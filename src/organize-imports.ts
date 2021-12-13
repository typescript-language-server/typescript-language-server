/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as lsp from 'vscode-languageserver/node';
import tsp from 'typescript/lib/protocol';
import { toTextDocumentEdit } from './protocol-translation';
import { LspDocuments } from './document';
import { CodeActionKind } from './utils/types';

export function provideOrganizeImports(response: tsp.OrganizeImportsResponse | undefined, documents: LspDocuments | undefined): Array<lsp.CodeAction> {
    if (!response || response.body.length === 0) {
        return [];
    }
    // Return a single code action with potentially multiple edits.
    return [
        lsp.CodeAction.create(
            'Organize imports',
            { documentChanges: response.body.map(edit => toTextDocumentEdit(edit, documents)) },
            CodeActionKind.SourceOrganizeImportsTs.value
        )];
}
