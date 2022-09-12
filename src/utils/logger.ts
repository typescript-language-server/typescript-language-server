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

import lsp from 'vscode-languageserver';
import type { LspClient } from '../lsp-client.js';

type TraceLevel = 'Trace' | 'Info' | 'Error';

export interface Logger {
    error(...arg: any[]): void;
    warn(...arg: any[]): void;
    info(...arg: any[]): void;
    log(...arg: any[]): void;
    /**
     * Logs the arguments regardless of the logging level.
     */
    trace(...arg: any[]): void;
}

export class LspClientLogger implements Logger {
    constructor(protected client: LspClient, protected level: lsp.MessageType) { }

    protected sendMessage(severity: lsp.MessageType, messageObjects: any[], options?: { overrideLevel?: boolean; }): void {
        if (this.level >= severity || options?.overrideLevel) {
            const message = messageObjects.map(p => {
                if (typeof p === 'object') {
                    return JSON.stringify(p, null, 2);
                } else {
                    return p;
                }
            }).join(' ');

            this.client.logMessage({
                type: severity,
                message: message,
            });
        }
    }

    error(...arg: any[]): void {
        this.sendMessage(lsp.MessageType.Error, arg);
    }

    warn(...arg: any[]): void {
        this.sendMessage(lsp.MessageType.Warning, arg);
    }

    info(...arg: any[]): void {
        this.sendMessage(lsp.MessageType.Info, arg);
    }

    log(...arg: any[]): void {
        this.sendMessage(lsp.MessageType.Log, arg);
    }

    trace(...arg: any[]): void {
        this.sendMessage(lsp.MessageType.Log, arg, { overrideLevel: true });
    }
}

export enum ConsoleLogLevel {
    error = 'error',
    warn = 'warn',
    info = 'warn',
    verbose = 'verbose',
}

export class ConsoleLogger implements Logger {
    constructor(private level: lsp.MessageType = lsp.MessageType.Info) {}

    static toMessageTypeLevel(type?: string): lsp.MessageType {
        switch (type) {
            case 'error':
                return lsp.MessageType.Error;
            case 'warn':
                return lsp.MessageType.Warning;
            case 'log':
                return lsp.MessageType.Log;
            case 'info':
            default:
                return lsp.MessageType.Info;
        }
    }

    private print(type: keyof Logger, level: lsp.MessageType, ...arg: any[]): void {
        if (this.level >= level) {
            // eslint-disable-next-line no-console
            console[type](...this.toStrings(arg));
        }
    }

    private toStrings(...arg: any[]): string[] {
        return arg.map(a => JSON.stringify(a, null, 2));
    }

    error(...arg: any[]): void {
        this.print('error', lsp.MessageType.Error, arg);
    }
    warn(...arg: any[]): void {
        this.print('error', lsp.MessageType.Warning, arg);
    }
    info(...arg: any[]): void {
        this.print('error', lsp.MessageType.Info, arg);
    }
    log(...arg: any[]): void {
        this.print('error', lsp.MessageType.Log, arg);
    }
    trace(...arg: any[]): void {
        this.log(arg);
    }
}

export class PrefixingLogger implements Logger {
    constructor(private logger: Logger, private prefix: string) { }

    error(...arg: any[]): void {
        this.logger.error(this.prefix, ...arg);
    }

    warn(...arg: any[]): void {
        this.logger.warn(this.prefix, ...arg);
    }

    info(...arg: any[]): void {
        this.logger.info(this.prefix, ...arg);
    }

    log(...arg: any[]): void {
        this.logger.log(this.prefix, ...arg);
    }

    trace(level: TraceLevel, message: string, data?: any): void {
        this.logger.trace(this.prefix, `[${level}  - ${now()}] ${message}`);
        if (data) {
            this.logger.trace(this.prefix, data2String(data));
        }
    }
}

function now(): string {
    const now = new Date();
    return padLeft(`${now.getUTCHours()}`, 2, '0')
            + ':' + padLeft(`${now.getMinutes()}`, 2, '0')
            + ':' + padLeft(`${now.getUTCSeconds()}`, 2, '0') + `.${now.getMilliseconds()}`;
}

function padLeft(s: string, n: number, pad = ' ') {
    return pad.repeat(Math.max(0, n - s.length)) + s;
}

function data2String(data: any): string {
    if (data instanceof Error) {
        return data.stack || data.message;
    }
    if (data.success === false && data.message) {
        return data.message;
    }
    return data.toString();
}
