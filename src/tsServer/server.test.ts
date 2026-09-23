/*
 * Copyright (C) 2026 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { describe, it, expect } from 'vitest';
import { SingleTsServer, type TsServerProcess } from './server.js';
import { noopRequestCancellerFactory } from './cancellation.js';
import Tracer, { Trace } from './tracer.js';
import { TypeScriptVersionProvider } from './versionProvider.js';
import { ServerResponse, ServerType } from '../typescriptService.js';
import { CommandTypes, type ts } from '../ts-protocol.js';
import { ConsoleLogger } from '../utils/logger.js';

const logger = new ConsoleLogger();
const tracer = new Tracer(logger, Trace.Off);
const bundled = new TypeScriptVersionProvider(undefined, logger).bundledVersion()!;

/** A tsserver process that never answers and can be brought down on demand. */
class FakeProcess implements TsServerProcess {
    public readonly written: ts.server.protocol.Request[] = [];
    private exitHandler: (code: number | null, signal: NodeJS.Signals | null) => void = () => {};
    private errorHandler: (error: Error) => void = () => {};

    write(serverRequest: ts.server.protocol.Request): void {
        this.written.push(serverRequest);
    }
    onData(): void {}
    onExit(handler: (code: number | null, signal: NodeJS.Signals | null) => void): void {
        this.exitHandler = handler;
    }
    onError(handler: (error: Error) => void): void {
        this.errorHandler = handler;
    }
    onStdErr(): void {}
    kill(): void {}

    exit(code: number | null, signal: NodeJS.Signals | null): void {
        this.exitHandler(code, signal);
    }
    error(error: Error): void {
        this.errorHandler(error);
    }
}

function createServer(process: FakeProcess): SingleTsServer {
    return new SingleTsServer('test', ServerType.Syntax, process, undefined, noopRequestCancellerFactory.create('test', tracer), bundled, tracer);
}

function navTree(server: SingleTsServer) {
    return server.executeImpl(CommandTypes.NavTree, { file: '/a.ts' }, { isAsync: false, expectsResult: true })[0]!;
}

describe('SingleTsServer', () => {
    it.each([
        ['exits', (process: FakeProcess) => process.exit(null, 'SIGKILL')],
        ['errors', (process: FakeProcess) => process.error(new Error('channel closed'))],
    ])('cancels pending, queued and later requests when the process %s', async (_, bringDown) => {
        const process = new FakeProcess();
        const server = createServer(process);
        const pending = navTree(server);
        const queued = navTree(server);
        expect(process.written).toHaveLength(1);

        bringDown(process);
        const later = navTree(server);

        for (const response of await Promise.all([pending, queued, later])) {
            expect(response).toBeInstanceOf(ServerResponse.Cancelled);
        }
        expect(process.written).toHaveLength(1);
    });
});
