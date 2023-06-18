/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/*
 * Copyright (C) 2023 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import type lsp from 'vscode-languageserver';
import { ResponseError } from 'vscode-languageserver';
import * as path from 'path';
import * as vscode from 'vscode';
import { DiagnosticKind, DiagnosticsManager } from './features/diagnostics.js';
import type { LspClient } from './lsp-client.js';
import type { ts } from './ts-protocol.js';
import { CommandTypes, EventName } from './ts-protocol.js';
import BufferSyncSupport from './tsServer/bufferSyncSupport.js';
import { OngoingRequestCancellerFactory } from './tsServer/cancellation.js';
import { ILogDirectoryProvider } from './tsServer/logDirectoryProvider.js';
import type { ITypeScriptServer, TsServerProcessFactory, TypeScriptServerExitEvent } from './tsServer/server.js';
import { TypeScriptServerError } from './tsServer/serverError.js';
import { TypeScriptServerSpawner } from './tsServer/spawner.js';
import { TypeScriptVersionManager } from './tsServer/versionManager';
import { ITypeScriptVersionProvider, TypeScriptVersion } from './tsServer/versionProvider.js';
import { ClientCapabilities, ClientCapability, ExecConfig, ITypeScriptServiceClient, ServerResponse, TypeScriptRequests } from './typescriptService.js';
import API from './utils/api.js';
import { ServiceConfigurationProvider, SyntaxServerConfiguration, TsServerLogLevel, TypeScriptServiceConfiguration, areServiceConfigurationsEqual } from './utils/configuration.js';
import { Disposable } from './utils/dispose.js';
import * as fileSchemes from './utils/fileSchemes.js';
import { Logger } from './utils/logger.js';
import { TypeScriptPluginPathsProvider } from './utils/pluginPathsProvider';
import { PluginManager } from './utils/plugins';
import Tracer from './utils/tracer';
import { ProjectType, inferredProjectCompilerOptions } from './utils/tsconfig.js';

export interface TsDiagnostics {
    readonly kind: DiagnosticKind;
    readonly resource: vscode.Uri;
    readonly diagnostics: ts.server.protocol.Diagnostic[];
}

interface ToCancelOnResourceChanged {
    readonly resource: vscode.Uri;
    cancel(): void;
}

namespace ServerState {
    export const enum Type {
        None,
        Running,
        Errored
    }

    export const None = { type: Type.None } as const;

    export class Running {
        readonly type = Type.Running;

        constructor(
            public readonly server: ITypeScriptServer,

            /**
             * API version obtained from the version picker after checking the corresponding path exists.
             */
            public readonly apiVersion: API,

            /**
             * Version reported by currently-running tsserver.
             */
            public tsserverVersion: string | undefined,
            public languageServiceEnabled: boolean,
        ) { }

        public readonly toCancelOnResourceChange = new Set<ToCancelOnResourceChanged>();

        updateTsserverVersion(tsserverVersion: string): void {
            this.tsserverVersion = tsserverVersion;
        }

        updateLanguageServiceEnabled(enabled: boolean): void {
            this.languageServiceEnabled = enabled;
        }
    }

    export class Errored {
        readonly type = Type.Errored;
        constructor(
            public readonly error: Error,
            public readonly tsServerLogFile: string | undefined,
        ) { }
    }

    export type State = typeof None | Running | Errored;
}

export default class TypeScriptServiceClient extends Disposable implements ITypeScriptServiceClient {
    private readonly emptyAuthority = 'ts-nul-authority';
    private readonly inMemoryResourcePrefix = '^';

    private readonly _onReady?: { promise: Promise<void>; resolve: () => void; reject: () => void; };
    private _configuration: TypeScriptServiceConfiguration;
    private readonly pluginPathsProvider: TypeScriptPluginPathsProvider;
    private readonly _versionManager: TypeScriptVersionManager;

    private readonly logger: Logger;
    private readonly tracer: Tracer;

    private readonly typescriptServerSpawner: TypeScriptServerSpawner;
    private serverState: ServerState.State = ServerState.None;
    private lastStart: number;
    private numberRestarts: number;
    private _isPromptingAfterCrash = false;
    private isRestarting = false;
    private hasServerFatallyCrashedTooManyTimes = false;
    private readonly loadingIndicator: ServerInitializingIndicator;

