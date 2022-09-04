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

import tsp from 'typescript/lib/protocol.d.js';
import * as lsp from 'vscode-languageserver';
import API from '../utils/api.js';
import type { ConfigurationManager } from '../configuration-manager.js';
import type { LspDocuments } from '../document.js';
import type { TspClient } from '../tsp-client.js';
import type { LspClient } from '../lsp-client.js';
import { CommandTypes } from '../tsp-command-types.js';
import { Position } from '../utils/typeConverters.js';
import { uriToPath } from '../protocol-translation.js';

export class TypeScriptInlayHintsProvider {
    public static readonly minVersion = API.v440;

    public static async provideInlayHints(
        uri: lsp.DocumentUri,
        range: lsp.Range,
        documents: LspDocuments,
        tspClient: TspClient,
        lspClient: LspClient,
        configurationManager: ConfigurationManager,
    ): Promise<lsp.InlayHint[]> {
        if (tspClient.apiVersion.lt(TypeScriptInlayHintsProvider.minVersion)) {
            lspClient.showErrorMessage('Inlay Hints request failed. Requires TypeScript 4.4+.');
            return [];
        }

        const file = uriToPath(uri);

        if (!file) {
            lspClient.showErrorMessage('Inlay Hints request failed. No resource provided.');
            return [];
        }

        const document = documents.get(file);

        if (!document) {
            lspClient.showErrorMessage('Inlay Hints request failed. File not opened in the editor.');
            return [];
        }

        if (!areInlayHintsEnabledForFile(configurationManager, file)) {
            return [];
        }

        await configurationManager.configureGloballyFromDocument(file);

        const start = document.offsetAt(range.start);
        const length = document.offsetAt(range.end) - start;

        const response = await tspClient.request(CommandTypes.ProvideInlayHints, { file, start, length });
        if (response.type !== 'response' || !response.success || !response.body) {
            return [];
        }

        return response.body.map<lsp.InlayHint>(hint => {
            const inlayHint = lsp.InlayHint.create(
                Position.fromLocation(hint.position),
                hint.text,
                fromProtocolInlayHintKind(hint.kind));
            hint.whitespaceBefore && (inlayHint.paddingLeft = true);
            hint.whitespaceAfter && (inlayHint.paddingRight = true);
            return inlayHint;
        });
    }
}

function areInlayHintsEnabledForFile(configurationManager: ConfigurationManager, filename: string) {
    const preferences = configurationManager.getPreferences(filename);

    // Doesn't need to include `includeInlayVariableTypeHintsWhenTypeMatchesName` and
    // `includeInlayVariableTypeHintsWhenTypeMatchesName` as those depend on other preferences being enabled.
    return preferences.includeInlayParameterNameHints === 'literals' ||
        preferences.includeInlayParameterNameHints === 'all' ||
        preferences.includeInlayEnumMemberValueHints ||
        preferences.includeInlayFunctionLikeReturnTypeHints ||
        preferences.includeInlayFunctionParameterTypeHints ||
        preferences.includeInlayPropertyDeclarationTypeHints ||
        preferences.includeInlayVariableTypeHints;
}

function fromProtocolInlayHintKind(kind: tsp.InlayHintKind): lsp.InlayHintKind | undefined {
    switch (kind) {
        case 'Parameter': return lsp.InlayHintKind.Parameter;
        case 'Type': return lsp.InlayHintKind.Type;
        case 'Enum': return undefined;
        default: return undefined;
    }
}
