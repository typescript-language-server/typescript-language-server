/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/*
 * Copyright (C) 2022 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as lsp from 'vscode-languageserver';
import { CancellationToken } from 'vscode-jsonrpc';
import { RequestItem, RequestQueue, RequestQueueingType } from './requestQueue.js';
import { ServerResponse, ServerType, TypeScriptRequestTypes } from '../typescriptService.js';
import { CommandTypes, EventName, ts } from '../ts-protocol.js';
import type { TspClientOptions } from '../tsp-client.js';
import { OngoingRequestCanceller } from './cancellation.js';
import { CallbackMap } from './callbackMap.js';
import { TypeScriptServerError } from './serverError.js';
import type Tracer from './tracer.js';
import type { TypeScriptVersion } from './versionProvider.js';

export enum ExecutionTarget {
    Semantic,
    Syntax
}

export interface TypeScriptServerExitEvent {
    readonly code: number | null;
    readonly signal: NodeJS.Signals | null;
}

type OnEventHandler = (e: ts.server.protocol.Event) => any;
type OnExitHandler = (e: TypeScriptServerExitEvent) => any;
type OnErrorHandler = (e: any) => any;
type OnStdErrHandler = (e: string) => any;

export interface ITypeScriptServer {
    onEvent(handler: OnEventHandler): void;
    onExit(handler: OnExitHandler): void;
    onError(handler: OnErrorHandler): void;
    onStdErr(handler: OnStdErrHandler): void;

    readonly tsServerLogFile: string | undefined;

    kill(): void;

    /**
     * @return A list of all execute requests. If there are multiple entries, the first item is the primary
     * request while the rest are secondary ones.
     */
    executeImpl(command: keyof TypeScriptRequestTypes, args: any, executeInfo: { isAsync: boolean; token?: CancellationToken; expectsResult: boolean; lowPriority?: boolean; executionTarget?: ExecutionTarget; }): Array<Promise<ServerResponse.Response<ts.server.protocol.Response>> | undefined>;

    dispose(): void;
}

export interface TsServerDelegate {
    onFatalError(command: string, error: Error): void;
}

export const enum TsServerProcessKind {
    Main = 'main',
    Syntax = 'syntax',
    Semantic = 'semantic',
    Diagnostics = 'diagnostics'
}

export interface TsServerProcessFactory {
    fork(
        version: TypeScriptVersion,
        args: readonly string[],
        kind: TsServerProcessKind,
        configuration: TspClientOptions,
    ): TsServerProcess;
}

export interface TsServerProcess {
    write(serverRequest: ts.server.protocol.Request): void;

    onData(handler: (data: ts.server.protocol.Response) => void): void;
    onExit(handler: (code: number | null, signal: NodeJS.Signals | null) => void): void;
    onError(handler: (error: Error) => void): void;
    onStdErr(handler: (code: string) => void): void;

    kill(): void;
}

export class SingleTsServer implements ITypeScriptServer {
    private readonly _requestQueue = new RequestQueue();
    private readonly _callbacks = new CallbackMap<ts.server.protocol.Response>();
    private readonly _pendingResponses = new Set<number>();
    private readonly _eventHandlers = new Set<OnEventHandler>();
    private readonly _exitHandlers = new Set<OnExitHandler>();
    private readonly _errorHandlers = new Set<OnErrorHandler>();
    private readonly _stdErrHandlers = new Set<OnStdErrHandler>();

    constructor(
        private readonly _serverId: string,
        private readonly _serverSource: ServerType,
        private readonly _process: TsServerProcess,
        private readonly _tsServerLogFile: string | undefined,
        private readonly _requestCanceller: OngoingRequestCanceller,
        private readonly _version: TypeScriptVersion,
        private readonly _tracer: Tracer,
    ) {
        this._process.onData(msg => {
            this.dispatchMessage(msg);
        });

        this._process.onStdErr(error => {
            this._stdErrHandlers.forEach(handler => handler(error));
        });

        this._process.onExit((code, signal) => {
            this._exitHandlers.forEach(handler => handler({ code, signal }));
            this._callbacks.destroy('server exited');
        });

        this._process.onError(error => {
            this._errorHandlers.forEach(handler => handler(error));
            this._callbacks.destroy('server errored');
        });
    }

    public onEvent(handler: OnEventHandler): void {
        this._eventHandlers.add(handler);
    }

    public onExit(handler: OnExitHandler): void {
        this._exitHandlers.add(handler);
    }

    public onStdErr(handler: OnStdErrHandler): void {
        this._stdErrHandlers.add(handler);
    }

    public onError(handler: OnErrorHandler): void {
        this._errorHandlers.add(handler);
    }

    public get tsServerLogFile(): string | undefined {
        return this._tsServerLogFile;
    }

