/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { LspClient } from './lsp-client.js';
import * as lsp from 'vscode-languageserver';

/**
 * the logger type
 */
export interface Logger {
    error(...arg: any[]): void;
    warn(...arg: any[]): void;
    info(...arg: any[]): void;
    log(...arg: any[]): void;
}

export class LspClientLogger implements Logger {
    constructor(protected client: LspClient, protected level: lsp.MessageType) { }

    protected sendMessage(severity: lsp.MessageType, messageObjects: any[]): void {
        if (this.level >= severity) {
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
}
