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

import type tsp from 'typescript/lib/protocol.d.js';
import type lsp from 'vscode-languageserver';
import type { CancellationToken } from 'vscode-jsonrpc';
import { CommandTypes, EventTypes } from './tsp-command-types.js';
import { Logger, PrefixingLogger } from './utils/logger.js';
import API from './utils/api.js';
import type { ILogDirectoryProvider } from './tsServer/logDirectoryProvider.js';
import { ExecConfig, ServerResponse, TypeScriptRequestTypes } from './tsServer/requests.js';
import type { ITypeScriptServer, TypeScriptServerExitEvent } from './tsServer/server.js';
import { TypeScriptServerError } from './tsServer/serverError.js';
import { TypeScriptServerSpawner } from './tsServer/spawner.js';
import Tracer, { Trace } from './tsServer/tracer.js';
import type { TypeScriptVersion } from './tsServer/versionProvider.js';
import type { LspClient } from './lsp-client.js';
import type { TsServerLogLevel } from './utils/configuration.js';

class ServerInitializingIndicator {
    private _loadingProjectName?: string;
    private _progressReporter?: lsp.WorkDoneProgressReporter;

    constructor(private lspClient: LspClient) {}

    public reset(): void {
        if (this._loadingProjectName) {
            this._loadingProjectName = undefined;
            if (this._progressReporter) {
                this._progressReporter.done();
                this._progressReporter = undefined;
            }
        }
    }

    public async startedLoadingProject(projectName: string): Promise<void> {
        // TS projects are loaded sequentially. Cancel existing task because it should always be resolved before
        // the incoming project loading task is.
        this.reset();

        this._loadingProjectName = projectName;
        this._progressReporter = await this.lspClient.createProgressReporter();
        this._progressReporter.begin('Initializing JS/TS language features…');
    }

    public finishedLoadingProject(projectName: string): void {
        if (this._loadingProjectName === projectName) {
            this._loadingProjectName = undefined;
            if (this._progressReporter) {
                this._progressReporter.done();
                this._progressReporter = undefined;
            }
        }
    }
}

export interface TspClientOptions {
    lspClient: LspClient;
    trace: Trace;
    typescriptVersion: TypeScriptVersion;
    logger: Logger;
    logVerbosity: TsServerLogLevel;
    logDirectoryProvider: ILogDirectoryProvider;
    disableAutomaticTypingAcquisition?: boolean;
    maxTsServerMemory?: number;
    npmLocation?: string;
    locale?: string;
    globalPlugins?: string[];
    pluginProbeLocations?: string[];
    onEvent?: (event: tsp.Event) => void;
    onExit?: (exitCode: number | null, signal: NodeJS.Signals | null) => void;
}

export class TspClient {
    public apiVersion: API;
    private primaryTsServer: ITypeScriptServer | null = null;
    private logger: Logger;
    private tsserverLogger: Logger;
    private loadingIndicator: ServerInitializingIndicator;
    private tracer: Tracer;

    constructor(private options: TspClientOptions) {
        this.apiVersion = options.typescriptVersion.version || API.defaultVersion;
        this.logger = new PrefixingLogger(options.logger, '[tsclient]');
        this.tsserverLogger = new PrefixingLogger(options.logger, '[tsserver]');
        this.loadingIndicator = new ServerInitializingIndicator(options.lspClient);
        this.tracer = new Tracer(this.tsserverLogger, options.trace);
    }

    start(): boolean {
        const tsServerSpawner = new TypeScriptServerSpawner(this.apiVersion, this.options.logDirectoryProvider, this.logger, this.tracer);
        const tsServer = tsServerSpawner.spawn(this.options.typescriptVersion, this.options);
        tsServer.onExit((data: TypeScriptServerExitEvent) => {
            this.shutdown();
            this.tsserverLogger.error(`Exited. Code: ${data.code}. Signal: ${data.signal}`);
            if (this.options.onExit) {
                this.options.onExit(data.code, data.signal);
            }
        });
        tsServer.onError((err: Error) => {
            if (err) {
                this.tsserverLogger.error('Exited with error. Error message is: {0}', err.message || err.name);
            }
            this.serviceExited();
        });
        tsServer.onEvent(event => this.dispatchEvent(event));
        this.primaryTsServer = tsServer;
        return true;
    }

    private serviceExited(): void {
        this.primaryTsServer = null;
        this.loadingIndicator.reset();
    }