    private write(serverRequest: ts.server.protocol.Request) {
        this._process.write(serverRequest);
    }

    public dispose(): void {
        this._callbacks.destroy('server disposed');
        this._pendingResponses.clear();
        this._eventHandlers.clear();
        this._exitHandlers.clear();
        this._errorHandlers.clear();
    }

    public kill(): void {
        this.dispose();
        this._process.kill();
    }

    private dispatchMessage(message: ts.server.protocol.Message) {
        try {
            switch (message.type) {
                case 'response':
                    if (this._serverSource) {
                        this.dispatchResponse({
                            ...(message as ts.server.protocol.Response),
                        });
                    } else {
                        this.dispatchResponse(message as ts.server.protocol.Response);
                    }
                    break;

                case 'event': {
                    const event = message as ts.server.protocol.Event;
                    if (event.event === 'requestCompleted') {
                        const seq = (event as ts.server.protocol.RequestCompletedEvent).body.request_seq;
                        const callback = this._callbacks.fetch(seq);
                        if (callback) {
                            this._tracer.traceRequestCompleted(this._serverId, 'requestCompleted', seq, callback);
                            callback.onSuccess(undefined);
                        }
                    } else {
                        this._tracer.traceEvent(this._serverId, event);
                        this._eventHandlers.forEach(handler => handler(event));
                    }
                    break;
                }
                default:
                    throw new Error(`Unknown message type ${message.type} received`);
            }
        } finally {
            this.sendNextRequests();
        }
    }

    private tryCancelRequest(seq: number, command: string): boolean {
        try {
            if (this._requestQueue.tryDeletePendingRequest(seq)) {
                this.logTrace(`Canceled request with sequence number ${seq}`);
                return true;
            }

            if (this._requestCanceller.tryCancelOngoingRequest(seq)) {
                return true;
            }

            this.logTrace(`Tried to cancel request with sequence number ${seq}. But request got already delivered.`);
            return false;
        } finally {
            const callback = this.fetchCallback(seq);
            callback?.onSuccess(new ServerResponse.Cancelled(`Cancelled request ${seq} - ${command}`));
        }
    }

    private dispatchResponse(response: ts.server.protocol.Response) {
        const callback = this.fetchCallback(response.request_seq);
        if (!callback) {
            return;
        }

        this._tracer.traceResponse(this._serverId, response, callback);
        if (response.success) {
            callback.onSuccess(response);
        } else if (response.message === 'No content available.') {
            // Special case where response itself is successful but there is not any data to return.
            callback.onSuccess(ServerResponse.NoContent);
        } else {
            callback.onError(TypeScriptServerError.create(this._serverId, this._version, response));
        }
    }

    public executeImpl(command: keyof TypeScriptRequestTypes, args: any, executeInfo: { isAsync: boolean; token?: CancellationToken; expectsResult: boolean; lowPriority?: boolean; executionTarget?: ExecutionTarget; }): Array<Promise<ServerResponse.Response<ts.server.protocol.Response>> | undefined> {
        const request = this._requestQueue.createRequest(command, args);
        const requestInfo: RequestItem = {
            request,
            expectsResponse: executeInfo.expectsResult,
            isAsync: executeInfo.isAsync,
            queueingType: SingleTsServer.getQueueingType(command, executeInfo.lowPriority),
        };
        let result: Promise<ServerResponse.Response<ts.server.protocol.Response>> | undefined;
        if (executeInfo.expectsResult) {
            result = new Promise<ServerResponse.Response<ts.server.protocol.Response>>((resolve, reject) => {
                this._callbacks.add(request.seq, { onSuccess: resolve as () => ServerResponse.Response<ts.server.protocol.Response> | undefined, onError: reject, queuingStartTime: Date.now(), isAsync: executeInfo.isAsync }, executeInfo.isAsync);

                if (executeInfo.token) {
                    executeInfo.token.onCancellationRequested(() => {
                        this.tryCancelRequest(request.seq, command);
                    });
                }
            });
        }

        this._requestQueue.enqueue(requestInfo);
        this.sendNextRequests();

        return [result];
    }

    private sendNextRequests(): void {
        // console.error({ pending: this._pendingResponses.size, queue: this._requestQueue.length });
        while (this._pendingResponses.size === 0 && this._requestQueue.length > 0) {
            const item = this._requestQueue.dequeue();
            if (item) {
                this.sendRequest(item);
            }
        }
    }

    private sendRequest(requestItem: RequestItem): void {
        const serverRequest = requestItem.request;
        this._tracer.traceRequest(this._serverId, serverRequest, requestItem.expectsResponse, this._requestQueue.length);

        if (requestItem.expectsResponse && !requestItem.isAsync) {
            this._pendingResponses.add(requestItem.request.seq);
        }

        try {
            this.write(serverRequest);
        } catch (err) {
            const callback = this.fetchCallback(serverRequest.seq);
            callback?.onError(err as Error);
        }
    }

