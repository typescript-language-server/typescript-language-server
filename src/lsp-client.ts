/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as lsp from 'vscode-languageserver';
import { MessageType } from 'vscode-languageserver';
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
    codeLensRefresh(): Promise<void>;
    inlayHintRefresh(): Promise<void>;
    sendNotification<P>(type: lsp.NotificationType<P>, params: lsp.RequestParam<P>): Promise<void>;
    getWorkspaceConfiguration<R = unknown>(scopeUri: string, section: string): Promise<R>;
    registerDidChangeWatchedFilesCapability(watchers: lsp.FileSystemWatcher[]): Promise<lsp.Disposable>;
}

function isNullProgressReporter(reporter: lsp.WorkDoneProgressReporter) {
    // We can't tell if this is a NullProgressReporter (well because this type isn't exposed from vscode-languageserver),
    // but we're going to assume if the toString for the begin method is empty, then it's a NullProgressReporter.
    const beginStr = reporter.begin.toString();
    const contents = beginStr.substring(beginStr.indexOf('{') + 1, beginStr.lastIndexOf('}'));
    return contents.trim() === '';
}

export class LspClientImpl implements LspClient {
    constructor(protected connection: lsp.Connection) {}

    async createProgressReporter(_?: lsp.CancellationToken, workDoneProgress?: lsp.WorkDoneProgressReporter): Promise<lsp.WorkDoneProgressReporter> {
        let reporter: lsp.WorkDoneProgressReporter;
        if (workDoneProgress && !isNullProgressReporter(workDoneProgress)) {
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
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.connection.sendDiagnostics(params);
    }

    showErrorMessage(message: string): void {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.connection.sendNotification(lsp.ShowMessageNotification.type, { type: MessageType.Error, message });
    }

    logMessage(args: lsp.LogMessageParams): void {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.connection.sendNotification(lsp.LogMessageNotification.type, args);
    }

    async getWorkspaceConfiguration<R = unknown>(scopeUri: string, section: string): Promise<R> {
        return await this.connection.workspace.getConfiguration({ scopeUri, section }) as R;
    }

    async applyWorkspaceEdit(params: lsp.ApplyWorkspaceEditParams): Promise<lsp.ApplyWorkspaceEditResult> {
        return this.connection.workspace.applyEdit(params);
    }

    async rename(args: lsp.TextDocumentPositionParams): Promise<any> {
        return this.connection.sendRequest(TypeScriptRenameRequest.type, args);
    }

    async codeLensRefresh(): Promise<void> {
        await this.connection.sendRequest(lsp.CodeLensRefreshRequest.type);
    }

    async inlayHintRefresh(): Promise<void> {
        await this.connection.sendRequest(lsp.InlayHintRefreshRequest.type);
    }

    async sendNotification<P>(type: lsp.NotificationType<P>, params: lsp.RequestParam<P>): Promise<void> {
        await this.connection.sendNotification(type, params);
    }

    async registerDidChangeWatchedFilesCapability(watchers: lsp.FileSystemWatcher[]): Promise<lsp.Disposable> {
        return await this.connection.client.register(lsp.DidChangeWatchedFilesNotification.type, { watchers });
    }
}