    private dispatchEvent(event: tsp.Event) {
        switch (event.event) {
            case EventTypes.SyntaxDiag:
            case EventTypes.SementicDiag:
            case EventTypes.SuggestionDiag: {
                // This event also roughly signals that projects have been loaded successfully (since the TS server is synchronous)
                this.loadingIndicator.reset();
                this.options.onEvent?.(event);
                break;
            }
            // case EventTypes.ConfigFileDiag:
            //     this._onConfigDiagnosticsReceived.fire(event as tsp.ConfigFileDiagnosticEvent);
            //     break;
            // case EventTypes.projectLanguageServiceState: {
            //     const body = (event as tsp.ProjectLanguageServiceStateEvent).body!;
            //     if (this.serverState.type === ServerState.Type.Running) {
            //         this.serverState.updateLanguageServiceEnabled(body.languageServiceEnabled);
            //     }
            //     this._onProjectLanguageServiceStateChanged.fire(body);
            //     break;
            // }
            // case EventTypes.projectsUpdatedInBackground: {
            //     this.loadingIndicator.reset();
            //     const body = (event as tsp.ProjectsUpdatedInBackgroundEvent).body;
            //     const resources = body.openFiles.map(file => this.toResource(file));
            //     this.bufferSyncSupport.getErr(resources);
            //     break;
            // }
            // case EventTypes.beginInstallTypes:
            //     this._onDidBeginInstallTypings.fire((event as tsp.BeginInstallTypesEvent).body);
            //     break;
            // case EventTypes.endInstallTypes:
            //     this._onDidEndInstallTypings.fire((event as tsp.EndInstallTypesEvent).body);
            //     break;
            // case EventTypes.typesInstallerInitializationFailed:
            //     this._onTypesInstallerInitializationFailed.fire((event as tsp.TypesInstallerInitializationFailedEvent).body);
            //     break;
            case EventTypes.ProjectLoadingStart:
                this.loadingIndicator.startedLoadingProject((event as tsp.ProjectLoadingStartEvent).body.projectName);
                break;
            case EventTypes.ProjectLoadingFinish:
                this.loadingIndicator.finishedLoadingProject((event as tsp.ProjectLoadingFinishEvent).body.projectName);
                break;
        }
    }

    shutdown(): void {
        if (this.loadingIndicator) {
            this.loadingIndicator.reset();
        }
        if (this.primaryTsServer) {
            this.primaryTsServer.kill();
        }
    }

    // High-level API.

    public notify(command: CommandTypes.Open, args: tsp.OpenRequestArgs): void;
    public notify(command: CommandTypes.Close, args: tsp.FileRequestArgs): void;
    public notify(command: CommandTypes.Change, args: tsp.ChangeRequestArgs): void;
    public notify(command: keyof TypeScriptRequestTypes, args: any): void {
        this.executeWithoutWaitingForResponse(command, args);
    }

    public requestGeterr(args: tsp.GeterrRequestArgs, token: CancellationToken): Promise<any> {
        return this.executeAsync(CommandTypes.Geterr, args, token);
    }

    public request<K extends keyof TypeScriptRequestTypes>(
        command: K,
        args: TypeScriptRequestTypes[K][0],
        token?: CancellationToken,
        config?: ExecConfig,
    ): Promise<TypeScriptRequestTypes[K][1]> {
        return this.execute(command, args, token, config);
    }

    // Low-level API.

    public execute(command: keyof TypeScriptRequestTypes, args: any, token?: CancellationToken, config?: ExecConfig): Promise<ServerResponse.Response<tsp.Response>> {
        let executions: Array<Promise<ServerResponse.Response<tsp.Response>> | undefined> | undefined;

        // if (config?.cancelOnResourceChange) {
        //     if (this.primaryTsServer) {
        //         const source = new CancellationTokenSource();
        //         token.onCancellationRequested(() => source.cancel());

        //         const inFlight: ToCancelOnResourceChanged = {
        //             resource: config.cancelOnResourceChange,
        //             cancel: () => source.cancel(),
        //         };
        //         runningServerState.toCancelOnResourceChange.add(inFlight);

        //         executions = this.executeImpl(command, args, {
        //             isAsync: false,
        //             token: source.token,
        //             expectsResult: true,
        //             ...config,
        //         });
        //         executions[0]!.finally(() => {
        //             runningServerState.toCancelOnResourceChange.delete(inFlight);
        //             source.dispose();
        //         });
        //     }
        // }

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

    public executeWithoutWaitingForResponse(command: keyof TypeScriptRequestTypes, args: any): void {
        this.executeImpl(command, args, {
            isAsync: false,
            token: undefined,
            expectsResult: false,
        });
    }

    public executeAsync(command: keyof TypeScriptRequestTypes, args: tsp.GeterrRequestArgs, token: CancellationToken): Promise<ServerResponse.Response<tsp.Response>> {
        return this.executeImpl(command, args, {
            isAsync: true,
            token,
            expectsResult: true,
        })[0]!;
    }

    private executeImpl(command: keyof TypeScriptRequestTypes, args: any, executeInfo: { isAsync: boolean; token?: CancellationToken; expectsResult: boolean; lowPriority?: boolean; requireSemantic?: boolean; }): Array<Promise<ServerResponse.Response<tsp.Response>> | undefined> {
        if (this.primaryTsServer) {
            return this.primaryTsServer.executeImpl(command, args, executeInfo);
        } else {
            return [Promise.resolve(ServerResponse.NoServer)];
        }
    }

    private fatalError(command: string, error: unknown): void {
        this.tsserverLogger.error(`A non-recoverable error occurred while executing command: ${command}`);
        if (error instanceof TypeScriptServerError && error.serverErrorText) {
            this.tsserverLogger.error(error.serverErrorText);
        }

        if (this.primaryTsServer) {
            this.logger.info('Killing TS Server');
            this.primaryTsServer.kill();
            if (error instanceof TypeScriptServerError) {
                this.primaryTsServer = null;
            }
        }
    }
}
