/*
 * Copyright (C) 2023 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as lsp from 'vscode-languageserver-protocol';
import { Range as LspRange, CodeLens } from 'vscode-languageserver-protocol';
import FileConfigurationManager from '../fileConfigurationManager.js';
import type { LspDocument } from '../../document.js';
import { CachedResponse } from '../../tsServer/cachedResponse.js';
import type { ts } from '../../ts-protocol.js';
import { CommandTypes } from '../../ts-protocol.js';
import { Range } from '../../utils/typeConverters.js';
import { ITypeScriptServiceClient } from '../../typescriptService.js';
import { escapeRegExp } from '../../utils/regexp.js';

export enum CodeLensType {
    Reference,
    Implementation
}

export interface ReferencesCodeLens extends CodeLens {
    data?: {
        type: CodeLensType;
        uri: string;
    };
}

export abstract class TypeScriptBaseCodeLensProvider {
    public static readonly cancelledCommand: lsp.Command = {
        // Cancellation is not an error. Just show nothing until we can properly re-compute the code lens
        title: '',
        command: '',
    };

    public static readonly errorCommand: lsp.Command = {
        title: 'Could not determine references',
        command: '',
    };

    protected abstract get type(): CodeLensType;

    public constructor(
        protected client: ITypeScriptServiceClient,
        private readonly cachedResponse: CachedResponse<ts.server.protocol.NavTreeResponse>,
        protected fileConfigurationManager: FileConfigurationManager,
    ) { }

    async provideCodeLenses(document: LspDocument, token: lsp.CancellationToken): Promise<ReferencesCodeLens[]> {
        const configuration = this.fileConfigurationManager.getWorkspacePreferencesForFile(document);
        if (this.type === CodeLensType.Implementation && !configuration.implementationsCodeLens?.enabled
            || this.type === CodeLensType.Reference && !configuration.referencesCodeLens?.enabled) {
            return [];
        }

        const response = await this.cachedResponse.execute(
            document,
            () => this.client.execute(CommandTypes.NavTree, { file: document.filepath }, token),
        );
        if (response.type !== 'response') {
            return [];
        }

        const referenceableSpans: lsp.Range[] = [];
        response.body?.childItems?.forEach(item => this.walkNavTree(document, item, undefined, referenceableSpans));
        return referenceableSpans.map(span => CodeLens.create(span, { uri: document.uri.toString(), type: this.type }));
    }

    protected abstract extractSymbol(
        document: LspDocument,
        item: ts.server.protocol.NavigationTree,
        parent: ts.server.protocol.NavigationTree | undefined
    ): lsp.Range | undefined;

    private walkNavTree(
        document: LspDocument,
        item: ts.server.protocol.NavigationTree,
        parent: ts.server.protocol.NavigationTree | undefined,
        results: lsp.Range[],
    ): void {
        const range = this.extractSymbol(document, item, parent);
        if (range) {
            results.push(range);
        }

        item.childItems?.forEach(child => this.walkNavTree(document, child, item, results));
    }
}

export function getSymbolRange(
    document: LspDocument,
    item: ts.server.protocol.NavigationTree,
): lsp.Range | undefined {
    if (item.nameSpan) {
        return Range.fromTextSpan(item.nameSpan);
    }

    // In older versions, we have to calculate this manually. See #23924
    const span = item.spans?.[0];
    if (!span) {
        return undefined;
    }

    const range = Range.fromTextSpan(span);
    const text = document.getText(range);

    const identifierMatch = new RegExp(`^(.*?(\\b|\\W))${escapeRegExp(item.text || '')}(\\b|\\W)`, 'gm');
    const match = identifierMatch.exec(text);
    const prefixLength = match ? match.index + match[1].length : 0;
    const startOffset = document.offsetAt(range.start) + prefixLength;
    return LspRange.create(
        document.positionAt(startOffset),
        document.positionAt(startOffset + item.text.length),
    );
}