    private fetchCallback(seq: number) {
        const callback = this._callbacks.fetch(seq);
        if (!callback) {
            return undefined;
        }

        this._pendingResponses.delete(seq);
        return callback;
    }

    private logTrace(message: string) {
        this._tracer.logTrace(this._serverId, message);
    }

    private static readonly fenceCommands = new Set(['change', 'close', 'open', 'updateOpen']);

    private static getQueueingType(
        command: string,
        lowPriority?: boolean,
    ): RequestQueueingType {
        if (SingleTsServer.fenceCommands.has(command)) {
            return RequestQueueingType.Fence;
        }
        return lowPriority ? RequestQueueingType.LowPriority : RequestQueueingType.Normal;
    }
}

interface ExecuteInfo {
    readonly isAsync: boolean;
    readonly token?: CancellationToken;
    readonly expectsResult: boolean;
    readonly lowPriority?: boolean;
    readonly executionTarget?: ExecutionTarget;
}

class RequestRouter {
    private static readonly sharedCommands = new Set<keyof TypeScriptRequestTypes>([
        CommandTypes.Change,
        CommandTypes.Close,
        CommandTypes.Open,
        CommandTypes.UpdateOpen,
        CommandTypes.Configure,
    ]);

    constructor(
        private readonly servers: ReadonlyArray<{
            readonly server: ITypeScriptServer;
            canRun?(command: keyof TypeScriptRequestTypes, executeInfo: ExecuteInfo): boolean;
        }>,
        private readonly delegate: TsServerDelegate,
    ) { }

    public execute(
        command: keyof TypeScriptRequestTypes,
        args: any,
        executeInfo: ExecuteInfo,
    ): Array<Promise<ServerResponse.Response<ts.server.protocol.Response>> | undefined> {
        if (RequestRouter.sharedCommands.has(command) && typeof executeInfo.executionTarget === 'undefined') {
            // Dispatch shared commands to all servers but use first one as the primary response

            const requestStates: RequestState.State[] = this.servers.map(() => RequestState.Unresolved);

            // Also make sure we never cancel requests to just one server
            let token: CancellationToken | undefined = undefined;
            if (executeInfo.token) {
                const source = new lsp.CancellationTokenSource();
                executeInfo.token.onCancellationRequested(() => {
                    if (requestStates.some(state => state === RequestState.Resolved)) {
                        // Don't cancel.
                        // One of the servers completed this request so we don't want to leave the other
                        // in a different state.
                        return;
                    }
                    source.cancel();
                });
                token = source.token;
            }

            const allRequests: Array<Promise<ServerResponse.Response<ts.server.protocol.Response>> | undefined> = [];

            for (let serverIndex = 0; serverIndex < this.servers.length; ++serverIndex) {
                const server = this.servers[serverIndex].server;

                const request = server.executeImpl(command, args, { ...executeInfo, token })[0];
                allRequests.push(request);
                if (request) {
                    request
                        .then(result => {
                            requestStates[serverIndex] = RequestState.Resolved;
                            const erroredRequest = requestStates.find(state => state.type === RequestState.Type.Errored) as RequestState.Errored | undefined;
                            if (erroredRequest) {
                                // We've gone out of sync
                                this.delegate.onFatalError(command, erroredRequest.err);
                            }
                            return result;
                        }, err => {
                            requestStates[serverIndex] = new RequestState.Errored(err);
                            if (requestStates.some(state => state === RequestState.Resolved)) {
                                // We've gone out of sync
                                this.delegate.onFatalError(command, err);
                            }
                            throw err;
                        });
                }
            }

            return allRequests;
        }

        for (const { canRun, server } of this.servers) {
            if (!canRun || canRun(command, executeInfo)) {
                return server.executeImpl(command, args, executeInfo);
            }
        }

        throw new Error(`Could not find server for command: '${command}'`);
    }
}

export class SyntaxRoutingTsServer implements ITypeScriptServer {
    /**
     * Commands that should always be run on the syntax server.
     */
    private static readonly syntaxAlwaysCommands = new Set<keyof TypeScriptRequestTypes>([
        CommandTypes.NavTree,
        CommandTypes.GetOutliningSpans,
        CommandTypes.JsxClosingTag,
        CommandTypes.SelectionRange,
        CommandTypes.Format,
        CommandTypes.Formatonkey,
        CommandTypes.DocCommentTemplate,
    ]);

    /**
     * Commands that should always be run on the semantic server.
     */
    private static readonly semanticCommands = new Set<keyof TypeScriptRequestTypes>([
        CommandTypes.Geterr,
        CommandTypes.GeterrForProject,
        CommandTypes.ProjectInfo,
        CommandTypes.ConfigurePlugin,
    ]);

