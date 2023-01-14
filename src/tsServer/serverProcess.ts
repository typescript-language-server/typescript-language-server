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

import ChildProcess from 'node:child_process';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { TsServerProcess, TsServerProcessFactory, TsServerProcessKind } from './server.js';
import type { ts } from '../ts-protocol.js';
import type { TspClientOptions } from '../tsp-client.js';
import API from '../utils/api.js';
import type { TypeScriptVersion } from './versionProvider.js';

export class NodeTsServerProcessFactory implements TsServerProcessFactory {
    fork(
        version: TypeScriptVersion,
        args: readonly string[],
        kind: TsServerProcessKind,
        configuration: TspClientOptions,
    ): TsServerProcess {
        const tsServerPath = version.tsServerPath;
        const useIpc = version.version?.gte(API.v490);

        const runtimeArgs = [...args];
        if (useIpc) {
            runtimeArgs.push('--useNodeIpc');
        }

        const childProcess = ChildProcess.fork(tsServerPath, runtimeArgs, {
            silent: true,
            cwd: undefined,
            env: generatePatchedEnv(process.env, tsServerPath),
            execArgv: getExecArgv(kind, configuration),
            stdio: useIpc ? ['pipe', 'pipe', 'pipe', 'ipc'] : undefined,
        });

        return useIpc ? new IpcChildServerProcess(childProcess) : new StdioChildServerProcess(childProcess);
    }
}

function generatePatchedEnv(env: any, modulePath: string): any {
    const newEnv = Object.assign({}, env);
    newEnv.NODE_PATH = path.join(modulePath, '..', '..', '..');
    // Ensure we always have a PATH set
    newEnv.PATH = newEnv.PATH || process.env.PATH;
    return newEnv;
}

function getExecArgv(kind: TsServerProcessKind, configuration: TspClientOptions): string[] {
    const args: string[] = [];
    const debugPort = getDebugPort(kind);
    if (debugPort) {
        const inspectFlag = getTssDebugBrk() ? '--inspect-brk' : '--inspect';
        args.push(`${inspectFlag}=${debugPort}`);
    }
    if (configuration.maxTsServerMemory) {
        args.push(`--max-old-space-size=${configuration.maxTsServerMemory}`);
    }
    return args;
}

function getDebugPort(kind: TsServerProcessKind): number | undefined {
    if (kind === TsServerProcessKind.Syntax) {
        // We typically only want to debug the main semantic server
        return undefined;
    }
    const value = getTssDebugBrk() || getTssDebug();
    if (value) {
        const port = parseInt(value);
        if (!isNaN(port)) {
            return port;
        }
    }
    return undefined;
}

function getTssDebug(): string | undefined {
    return process.env.TSS_DEBUG;
}

function getTssDebugBrk(): string | undefined {
    return process.env.TSS_DEBUG_BRK;
}

class IpcChildServerProcess implements TsServerProcess {
    constructor(
        private readonly _process: ChildProcess.ChildProcess,
    ) {}

    write(serverRequest: ts.server.protocol.Request): void {
        this._process.send(serverRequest);
    }

    onData(handler: (data: ts.server.protocol.Response) => void): void {
        this._process.on('message', handler);
    }

    onExit(handler: (code: number | null, signal: NodeJS.Signals | null) => void): void {
        this._process.on('exit', handler);
    }

    onStdErr(handler: (data: string) => void): void {
        this._process.stderr!.on('data', data => handler(data.toString()));
    }

    onError(handler: (err: Error) => void): void {
        this._process.on('error', handler);
    }

    kill(): void {
        this._process.kill();
    }
}

class StdioChildServerProcess implements TsServerProcess {
    private _reader: Reader<ts.server.protocol.Response> | null;

    constructor(
        private readonly _process: ChildProcess.ChildProcess,
    ) {
        this._reader = new Reader<ts.server.protocol.Response>(this._process.stdout!);
    }

    private get reader(): Reader<ts.server.protocol.Response> {
        return this._reader!;
    }

    write(serverRequest: ts.server.protocol.Request): void {
        this._process.stdin!.write(`${JSON.stringify(serverRequest)}\r\n`, 'utf8');
    }

    onData(handler: (data: ts.server.protocol.Response) => void): void {
        this.reader.onData(handler);
    }

    onExit(handler: (code: number | null, signal: NodeJS.Signals | null) => void): void {
        this._process.on('exit', handler);
    }

