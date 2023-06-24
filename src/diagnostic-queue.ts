/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as lsp from 'vscode-languageserver';
import debounce from 'p-debounce';
import { Logger } from './utils/logger.js';
import { pathToUri, toDiagnostic } from './protocol-translation.js';
import { SupportedFeatures } from './ts-protocol.js';
import type { ts } from './ts-protocol.js';
import { LspDocuments } from './document.js';
import { DiagnosticKind, TspClient } from './tsp-client.js';
import { ClientCapability } from './typescriptService.js';

class FileDiagnostics {
    private readonly diagnosticsPerKind = new Map<DiagnosticKind, ts.server.protocol.Diagnostic[]>();

    constructor(
        protected readonly uri: string,
        protected readonly publishDiagnostics: (params: lsp.PublishDiagnosticsParams) => void,
        protected readonly documents: LspDocuments,
        protected readonly features: SupportedFeatures,
    ) { }

    update(kind: DiagnosticKind, diagnostics: ts.server.protocol.Diagnostic[]): void {
        this.diagnosticsPerKind.set(kind, diagnostics);
        this.firePublishDiagnostics();
    }
    protected readonly firePublishDiagnostics = debounce(() => {
        const diagnostics = this.getDiagnostics();
        this.publishDiagnostics({ uri: this.uri, diagnostics });
    }, 50);

    public getDiagnostics(): lsp.Diagnostic[] {
        const result: lsp.Diagnostic[] = [];
        for (const diagnostics of this.diagnosticsPerKind.values()) {
            for (const diagnostic of diagnostics) {
                result.push(toDiagnostic(diagnostic, this.documents, this.features));
            }
        }
        return result;
    }
}

export class DiagnosticEventQueue {
    protected readonly diagnostics = new Map<string, FileDiagnostics>();
    private ignoredDiagnosticCodes: Set<number> = new Set();

    constructor(
        protected readonly publishDiagnostics: (params: lsp.PublishDiagnosticsParams) => void,
        protected readonly documents: LspDocuments,
        protected readonly features: SupportedFeatures,
        protected readonly logger: Logger,
        private readonly tspClient: TspClient,
    ) { }

    updateDiagnostics(kind: DiagnosticKind, file: string, diagnostics: ts.server.protocol.Diagnostic[]): void {
        if (kind !== DiagnosticKind.Syntax && !this.tspClient.hasCapabilityForResource(this.documents.toResource(file), ClientCapability.Semantic)) {
            return;
        }

        if (this.ignoredDiagnosticCodes.size) {
            diagnostics = diagnostics.filter(diagnostic => !this.isDiagnosticIgnored(diagnostic));
        }
        const uri = pathToUri(file, this.documents);
        const diagnosticsForFile = this.diagnostics.get(uri) || new FileDiagnostics(uri, this.publishDiagnostics, this.documents, this.features);
        diagnosticsForFile.update(kind, diagnostics);
        this.diagnostics.set(uri, diagnosticsForFile);
    }

    updateIgnoredDiagnosticCodes(ignoredCodes: readonly number[]): void {
        this.ignoredDiagnosticCodes = new Set(ignoredCodes);
    }

    public getDiagnosticsForFile(file: string): lsp.Diagnostic[] {
        const uri = pathToUri(file, this.documents);
        return this.diagnostics.get(uri)?.getDiagnostics() || [];
    }

    private isDiagnosticIgnored(diagnostic: ts.server.protocol.Diagnostic) : boolean {
        return diagnostic.code !== undefined && this.ignoredDiagnosticCodes.has(diagnostic.code);
    }
}