    public readonly lspClient: LspClient;
    public readonly bufferSyncSupport: BufferSyncSupport;
    public readonly diagnosticsManager: DiagnosticsManager;
    public readonly pluginManager: PluginManager;

    private readonly logDirectoryProvider: ILogDirectoryProvider;
    private readonly cancellerFactory: OngoingRequestCancellerFactory;
    private readonly versionProvider: ITypeScriptVersionProvider;
    private readonly processFactory: TsServerProcessFactory;

    constructor(
        private readonly context: vscode.ExtensionContext,
        onCaseInsenitiveFileSystem: boolean,
        services: {
            lspClient: LspClient;
            pluginManager: PluginManager;
            logDirectoryProvider: ILogDirectoryProvider;
            cancellerFactory: OngoingRequestCancellerFactory;
            versionProvider: ITypeScriptVersionProvider;
            processFactory: TsServerProcessFactory;
            serviceConfigurationProvider: ServiceConfigurationProvider;
            logger: Logger;
        },
        allModeIds: readonly string[],
    ) {
        super();

        this.logger = services.logger;
        this.tracer = new Tracer(this.logger);

        this.lspClient = services.lspClient;
        this.pluginManager = services.pluginManager;
        this.logDirectoryProvider = services.logDirectoryProvider;
        this.cancellerFactory = services.cancellerFactory;
        this.versionProvider = services.versionProvider;
        this.processFactory = services.processFactory;
        this.loadingIndicator = new ServerInitializingIndicator(this.lspClient);

        this.lastStart = Date.now();

        let resolve: () => void;
        let reject: () => void;
        const p = new Promise<void>((res, rej) => {
            resolve = res;
            reject = rej;
        });
        this._onReady = { promise: p, resolve: resolve!, reject: reject! };

        this.numberRestarts = 0;

        this._configuration = services.serviceConfigurationProvider.loadFromWorkspace();
        this.versionProvider.updateConfiguration(this._configuration);

        this.pluginPathsProvider = new TypeScriptPluginPathsProvider(this._configuration);
        this._versionManager = this._register(new TypeScriptVersionManager(this._configuration, this.versionProvider, context.workspaceState));
        this._register(this._versionManager.onDidPickNewVersion(() => {
            this.restartTsServer();
        }));

        this.bufferSyncSupport = new BufferSyncSupport(this, allModeIds, onCaseInsenitiveFileSystem);
        this.onReady(() => {
            this.bufferSyncSupport.listen();
        });

        this.diagnosticsManager = new DiagnosticsManager('typescript', onCaseInsenitiveFileSystem);
        this.bufferSyncSupport.onDelete(resource => {
            this.cancelInflightRequestsForResource(resource);
            this.diagnosticsManager.deleteAllDiagnosticsInFile(resource);
        }, null, this._disposables);

        this.bufferSyncSupport.onWillChange(resource => {
            this.cancelInflightRequestsForResource(resource);
        });

        vscode.workspace.onDidChangeConfiguration(() => {
            const oldConfiguration = this._configuration;
            this._configuration = services.serviceConfigurationProvider.loadFromWorkspace();

            this.versionProvider.updateConfiguration(this._configuration);
            this._versionManager.updateConfiguration(this._configuration);
            this.pluginPathsProvider.updateConfiguration(this._configuration);
            this.tracer.updateConfiguration();

            if (this.serverState.type === ServerState.Type.Running) {
                if (!this._configuration.implicitProjectConfiguration.isEqualTo(oldConfiguration.implicitProjectConfiguration)) {
                    this.setCompilerOptionsForInferredProjects(this._configuration);
                }

                if (!areServiceConfigurationsEqual(this._configuration, oldConfiguration)) {
                    this.restartTsServer();
                }
            }
        }, this, this._disposables);

        this.typescriptServerSpawner = new TypeScriptServerSpawner(this.versionProvider, this._versionManager, this.logDirectoryProvider/*, this.pluginPathsProvider*/, this.logger, this.tracer, this.processFactory);

        // this._register(this.pluginManager.onDidUpdateConfig(update => {
        //     this.configurePlugin(update.pluginId, update.config);
        // }));

        this._register(this.pluginManager.onDidChangePlugins(() => {
            this.restartTsServer();
        }));
    }

