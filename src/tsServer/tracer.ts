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

/* eslint-disable @typescript-eslint/no-unnecessary-qualifier */

import type { ts } from '../ts-protocol.js';
import { Logger } from '../utils/logger.js';

export enum Trace {
    Off,
    Messages,
    Verbose,
}

export type TraceValue = 'off' | 'messages' | 'verbose';

export namespace Trace {
    export function fromString(value: string): Trace {
        value = value.toLowerCase();
        switch (value) {
            case 'off':
                return Trace.Off;
            case 'messages':
                return Trace.Messages;
            case 'verbose':
                return Trace.Verbose;
            default:
                return Trace.Off;
        }
    }
}

interface RequestExecutionMetadata {
    readonly queuingStartTime: number;
}

export default class Tracer {
    constructor(
        private readonly logger: Logger,
        private readonly trace: Trace,
    ) {
    }

    public traceRequest(serverId: string, request: ts.server.protocol.Request, responseExpected: boolean, queueLength: number): void {
        if (this.trace === Trace.Off) {
            return;
        }
        let data: string | undefined = undefined;
        if (this.trace === Trace.Verbose && request.arguments) {
            data = `Arguments: ${JSON.stringify(request.arguments, null, 4)}`;
        }
        this.logTrace(serverId, `Sending request: ${request.command} (${request.seq}). Response expected: ${responseExpected ? 'yes' : 'no'}. Current queue length: ${queueLength}`, data);
    }

    public traceResponse(serverId: string, response: ts.server.protocol.Response, meta: RequestExecutionMetadata): void {
        if (this.trace === Trace.Off) {
            return;
        }
        let data: string | undefined = undefined;
        if (this.trace === Trace.Verbose && response.body) {
            data = `Result: ${JSON.stringify(response.body, null, 4)}`;
        }
        this.logTrace(serverId, `Response received: ${response.command} (${response.request_seq}). Request took ${Date.now() - meta.queuingStartTime} ms. Success: ${response.success} ${!response.success ? `. Message: ${response.message}` : ''}`, data);
    }

    public traceRequestCompleted(serverId: string, command: string, request_seq: number, meta: RequestExecutionMetadata): any {
        if (this.trace === Trace.Off) {
            return;
        }
        this.logTrace(serverId, `Async response received: ${command} (${request_seq}). Request took ${Date.now() - meta.queuingStartTime} ms.`);
    }

    public traceEvent(serverId: string, event: ts.server.protocol.Event): void {
        if (this.trace === Trace.Off) {
            return;
        }
        let data: string | undefined = undefined;
        if (this.trace === Trace.Verbose && event.body) {
            data = `Data: ${JSON.stringify(event.body, null, 4)}`;
        }
        this.logTrace(serverId, `Event received: ${event.event} (${event.seq}).`, data);
    }

    public logTrace(serverId: string, message: string, data?: any): void {
        if (this.trace !== Trace.Off) {
            this.logger.trace('Trace', `<${serverId}> ${message}`, data);
        }
    }
}
