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

class FileDiagnostics {
    private readonly diagnosticsPerKind = new Map<EventTypes, lsp.Diagnostic[]>();
    
    constructor(readonly uri: string) { }
    
    private readonly returnDiagnostics = debounce((resolve: (params: lsp.PublishDiagnosticsParams) => void) => {
        const diagnostics = this.getDiagnostics();
        resolve({ uri: this.uri, diagnostics });
    }, 50);
    
    public updateDiagnostics(kind: EventTypes, diagnostics: tsp.Diagnostic[]): Promise<lsp.PublishDiagnosticsParams> {
        this.diagnosticsPerKind.set(kind, diagnostics.map(toDiagnostic));
        return new Promise((resolve) => this.returnDiagnostics(resolve));
    }
    
    protected getDiagnostics(): lsp.Diagnostic[] {
        const result: lsp.Diagnostic[] = [];
        for (const value of this.diagnosticsPerKind.values()) {
            result.push(...value);
        }
        return result;
    }
}

export class DiagnosticEventQueue {

    protected readonly diagnostics = new Map<string, FileDiagnostics>();

    constructor(
        protected publishDiagnostics: (params: lsp.PublishDiagnosticsParams) => void,
        protected logger: Logger
    ) { }

    updateDiagnostics(kind: EventTypes, event: tsp.DiagnosticEvent): void {
        if (!event.body) {
            this.logger.error(`Received empty ${event.event} diagnostics.`)
            return;
        }
        const { file } = event.body;
        let fileDiagnostics = this.diagnostics.get(file);
        if (!fileDiagnostics) {
            fileDiagnostics = new FileDiagnostics(pathToUri(file));
            this.diagnostics.set(file, fileDiagnostics);
        }
        fileDiagnostics.updateDiagnostics(kind, event.body.diagnostics).then(this.publishDiagnostics);
    }
}