    public get capabilities(): ClientCapabilities {
        if (this._configuration.useSyntaxServer === SyntaxServerConfiguration.Always) {
            return new ClientCapabilities(
                ClientCapability.Syntax,
                ClientCapability.EnhancedSyntax);
        }

        if (this.apiVersion.gte(API.v400)) {
            return new ClientCapabilities(
                ClientCapability.Syntax,
                ClientCapability.EnhancedSyntax,
                ClientCapability.Semantic);
        }

        return new ClientCapabilities(
            ClientCapability.Syntax,
            ClientCapability.Semantic);
    }

    private readonly _onDidChangeCapabilities = this._register(new vscode.EventEmitter<void>());
    readonly onDidChangeCapabilities = this._onDidChangeCapabilities.event;

    private cancelInflightRequestsForResource(resource: vscode.Uri): void {
        if (this.serverState.type !== ServerState.Type.Running) {
            return;
        }

        for (const request of this.serverState.toCancelOnResourceChange) {
            if (request.resource.toString() === resource.toString()) {
                request.cancel();
            }
        }
    }

    public get configuration(): TypeScriptServiceConfiguration {
        return this._configuration;
    }

    public override dispose(): void {
        super.dispose();

        this.bufferSyncSupport.dispose();

        if (this.serverState.type === ServerState.Type.Running) {
            this.serverState.server.kill();
        }

        this.loadingIndicator.reset();
    }

    public restartTsServer(fromUserAction = false): void {
        if (this.serverState.type === ServerState.Type.Running) {
            this.info('Killing TS Server');
            this.isRestarting = true;
            this.serverState.server.kill();
        }

        if (fromUserAction) {
            // Reset crash trackers
            this.hasServerFatallyCrashedTooManyTimes = false;
            this.numberRestarts = 0;
            this.lastStart = Date.now();
        }

        this.serverState = this.startService(true);
    }

    private readonly _onTsServerStarted = this._register(new vscode.EventEmitter<{ version: TypeScriptVersion; usedApiVersion: API; }>());
    public readonly onTsServerStarted = this._onTsServerStarted.event;

    private readonly _onDiagnosticsReceived = this._register(new vscode.EventEmitter<TsDiagnostics>());
    public readonly onDiagnosticsReceived = this._onDiagnosticsReceived.event;

    private readonly _onConfigDiagnosticsReceived = this._register(new vscode.EventEmitter<ts.server.protocol.ConfigFileDiagnosticEvent>());
    public readonly onConfigDiagnosticsReceived = this._onConfigDiagnosticsReceived.event;

    private readonly _onResendModelsRequested = this._register(new vscode.EventEmitter<void>());
    public readonly onResendModelsRequested = this._onResendModelsRequested.event;

    private readonly _onProjectLanguageServiceStateChanged = this._register(new vscode.EventEmitter<ts.server.protocol.ProjectLanguageServiceStateEventBody>());
    public readonly onProjectLanguageServiceStateChanged = this._onProjectLanguageServiceStateChanged.event;

    private readonly _onDidBeginInstallTypings = this._register(new vscode.EventEmitter<ts.server.protocol.BeginInstallTypesEventBody>());
    public readonly onDidBeginInstallTypings = this._onDidBeginInstallTypings.event;

    private readonly _onDidEndInstallTypings = this._register(new vscode.EventEmitter<ts.server.protocol.EndInstallTypesEventBody>());
    public readonly onDidEndInstallTypings = this._onDidEndInstallTypings.event;

    private readonly _onTypesInstallerInitializationFailed = this._register(new vscode.EventEmitter<ts.server.protocol.TypesInstallerInitializationFailedEventBody>());
    public readonly onTypesInstallerInitializationFailed = this._onTypesInstallerInitializationFailed.event;

    private readonly _onSurveyReady = this._register(new vscode.EventEmitter<ts.server.protocol.SurveyReadyEventBody>());
    public readonly onSurveyReady = this._onSurveyReady.event;

    public get apiVersion(): API {
        if (this.serverState.type === ServerState.Type.Running) {
            return this.serverState.apiVersion;
        }
        return API.defaultVersion;
    }

    public onReady(f: () => void): Promise<void> {
        return this._onReady!.promise.then(f);
    }

    private info(message: string, data?: any): void {
        this.logger.info(message, data);
    }

    private error(message: string, data?: any): void {
        this.logger.error(message, data);
    }

