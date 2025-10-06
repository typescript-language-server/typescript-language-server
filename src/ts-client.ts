/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import path from 'node:path';
import { URI } from 'vscode-uri';
import { ResponseError } from 'vscode-languageserver';
import type lsp from 'vscode-languageserver';
import { type DocumentUri } from 'vscode-languageserver-textdocument';
import { type CancellationToken, CancellationTokenSource } from 'vscode-jsonrpc';
import { type LspDocument, LspDocuments } from './document.js';
import * as fileSchemes from './configuration/fileSchemes.js';
import * as languageModeIds from './configuration/languageIds.js';
import { CommandTypes, EventName } from './ts-protocol.js';
import type { TypeScriptPlugin, ts } from './ts-protocol.js';
import type { ILogDirectoryProvider } from './tsServer/logDirectoryProvider.js';
import { AsyncTsServerRequests, ClientCapabilities, ClientCapability, ExecConfig, NoResponseTsServerRequests, ITypeScriptServiceClient, ServerResponse, StandardTsServerRequests, TypeScriptRequestTypes, ExecuteInfo } from './typescriptService.js';
import { PluginManager } from './tsServer/plugins.js';
import type { ITypeScriptServer, TypeScriptServerExitEvent } from './tsServer/server.js';
import { TypeScriptServerError } from './tsServer/serverError.js';
import { TypeScriptServerSpawner } from './tsServer/spawner.js';
import Tracer, { Trace } from './tsServer/tracer.js';
import { TypeScriptVersion, TypeScriptVersionSource } from './tsServer/versionProvider.js';
import type { LspClient } from './lsp-client.js';
import API from './utils/api.js';
import { SyntaxServerConfiguration, TsServerLogLevel } from './utils/configuration.js';
import { Logger, PrefixingLogger } from './utils/logger.js';
import type { WorkspaceFolder } from './utils/types.js';
import { ZipfileURI } from './utils/uri.js';

interface ToCancelOnResourceChanged {
    readonly resource: string;
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

export const enum DiagnosticKind {
    Syntax,
    Semantic,
    Suggestion,
}

export function getDignosticsKind(event: ts.server.protocol.Event): DiagnosticKind {
    switch (event.event) {
        case 'syntaxDiag': return DiagnosticKind.Syntax;
        case 'semanticDiag': return DiagnosticKind.Semantic;
        case 'suggestionDiag': return DiagnosticKind.Suggestion;
    }
    throw new Error('Unknown dignostics kind');
}

class ServerInitializingIndicator {
    private _loadingProjectName?: string;
    private _task?: Promise<lsp.WorkDoneProgressReporter>;

    constructor(private lspClient: LspClient) {}

    public reset(): void {
        if (this._task) {
            const task = this._task;
            this._task = undefined;
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            task.then(reporter => reporter.done());
        }
    }

    public startedLoadingProject(projectName: string): void {
        // TS projects are loaded sequentially. Cancel existing task because it should always be resolved before
        // the incoming project loading task is.
        this.reset();

        this._loadingProjectName = projectName;
        this._task = this.lspClient.createProgressReporter();
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this._task.then(reporter => reporter.begin('Initializing JS/TS language features…'));
    }

    public finishedLoadingProject(projectName: string): void {
        if (this._loadingProjectName === projectName) {
            this.reset();
        }
    }
}

export const emptyAuthority = 'ts-nul-authority';
export const inMemoryResourcePrefix = '^';
const RE_IN_MEMORY_FILEPATH = /^\^\/([^/]+)\/([^/]*)\/(.+)$/;

export interface TsClientOptions {
    trace: Trace;
    typescriptVersion: TypeScriptVersion;
    logVerbosity: TsServerLogLevel;
    logDirectoryProvider: ILogDirectoryProvider;
    disableAutomaticTypingAcquisition?: boolean;
    maxTsServerMemory?: number;
    npmLocation?: string;
    hostInfo?: string | undefined;
    locale?: string;
    plugins: TypeScriptPlugin[];
    onEvent?: (event: ts.server.protocol.Event) => void;
    onExit?: (exitCode: number | null, signal: NodeJS.Signals | null) => void;
    useSyntaxServer: SyntaxServerConfiguration;
}

export class TsClient implements ITypeScriptServiceClient {
    public apiVersion: API = API.defaultVersion;
    public typescriptVersionSource: TypeScriptVersionSource = TypeScriptVersionSource.Bundled;
    public readonly pluginManager: PluginManager;
    private serverState: ServerState.State = ServerState.None;
    private readonly lspClient: LspClient;
    private readonly logger: Logger;
    private readonly tsserverLogger: Logger;
    private readonly loadingIndicator: ServerInitializingIndicator;
    private isNeovimHost: boolean = false;
    private tracer: Tracer | undefined;
    private workspaceFolders: WorkspaceFolder[] = [];
    private readonly documents: LspDocuments;
    private useSyntaxServer: SyntaxServerConfiguration = SyntaxServerConfiguration.Auto;
    private onEvent?: (event: ts.server.protocol.Event) => void;
    private onExit?: (exitCode: number | null, signal: NodeJS.Signals | null) => void;

