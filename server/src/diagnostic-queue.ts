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

export class DiagnosticEventQueue {

    constructor(
        protected publicDiagnostics: (params: lsp.PublishDiagnosticsParams) => void,
        protected logger: Logger) {
    }

    pendingSyntaxDiagnostics = new Map<string, tsp.DiagnosticEvent>();

    addSyntacticDiagnostic(event: tsp.DiagnosticEvent): void {
        if (!event.body) {
            this.logger.error("Received empty syntactic diagnostics.")
            return;
        }
        this.pendingSyntaxDiagnostics.set(this.key(event), event);
    }

    private key(event: tsp.DiagnosticEvent): string {
        return event.seq + event.body!.file;
    }

    addSemanticDiagnostic(event: tsp.DiagnosticEvent): void {
        const syntax = this.pendingSyntaxDiagnostics.get(this.key(event));
        if (!event.body) {
            this.logger.error("Received empty semantic diagnostics.")
            return;
        }
        if (!syntax) {
            this.logger.error("Received semantic diagnostics without previsou syntactic ones, for file : " + event.body.file)
            return;
        }
        this.pendingSyntaxDiagnostics.delete(this.key(event));
        const diagnostics: lsp.Diagnostic[] = []
        for (const d of syntax.body!.diagnostics) {
            diagnostics.push(toDiagnostic(d));
        }
        for (const d of event.body.diagnostics) {
            diagnostics.push(toDiagnostic(d));
        }
        const result: lsp.PublishDiagnosticsParams = {
            uri: pathToUri(event.body.file),
            diagnostics
        }
        this.publicDiagnostics(result);
    }
}