    onStdErr(handler: (data: string) => void): void {
        this._process.stderr!.on('data', data => handler(data.toString()));
    }

    onError(handler: (err: Error) => void): void {
        this._process.on('error', handler);
        this.reader.onError(handler);
    }

    kill(): void {
        this._process.kill();
        this.reader.dispose();
        this._reader = null;
    }
}

class Reader<T> {
    private readonly buffer: ProtocolBuffer = new ProtocolBuffer();
    private nextMessageLength = -1;
    private _onError = (_error: Error) => {};
    private _onData = (_data: T) => {};
    private isDisposed = false;

    public constructor(readable: Readable) {
        readable.on('data', data => this.onLengthData(data));
    }

    public dispose() {
        this.isDisposed = true;
        this._onError = (_error: Error) => {};
        this._onData = (_data: T) => {};
    }

    public onError(handler: (error: Error) => void): void {
        this._onError = handler;
    }

    public onData(handler: (data: T) => void): void {
        this._onData = handler;
    }

    private onLengthData(data: Buffer | string): void {
        if (this.isDisposed) {
            return;
        }

        try {
            this.buffer.append(data);
            // eslint-disable-next-line no-constant-condition
            while (true) {
                if (this.nextMessageLength === -1) {
                    this.nextMessageLength = this.buffer.tryReadContentLength();
                    if (this.nextMessageLength === -1) {
                        return;
                    }
                }
                const msg = this.buffer.tryReadContent(this.nextMessageLength);
                if (msg === null) {
                    return;
                }
                this.nextMessageLength = -1;
                const json = JSON.parse(msg);
                this._onData(json);
            }
        } catch (e) {
            this._onError(e as Error);
        }
    }
}

const defaultSize = 8192;
const contentLength = 'Content-Length: ';
const contentLengthSize: number = Buffer.byteLength(contentLength, 'utf8');
const blank: number = Buffer.from(' ', 'utf8')[0];
const backslashR: number = Buffer.from('\r', 'utf8')[0];
const backslashN: number = Buffer.from('\n', 'utf8')[0];

class ProtocolBuffer {
    private index = 0;
    private buffer: Buffer = Buffer.allocUnsafe(defaultSize);

    public append(data: string | Buffer): void {
        let toAppend: Buffer | null = null;
        if (Buffer.isBuffer(data)) {
            toAppend = data;
        } else {
            toAppend = Buffer.from(data, 'utf8');
        }
        if (this.buffer.length - this.index >= toAppend.length) {
            toAppend.copy(this.buffer, this.index, 0, toAppend.length);
        } else {
            const newSize = (Math.ceil((this.index + toAppend.length) / defaultSize) + 1) * defaultSize;
            if (this.index === 0) {
                this.buffer = Buffer.allocUnsafe(newSize);
                toAppend.copy(this.buffer, 0, 0, toAppend.length);
            } else {
                this.buffer = Buffer.concat([this.buffer.slice(0, this.index), toAppend], newSize);
            }
        }
        this.index += toAppend.length;
    }

    public tryReadContentLength(): number {
        let result = -1;
        let current = 0;
        // we are utf8 encoding...
        while (current < this.index && (this.buffer[current] === blank || this.buffer[current] === backslashR || this.buffer[current] === backslashN)) {
            current++;
        }
        if (this.index < current + contentLengthSize) {
            return result;
        }
        current += contentLengthSize;
        const start = current;
        while (current < this.index && this.buffer[current] !== backslashR) {
            current++;
        }
        if (current + 3 >= this.index || this.buffer[current + 1] !== backslashN || this.buffer[current + 2] !== backslashR || this.buffer[current + 3] !== backslashN) {
            return result;
        }
        const data = this.buffer.toString('utf8', start, current);
        result = parseInt(data);
        this.buffer = this.buffer.slice(current + 4);
        this.index = this.index - (current + 4);
        return result;
    }

    public tryReadContent(length: number): string | null {
        if (this.index < length) {
            return null;
        }
        const result = this.buffer.toString('utf8', 0, length);
        let sourceStart = length;
        while (sourceStart < this.index && (this.buffer[sourceStart] === backslashR || this.buffer[sourceStart] === backslashN)) {
            sourceStart++;
        }
        this.buffer.copy(this.buffer, 0, sourceStart);
        this.index = this.index - sourceStart;
        return result;
    }
}
