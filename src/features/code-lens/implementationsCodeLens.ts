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
import { Location, Position, Range } from 'vscode-languageserver-protocol';
import type { LspDocument } from '../../document.js';
import { CommandTypes, ScriptElementKind, type ts } from '../../ts-protocol.js';
import * as typeConverters from '../../utils/typeConverters.js';
import { CodeLensType, ReferencesCodeLens, TypeScriptBaseCodeLensProvider, getSymbolRange } from './baseCodeLensProvider.js';
import { ExecutionTarget } from '../../tsServer/server.js';

export default class TypeScriptImplementationsCodeLensProvider extends TypeScriptBaseCodeLensProvider {
    protected get type(): CodeLensType {
        return CodeLensType.Implementation;
    }

    public async resolveCodeLens(
        codeLens: ReferencesCodeLens,
        token: lsp.CancellationToken,
    ): Promise<ReferencesCodeLens> {
        const document = this.client.toOpenDocument(codeLens.data!.uri);
        if (!document) {
            return codeLens;
        }

        if (!this.fileConfigurationManager.getWorkspacePreferencesForFile(document).implementationsCodeLens?.enabled) {
            return codeLens;
        }

        const args = typeConverters.Position.toFileLocationRequestArgs(document.filepath, codeLens.range.start);
        const response = await this.client.execute(CommandTypes.Implementation, args, token, {
            lowPriority: true,
            executionTarget: ExecutionTarget.Semantic,
            cancelOnResourceChange: codeLens.data!.uri,
        });
        if (response.type !== 'response' || !response.body) {
            codeLens.command = response.type === 'cancelled'
                ? TypeScriptBaseCodeLensProvider.cancelledCommand
                : TypeScriptBaseCodeLensProvider.errorCommand;
            return codeLens;
        }

        const locations = response.body
            .map(reference =>
                // Only take first line on implementation: https://github.com/microsoft/vscode/issues/23924
                Location.create(this.client.toResourceUri(reference.file),
                                reference.start.line === reference.end.line
                                    ? typeConverters.Range.fromTextSpan(reference)
                                    : Range.create(
                                        typeConverters.Position.fromLocation(reference.start),
                                        Position.create(reference.start.line, 0))))
            // Exclude original from implementations
            .filter(location =>
                !(location.uri.toString() === codeLens.data!.uri &&
                    location.range.start.line === codeLens.range.start.line &&
                    location.range.start.character === codeLens.range.start.character));

        codeLens.command = this.getCommand(locations, codeLens);
        return codeLens;
    }

    private getCommand(locations: Location[], codeLens: ReferencesCodeLens): lsp.Command | undefined {
        return {
            title: this.getTitle(locations),
            command: locations.length ? 'editor.action.showReferences' : '',
            arguments: [codeLens.data!.uri, codeLens.range.start, locations],
        };
    }

    private getTitle(locations: Location[]): string {
        return locations.length === 1
            ? '1 implementation'
            : `${locations.length} implementations`;
    }

    protected extractSymbol(
        document: LspDocument,
        item: ts.server.protocol.NavigationTree,
        _parent: ts.server.protocol.NavigationTree | undefined,
    ): lsp.Range | undefined {
        switch (item.kind) {
            case ScriptElementKind.interfaceElement:
                return getSymbolRange(document, item);

            case ScriptElementKind.classElement:
            case ScriptElementKind.memberFunctionElement:
            case ScriptElementKind.memberVariableElement:
            case ScriptElementKind.memberGetAccessorElement:
            case ScriptElementKind.memberSetAccessorElement:
                if (item.kindModifiers.match(/\babstract\b/g)) {
                    return getSymbolRange(document, item);
                }
                break;
        }
        return undefined;
    }
}
