/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as lsp from 'vscode-languageserver';
import * as tsp from 'typescript/lib/protocol';
import { Commands } from './commands';
import { toTextDocumentEdit } from './protocol-translation';
import { LspDocuments } from './document';
import { CodeActionKind } from "vscode-languageserver";

export function *provideQuickFix(
    response: tsp.GetCodeFixesResponse | undefined,
    documents: LspDocuments | undefined
): IterableIterator<lsp.CodeAction> {
    if (!response || !response.body) {
        return;
    }
    for (const fix of response.body) {
        yield lsp.CodeAction.create(
            fix.description,
            {
                title: fix.description,
                command: Commands.APPLY_WORKSPACE_EDIT,
                arguments: [{documentChanges: fix.changes.map(c => toTextDocumentEdit(c, documents))}]
            },
            CodeActionKind.QuickFix,
        )
    }
}