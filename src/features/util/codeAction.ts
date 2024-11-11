// sync: file[extensions/typescript-language-features/src/languageFeatures/util/codeAction.ts] sha[f76ac124233270762d11ec3afaaaafcba53b3bbf]
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/*
 * Copyright (C) 2022 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as lsp from 'vscode-languageserver';
import { CommandTypes, type ts } from '../../ts-protocol.js';
import { ITypeScriptServiceClient } from '../../typescriptService.js';
import { toTextDocumentEdit } from '../../protocol-translation.js';
import { LspClient } from '../../lsp-client.js';

export function getEditForCodeAction(
    client: ITypeScriptServiceClient,
    action: ts.server.protocol.CodeAction,
): lsp.WorkspaceEdit | undefined {
    return action.changes?.length
        ? { documentChanges: action.changes.map(change => toTextDocumentEdit(change, client)) }
        : undefined;
}

export async function applyCodeAction(
    client: ITypeScriptServiceClient,
    lspClient: LspClient,
    action: ts.server.protocol.CodeAction,
    token: lsp.CancellationToken,
): Promise<boolean> {
    const workspaceEdit = getEditForCodeAction(client, action);
    if (workspaceEdit) {
        if (!await lspClient.applyWorkspaceEdit({ edit: workspaceEdit })) {
            return false;
        }
    }
    return applyCodeActionCommands(client, action.commands, token);
}

export async function applyCodeActionCommands(
    client: ITypeScriptServiceClient,
    commands: ReadonlyArray<object> | undefined,
    token?: lsp.CancellationToken,
): Promise<boolean> {
    if (commands?.length) {
        for (const command of commands) {
            await client.execute(CommandTypes.ApplyCodeActionCommand, { command }, token);
        }
    }
    return true;
}
