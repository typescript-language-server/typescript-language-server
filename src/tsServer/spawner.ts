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
import API from '../utils/api.js';
import { ClientCapabilities, ClientCapability, ServerType } from '../typescriptService.js';
import { Logger, LogLevel } from '../utils/logger.js';
import type { TsClientOptions } from '../ts-client.js';
import { nodeRequestCancellerFactory } from './cancellation.js';
import type { ILogDirectoryProvider } from './logDirectoryProvider.js';
import type { PluginManager } from './plugins.js';
import { ITypeScriptServer, SingleTsServer, SyntaxRoutingTsServer, TsServerDelegate, TsServerProcessKind } from './server.js';
import { NodeTsServerProcessFactory } from './serverProcess.js';
import type Tracer from './tracer.js';
import type { TypeScriptVersion } from './versionProvider.js';
import { SyntaxServerConfiguration, TsServerLogLevel } from '../utils/configuration.js';

const enum CompositeServerType {
    /** Run a single server that handles all commands  */
    Single,

    /** Run a separate server for syntax commands */
    SeparateSyntax,

    /** Use a separate syntax server while the project is loading */
    DynamicSeparateSyntax,

    /** Only enable the syntax server */
    SyntaxOnly
}

export class TypeScriptServerSpawner {
    public constructor(
        private readonly _apiVersion: API,
        private readonly _logDirectoryProvider: ILogDirectoryProvider,
        private readonly _logger: Logger,
        private readonly _tracer: Tracer,
    ) { }

    public spawn(
        version: TypeScriptVersion,
        capabilities: ClientCapabilities,
        configuration: TsClientOptions,
        pluginManager: PluginManager,
        delegate: TsServerDelegate,
    ): ITypeScriptServer {
        let primaryServer: ITypeScriptServer;
        const serverType = this.getCompositeServerType(version, capabilities, configuration);

        switch (serverType) {
            case CompositeServerType.SeparateSyntax:
            case CompositeServerType.DynamicSeparateSyntax:
            {
                const enableDynamicRouting = serverType === CompositeServerType.DynamicSeparateSyntax;
                primaryServer = new SyntaxRoutingTsServer({
                    syntax: this.spawnTsServer(TsServerProcessKind.Syntax, version, configuration, pluginManager),
                    semantic: this.spawnTsServer(TsServerProcessKind.Semantic, version, configuration, pluginManager),
                }, delegate, enableDynamicRouting);
                break;
            }
            case CompositeServerType.Single:
            {
                primaryServer = this.spawnTsServer(TsServerProcessKind.Main, version, configuration, pluginManager);
                break;
            }
            case CompositeServerType.SyntaxOnly:
            {
                primaryServer = this.spawnTsServer(TsServerProcessKind.Syntax, version, configuration, pluginManager);
                break;
            }
        }

        return primaryServer;
    }

    private getCompositeServerType(
        version: TypeScriptVersion,
        capabilities: ClientCapabilities,
        configuration: TsClientOptions,
    ): CompositeServerType {
        if (!capabilities.has(ClientCapability.Semantic)) {
            return CompositeServerType.SyntaxOnly;
        }

        switch (configuration.useSyntaxServer) {
            case SyntaxServerConfiguration.Always:
                return CompositeServerType.SyntaxOnly;

            case SyntaxServerConfiguration.Never:
                return CompositeServerType.Single;

            case SyntaxServerConfiguration.Auto:
                if (version.version?.gte(API.v340)) {
                    return version.version?.gte(API.v400)
                        ? CompositeServerType.DynamicSeparateSyntax
                        : CompositeServerType.SeparateSyntax;
                }
                return CompositeServerType.Single;
        }
    }

