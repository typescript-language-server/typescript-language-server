/*
 * Copyright (C) 2022 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as lsp from 'vscode-languageserver';
import API from '../utils/api.js';
import { Position } from '../utils/typeConverters.js';
import { toLocation, uriToPath } from '../protocol-translation.js';
import type { LspDocuments } from '../document.js';
import type { TspClient } from '../tsp-client.js';
import type { LspClient } from '../lsp-client.js';
import { CommandTypes } from '../tsp-command-types.js';

export class SourceDefinitionCommand {
    public static readonly id = '_typescript.goToSourceDefinition';
    public static readonly minVersion = API.v470;

    public static async execute(
        uri: lsp.DocumentUri | undefined,
        position: lsp.Position | undefined,
        documents: LspDocuments,
        tspClient: TspClient,
        lspClient: LspClient,
        reporter: lsp.WorkDoneProgressReporter,
    ): Promise<lsp.Location[] | void> {
        if (tspClient.apiVersion.lt(SourceDefinitionCommand.minVersion)) {
            lspClient.showErrorMessage('Go to Source Definition failed. Requires TypeScript 4.7+.');
            return;
        }

        if (!position || typeof position.character !== 'number' || typeof position.line !== 'number') {
            lspClient.showErrorMessage('Go to Source Definition failed. Invalid position.');
            return;
        }

        let file: string | undefined;

        if (!uri || typeof uri !== 'string' || !(file = uriToPath(uri))) {
            lspClient.showErrorMessage('Go to Source Definition failed. No resource provided.');
            return;
        }

        const document = documents.get(file);

        if (!document) {
            lspClient.showErrorMessage('Go to Source Definition failed. File not opened in the editor.');
            return;
        }

        const args = Position.toFileLocationRequestArgs(file, position);
        return await lspClient.withProgress<lsp.Location[] | void>({
            message: 'Finding source definitions…',
            reporter,
        }, async () => {
            const response = await tspClient.request(CommandTypes.FindSourceDefinition, args);
            if (response.type !== 'response' || !response.body) {
                lspClient.showErrorMessage('No source definitions found.');
                return;
            }
            return response.body.map(reference => toLocation(reference, documents));
        });
    }
}