    public ensureServiceStarted(): void {
        if (this.serverState.type !== ServerState.Type.Running) {
            this.startService();
        }
    }

    private token = 0;
    private startService(resendModels = false): ServerState.State {
        this.info('Starting TS Server');

        if (this.isDisposed) {
            this.info('Not starting server: disposed');
            return ServerState.None;
        }

        if (this.hasServerFatallyCrashedTooManyTimes) {
            this.info('Not starting server: too many crashes');
            return ServerState.None;
        }

        let version = this._versionManager.currentVersion;
        if (!version.isValid) {
            vscode.window.showWarningMessage(vscode.l10n.t("The path {0} doesn't point to a valid tsserver install. Falling back to bundled TypeScript version.", version.path));

            this._versionManager.reset();
            version = this._versionManager.currentVersion;
        }

        this.info(`Using tsserver from: ${version.path}`);

        const apiVersion = version.apiVersion || API.defaultVersion;
        const mytoken = ++this.token;
        const handle = this.typescriptServerSpawner.spawn(version, this.capabilities, this.configuration, this.pluginManager, this.cancellerFactory, {
            onFatalError: (command, err) => this.fatalError(command, err),
        });
        this.serverState = new ServerState.Running(handle, apiVersion, undefined, true);
        this.lastStart = Date.now();

        /* __GDPR__
            "tsserver.spawned" : {
                "owner": "mjbvz",
                "${include}": [
                    "${TypeScriptCommonProperties}"
                ],
                "localTypeScriptVersion": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
                "typeScriptVersionSource": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
            }
        */
        this.logTelemetry('tsserver.spawned', {
            localTypeScriptVersion: this.versionProvider.localVersion ? this.versionProvider.localVersion.displayName : '',
            typeScriptVersionSource: version.source,
        });

        handle.onError((err: Error) => {
            if (this.token !== mytoken) {
                // this is coming from an old process
                return;
            }

            if (err) {
                vscode.window.showErrorMessage(vscode.l10n.t('TypeScript language server exited with error. Error message is: {0}', err.message || err.name));
            }

            this.serverState = new ServerState.Errored(err, handle.tsServerLog);
            this.error('TSServer errored with error.', err);
            if (handle.tsServerLog?.type === 'file') {
                this.error(`TSServer log file: ${handle.tsServerLog.uri.fsPath}`);
            }

            /* __GDPR__
                "tsserver.error" : {
                    "owner": "mjbvz",
                    "${include}": [
                        "${TypeScriptCommonProperties}"
                    ]
                }
            */
            this.logTelemetry('tsserver.error');
            this.serviceExited(false);
        });

        handle.onExit((data: TypeScriptServerExitEvent) => {
            const { code, signal } = data;
            this.error(`TSServer exited. Code: ${code}. Signal: ${signal}`);

            // In practice, the exit code is an integer with no ties to any identity,
            // so it can be classified as SystemMetaData, rather than CallstackOrException.
            /* __GDPR__
                "tsserver.exitWithCode" : {
                    "owner": "mjbvz",
                    "code" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
                    "signal" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
                    "${include}": [
                        "${TypeScriptCommonProperties}"
                    ]
                }
            */
            this.logTelemetry('tsserver.exitWithCode', { code: code ?? undefined, signal: signal ?? undefined });

            if (this.token !== mytoken) {
                // this is coming from an old process
                return;
            }

            if (handle.tsServerLog?.type === 'file') {
                this.info(`TSServer log file: ${handle.tsServerLog.uri.fsPath}`);
            }
            this.serviceExited(!this.isRestarting);
            this.isRestarting = false;
        });

        handle.onEvent(event => this.dispatchEvent(event));

        if (apiVersion.gte(API.v300) && this.capabilities.has(ClientCapability.Semantic)) {
            this.loadingIndicator.startedLoadingProject(undefined /* projectName */);
        }

        this.serviceStarted(resendModels);

        this._onReady!.resolve();
        this._onTsServerStarted.fire({ version: version, usedApiVersion: apiVersion });
        this._onDidChangeCapabilities.fire();
        return this.serverState;
    }

    public async showVersionPicker(): Promise<void> {
        this._versionManager.promptUserForVersion();
    }

