/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as lsp from 'vscode-languageserver';
import { Commands } from './commands.js';
import { toTextDocumentEdit } from './protocol-translation.js';
import type { ts } from './ts-protocol.js';
import { LspDocuments } from './document.js';

export function provideQuickFix(response: ts.server.protocol.GetCodeFixesResponse | undefined, documents: LspDocuments | undefined): Array<lsp.CodeAction> {
    if (!response?.body) {
        return [];
    }
    return response.body.map(fix => lsp.CodeAction.create(
        fix.description,
        {
            title: fix.description,
            command: Commands.APPLY_WORKSPACE_EDIT,
            arguments: [{ documentChanges: fix.changes.map(c => toTextDocumentEdit(c, documents)) }],
        },
        lsp.CodeActionKind.QuickFix,
    ));
}
