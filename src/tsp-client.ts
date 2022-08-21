/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as fs from 'node:fs';
import * as cp from 'node:child_process';
import * as readline from 'node:readline';
import * as decoder from 'node:string_decoder';
import type tsp from 'typescript/lib/protocol.d.js';
import { CancellationToken } from 'vscode-jsonrpc';
import { temporaryFile } from 'tempy';
import { CommandTypes } from './tsp-command-types.js';
import { Logger, PrefixingLogger } from './logger.js';
import { Deferred } from './utils.js';
import API from './utils/api.js';

export interface TspClientOptions {
    apiVersion: API;
    logger: Logger;
    tsserverPath: string;
    logFile?: string;
    logVerbosity?: string;
    disableAutomaticTypingAcquisition?: boolean;
    maxTsServerMemory?: number;
    npmLocation?: string;
    locale?: string;
    globalPlugins?: string[];
    pluginProbeLocations?: string[];
    onEvent?: (event: tsp.Event) => void;
    onExit?: (exitCode: number | null, signal: NodeJS.Signals | null) => void;
}

interface TypeScriptRequestTypes {
    [CommandTypes.ApplyCodeActionCommand]: [tsp.ApplyCodeActionCommandRequestArgs, tsp.ApplyCodeActionCommandResponse];
    [CommandTypes.CompilerOptionsForInferredProjects]: [tsp.SetCompilerOptionsForInferredProjectsArgs, tsp.SetCompilerOptionsForInferredProjectsResponse];
    [CommandTypes.CompletionDetails]: [tsp.CompletionDetailsRequestArgs, tsp.CompletionDetailsResponse];
    [CommandTypes.CompletionInfo]: [tsp.CompletionsRequestArgs, tsp.CompletionInfoResponse];
    [CommandTypes.Configure]: [tsp.ConfigureRequestArguments, tsp.ConfigureResponse];
    [CommandTypes.Definition]: [tsp.FileLocationRequestArgs, tsp.DefinitionResponse];
    [CommandTypes.DefinitionAndBoundSpan]: [tsp.FileLocationRequestArgs, tsp.DefinitionInfoAndBoundSpanResponse];
    [CommandTypes.DocCommentTemplate]: [tsp.FileLocationRequestArgs, tsp.DocCommandTemplateResponse];
    [CommandTypes.DocumentHighlights]: [tsp.DocumentHighlightsRequestArgs, tsp.DocumentHighlightsResponse];
    [CommandTypes.EncodedSemanticClassificationsFull]: [tsp.EncodedSemanticClassificationsRequestArgs, tsp.EncodedSemanticClassificationsResponse];
    [CommandTypes.FindSourceDefinition]: [tsp.FileLocationRequestArgs, tsp.DefinitionResponse];
    [CommandTypes.Format]: [tsp.FormatRequestArgs, tsp.FormatResponse];
    [CommandTypes.Formatonkey]: [tsp.FormatOnKeyRequestArgs, tsp.FormatResponse];
    [CommandTypes.GetApplicableRefactors]: [tsp.GetApplicableRefactorsRequestArgs, tsp.GetApplicableRefactorsResponse];
    [CommandTypes.GetCodeFixes]: [tsp.CodeFixRequestArgs, tsp.CodeFixResponse];
    [CommandTypes.GetCombinedCodeFix]: [tsp.GetCombinedCodeFixRequestArgs, tsp.GetCombinedCodeFixResponse];
    [CommandTypes.GetEditsForFileRename]: [tsp.GetEditsForFileRenameRequestArgs, tsp.GetEditsForFileRenameResponse];
    [CommandTypes.GetEditsForRefactor]: [tsp.GetEditsForRefactorRequestArgs, tsp.GetEditsForRefactorResponse];
    [CommandTypes.Geterr]: [tsp.GeterrRequestArgs, any];
    [CommandTypes.GetOutliningSpans]: [tsp.FileRequestArgs, tsp.OutliningSpansResponse];
    [CommandTypes.GetSupportedCodeFixes]: [null, tsp.GetSupportedCodeFixesResponse];
    [CommandTypes.Implementation]: [tsp.FileLocationRequestArgs, tsp.ImplementationResponse];
    [CommandTypes.JsxClosingTag]: [tsp.JsxClosingTagRequestArgs, tsp.JsxClosingTagResponse];
    [CommandTypes.Navto]: [tsp.NavtoRequestArgs, tsp.NavtoResponse];
    [CommandTypes.NavTree]: [tsp.FileRequestArgs, tsp.NavTreeResponse];
    [CommandTypes.OrganizeImports]: [tsp.OrganizeImportsRequestArgs, tsp.OrganizeImportsResponse];
    [CommandTypes.ProjectInfo]: [tsp.ProjectInfoRequestArgs, tsp.ProjectInfoResponse];
    [CommandTypes.ProvideInlayHints]: [tsp.InlayHintsRequestArgs, tsp.InlayHintsResponse];
    [CommandTypes.Quickinfo]: [tsp.FileLocationRequestArgs, tsp.QuickInfoResponse];
    [CommandTypes.References]: [tsp.FileLocationRequestArgs, tsp.ReferencesResponse];
    [CommandTypes.Rename]: [tsp.RenameRequestArgs, tsp.RenameResponse];
    [CommandTypes.SignatureHelp]: [tsp.SignatureHelpRequestArgs, tsp.SignatureHelpResponse];
    [CommandTypes.TypeDefinition]: [tsp.FileLocationRequestArgs, tsp.TypeDefinitionResponse];
}

