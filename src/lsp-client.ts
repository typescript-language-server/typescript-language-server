/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as lsp from 'vscode-languageserver';
import { MessageType } from 'vscode-languageserver';
import { attachWorkDone } from 'vscode-languageserver/lib/common/progress.js';
import { TypeScriptRenameRequest } from './ts-protocol.js';

export interface WithProgressOptions {
    message: string;
    reporter: lsp.WorkDoneProgressReporter;
}

export interface LspClient {
    createProgressReporter(token?: lsp.CancellationToken, workDoneProgress?: lsp.WorkDoneProgressReporter): Promise<lsp.WorkDoneProgressReporter>;
    withProgress<R>(options: WithProgressOptions, task: (progress: lsp.WorkDoneProgressReporter) => Promise<R>): Promise<R>;
    publishDiagnostics(args: lsp.PublishDiagnosticsParams): void;
    showErrorMessage(message: string): void;
    logMessage(args: lsp.LogMessageParams): void;
    applyWorkspaceEdit(args: lsp.ApplyWorkspaceEditParams): Promise<lsp.ApplyWorkspaceEditResult>;
    rename(args: lsp.TextDocumentPositionParams): Promise<any>;
}

// Hack around the LSP library that makes it otherwise impossible to differentiate between Null and Client-initiated reporter.
const nullProgressReporter = attachWorkDone(undefined as any, /* params */ undefined);

export class LspClientImpl implements LspClient {
    constructor(protected connection: lsp.Connection) {}

    async createProgressReporter(_?: lsp.CancellationToken, workDoneProgress?: lsp.WorkDoneProgressReporter): Promise<lsp.WorkDoneProgressReporter> {
        let reporter: lsp.WorkDoneProgressReporter;
        if (workDoneProgress && workDoneProgress.constructor !== nullProgressReporter.constructor) {
            reporter = workDoneProgress;
        } else {
            reporter = workDoneProgress || await this.connection.window.createWorkDoneProgress();
        }
        return reporter;
    }

    async withProgress<R = unknown>(options: WithProgressOptions, task: (progress: lsp.WorkDoneProgressReporter) => Promise<R>): Promise<R> {
        const { message, reporter } = options;
        reporter.begin(message);
        return task(reporter).then(result => {
            reporter.done();
            return result;
        });
    }

    publishDiagnostics(params: lsp.PublishDiagnosticsParams): void {
        this.connection.sendDiagnostics(params);
    }

    showErrorMessage(message: string): void {
        this.connection.sendNotification(lsp.ShowMessageNotification.type, { type: MessageType.Error, message });
    }

    logMessage(args: lsp.LogMessageParams): void {
        this.connection.sendNotification(lsp.LogMessageNotification.type, args);
    }

    async applyWorkspaceEdit(params: lsp.ApplyWorkspaceEditParams): Promise<lsp.ApplyWorkspaceEditResult> {
        return this.connection.workspace.applyEdit(params);
    }

    async rename(args: lsp.TextDocumentPositionParams): Promise<any> {
        return this.connection.sendRequest(TypeScriptRenameRequest.type, args);
    }
}
