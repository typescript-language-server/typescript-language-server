/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as lsp from 'vscode-languageserver';
import * as tsp from 'typescript/lib/protocol';
import { Commands } from './commands';
import { CodeActionKind } from "vscode-languageserver";

export function provideOrganizeImports(response: tsp.OrganizeImportsResponse | undefined, context: lsp.CodeActionContext, result: (lsp.Command | lsp.CodeAction)[]): void {
    // Don't provide this action if it's not explicitly included
    if (context.only && context.only.indexOf(lsp.CodeActionKind.SourceOrganizeImports) !== -1) {
        return;
    }

    if (!response || !response.body) {
        return;
    }

    for (const edit of response.body) {
        result.push(lsp.CodeAction.create(
            "Organize imports",
            lsp.Command.create("", Commands.ORGANIZE_IMPORTS, edit.fileName),
            CodeActionKind.SourceOrganizeImports
        ))
    }
}
