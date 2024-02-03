/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as lsp from 'vscode-languageserver';
import debounce from 'p-debounce';
import { Logger } from './utils/logger.js';
import { toDiagnostic } from './protocol-translation.js';
import { SupportedFeatures } from './ts-protocol.js';
import type { ts } from './ts-protocol.js';
import { DiagnosticKind, type TsClient } from './ts-client.js';
import { ClientCapability } from './typescriptService.js';

class FileDiagnostics {
    private closed = false;
    private readonly diagnosticsPerKind = new Map<DiagnosticKind, ts.server.protocol.Diagnostic[]>();
    private readonly firePublishDiagnostics = debounce(() => this.publishDiagnostics(), 50);

    constructor(
        protected readonly uri: string,
        protected readonly onPublishDiagnostics: (params: lsp.PublishDiagnosticsParams) => void,
        protected readonly client: TsClient,
        protected readonly features: SupportedFeatures,
    ) { }

    public update(kind: DiagnosticKind, diagnostics: ts.server.protocol.Diagnostic[]): void {
        if (this.diagnosticsPerKind.get(kind)?.length === 0 && diagnostics.length === 0) {
            return;
        }

        this.diagnosticsPerKind.set(kind, diagnostics);
        this.firePublishDiagnostics();
    }

    private publishDiagnostics() {
        if (this.closed || !this.features.diagnosticsSupport) {
            return;
        }
        const diagnostics = this.getDiagnostics();
        this.onPublishDiagnostics({ uri: this.uri, diagnostics });
    }

    public getDiagnostics(): lsp.Diagnostic[] {
        const result: lsp.Diagnostic[] = [];
        for (const diagnostics of this.diagnosticsPerKind.values()) {
            for (const diagnostic of diagnostics) {
                result.push(toDiagnostic(diagnostic, this.client, this.features));
            }
        }
        return result;
    }

    public onDidClose(): void {
        this.diagnosticsPerKind.clear();
        this.publishDiagnostics();
        this.closed = true;
    }

    public async waitForDiagnosticsForTesting(): Promise<void> {
        return new Promise(resolve => {
            const interval = setInterval(() => {
                if (this.diagnosticsPerKind.size === 3) {  // Must include all types of `DiagnosticKind`.
                    clearInterval(interval);
                    this.publishDiagnostics();
                    resolve();
                }
            }, 50);
        });
    }
}

export class DiagnosticEventQueue {
    protected readonly diagnostics = new Map<string, FileDiagnostics>();
    private ignoredDiagnosticCodes: Set<number> = new Set();

    constructor(
        protected readonly publishDiagnostics: (params: lsp.PublishDiagnosticsParams) => void,
        protected readonly client: TsClient,
        protected readonly features: SupportedFeatures,
        protected readonly logger: Logger,
    ) { }

    updateDiagnostics(kind: DiagnosticKind, file: string, diagnostics: ts.server.protocol.Diagnostic[]): void {
        if (kind !== DiagnosticKind.Syntax && !this.client.hasCapabilityForResource(this.client.toResource(file), ClientCapability.Semantic)) {
            return;
        }

        if (this.ignoredDiagnosticCodes.size) {
            diagnostics = diagnostics.filter(diagnostic => !this.isDiagnosticIgnored(diagnostic));
        }

        const uri = this.client.toResourceUri(file);
        const diagnosticsForFile = this.diagnostics.get(uri) || new FileDiagnostics(uri, this.publishDiagnostics, this.client, this.features);
        diagnosticsForFile.update(kind, diagnostics);
        this.diagnostics.set(uri, diagnosticsForFile);
    }

    updateIgnoredDiagnosticCodes(ignoredCodes: readonly number[]): void {
        this.ignoredDiagnosticCodes = new Set(ignoredCodes);
    }

    public getDiagnosticsForFile(file: string): lsp.Diagnostic[] {
        const uri = this.client.toResourceUri(file);
        return this.diagnostics.get(uri)?.getDiagnostics() || [];
    }

    public onDidCloseFile(file: string): void {
        const uri = this.client.toResourceUri(file);
        const diagnosticsForFile = this.diagnostics.get(uri);
        diagnosticsForFile?.onDidClose();
        this.diagnostics.delete(uri);
    }

    /**
     * A testing function to clear existing file diagnostics, request fresh ones and wait for all to arrive.
     */
    public async waitForDiagnosticsForTesting(file: string): Promise<void> {
        const uri = this.client.toResourceUri(file);
        let diagnosticsForFile = this.diagnostics.get(uri);
        if (diagnosticsForFile) {
            diagnosticsForFile.onDidClose();
        }
        diagnosticsForFile = new FileDiagnostics(uri, this.publishDiagnostics, this.client, this.features);
        this.diagnostics.set(uri, diagnosticsForFile);
        // Normally diagnostics are delayed by 300ms. This will trigger immediate request.
        this.client.requestDiagnosticsForTesting();
        await diagnosticsForFile.waitForDiagnosticsForTesting();
    }

    private isDiagnosticIgnored(diagnostic: ts.server.protocol.Diagnostic) : boolean {
        return diagnostic.code !== undefined && this.ignoredDiagnosticCodes.has(diagnostic.code);
    }
}
