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

import API from '../utils/api.js';
import { ServerType } from './requests.js';
import { Logger } from '../logger.js';
import type { TspClientOptions } from '../tsp-client.js';
import { nodeRequestCancellerFactory } from './cancellation.js';
import { ITypeScriptServer, ProcessBasedTsServer, TsServerProcessKind } from './server.js';
import { NodeTsServerProcessFactory } from './serverProcess.js';
import type { TypeScriptVersion } from './versionProvider.js';

export class TypeScriptServerSpawner {
    public constructor(
        private readonly _apiVersion: API,
        // private readonly _logDirectoryProvider: ILogDirectoryProvider,
        private readonly _logger: Logger,
    ) { }

    public spawn(
        version: TypeScriptVersion,
        configuration: TspClientOptions,
    ): ITypeScriptServer {
        const kind = TsServerProcessKind.Main;
        const processFactory = new NodeTsServerProcessFactory();
        const canceller = nodeRequestCancellerFactory.create(/*kind, this._tracer*/);
        const { args, tsServerLogFile } = this.getTsServerArgs(TsServerProcessKind.Main, configuration, this._apiVersion, canceller.cancellationPipeName);
        const process = processFactory.fork(version, args, TsServerProcessKind.Main, configuration);
        this._logger.log('Starting tsserver');
        return new ProcessBasedTsServer(
            kind,
            this.kindToServerType(kind),
            process,
            tsServerLogFile,
            canceller,
            version,
            /*this._telemetryReporter,
            this._tracer*/);
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
        configuration: TspClientOptions,
        // currentVersion: TypeScriptVersion,
        apiVersion: API,
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

        if (apiVersion.gte(API.v250)) {
            args.push('--useInferredProjectPerProjectRoot');
        } else {
            args.push('--useSingleInferredProject');
        }

        const {
            disableAutomaticTypingAcquisition,
            globalPlugins,
            locale,
            logFile,
            logVerbosity,
            npmLocation,
            pluginProbeLocations,
        } = configuration;
        if (disableAutomaticTypingAcquisition || kind === TsServerProcessKind.Syntax || kind === TsServerProcessKind.Diagnostics) {
            args.push('--disableAutomaticTypingAcquisition');
        }
        // if (kind === TsServerProcessKind.Semantic || kind === TsServerProcessKind.Main) {
        //     args.push('--enableTelemetry');
        // }
        if (cancellationPipeName) {
            args.push('--cancellationPipeName', cancellationPipeName + '*');
        }
        // if (TspClient.isLoggingEnabled(configuration)) {
        //     const logDir = this._logDirectoryProvider.getNewLogDirectory();
        //     if (logDir) {
        //         tsServerLogFile = path.join(logDir, 'tsserver.log');
        //         args.push('--logVerbosity', TsServerLogLevel.toString(configuration.tsServerLogLevel));
        //         args.push('--logFile', tsServerLogFile);
        //     }
        // }
        if (logFile) {
            args.push('--logFile', logFile);
        }
        if (logVerbosity) {
            args.push('--logVerbosity', logVerbosity);
        }
        // if (configuration.enableTsServerTracing) {
        //     tsServerTraceDirectory = this._logDirectoryProvider.getNewLogDirectory();
        //     if (tsServerTraceDirectory) {
        //         args.push('--traceDirectory', tsServerTraceDirectory);
        //     }
        // }
        // const pluginPaths = this._pluginPathsProvider.getPluginPaths();
        // if (pluginManager.plugins.length) {
        //     args.push('--globalPlugins', pluginManager.plugins.map(x => x.name).join(','));
        //     const isUsingBundledTypeScriptVersion = currentVersion.path === this._versionProvider.defaultVersion.path;
        //     for (const plugin of pluginManager.plugins) {
        //         if (isUsingBundledTypeScriptVersion || plugin.enableForWorkspaceTypeScriptVersions) {
        //             pluginPaths.push(isWeb() ? plugin.uri.toString() : plugin.uri.fsPath);
        //         }
        //     }
        // }
        // if (pluginPaths.length !== 0) {
        //     args.push('--pluginProbeLocations', pluginPaths.join(','));
        // }
        if (globalPlugins && globalPlugins.length) {
            args.push('--globalPlugins', globalPlugins.join(','));
        }
        if (pluginProbeLocations && pluginProbeLocations.length) {
            args.push('--pluginProbeLocations', pluginProbeLocations.join(','));
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
}