    constructor(
        onCaseInsensitiveFileSystem: boolean,
        logger: Logger,
        lspClient: LspClient,
    ) {
        this.pluginManager = new PluginManager();
        this.documents = new LspDocuments(this, lspClient, onCaseInsensitiveFileSystem);
        this.logger = new PrefixingLogger(logger, '[tsclient]');
        this.tsserverLogger = new PrefixingLogger(this.logger, '[tsserver]');
        this.lspClient = lspClient;
        this.loadingIndicator = new ServerInitializingIndicator(this.lspClient);
    }

    public get documentsForTesting(): Map<string, LspDocument> {
        return this.documents.documentsForTesting;
    }

    public openTextDocument(textDocument: lsp.TextDocumentItem): boolean {
        return this.documents.openTextDocument(textDocument);
    }

    public onDidCloseTextDocument(uri: lsp.DocumentUri): void {
        this.documents.onDidCloseTextDocument(uri);
    }

    public onDidChangeTextDocument(params: lsp.DidChangeTextDocumentParams): void {
        this.documents.onDidChangeTextDocument(params);
    }

    public lastFileOrDummy(): string | undefined {
        return this.documents.files[0] || this.workspaceFolders[0]?.uri.fsPath;
    }

    public toTsFilePath(stringUri: string): string | undefined {
        // Vim may send `zipfile:` URIs which tsserver with Yarn v2+ hook can handle. Keep as-is.
        // Example: zipfile:///foo/bar/baz.zip::path/to/module
        if (this.isNeovimHost && stringUri.startsWith('zipfile:')) {
            return stringUri;
        }

        const resource = URI.parse(stringUri);

        if (fileSchemes.disabledSchemes.has(resource.scheme)) {
            return undefined;
        }

        if (resource.scheme === fileSchemes.file) {
            return resource.fsPath;
        }

        return inMemoryResourcePrefix
            + '/' + resource.scheme
            + '/' + (resource.authority || emptyAuthority)
            + (resource.path.startsWith('/') ? resource.path : '/' + resource.path)
            + (resource.fragment ? '#' + resource.fragment : '');
    }

    public toOpenDocument(textDocumentUri: DocumentUri, options: { suppressAlertOnFailure?: boolean; } = {}): LspDocument | undefined {
        const filepath = this.toTsFilePath(textDocumentUri);
        const document = filepath && this.documents.get(filepath);
        if (!document) {
            const uri = URI.parse(textDocumentUri);
            if (!options.suppressAlertOnFailure && !fileSchemes.disabledSchemes.has(uri.scheme)) {
                console.error(`Unexpected resource ${textDocumentUri}`);
            }
            return undefined;
        }
        return document;
    }

    public requestDiagnosticsForTesting(): void {
        this.documents.requestDiagnosticsForTesting();
    }

    public hasPendingDiagnostics(resource: URI): boolean {
        return this.documents.hasPendingDiagnostics(resource);
    }

    /**
     * Convert a path to a resource.
     */
    public toResource(filepath: string): URI {
        // Yarn v2+ hooks tsserver and sends `zipfile:` URIs for Vim. Keep as-is.
        // Example: zipfile:///foo/bar/baz.zip::path/to/module
        if (this.isNeovimHost && filepath.startsWith('zipfile:')) {
            return ZipfileURI.parse(filepath);
        }

        if (filepath.startsWith(inMemoryResourcePrefix)) {
            const parts = filepath.match(RE_IN_MEMORY_FILEPATH);
            if (parts) {
                const resource = URI.parse(parts[1] + '://' + (parts[2] === emptyAuthority ? '' : parts[2]) + '/' + parts[3]);
                const tsFilepath = this.toTsFilePath(resource.toString());
                const document = tsFilepath && this.documents.get(tsFilepath);
                return document ? document.uri : resource;
            }
        }

        const fileUri = URI.file(filepath);
        const document = this.documents.get(fileUri.fsPath);
        return document ? document.uri : fileUri;
    }

    public toResourceUri(filepath: string): string {
        return this.toResource(filepath).toString();
    }