export class TspClient {
    public apiVersion: API;
    private tsserverProc: cp.ChildProcess | null = null;
    private readlineInterface: readline.ReadLine | null = null;
    private seq = 0;
    private readonly deferreds: { [seq: number]: Deferred<any>; } = {};
    private logger: Logger;
    private tsserverLogger: Logger;
    private cancellationPipeName: string | undefined;

    constructor(private options: TspClientOptions) {
        this.apiVersion = options.apiVersion;
        this.logger = new PrefixingLogger(options.logger, '[tsclient]');
        this.tsserverLogger = new PrefixingLogger(options.logger, '[tsserver]');
    }

    start(): boolean {
        if (this.readlineInterface) {
            return false;
        }
        const {
            tsserverPath,
            logFile,
            logVerbosity,
            disableAutomaticTypingAcquisition,
            maxTsServerMemory,
            npmLocation,
            locale,
            globalPlugins,
            pluginProbeLocations,
        } = this.options;
        const args: string[] = [];
        if (logFile) {
            args.push('--logFile', logFile);
        }
        if (logVerbosity) {
            args.push('--logVerbosity', logVerbosity);
        }
        if (globalPlugins && globalPlugins.length) {
            args.push('--globalPlugins', globalPlugins.join(','));
        }
        if (pluginProbeLocations && pluginProbeLocations.length) {
            args.push('--pluginProbeLocations', pluginProbeLocations.join(','));
        }
        if (disableAutomaticTypingAcquisition) {
            args.push('--disableAutomaticTypingAcquisition');
        }
        if (npmLocation) {
            this.logger.info(`using npm from ${npmLocation}`);
            args.push('--npmLocation', npmLocation);
        }
        if (locale) {
            args.push('--locale', locale);
        }

        this.cancellationPipeName = temporaryFile({ name: 'tscancellation' });
        args.push('--cancellationPipeName', `${this.cancellationPipeName}*`);
        this.logger.log(`Starting tsserver : '${tsserverPath} ${args.join(' ')}'`);
        const options = {
            silent: true,
            execArgv: [
                ...maxTsServerMemory ? [`--max-old-space-size=${maxTsServerMemory}`] : [],
            ],
        };
        this.tsserverProc = cp.fork(tsserverPath, args, options);
        this.tsserverProc.on('exit', (exitCode, signal) => {
            this.shutdown();
            if (this.options.onExit) {
                this.options.onExit(exitCode, signal);
            }
        });
        const { stdout, stdin, stderr } = this.tsserverProc;
        if (!stdout || !stdin || !stderr) {
            this.logger.error(`Failed initializing input/output of tsserver (stdin: ${!!stdin}, stdout: ${!!stdout}, stderr: ${!!stderr})`);
            return false;
        }
        this.readlineInterface = readline.createInterface(stdout, stdin, undefined);
        this.readlineInterface.on('line', line => this.processMessage(line));

        const dec = new decoder.StringDecoder('utf-8');
        stderr.addListener('data', data => {
            const stringMsg = typeof data === 'string' ? data : dec.write(data);
            this.tsserverLogger.error(stringMsg);
        });
        return true;
    }

