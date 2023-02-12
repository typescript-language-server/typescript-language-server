/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as lsp from 'vscode-languageserver';
import { toTextDocumentEdit } from './protocol-translation.js';
import { LspDocuments } from './document.js';
import { OrganizeImportsMode } from './ts-protocol.js';
import type { ts } from './ts-protocol.js';
import API from './utils/api.js';
import { CodeActionKind } from './utils/types.js';

interface OrganizeImportsCommand {
    readonly title: string;
    readonly minVersion?: API;
    readonly kind: CodeActionKind;
    readonly mode: OrganizeImportsMode;
}

const organizeImportsCommand: OrganizeImportsCommand = {
    title: 'Organize Imports',
    kind: CodeActionKind.SourceOrganizeImportsTs,
    mode: OrganizeImportsMode.All,
};

const sortImportsCommand: OrganizeImportsCommand = {
    minVersion: API.v430,
    title: 'Sort Imports',
    kind: CodeActionKind.SourceSortImportsTs,
    mode: OrganizeImportsMode.SortAndCombine,
};

const removeUnusedImportsCommand: OrganizeImportsCommand = {
    minVersion: API.v490,
    title: 'Remove Unused Imports',
    kind: CodeActionKind.SourceRemoveUnusedImportsTs,
    mode: OrganizeImportsMode.RemoveUnused,
};

export const organizeImportsCommands = [
    organizeImportsCommand,
    sortImportsCommand,
    removeUnusedImportsCommand,
];

export function provideOrganizeImports(command: OrganizeImportsCommand, response: ts.server.protocol.OrganizeImportsResponse, documents: LspDocuments | undefined): lsp.CodeAction[] {
    if (!response || response.body.length === 0) {
        return [];
    }
    // Return a single code action with potentially multiple edits.
    return [
        lsp.CodeAction.create(
            command.title,
            { documentChanges: response.body.map(edit => toTextDocumentEdit(edit, documents)) },
            command.kind.value,
        )];
}