    public async openTsServerLogFile(): Promise<boolean> {
        if (this._configuration.tsServerLogLevel === TsServerLogLevel.Off) {
            vscode.window.showErrorMessage<vscode.MessageItem>(
                vscode.l10n.t("TS Server logging is off. Please set 'typescript.tsserver.log' and restart the TS server to enable logging"),
                {
                    title: vscode.l10n.t('Enable logging and restart TS server'),
                })
                .then(selection => {
                    if (selection) {
                        return vscode.workspace.getConfiguration().update('typescript.tsserver.log', 'verbose', true).then(() => {
                            this.restartTsServer();
                        });
                    }
                    return undefined;
                });
            return false;
        }

        if (this.serverState.type !== ServerState.Type.Running || !this.serverState.server.tsServerLog) {
            vscode.window.showWarningMessage(vscode.l10n.t('TS Server has not started logging.'));
            return false;
        }

        switch (this.serverState.server.tsServerLog.type) {
            case 'output': {
                this.serverState.server.tsServerLog.output.show();
                return true;
            }
            case 'file': {
                try {
                    const doc = await vscode.workspace.openTextDocument(this.serverState.server.tsServerLog.uri);
                    await vscode.window.showTextDocument(doc);
                    return true;
                } catch {
                    // noop
                }

                try {
                    await vscode.commands.executeCommand('revealFileInOS', this.serverState.server.tsServerLog.uri);
                    return true;
                } catch {
                    vscode.window.showWarningMessage(vscode.l10n.t('Could not open TS Server log file'));
                    return false;
                }
            }
        }
    }

    private serviceStarted(resendModels: boolean): void {
        this.bufferSyncSupport.reset();

        const watchOptions = this.apiVersion.gte(API.v380)
            ? this.configuration.watchOptions
            : undefined;

        const configureOptions: ts.server.protocol.ConfigureRequestArguments = {
            hostInfo: 'vscode',
            preferences: {
                providePrefixAndSuffixTextForRename: true,
                allowRenameOfImportPath: true,
                includePackageJsonAutoImports: this._configuration.includePackageJsonAutoImports,
            },
            watchOptions,
        };
        this.executeWithoutWaitingForResponse('configure', configureOptions);
        this.setCompilerOptionsForInferredProjects(this._configuration);
        if (resendModels) {
            this._onResendModelsRequested.fire();
            this.bufferSyncSupport.reinitialize();
            this.bufferSyncSupport.requestAllDiagnostics();
        }

        // Reconfigure any plugins
        for (const [pluginName, config] of this.pluginManager.configurations()) {
            this.configurePlugin(pluginName, config);
        }
    }

    private setCompilerOptionsForInferredProjects(configuration: TypeScriptServiceConfiguration): void {
        const args: ts.server.protocol.SetCompilerOptionsForInferredProjectsArgs = {
            options: this.getCompilerOptionsForInferredProjects(configuration),
        };
        this.executeWithoutWaitingForResponse('compilerOptionsForInferredProjects', args);
    }

    private getCompilerOptionsForInferredProjects(configuration: TypeScriptServiceConfiguration): ts.server.protocol.ExternalProjectCompilerOptions {
        return {
            ...inferredProjectCompilerOptions(ProjectType.TypeScript, configuration),
            allowJs: true,
            allowSyntheticDefaultImports: true,
            allowNonTsExtensions: true,
            resolveJsonModule: true,
        };
    }

    private serviceExited(restart: boolean): void {
        this.loadingIndicator.reset();

        this.serverState = ServerState.None;

        if (restart) {
            const diff = Date.now() - this.lastStart;
            this.numberRestarts++;
            let startService = true;

            const pluginExtensionList = this.pluginManager.plugins.map(plugin => plugin.extension.id).join(', ');
            const reportIssueItem: vscode.MessageItem = {
                title: vscode.l10n.t('Report Issue'),
            };
            let prompt: Thenable<undefined | vscode.MessageItem> | undefined = undefined;

            if (this.numberRestarts > 5) {
                this.numberRestarts = 0;
                if (diff < 10 * 1000 /* 10 seconds */) {
                    this.lastStart = Date.now();
                    startService = false;
                    this.hasServerFatallyCrashedTooManyTimes = true;
                    prompt = vscode.window.showErrorMessage(
                        this.pluginManager.plugins.length
                            ? vscode.l10n.t('The JS/TS language service immediately crashed 5 times. The service will not be restarted.\nThis may be caused by a plugin contributed by one of these extensions: {0}', pluginExtensionList)
                            : vscode.l10n.t('The JS/TS language service immediately crashed 5 times. The service will not be restarted.'),
                        reportIssueItem);
                } else if (diff < 60 * 1000 * 5 /* 5 Minutes */) {
                    this.lastStart = Date.now();
                    if (!this._isPromptingAfterCrash) {
                        prompt = vscode.window.showWarningMessage(
                            this.pluginManager.plugins.length
                                ? vscode.l10n.t('The JS/TS language service crashed 5 times in the last 5 Minutes.\nThis may be caused by a plugin contributed by one of these extensions: {0}', pluginExtensionList)
                                : vscode.l10n.t('The JS/TS language service crashed 5 times in the last 5 Minutes.'),
                            reportIssueItem);
                    }
                }
            }

            if (prompt) {
                this._isPromptingAfterCrash = true;
            }

            prompt?.then(item => {
                this._isPromptingAfterCrash = false;
            });

            if (startService) {
                this.startService(true);
            }
        }
    }

