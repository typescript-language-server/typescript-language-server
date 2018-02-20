/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as cp from 'child_process';
import * as readline from 'readline';
import * as decoder from 'string_decoder';
import * as protocol from 'typescript/lib/protocol';

import { CommandTypes } from './tsp-command-types';
import { Logger, PrefixingLogger } from './logger';
import { Deferred } from './utils';

export interface TspClientOptions {
    logger: Logger;
    tsserverPath: string;
    logFile?: string;
    logVerbosity?: string;
    onEvent?: (event: protocol.Event) => void;
}

export class TspClient {
    private readlineInterface: readline.ReadLine;
    private tsserverProc: cp.ChildProcess;
    private seq = 0;

    private buffer = '';
    private header: Record<string, any> | undefined;

    private deferreds = {};

    private logger: Logger
    private tsserverLogger: Logger

    constructor(private options: TspClientOptions) {
        this.logger = new PrefixingLogger(options.logger, '[tsclient]')
        this.tsserverLogger = new PrefixingLogger(options.logger, '[tsserver]')
    }

    start() {
        if (this.readlineInterface) {
            return;
        }
        const args: string[] = []
        if (this.options.logFile) {
            args.push('--logFile');
            args.push(this.options.logFile);
        }
        if (this.options.logVerbosity) {
            args.push('--logVerbosity');
            args.push(this.options.logVerbosity);
        }
        this.logger.info(`Starting tsserver : '${this.options.tsserverPath} ${args.join(' ')}'`);
        this.tsserverProc = cp.spawn(this.options.tsserverPath, args);
        this.readlineInterface = readline.createInterface(this.tsserverProc.stdout, this.tsserverProc.stdin, undefined);
        process.on('exit', () => {
            this.readlineInterface.close();
            this.tsserverProc.stdin.destroy();
            this.tsserverProc.kill();
        });
        this.readlineInterface.on('line', line => this.processMessage(line));

        const dec = new decoder.StringDecoder("utf-8");
        this.tsserverProc.stderr.addListener('data', data => {
            const stringMsg = typeof data === 'string' ? data : dec.write(data);
            this.tsserverLogger.error(stringMsg);
        });
    }

    notify(command: CommandTypes.Open, args: protocol.OpenRequestArgs)
    notify(command: CommandTypes.Close, args: protocol.FileRequestArgs)
    notify(command: CommandTypes.Saveto, args: protocol.SavetoRequestArgs)
    notify(command: CommandTypes.Change, args: protocol.ChangeRequestArgs)
    notify(command: string, args: object) {
        this.logger.log("notify", command, args);
        this.sendMessage(command, true, args);
    }

    request(command: CommandTypes.Definition, args: protocol.FileLocationRequestArgs): Promise<protocol.DefinitionResponse>
    request(command: CommandTypes.Format, args: protocol.FormatRequestArgs): Promise<protocol.FormatResponse>
    request(command: CommandTypes.GetApplicableRefactors, args: protocol.CodeFixRequestArgs): Promise<protocol.GetCodeFixesResponse>
    request(command: CommandTypes.GetCodeFixes, args: protocol.CodeFixRequestArgs): Promise<protocol.GetCodeFixesResponse>
    request(command: CommandTypes.Geterr, args: protocol.GeterrRequestArgs): Promise<protocol.RequestCompletedEvent>
    request(command: CommandTypes.GeterrForProject, args: protocol.GeterrForProjectRequestArgs): Promise<protocol.RequestCompletedEvent>
    request(command: CommandTypes.Navto, args: protocol.NavtoRequestArgs): Promise<protocol.NavtoResponse>
    request(command: CommandTypes.NavTree, args: protocol.FileRequestArgs): Promise<protocol.NavTreeResponse>
    request(command: CommandTypes.Completions, args: protocol.CompletionsRequestArgs): Promise<protocol.CompletionsResponse>
    request(command: CommandTypes.CompletionDetails, args: protocol.CompletionDetailsRequestArgs): Promise<protocol.CompletionDetailsResponse>
    request(command: CommandTypes.DocumentHighlights, args: protocol.DocumentHighlightsRequestArgs): Promise<protocol.DocumentHighlightsResponse>
    request(command: CommandTypes.Quickinfo, args: protocol.FileLocationRequestArgs): Promise<protocol.QuickInfoResponse>
    request(command: CommandTypes.Rename, args: protocol.RenameRequestArgs): Promise<protocol.RenameResponse>
    request(command: CommandTypes.References, args: protocol.FileLocationRequestArgs): Promise<protocol.ReferencesResponse>
    request(command: CommandTypes.SignatureHelp, args: protocol.SignatureHelpRequestArgs): Promise<protocol.SignatureHelpResponse>
    request(command: string, args: object): Promise<object> {
        this.logger.log("request", command, args);
        return this.sendMessage(command, false, args)!;
    }

    protected sendMessage(command: string, notification: boolean, args?: any): Promise<any> | undefined {
        this.seq = this.seq + 1;
        let request: protocol.Request = {
            command,
            seq: this.seq,
            type: 'request'
        };
        if (args) {
            request.arguments = args;
        }
        const serializedRequest = JSON.stringify(request) + "\n";
        this.tsserverProc.stdin.write(serializedRequest);
        if (notification) {
            return;
        } else {
            return (this.deferreds[this.seq] = new Deferred<any>(command)).promise;
        }
    }

    protected processMessage(untrimmedMessageString: string): void {
        const messageString = untrimmedMessageString.trim();
        if (!messageString || messageString.startsWith('Content-Length:')) {
            return;
        }
        const message: protocol.Message = JSON.parse(messageString);
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
        this.logger.log('has deferred', !!deferred, message, Object.keys(this.deferreds));
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