    private spawnTsServer(
        kind: TsServerProcessKind,
        version: TypeScriptVersion,
        configuration: TsClientOptions,
        pluginManager: PluginManager,
    ): ITypeScriptServer {
        const processFactory = new NodeTsServerProcessFactory();
        const canceller = nodeRequestCancellerFactory.create(kind, this._tracer);
        const { args, tsServerLogFile } = this.getTsServerArgs(kind, configuration, this._apiVersion, pluginManager, canceller.cancellationPipeName);

        if (this.isLoggingEnabled(configuration)) {
            if (tsServerLogFile) {
                this._logger.logIgnoringVerbosity(LogLevel.Info, `<${kind}> Log file: ${tsServerLogFile}`);
            } else {
                this._logger.logIgnoringVerbosity(LogLevel.Error, `<${kind}> Could not create log directory`);
            }
        }

        const tsProcess = processFactory.fork(version, args, kind, configuration);
        this._logger.log('Starting tsserver');
        return new SingleTsServer(
            kind,
            this.kindToServerType(kind),
            tsProcess,
            tsServerLogFile,
            canceller,
            version,
            this._tracer);
    }

    private kindToServerType(kind: TsServerProcessKind): ServerType {
        switch (kind) {
            case TsServerProcessKind.Syntax:
                return ServerType.Syntax;

            case TsServerProcessKind.Main:
            case TsServerProcessKind.Semantic:
            case TsServerProcessKind.Diagnostics:
            default:
                return ServerType.Semantic;
        }
    }

    private getTsServerArgs(
        kind: TsServerProcessKind,
        configuration: TsClientOptions,
        // currentVersion: TypeScriptVersion,
        apiVersion: API,
        pluginManager: PluginManager,
        cancellationPipeName: string | undefined,
    ): { args: string[]; tsServerLogFile: string | undefined; tsServerTraceDirectory: string | undefined; } {
        const args: string[] = [];
        let tsServerLogFile: string | undefined;
        let tsServerTraceDirectory: string | undefined;

        if (kind === TsServerProcessKind.Syntax) {
            if (apiVersion.gte(API.v401)) {
                args.push('--serverMode', 'partialSemantic');
            } else {
                args.push('--syntaxOnly');
            }
        }

        args.push('--useInferredProjectPerProjectRoot');

        const { disableAutomaticTypingAcquisition, locale, npmLocation } = configuration;

        if (disableAutomaticTypingAcquisition || kind === TsServerProcessKind.Syntax || kind === TsServerProcessKind.Diagnostics) {
            args.push('--disableAutomaticTypingAcquisition');
        }

        // if (kind === TsServerProcessKind.Semantic || kind === TsServerProcessKind.Main) {
        //     args.push('--enableTelemetry');
        // }

        if (cancellationPipeName) {
            args.push('--cancellationPipeName', `${cancellationPipeName}*`);
        }

        if (this.isLoggingEnabled(configuration)) {
            const logDir = this._logDirectoryProvider.getNewLogDirectory();
            if (logDir) {
                tsServerLogFile = path.join(logDir, 'tsserver.log');
                args.push('--logVerbosity', TsServerLogLevel.toString(configuration.logVerbosity));
                args.push('--logFile', tsServerLogFile);
            }
        }

        // if (configuration.enableTsServerTracing) {
        //     tsServerTraceDirectory = this._logDirectoryProvider.getNewLogDirectory();
        //     if (tsServerTraceDirectory) {
        //         args.push('--traceDirectory', tsServerTraceDirectory);
        //     }
        // }

        const pluginPaths: string[] = [];

        if (pluginManager.plugins.length) {
            args.push('--globalPlugins', pluginManager.plugins.map(x => x.name).join(','));

            for (const plugin of pluginManager.plugins) {
                pluginPaths.push(plugin.uri.fsPath);
            }
        }

        if (pluginPaths.length !== 0) {
            args.push('--pluginProbeLocations', pluginPaths.join(','));
        }

        if (npmLocation) {
            this._logger.info(`using npm from ${npmLocation}`);
            args.push('--npmLocation', `"${npmLocation}"`);
        }

        args.push('--locale', locale || 'en');
        // args.push('--noGetErrOnBackgroundUpdate');
        args.push('--validateDefaultNpmLocation');

        return { args, tsServerLogFile, tsServerTraceDirectory };
    }

    private isLoggingEnabled(configuration: TsClientOptions) {
        return configuration.logVerbosity !== TsServerLogLevel.Off;
    }
}

