/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as lsp from 'vscode-languageserver';
import type tsp from 'typescript/lib/protocol.d.js';
import { toTextDocumentEdit } from './protocol-translation.js';
import { LspDocuments } from './document.js';
import { CodeActionKind } from './utils/types.js';

export function provideOrganizeImports(response: tsp.OrganizeImportsResponse | undefined, documents: LspDocuments | undefined): Array<lsp.CodeAction> {
    if (!response || response.body.length === 0) {
        return [];
    }
    // Return a single code action with potentially multiple edits.
    return [
        lsp.CodeAction.create(
            'Organize imports',
            { documentChanges: response.body.map(edit => toTextDocumentEdit(edit, documents)) },
            CodeActionKind.SourceOrganizeImportsTs.value,
        )];
}
