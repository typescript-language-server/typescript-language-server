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
import debounce = require('lodash.debounce');

export class DiagnosticEventQueue {

    protected readonly diagnostics = new Map<string, Map<EventTypes, lsp.Diagnostic[]>>();

    constructor(
        protected publicDiagnostics: (params: lsp.PublishDiagnosticsParams) => void,
        protected logger: Logger
    ) { }

    updateDiagnostics(kind: EventTypes, event: tsp.DiagnosticEvent): void {
        if (!event.body) {
            this.logger.error(`Received empty ${event.event} diagnostics.`)
            return;
        }
        const { file } = event.body;
        const diagnostics = this.diagnostics.get(file) || new Map<EventTypes, lsp.Diagnostic[]>();
        diagnostics.set(kind, event.body.diagnostics.map(toDiagnostic));
        this.diagnostics.set(file, diagnostics);
        this.firePublishDiagnostics(file);
    }

    protected firePublishDiagnostics = debounce((file: string): void => {
        const uri = pathToUri(file);
        const diagnostics = this.getDiagnostics(file);
        this.publicDiagnostics({ uri, diagnostics });
    }, 50);
    protected getDiagnostics(file: string): lsp.Diagnostic[] {
        const diagnostics = this.diagnostics.get(file);
        if (!diagnostics) {
            return [];
        }
        const result: lsp.Diagnostic[] = [];
        for (const value of diagnostics.values()) {
            result.push(...value);
        }
        return result;
    }

}