    public toTsFilePath(resource: vscode.Uri): string | undefined {
        if (fileSchemes.disabledSchemes.has(resource.scheme)) {
            return undefined;
        }

        if (resource.scheme === fileSchemes.file) {
            if (!resource.fsPath) {
                return undefined;
            }

            // Convert to posix style path
            return path.posix.normalize(resource.fsPath.split(path.sep).join(path.posix.sep));
        }

        return this.inMemoryResourcePrefix
            + '/' + resource.scheme
            + '/' + (resource.authority || this.emptyAuthority)
            + (resource.path.startsWith('/') ? resource.path : '/' + resource.path)
            + (resource.fragment ? '#' + resource.fragment : '');
    }

    public toOpenTsFilePath(document: vscode.TextDocument, options: { suppressAlertOnFailure?: boolean; } = {}): string | undefined {
        if (!this.bufferSyncSupport.ensureHasBuffer(document.uri)) {
            if (!options.suppressAlertOnFailure && !fileSchemes.disabledSchemes.has(document.uri.scheme)) {
                console.error(`Unexpected resource ${document.uri}`);
            }
            return undefined;
        }
        return this.toTsFilePath(document.uri);
    }

    public hasCapabilityForResource(resource: vscode.Uri, capability: ClientCapability): boolean {
        if (!this.capabilities.has(capability)) {
            return false;
        }

        switch (capability) {
            case ClientCapability.Semantic: {
                return fileSchemes.semanticSupportedSchemes.includes(resource.scheme);
            }
            case ClientCapability.Syntax:
            case ClientCapability.EnhancedSyntax: {
                return true;
            }
        }
    }

    public toResource(filepath: string): vscode.Uri {
        if (filepath.startsWith(this.inMemoryResourcePrefix)) {
            const parts = filepath.match(/^\^\/([^\/]+)\/([^\/]*)\/(.+)$/);
            if (parts) {
                const resource = vscode.Uri.parse(parts[1] + '://' + (parts[2] === this.emptyAuthority ? '' : parts[2]) + '/' + parts[3]);
                return this.bufferSyncSupport.toVsCodeResource(resource);
            }
        }
        return this.bufferSyncSupport.toResource(filepath);
    }

    public getWorkspaceRootForResource(resource: vscode.Uri): string | undefined {
        const roots = vscode.workspace.workspaceFolders ? Array.from(vscode.workspace.workspaceFolders) : undefined;
        if (!roots?.length) {
            if (resource.scheme === fileSchemes.officeScript) {
                return '/';
            }
            return undefined;
        }

        let tsRootPath: string | undefined;
        for (const root of roots.sort((a, b) => a.uri.fsPath.length - b.uri.fsPath.length)) {
            if (root.uri.scheme === resource.scheme && root.uri.authority === resource.authority) {
                if (resource.fsPath.startsWith(root.uri.fsPath + path.sep)) {
                    tsRootPath = this.toTsFilePath(root.uri);
                    break;
                }
            }
        }

        tsRootPath ??= this.toTsFilePath(roots[0].uri);
        if (!tsRootPath || tsRootPath.startsWith(this.inMemoryResourcePrefix)) {
            return undefined;
        }

        return tsRootPath;
    }

    // High-level API START

