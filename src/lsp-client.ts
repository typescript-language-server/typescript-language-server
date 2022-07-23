/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as lsp from 'vscode-languageserver/node';
import { TypeScriptRenameRequest } from './ts-protocol';

export interface ProgressReporter {
    begin(message?: string): void;
    report(message: string): void;
    end(): void;
}

export interface LspClient {
    setClientCapabilites(capabilites: lsp.ClientCapabilities): void;
    createProgressReporter(): ProgressReporter;
    publishDiagnostics(args: lsp.PublishDiagnosticsParams): void;
    showMessage(args: lsp.ShowMessageParams): void;
    logMessage(args: lsp.LogMessageParams): void;
    applyWorkspaceEdit(args: lsp.ApplyWorkspaceEditParams): Promise<lsp.ApplyWorkspaceEditResult>;
    telemetry(args: any): void;
    rename(args: lsp.TextDocumentPositionParams): Promise<any>;
}

export class LspClientImpl implements LspClient {
    private clientCapabilities?: lsp.ClientCapabilities;

    constructor(protected connection: lsp.Connection) {}

    setClientCapabilites(capabilites: lsp.ClientCapabilities): void {
        this.clientCapabilities = capabilites;
    }

    createProgressReporter(): ProgressReporter {
        let workDoneProgress: Promise<lsp.WorkDoneProgressServerReporter> | undefined;
        return {
            begin: (message = '') => {
                if (this.clientCapabilities?.window?.workDoneProgress) {
                    workDoneProgress = this.connection.window.createWorkDoneProgress();
                    workDoneProgress
                        .then((progress) => {
                            progress.begin(message);
                        })
                        .catch(() => {});
                }
            },
            report: (message: string) => {
                if (workDoneProgress) {
                    workDoneProgress
                        .then((progress) => {
                            progress.report(message);
                        })
                        .catch(() => {});
                }
            },
            end: () => {
                if (workDoneProgress) {
                    workDoneProgress
                        .then((progress) => {
                            progress.done();
                        })
                        .catch(() => {});
                    workDoneProgress = undefined;
                }
            }
        };
    }

    publishDiagnostics(args: lsp.PublishDiagnosticsParams): void {
        this.connection.sendNotification(lsp.PublishDiagnosticsNotification.type, args);
    }

    showMessage(args: lsp.ShowMessageParams): void {
        this.connection.sendNotification(lsp.ShowMessageNotification.type, args);
    }

    logMessage(args: lsp.LogMessageParams): void {
        this.connection.sendNotification(lsp.LogMessageNotification.type, args);
    }

    telemetry(args: any): void {
        this.connection.sendNotification(lsp.TelemetryEventNotification.type, args);
    }

    async applyWorkspaceEdit(args: lsp.ApplyWorkspaceEditParams): Promise<lsp.ApplyWorkspaceEditResult> {
        return this.connection.sendRequest(lsp.ApplyWorkspaceEditRequest.type, args);
    }

    async rename(args: lsp.TextDocumentPositionParams): Promise<any> {
        return this.connection.sendRequest(TypeScriptRenameRequest.type, args);
    }
}