    shutdown(): void {
        this.readlineInterface?.close();
        if (this.tsserverProc) {
            this.tsserverProc.stdin?.destroy();
            this.tsserverProc.kill('SIGTERM');
        }
    }

    notify(command: CommandTypes.Open, args: tsp.OpenRequestArgs): void;
    notify(command: CommandTypes.Close, args: tsp.FileRequestArgs): void;
    notify(command: CommandTypes.Saveto, args: tsp.SavetoRequestArgs): void;
    notify(command: CommandTypes.Change, args: tsp.ChangeRequestArgs): void;
    notify(command: string, args: any): void {
        this.sendMessage(command, true, args);
    }

    request<K extends keyof TypeScriptRequestTypes>(
        command: K,
        args: TypeScriptRequestTypes[K][0],
        token?: CancellationToken,
    ): Promise<TypeScriptRequestTypes[K][1]> {
        this.sendMessage(command, false, args);
        const seq = this.seq;
        const deferred = new Deferred<TypeScriptRequestTypes[K][1]>();
        this.deferreds[seq] = deferred;
        const request = deferred.promise;
        if (token) {
            const onCancelled = token.onCancellationRequested(() => {
                onCancelled.dispose();
                if (this.cancellationPipeName) {
                    const requestCancellationPipeName = `${this.cancellationPipeName}${seq}`;
                    fs.writeFile(requestCancellationPipeName, '', err => {
                        if (!err) {
                            request.then(() =>
                                fs.unlink(requestCancellationPipeName, () => { /* no-op */ }),
                            );
                        }
                    });
                }
            });
        }
        return request;
    }

    protected sendMessage(command: string, notification: boolean, args?: any): void {
        this.seq = this.seq + 1;
        const request: tsp.Request = {
            command,
            seq: this.seq,
            type: 'request',
        };
        if (args) {
            request.arguments = args;
        }
        const serializedRequest = JSON.stringify(request) + '\n';
        if (this.tsserverProc) {
            this.tsserverProc.stdin!.write(serializedRequest);
            this.logger.log(notification ? 'notify' : 'request', request);
        } else {
            this.logger.error(`Message "${command}" couldn't be sent. Tsserver process not started.`);
        }
    }

    protected processMessage(untrimmedMessageString: string): void {
        const messageString = untrimmedMessageString.trim();
        if (!messageString || messageString.startsWith('Content-Length:')) {
            return;
        }
        const message: tsp.Message = JSON.parse(messageString);
        this.logger.log('processMessage', message);
        if (this.isResponse(message)) {
            this.resolveResponse(message, message.request_seq, message.success);
        } else if (this.isEvent(message)) {
            if (this.isRequestCompletedEvent(message)) {
                this.resolveResponse(message, message.body.request_seq, true);
            } else {
                if (this.options.onEvent) {
                    this.options.onEvent(message);
                }
            }
        }
    }

    private resolveResponse(message: tsp.Message, request_seq: number, success: boolean) {
        const deferred = this.deferreds[request_seq];
        this.logger.log('request completed', { request_seq, success });
        if (deferred) {
            if (success) {
                this.deferreds[request_seq].resolve(message);
            } else {
                this.deferreds[request_seq].reject(message);
            }
            delete this.deferreds[request_seq];
        }
    }

    private isEvent(message: tsp.Message): message is tsp.Event {
        return message.type === 'event';
    }

    private isResponse(message: tsp.Message): message is tsp.Response {
        return message.type === 'response';
    }

    private isRequestCompletedEvent(message: tsp.Message): message is tsp.RequestCompletedEvent {
        return this.isEvent(message) && message.event === 'requestCompleted';
    }
}
