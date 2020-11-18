/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as tsp from 'typescript/lib/protocol';
import * as lsp from 'vscode-languageserver';
import { Logger } from './logger';
import { pathToUri, toDiagnostic } from './protocol-translation';
import { EventTypes } from './tsp-command-types';
import debounce = require('p-debounce');
import { LspDocuments } from './document';

class FileDiagnostics {
    private readonly diagnosticsPerKind = new Map<EventTypes, tsp.Diagnostic[]>();

    constructor(
        protected readonly uri: string,
        protected readonly publishDiagnostics: (params: lsp.PublishDiagnosticsParams) => void,
        protected readonly documents: LspDocuments
    ) { }

    update(kind: EventTypes, diagnostics: tsp.Diagnostic[]): void {
        this.diagnosticsPerKind.set(kind, diagnostics);
        this.firePublishDiagnostics();
    }
    protected readonly firePublishDiagnostics = debounce(() => {
        const diagnostics = this.getDiagnostics();
        this.publishDiagnostics({ uri: this.uri, diagnostics });
    }, 50);

    protected getDiagnostics(): lsp.Diagnostic[] {
        const result: lsp.Diagnostic[] = [];
        for (const diagnostics of this.diagnosticsPerKind.values()) {
            for (const diagnostic of diagnostics) {
                result.push(toDiagnostic(diagnostic, this.documents));
            }
        }
        return result;
    }
}

export class DiagnosticEventQueue {

    protected readonly diagnostics = new Map<string, FileDiagnostics>();

    constructor(
        protected readonly publishDiagnostics: (params: lsp.PublishDiagnosticsParams) => void,
        protected readonly documents: LspDocuments,
        protected readonly logger: Logger,
        protected readonly ignoredDiagnosticCodes: number[],
    ) { }

    updateDiagnostics(kind: EventTypes, event: tsp.DiagnosticEvent): void {
        if (!event.body) {
            this.logger.error(`Received empty ${event.event} diagnostics.`)
            return;
        }
        const { file, diagnostics: diagnosticsFromServer } = event.body;

        // `d.code` can be undefined
        const isDiagnosticAllowed = (d: tsp.Diagnostic) => !d.code || this.ignoredDiagnosticCodes.indexOf(d.code) === -1;
        const filteredDiagnostics = diagnosticsFromServer.filter(isDiagnosticAllowed);
        const uri = pathToUri(file, this.documents);
        const diagnostics = this.diagnostics.get(uri) || new FileDiagnostics(uri, this.publishDiagnostics, this.documents);
        diagnostics.update(kind, filteredDiagnostics);
        this.diagnostics.set(uri, diagnostics);
    }
}