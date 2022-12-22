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

/* eslint-disable @typescript-eslint/no-unnecessary-qualifier */

import lsp from 'vscode-languageserver';
import type { LspClient } from '../lsp-client.js';

export enum LogLevel {
    Error,
    Warning,
    Info,
    Log,
}

export namespace LogLevel {
    export function fromString(value?: string): LogLevel {
        switch (value?.toLowerCase()) {
            case 'log':
                return LogLevel.Log;
            case 'info':
                return LogLevel.Info;
            case 'warning':
                return LogLevel.Warning;
            case 'error':
            default:
                return LogLevel.Error;
        }
    }

    export function toString(level: LogLevel): string {
        switch (level) {
            case LogLevel.Error:
                return 'error';
            case LogLevel.Warning:
                return 'warning';
            case LogLevel.Info:
                return 'info';
            case LogLevel.Log:
                return 'log';
        }
    }
}

type TraceLevel = 'Trace' | 'Info' | 'Error';

export interface Logger {
    error(...args: any[]): void;
    warn(...args: any[]): void;
    info(...args: any[]): void;
    log(...args: any[]): void;
    /**
     * Logs the arguments regardless of the verbosity level set for the logger.
     */
    logIgnoringVerbosity(level: LogLevel, ...args: any[]): void;
    /**
     * Logs the arguments regardless of the verbosity level in a trace-specific format.
     */
    trace(level: TraceLevel, message: string, data?: any): void;
}

export class LspClientLogger implements Logger {
    constructor(
        private client: LspClient,
        private level: lsp.MessageType,
    ) {}

    private sendMessage(severity: lsp.MessageType, messageObjects: any[], options?: { overrideLevel?: boolean; }): void {
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

    private logLevelToLspMessageType(level: LogLevel): lsp.MessageType {
        switch (level) {
            case LogLevel.Log:
                return lsp.MessageType.Log;
            case LogLevel.Info:
                return lsp.MessageType.Info;
            case LogLevel.Warning:
                return lsp.MessageType.Warning;
            case LogLevel.Error:
                return lsp.MessageType.Error;
        }
    }

    error(...args: any[]): void {
        this.sendMessage(lsp.MessageType.Error, args);
    }

    warn(...args: any[]): void {
        this.sendMessage(lsp.MessageType.Warning, args);
    }

    info(...args: any[]): void {
        this.sendMessage(lsp.MessageType.Info, args);
    }

    log(...args: any[]): void {
        this.sendMessage(lsp.MessageType.Log, args);
    }

    logIgnoringVerbosity(level: LogLevel, ...args: any[]): void {
        this.sendMessage(this.logLevelToLspMessageType(level), args, { overrideLevel: true });
    }

    trace(level: TraceLevel, message: string, data?: any): void {
        this.logIgnoringVerbosity(LogLevel.Log, `[${level}  - ${now()}] ${message}`);
        if (data) {
            this.logIgnoringVerbosity(LogLevel.Log, data2String(data));
        }
    }
}

export class ConsoleLogger implements Logger {
    constructor(
        private level: LogLevel = LogLevel.Error,
    ) {}

    private print(level: LogLevel, args: any[], options?: { overrideLevel?: boolean; }): void {
        if (this.level >= level || options?.overrideLevel) {
            // All messages logged to stderr as stdout is reserved for LSP communication.
            console.error(`[${LogLevel.toString(level)}]`, ...this.toStrings(...args));
        }
    }

    private toStrings(...args: any[]): string[] {
        return args.map(a => {
            if (typeof a === 'string') {
                return a;
            }
            return JSON.stringify(a, null, 2);
        });
    }

    error(...args: any[]): void {
        this.print(LogLevel.Error, args);
    }

    warn(...args: any[]): void {
        this.print(LogLevel.Warning, args);
    }

    info(...args: any[]): void {
        this.print(LogLevel.Info, args);
    }

    log(...args: any[]): void {
        this.print(LogLevel.Log, args);
    }

    logIgnoringVerbosity(level: LogLevel, ...args: any[]): void {
        this.print(level, args, { overrideLevel: true });
    }

    trace(level: TraceLevel, message: string, data?: any): void {
        this.logIgnoringVerbosity(LogLevel.Log, `[${level}  - ${now()}] ${message}`);
        if (data) {
            this.logIgnoringVerbosity(LogLevel.Log, data2String(data));
        }
    }
}

export class PrefixingLogger implements Logger {
    constructor(
        private logger: Logger,
        private prefix: string,
    ) {}

    error(...args: any[]): void {
        this.logger.error(this.prefix, ...args);
    }

    warn(...args: any[]): void {
        this.logger.warn(this.prefix, ...args);
    }

    info(...args: any[]): void {
        this.logger.info(this.prefix, ...args);
    }

    log(...args: any[]): void {
        this.logger.log(this.prefix, ...args);
    }

    logIgnoringVerbosity(level: LogLevel, ...args: any[]): void {
        this.logger.logIgnoringVerbosity(level, this.prefix, ...args);
    }

    trace(level: TraceLevel, message: string, data?: any): void {
        this.logIgnoringVerbosity(LogLevel.Log, this.prefix, `[${level}  - ${now()}] ${message}`);
        if (data) {
            this.logIgnoringVerbosity(LogLevel.Log, this.prefix, data2String(data));
        }
    }
}

function now(): string {
    const now = new Date();
    return `${padLeft(`${now.getUTCHours()}`, 2, '0')}:${padLeft(`${now.getMinutes()}`, 2, '0')}:${padLeft(`${now.getUTCSeconds()}`, 2, '0')}.${now.getMilliseconds()}`;
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