    public getWorkspaceRootForResource(resource: URI): URI | undefined {
        // For notebook cells, we need to use the notebook document to look up the workspace
        // if (resource.scheme === Schemes.notebookCell) {
        //     for (const notebook of vscode.workspace.notebookDocuments) {
        //         for (const cell of notebook.getCells()) {
        //             if (cell.document.uri.toString() === resource.toString()) {
        //                 resource = notebook.uri;
        //                 break;
        //             }
        //         }
        //     }
        // }

        for (const root of this.workspaceFolders.sort((a, b) => a.uri.fsPath.length - b.uri.fsPath.length)) {
            if (root.uri.scheme === resource.scheme && root.uri.authority === resource.authority) {
                if (resource.fsPath.startsWith(root.uri.fsPath + path.sep)) {
                    return root.uri;
                }
            }
        }

        return undefined;
    }

    public get capabilities(): ClientCapabilities {
        if (this.useSyntaxServer === SyntaxServerConfiguration.Always) {
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

    public hasCapabilityForResource(resource: URI, capability: ClientCapability): boolean {
        if (!this.capabilities.has(capability)) {
            return false;
        }

        switch (capability) {
            case ClientCapability.Semantic: {
                return fileSchemes.getSemanticSupportedSchemes().includes(resource.scheme);
            }
            case ClientCapability.Syntax:
            case ClientCapability.EnhancedSyntax: {
                return true;
            }
        }
    }

    public configurePlugin(pluginName: string, configuration: unknown): void {
        if (this.apiVersion.gte(API.v314)) {
            this.executeWithoutWaitingForResponse(CommandTypes.ConfigurePlugin, { pluginName, configuration });
        }
    }

    start(
        workspaceRoot: string | undefined,
        options: TsClientOptions,
    ): boolean {
        this.apiVersion = options.typescriptVersion.version || API.defaultVersion;
        this.typescriptVersionSource = options.typescriptVersion.source;
        this.isNeovimHost = options.hostInfo === 'neovim';
        this.tracer = new Tracer(this.tsserverLogger, options.trace);
        this.workspaceFolders = workspaceRoot ? [{ uri: URI.file(workspaceRoot) }] : [];
        this.useSyntaxServer = options.useSyntaxServer;
        this.onEvent = options.onEvent;
        this.onExit = options.onExit;
        this.pluginManager.setPlugins(options.plugins);
        const modeIds: string[] = [
            ...languageModeIds.jsTsLanguageModes,
            ...this.pluginManager.plugins.flatMap(x => x.languages),
        ];
        this.documents.initialize(modeIds);

        const tsServerSpawner = new TypeScriptServerSpawner(this.apiVersion, options.logDirectoryProvider, this.logger, this.tracer);
        const tsServer = tsServerSpawner.spawn(options.typescriptVersion, this.capabilities, options, this.pluginManager, {
            onFatalError: (command, err) => this.fatalError(command, err),
        });
        this.serverState = new ServerState.Running(tsServer, this.apiVersion, undefined, true);
        tsServer.onExit((data: TypeScriptServerExitEvent) => {
            this.serverState = ServerState.None;
            this.shutdown();
            this.tsserverLogger.error(`Exited. Code: ${data.code}. Signal: ${data.signal}`);
            this.onExit?.(data.code, data.signal);
        });
        tsServer.onStdErr((error: string) => {
            if (error) {
                this.logger.error(error);
            }
        });
        tsServer.onError((err: Error) => {
            this.serverState = new ServerState.Errored(err, tsServer.tsServerLogFile);
            if (err) {
                this.tsserverLogger.error('Exited with error. Error message is: {0}', err.message || err.name);
            }
            this.serviceExited();
        });
        tsServer.onEvent(event => this.dispatchEvent(event));
        return true;
    }

    private serviceExited(): void {
        if (this.serverState.type === ServerState.Type.Running) {
            this.serverState.server.kill();
        }
        this.loadingIndicator.reset();
    }

    private dispatchEvent(event: ts.server.protocol.Event) {
        switch (event.event as EventName) {
            case EventName.syntaxDiag:
            case EventName.semanticDiag:
            case EventName.suggestionDiag:
            case EventName.configFileDiag: {
                // This event also roughly signals that projects have been loaded successfully (since the TS server is synchronous)
                this.loadingIndicator.reset();
                this.onEvent?.(event);
                break;
            }
            // case EventName.ConfigFileDiag:
            //     this._onConfigDiagnosticsReceived.fire(event as ts.server.protocol.ConfigFileDiagnosticEvent);
            //     break;
            // case EventName.projectLanguageServiceState: {
            //     const body = (event as ts.server.protocol.ProjectLanguageServiceStateEvent).body!;
            //     if (this.serverState.type === ServerState.Type.Running) {
            //         this.serverState.updateLanguageServiceEnabled(body.languageServiceEnabled);
            //     }
            //     this._onProjectLanguageServiceStateChanged.fire(body);
            //     break;
            // }
            case EventName.projectsUpdatedInBackground: {
                this.loadingIndicator.reset();

                const body = (event as ts.server.protocol.ProjectsUpdatedInBackgroundEvent).body;
                const resources = body.openFiles.map(file => this.toResource(file));
                this.documents.getErr(resources);
                break;
            }
            // case EventName.beginInstallTypes:
            //     this._onDidBeginInstallTypings.fire((event as ts.server.protocol.BeginInstallTypesEvent).body);
            //     break;
            // case EventName.endInstallTypes:
            //     this._onDidEndInstallTypings.fire((event as ts.server.protocol.EndInstallTypesEvent).body);
            //     break;
            // case EventName.typesInstallerInitializationFailed:
            //     this._onTypesInstallerInitializationFailed.fire((event as ts.server.protocol.TypesInstallerInitializationFailedEvent).body);
            //     break;
            case EventName.projectLoadingStart:
                this.loadingIndicator.startedLoadingProject((event as ts.server.protocol.ProjectLoadingStartEvent).body.projectName);
                break;
            case EventName.projectLoadingFinish:
                this.loadingIndicator.finishedLoadingProject((event as ts.server.protocol.ProjectLoadingFinishEvent).body.projectName);
                break;
        }
    }

    public shutdown(): void {
        if (this.loadingIndicator) {
            this.loadingIndicator.reset();
        }
        if (this.serverState.type === ServerState.Type.Running) {
            this.serverState.server.kill();
        }
        this.serverState = ServerState.None;
    }

    public execute<K extends keyof StandardTsServerRequests>(
        command: K,
        args: StandardTsServerRequests[K][0],
        token?: CancellationToken,
        config?: ExecConfig,
    ): Promise<ServerResponse.Response<StandardTsServerRequests[K][1]>> {
        let executions: Array<Promise<ServerResponse.Response<ts.server.protocol.Response>> | undefined> | undefined;

        if (config?.cancelOnResourceChange) {
            const runningServerState = this.serverState;
            if (token && runningServerState.type === ServerState.Type.Running) {
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
                executions[0]!
                    .catch(() => {})
                    .finally(() => {
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
            const executionsWithResults = executions.filter<Promise<ServerResponse.Response<ts.server.protocol.Response>>>(e => e !== undefined);
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            Promise.all(executionsWithResults).then(() => {
                this.loadingIndicator.reset();
            });
        }

        return executions[0]!.catch(error => {
            throw new ResponseError(1, (error as Error).message);
        });
    }

    public executeWithoutWaitingForResponse<K extends keyof NoResponseTsServerRequests>(
        command: K,
        args: NoResponseTsServerRequests[K][0],
    ): void {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.executeImpl(command, args, {
            isAsync: false,
            token: undefined,
            expectsResult: false,
        });
    }

    public executeAsync<K extends keyof AsyncTsServerRequests>(
        command: K,
        args: AsyncTsServerRequests[K][0],
        token: CancellationToken,
    ): Promise<ServerResponse.Response<AsyncTsServerRequests[K][1]>> {
        return this.executeImpl(command, args, {
            isAsync: true,
            token,
            expectsResult: true,
        })[0]!;
    }

    // For use by TSServerRequestCommand.
    public executeCustom<K extends keyof TypeScriptRequestTypes>(
        command: K,
        args: any,
        executeInfo?: ExecuteInfo,
    ): Promise<ServerResponse.Response<ts.server.protocol.Response>> {
        const updatedExecuteInfo: ExecuteInfo = {
            expectsResult: true,
            isAsync: false,
            ...executeInfo,
        };
        const executions = this.executeImpl(command, args, updatedExecuteInfo);

        return executions[0]!.catch(error => {
            throw new ResponseError(1, (error as Error).message);
        });
    }

    public interruptGetErr<R>(f: () => R): R {
        return this.documents.interruptGetErr(f);
    }

    public cancelInflightRequestsForResource(resource: URI): void {
        if (this.serverState.type !== ServerState.Type.Running) {
            return;
        }

        for (const request of this.serverState.toCancelOnResourceChange) {
            if (request.resource === resource.toString()) {
                request.cancel();
            }
        }
    }

    // public get configuration(): TypeScriptServiceConfiguration {
    //     return this._configuration;
    // }

    private executeImpl(command: keyof TypeScriptRequestTypes, args: any, executeInfo: ExecuteInfo): Array<Promise<ServerResponse.Response<ts.server.protocol.Response>> | undefined> {
        const serverState = this.serverState;
        if (serverState.type === ServerState.Type.Running) {
            return serverState.server.executeImpl(command, args, executeInfo);
        } else {
            return [Promise.resolve(ServerResponse.NoServer)];
        }
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
}
