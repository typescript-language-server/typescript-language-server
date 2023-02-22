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

import { Logger, PrefixingLogger } from './utils/logger.js';
import API from './utils/api.js';
import type { ts } from './ts-protocol.js';
import type { ILogDirectoryProvider } from './tsServer/logDirectoryProvider.js';
import { ClientCapability } from './typescriptService.js';
import { TypeScriptServerSpawner } from './tsServer/spawner.js';
import Tracer, { Trace } from './tsServer/tracer.js';
import type { TypeScriptVersion, TypeScriptVersionSource } from './tsServer/versionProvider.js';
import type { LspClient } from './lsp-client.js';
import { SyntaxServerConfiguration, TsServerLogLevel } from './utils/configuration.js';

export interface TspClientOptions {
    lspClient: LspClient;
    trace: Trace;
    typescriptVersion: TypeScriptVersion;
    logger: Logger;
    logVerbosity: TsServerLogLevel;
    logDirectoryProvider: ILogDirectoryProvider;
    disableAutomaticTypingAcquisition?: boolean;
    enableProjectDiagnostics: boolean;
    maxTsServerMemory?: number;
    npmLocation?: string;
    locale?: string;
    globalPlugins?: string[];
    pluginProbeLocations?: string[];
    onEvent?: (event: ts.server.protocol.Event) => void;
    onExit?: (exitCode: number | null, signal: NodeJS.Signals | null) => void;
    useSyntaxServer: SyntaxServerConfiguration;
}

export class TspClient {
    public apiVersion: API;
    public typescriptVersionSource: TypeScriptVersionSource;
    private serverState: ServerState.State = ServerState.None;
    private logger: Logger;
    private tsserverLogger: Logger;
    private loadingIndicator: ServerInitializingIndicator;
    private tracer: Tracer;

    constructor(private options: TspClientOptions) {
        this.apiVersion = options.typescriptVersion.version || API.defaultVersion;
        this.typescriptVersionSource = options.typescriptVersion.source;
        this.logger = new PrefixingLogger(options.logger, '[tsclient]');
        this.tsserverLogger = new PrefixingLogger(options.logger, '[tsserver]');
        this.loadingIndicator = new ServerInitializingIndicator(options.lspClient);
        this.tracer = new Tracer(this.tsserverLogger, options.trace);
    }

    start(): boolean {
        const tsServerSpawner = new TypeScriptServerSpawner(this.apiVersion, this.options.logDirectoryProvider, this.logger, this.tracer);
        const tsServer = tsServerSpawner.spawn(this.options.typescriptVersion, this.capabilities, this.options, {
            onFatalError: (command, err) => this.fatalError(command, err),
        });
        this.serverState = new ServerState.Running(tsServer, this.apiVersion, undefined, true);
        tsServer.onExit((data: TypeScriptServerExitEvent) => {
            this.serverState = ServerState.None;
            this.shutdown();
            this.tsserverLogger.error(`Exited. Code: ${data.code}. Signal: ${data.signal}`);
            if (this.options.onExit) {
                this.options.onExit(data.code, data.signal);
            }
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
        if (this.apiVersion.gte(API.v300) && this.capabilities.has(ClientCapability.Semantic)) {
            this.loadingIndicator.startedLoadingProject('');
        }
        return true;
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
}