    public notify(command: CommandTypes.Open, args: ts.server.protocol.OpenRequestArgs): void;
    public notify(command: CommandTypes.Close, args: ts.server.protocol.FileRequestArgs): void;
    public notify(command: CommandTypes.Change, args: ts.server.protocol.ChangeRequestArgs): void;
    public notify(command: keyof NoResponseTsServerRequests, args: any): void {
        this.executeWithoutWaitingForResponse(command, args);
    }

    public requestGeterr(args: ts.server.protocol.GeterrRequestArgs, token: lsp.CancellationToken): Promise<any> {
        return this.executeAsync(CommandTypes.Geterr, args, token);
    }

    public async request<K extends keyof StandardTsServerRequests>(
        command: K,
        args: StandardTsServerRequests[K][0],
        token?: lsp.CancellationToken,
        config?: ExecConfig,
    ): Promise<ServerResponse.Response<StandardTsServerRequests[K][1]>> {
        try {
            return await this.execute(command, args, token, config);
        } catch (error) {
            throw new ResponseError(1, (error as Error).message);
        }
    }

    // High-level API END

    public execute(command: keyof TypeScriptRequestTypes, args: any, token?: lsp.CancellationToken, config?: ExecConfig): Promise<ServerResponse.Response<ts.server.protocol.Response>> {
        let executions: Array<Promise<ServerResponse.Response<ts.server.protocol.Response>> | undefined> | undefined;

        if (config?.cancelOnResourceChange) {
            const runningServerState = this.serverState;
            if (runningServerState.type === ServerState.Type.Running) {
                const source = new CancellationTokenSource();
                token.onCancellationRequested(() => source.cancel());

                const inFlight: ToCancelOnResourceChanged = {
                    resource: config.cancelOnResourceChange,
                    cancel: () => source.cancel(),
                };
                runningServerState.toCancelOnResourceChange.add(inFlight);

                executions = this.executeImpl(command, args, {
                    isAsync: false,
                    token: source.token,
                    expectsResult: true,
                    ...config,
                });
                executions[0]!.finally(() => {
                    runningServerState.toCancelOnResourceChange.delete(inFlight);
                    source.dispose();
                });
            }
        }

        if (!executions) {
            executions = this.executeImpl(command, args, {
                isAsync: false,
                token,
                expectsResult: true,
                ...config,
            });
        }

        if (config?.nonRecoverable) {
            executions[0]!.catch(err => this.fatalError(command, err));
        }

        if (command === CommandTypes.UpdateOpen) {
            // If update open has completed, consider that the project has loaded
            Promise.all(executions).then(() => {
                this.loadingIndicator.reset();
            });
        }

        return executions[0]!;
    }

    public executeWithoutWaitingForResponse<K extends keyof NoResponseTsServerRequests>(
        command: K,
        args: NoResponseTsServerRequests[K][0],
    ): void {
        this.executeImpl(command, args, {
            isAsync: false,
            token: undefined,
            expectsResult: false,
        });
    }

    public executeAsync<K extends keyof AsyncTsServerRequests>(
        command: K,
        args: AsyncTsServerRequests[K][0],
        token: lsp.CancellationToken,
    ): Promise<ServerResponse.Response<ts.server.protocol.Response>> {
        return this.executeImpl(command, args, {
            isAsync: true,
            token,
            expectsResult: true,
        })[0]!;
    }

    private executeImpl(command: keyof TypeScriptRequestTypes, args: any, executeInfo: { isAsync: boolean; token?: lsp.CancellationToken; expectsResult: boolean; lowPriority?: boolean; requireSemantic?: boolean; }): Array<Promise<ServerResponse.Response<ts.server.protocol.Response>> | undefined> {
        const serverState = this.serverState;
        if (serverState.type === ServerState.Type.Running) {
            this.bufferSyncSupport.beforeCommand(command);
            return serverState.server.executeImpl(command, args, executeInfo);
        } else {
            return [Promise.resolve(ServerResponse.NoServer)];
        }
    }

    public interruptGetErr<R>(f: () => R): R {
        return this.bufferSyncSupport.interruptGetErr(f);
    }

    private fatalError(command: string, error: unknown): void {
        this.tsserverLogger.error(`A non-recoverable error occurred while executing command: ${command}`);
        if (error instanceof TypeScriptServerError && error.serverErrorText) {
            this.tsserverLogger.error(error.serverErrorText);
        }

        if (this.serverState.type === ServerState.Type.Running) {
            this.logger.info('Killing TS Server');
            const logfile = this.serverState.server.tsServerLogFile;
            this.serverState.server.kill();
            if (error instanceof TypeScriptServerError) {
                this.serverState = new ServerState.Errored(error, logfile);
            }
        }
    }

