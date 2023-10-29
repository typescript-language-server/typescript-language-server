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
import type { LspDocument } from '../document.js';
import FileConfigurationManager from './fileConfigurationManager.js';
import { CommandTypes } from '../ts-protocol.js';
import type { ts } from '../ts-protocol.js';
import type { TsClient } from '../ts-client.js';
import type { LspClient } from '../lsp-client.js';
import { IFilePathToResourceConverter } from '../utils/previewer.js';
import { Location, Position } from '../utils/typeConverters.js';

export class TypeScriptInlayHintsProvider {
    public static readonly minVersion = API.v440;

    public static async provideInlayHints(
        textDocument: lsp.TextDocumentIdentifier,
        range: lsp.Range,
        client: TsClient,
        lspClient: LspClient,
        fileConfigurationManager: FileConfigurationManager,
        token?: lsp.CancellationToken,
    ): Promise<lsp.InlayHint[]> {
        if (client.apiVersion.lt(TypeScriptInlayHintsProvider.minVersion)) {
            lspClient.showErrorMessage('Inlay Hints request failed. Requires TypeScript 4.4+.');
            return [];
        }

        const document = client.toOpenDocument(textDocument.uri);

        if (!document) {
            lspClient.showErrorMessage('Inlay Hints request failed. File not opened in the editor.');
            return [];
        }

        if (!areInlayHintsEnabledForFile(fileConfigurationManager, document)) {
            return [];
        }

        await fileConfigurationManager.ensureConfigurationForDocument(document, token);
        if (token?.isCancellationRequested) {
            return [];
        }

        const start = document.offsetAt(range.start);
        const length = document.offsetAt(range.end) - start;

        const response = await client.execute(CommandTypes.ProvideInlayHints, { file: document.filepath, start, length }, token);
        if (response.type !== 'response' || !response.success || !response.body) {
            return [];
        }

        return response.body.map<lsp.InlayHint>(hint => {
            const inlayHint = lsp.InlayHint.create(
                Position.fromLocation(hint.position),
                TypeScriptInlayHintsProvider.convertInlayHintText(hint, client),
                fromProtocolInlayHintKind(hint.kind));
            hint.whitespaceBefore && (inlayHint.paddingLeft = true);
            hint.whitespaceAfter && (inlayHint.paddingRight = true);
            return inlayHint;
        });
    }

    private static convertInlayHintText(
        tsHint: ts.server.protocol.InlayHintItem,
        filePathConverter: IFilePathToResourceConverter,
    ): string | lsp.InlayHintLabelPart[] {
        if (tsHint.displayParts) {
            return tsHint.displayParts.map((part): lsp.InlayHintLabelPart => {
                const out = lsp.InlayHintLabelPart.create(part.text);
                if (part.span) {
                    out.location = Location.fromTextSpan(filePathConverter.toResource(part.span.file).toString(), part.span);
                }
                return out;
            });
        }

        return tsHint.text;
    }
}

function areInlayHintsEnabledForFile(fileConfigurationManager: FileConfigurationManager, document: LspDocument) {
    const preferences = fileConfigurationManager.getPreferences(document);

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

function fromProtocolInlayHintKind(kind: ts.server.protocol.InlayHintKind): lsp.InlayHintKind | undefined {
    switch (kind) {
        case 'Parameter': return lsp.InlayHintKind.Parameter;
        case 'Type': return lsp.InlayHintKind.Type;
        case 'Enum': return undefined;
        default: return undefined;
    }
}
