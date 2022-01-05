/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as fs from 'fs';
import * as cp from 'child_process';
import * as readline from 'readline';
import * as decoder from 'string_decoder';
import protocol from 'typescript/lib/protocol';
import tempy from 'tempy';

import { CommandTypes } from './tsp-command-types';
import { Logger, PrefixingLogger } from './logger';
import { Deferred } from './utils';
import { CancellationToken } from 'vscode-jsonrpc';

export interface TspClientOptions {
    logger: Logger;
    tsserverPath: string;
    logFile?: string;
    logVerbosity?: string;
    disableAutomaticTypingAcquisition?: boolean;
    maxTsServerMemory?: number;
    npmLocation?: string;
    globalPlugins?: string[];
    pluginProbeLocations?: string[];
    onEvent?: (event: protocol.Event) => void;
    onExit?: (exitCode: number | null, signal: NodeJS.Signals | null) => void;
}

interface TypeScriptRequestTypes {
    'geterr': [protocol.GeterrRequestArgs, any];
    [CommandTypes.GeterrForProject]: [protocol.GeterrForProjectRequestArgs, any];
    'compilerOptionsForInferredProjects': [protocol.SetCompilerOptionsForInferredProjectsArgs, protocol.SetCompilerOptionsForInferredProjectsResponse];
    'documentHighlights': [protocol.DocumentHighlightsRequestArgs, protocol.DocumentHighlightsResponse];
    'applyCodeActionCommand': [protocol.ApplyCodeActionCommandRequestArgs, protocol.ApplyCodeActionCommandResponse];
    'completionEntryDetails': [protocol.CompletionDetailsRequestArgs, protocol.CompletionDetailsResponse];
    'completionInfo': [protocol.CompletionsRequestArgs, protocol.CompletionInfoResponse];
    'configure': [protocol.ConfigureRequestArguments, protocol.ConfigureResponse];
    'definition': [protocol.FileLocationRequestArgs, protocol.DefinitionResponse];
    'definitionAndBoundSpan': [protocol.FileLocationRequestArgs, protocol.DefinitionInfoAndBoundSpanReponse];
    'docCommentTemplate': [protocol.FileLocationRequestArgs, protocol.DocCommandTemplateResponse];
    'format': [protocol.FormatRequestArgs, protocol.FormatResponse];
    'formatonkey': [protocol.FormatOnKeyRequestArgs, protocol.FormatResponse];
    'getApplicableRefactors': [protocol.GetApplicableRefactorsRequestArgs, protocol.GetApplicableRefactorsResponse];
    'getCodeFixes': [protocol.CodeFixRequestArgs, protocol.CodeFixResponse];
    'getCombinedCodeFix': [protocol.GetCombinedCodeFixRequestArgs, protocol.GetCombinedCodeFixResponse];
    'getEditsForFileRename': [protocol.GetEditsForFileRenameRequestArgs, protocol.GetEditsForFileRenameResponse];
    'getEditsForRefactor': [protocol.GetEditsForRefactorRequestArgs, protocol.GetEditsForRefactorResponse];
    'getOutliningSpans': [protocol.FileRequestArgs, protocol.OutliningSpansResponse];
    'getSupportedCodeFixes': [null, protocol.GetSupportedCodeFixesResponse];
    'implementation': [protocol.FileLocationRequestArgs, protocol.ImplementationResponse];
    'jsxClosingTag': [protocol.JsxClosingTagRequestArgs, protocol.JsxClosingTagResponse];
    'navto': [protocol.NavtoRequestArgs, protocol.NavtoResponse];
    'navtree': [protocol.FileRequestArgs, protocol.NavTreeResponse];
    'occurrences': [protocol.FileLocationRequestArgs, protocol.OccurrencesResponse];
    'organizeImports': [protocol.OrganizeImportsRequestArgs, protocol.OrganizeImportsResponse];
    'projectInfo': [protocol.ProjectInfoRequestArgs, protocol.ProjectInfoResponse];
    'quickinfo': [protocol.FileLocationRequestArgs, protocol.QuickInfoResponse];
    'references': [protocol.FileLocationRequestArgs, protocol.ReferencesResponse];
    'rename': [protocol.RenameRequestArgs, protocol.RenameResponse];
    'signatureHelp': [protocol.SignatureHelpRequestArgs, protocol.SignatureHelpResponse];
    'typeDefinition': [protocol.FileLocationRequestArgs, protocol.TypeDefinitionResponse];
    'provideInlayHints': [protocol.InlayHintsRequestArgs, protocol.InlayHintsResponse];
    'encodedSemanticClassifications-full': [protocol.EncodedSemanticClassificationsRequestArgs, protocol.EncodedSemanticClassificationsResponse];
}

export class TspClient {
    private readlineInterface: readline.ReadLine;
    private tsserverProc: cp.ChildProcess;
    private seq = 0;
    private readonly deferreds: { [seq: number]: Deferred<any>; } = {};
    private logger: Logger;
    private tsserverLogger: Logger;
    private cancellationPipeName: string | undefined;

    constructor(private options: TspClientOptions) {
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
            globalPlugins,
            pluginProbeLocations
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

        this.cancellationPipeName = tempy.file({ name: 'tscancellation' });
        args.push('--cancellationPipeName', `${this.cancellationPipeName}*`);
        this.logger.log(`Starting tsserver : '${tsserverPath} ${args.join(' ')}'`);
        const options = {
            silent: true,
            execArgv: [
                ...maxTsServerMemory ? [`--max-old-space-size=${maxTsServerMemory}`] : []
            ]
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
        this.tsserverProc.stdin?.destroy();
        this.tsserverProc.kill();
    }

    notify(command: CommandTypes.Open, args: protocol.OpenRequestArgs): void;
    notify(command: CommandTypes.Close, args: protocol.FileRequestArgs): void;
    notify(command: CommandTypes.Saveto, args: protocol.SavetoRequestArgs): void;
    notify(command: CommandTypes.Change, args: protocol.ChangeRequestArgs): void;
    notify(command: string, args: any): void {
        this.sendMessage(command, true, args);
    }

    request<K extends keyof TypeScriptRequestTypes>(
        command: K,
        args: TypeScriptRequestTypes[K][0],
        token?: CancellationToken
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
                                fs.unlink(requestCancellationPipeName, () => { /* no-op */ })
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
        const request: protocol.Request = {
            command,
            seq: this.seq,
            type: 'request'
        };
        if (args) {
            request.arguments = args;
        }
        const serializedRequest = JSON.stringify(request) + '\n';
        this.tsserverProc.stdin!.write(serializedRequest);
        this.logger.log(notification ? 'notify' : 'request', request);
    }

    protected processMessage(untrimmedMessageString: string): void {
        const messageString = untrimmedMessageString.trim();
        if (!messageString || messageString.startsWith('Content-Length:')) {
            return;
        }
        const message: protocol.Message = JSON.parse(messageString);
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

    private resolveResponse(message: protocol.Message, request_seq: number, success: boolean) {
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

    private isEvent(message: protocol.Message): message is protocol.Event {
        return message.type === 'event';
    }

    private isResponse(message: protocol.Message): message is protocol.Response {
        return message.type === 'response';
    }

    private isRequestCompletedEvent(message: protocol.Message): message is protocol.RequestCompletedEvent {
        return this.isEvent(message) && message.event === 'requestCompleted';
    }
}