    /**
     * Commands that can be run on the syntax server but would benefit from being upgraded to the semantic server.
     */
    private static readonly syntaxAllowedCommands = new Set<keyof TypeScriptRequestTypes>([
        CommandTypes.CompletionEntryDetails,
        CommandTypes.CompletionInfo,
        CommandTypes.Definition,
        CommandTypes.DefinitionAndBoundSpan,
        CommandTypes.DocumentHighlights,
        CommandTypes.Implementation,
        CommandTypes.Navto,
        CommandTypes.Quickinfo,
        CommandTypes.References,
        CommandTypes.Rename,
        CommandTypes.SignatureHelp,
    ]);

    private readonly syntaxServer: ITypeScriptServer;
    private readonly semanticServer: ITypeScriptServer;
    private readonly router: RequestRouter;

    private _projectLoading = true;
    private readonly _eventHandlers = new Set<OnEventHandler>();
    private readonly _exitHandlers = new Set<OnExitHandler>();
    private readonly _errorHandlers = new Set<OnErrorHandler>();

    public constructor(
        servers: { syntax: ITypeScriptServer; semantic: ITypeScriptServer; },
        delegate: TsServerDelegate,
        enableDynamicRouting: boolean,
    ) {
        this.syntaxServer = servers.syntax;
        this.semanticServer = servers.semantic;

        this.router = new RequestRouter(
            [
                {
                    server: this.syntaxServer,
                    canRun: (command, execInfo) => {
                        switch (execInfo.executionTarget) {
                            case ExecutionTarget.Semantic:
                                return false;
                            case ExecutionTarget.Syntax:
                                return true;
                        }

                        if (SyntaxRoutingTsServer.syntaxAlwaysCommands.has(command)) {
                            return true;
                        }
                        if (SyntaxRoutingTsServer.semanticCommands.has(command)) {
                            return false;
                        }
                        if (enableDynamicRouting && this.projectLoading && SyntaxRoutingTsServer.syntaxAllowedCommands.has(command)) {
                            return true;
                        }
                        return false;
                    },
                }, {
                    server: this.semanticServer,
                    canRun: undefined, /* gets all other commands */
                },
            ],
            delegate);

        this.syntaxServer.onEvent(event => {
            this._eventHandlers.forEach(handler => handler(event));
        });

        this.semanticServer.onEvent(event => {
            switch (event.event) {
                case EventName.projectLoadingStart:
                    this._projectLoading = true;
                    break;

                case EventName.projectLoadingFinish:
                case EventName.semanticDiag:
                case EventName.syntaxDiag:
                case EventName.suggestionDiag:
                case EventName.configFileDiag:
                    this._projectLoading = false;
                    break;
            }
            this._eventHandlers.forEach(handler => handler(event));
        });

        this.semanticServer.onExit(event => {
            this._exitHandlers.forEach(handler => handler(event));
            this.syntaxServer.kill();
        });

        this.semanticServer.onError(event => this._errorHandlers.forEach(handler => handler(event)));
    }

    private get projectLoading() {
        return this._projectLoading;
    }

    public dispose(): void {
        this._eventHandlers.clear();
        this._exitHandlers.clear();
        this._errorHandlers.clear();
    }

    public onEvent(handler: OnEventHandler): void {
        this._eventHandlers.add(handler);
    }

    public onExit(handler: OnExitHandler): void {
        this._exitHandlers.add(handler);
    }

    public onError(handler: OnErrorHandler): void {
        this._errorHandlers.add(handler);
    }

    public onStdErr(_handler: OnStdErrHandler): void {
    }

    public get tsServerLogFile(): string | undefined {
        return this.semanticServer.tsServerLogFile;
    }

    public kill(): void {
        this.dispose();
        this.syntaxServer.kill();
        this.semanticServer.kill();
    }

    public executeImpl(command: keyof TypeScriptRequestTypes, args: any, executeInfo: { isAsync: boolean; token?: CancellationToken; expectsResult: boolean; lowPriority?: boolean; executionTarget?: ExecutionTarget; }): Array<Promise<ServerResponse.Response<ts.server.protocol.Response>> | undefined> {
        return this.router.execute(command, args, executeInfo);
    }
}

namespace RequestState {
    export const enum Type { Unresolved, Resolved, Errored }

    export const Unresolved = { type: Type.Unresolved } as const;

    export const Resolved = { type: Type.Resolved } as const;

    export class Errored {
        readonly type = Type.Errored;

        constructor(
            public readonly err: Error,
        ) { }
    }

    export type State = typeof Unresolved | typeof Resolved | Errored;
}