    private dispatchEvent(event: ts.server.protocol.Event) {
        switch (event.event) {
            case EventName.syntaxDiag:
            case EventName.semanticDiag:
            case EventName.suggestionDiag: {
                // This event also roughly signals that projects have been loaded successfully (since the TS server is synchronous)
                this.loadingIndicator.reset();
                // this.options.onEvent?.(event);

                const diagnosticEvent = event as ts.server.protocol.DiagnosticEvent;
                if (diagnosticEvent.body?.diagnostics) {
                    this._onDiagnosticsReceived.fire({
                        kind: getDignosticsKind(event),
                        resource: this.toResource(diagnosticEvent.body.file),
                        diagnostics: diagnosticEvent.body.diagnostics,
                    });
                }
                break;
            }
            case EventName.configFileDiag: {
                this._onConfigDiagnosticsReceived.fire(event as ts.server.protocol.ConfigFileDiagnosticEvent);
                break;
            }
            case EventName.projectLanguageServiceState: {
                const body = (event as ts.server.protocol.ProjectLanguageServiceStateEvent).body!;
                if (this.serverState.type === ServerState.Type.Running) {
                    this.serverState.updateLanguageServiceEnabled(body.languageServiceEnabled);
                }
                this._onProjectLanguageServiceStateChanged.fire(body);
                break;
            }
            case EventName.projectsUpdatedInBackground: {
                this.loadingIndicator.reset();

                const body = (event as ts.server.protocol.ProjectsUpdatedInBackgroundEvent).body;
                const resources = body.openFiles.map(file => this.toResource(file));
                this.bufferSyncSupport.getErr(resources);
                break;
            }
            case EventName.beginInstallTypes:
                this._onDidBeginInstallTypings.fire((event as ts.server.protocol.BeginInstallTypesEvent).body);
                break;
            case EventName.endInstallTypes:
                this._onDidEndInstallTypings.fire((event as ts.server.protocol.EndInstallTypesEvent).body);
                break;
            case EventName.typesInstallerInitializationFailed:
                this._onTypesInstallerInitializationFailed.fire((event as ts.server.protocol.TypesInstallerInitializationFailedEvent).body);
                break;
            case EventName.projectLoadingStart:
                this.loadingIndicator.startedLoadingProject((event as ts.server.protocol.ProjectLoadingStartEvent).body.projectName);
                break;
            case EventName.projectLoadingFinish:
                this.loadingIndicator.finishedLoadingProject((event as ts.server.protocol.ProjectLoadingFinishEvent).body.projectName);
                break;
        }
    }

    // private configurePlugin(pluginName: string, configuration: {}): any {
    //     if (this.apiVersion.gte(API.v314)) {
    //         this.executeWithoutWaitingForResponse('configurePlugin', { pluginName, configuration });
    //     }
    // }
}

function getDignosticsKind(event: ts.server.protocol.Event) {
    switch (event.event) {
        case 'syntaxDiag': return DiagnosticKind.Syntax;
        case 'semanticDiag': return DiagnosticKind.Semantic;
        case 'suggestionDiag': return DiagnosticKind.Suggestion;
    }
    throw new Error('Unknown dignostics kind');
}

class ServerInitializingIndicator extends Disposable {
    private _task?: { project: string | undefined; resolve: () => void; };

    constructor(private lspClient: LspClient) {
        super();
    }

    public reset(): void {
        if (this._task) {
            this._task.resolve();
            this._task = undefined;
        }
    }

    public startedLoadingProject(projectName: string): void {
        // TS projects are loaded sequentially. Cancel existing task because it should always be resolved before
        // the incoming project loading task is.
        this.reset();

        const reporter = this.lspClient.createProgressReporter();
        reporter.then(reporter => {
            reporter.begin('Initializing JS/TS language features…');
            this._task = {
                project: projectName,
                resolve: () => reporter.done(),
            };
        });
    }

    public finishedLoadingProject(projectName: string): void {
        if (this._task && this._task.project === projectName) {
            this._task.resolve();
            this._task = undefined;
        }
    }
}
