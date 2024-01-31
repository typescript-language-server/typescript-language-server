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
import type { LspDocument } from '../../document.js';
import { CommandTypes, ScriptElementKind, type ts } from '../../ts-protocol.js';
import { ExecutionTarget } from '../../tsServer/server.js';
import * as typeConverters from '../../utils/typeConverters.js';
import { CodeLensType, ReferencesCodeLens, TypeScriptBaseCodeLensProvider, getSymbolRange } from './baseCodeLensProvider.js';

export class TypeScriptReferencesCodeLensProvider extends TypeScriptBaseCodeLensProvider {
    protected get type(): CodeLensType {
        return CodeLensType.Reference;
    }

    public async resolveCodeLens(codeLens: ReferencesCodeLens, token: lsp.CancellationToken): Promise<lsp.CodeLens> {
        const document = this.client.toOpenDocument(codeLens.data!.uri);
        if (!document) {
            return codeLens;
        }

        if (!this.fileConfigurationManager.getWorkspacePreferencesForFile(document).referencesCodeLens?.enabled) {
            return codeLens;
        }

        const args = typeConverters.Position.toFileLocationRequestArgs(document.filepath, codeLens.range.start);
        const response = await this.client.execute(CommandTypes.References, args, token, {
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

        const locations = response.body.refs
            .filter(reference => !reference.isDefinition)
            .map(reference =>
                typeConverters.Location.fromTextSpan(this.client.toResourceUri(reference.file), reference));

        codeLens.command = {
            title: this.getCodeLensLabel(locations),
            command: locations.length ? 'editor.action.showReferences' : '',
            arguments: [codeLens.data!.uri, codeLens.range.start, locations],
        };
        return codeLens;
    }

    private getCodeLensLabel(locations: ReadonlyArray<lsp.Location>): string {
        return locations.length === 1
            ? '1 reference'
            : `${locations.length} references`;
    }

    protected extractSymbol(
        document: LspDocument,
        item: ts.server.protocol.NavigationTree,
        parent: ts.server.protocol.NavigationTree | undefined,
    ): lsp.Range | undefined {
        if (parent && parent.kind === ScriptElementKind.enumElement) {
            return getSymbolRange(document, item);
        }

        switch (item.kind) {
            case ScriptElementKind.functionElement: {
                const showOnAllFunctions = this.fileConfigurationManager.getWorkspacePreferencesForFile(document).referencesCodeLens?.showOnAllFunctions;
                if (showOnAllFunctions) {
                    return getSymbolRange(document, item);
                }
            }
            // fallthrough

            case ScriptElementKind.constElement:
            case ScriptElementKind.letElement:
            case ScriptElementKind.variableElement:
                // Only show references for exported variables
                if (/\bexport\b/.test(item.kindModifiers)) {
                    return getSymbolRange(document, item);
                }
                break;

            case ScriptElementKind.classElement:
                if (item.text === '<class>') {
                    break;
                }
                return getSymbolRange(document, item);

            case ScriptElementKind.interfaceElement:
            case ScriptElementKind.typeElement:
            case ScriptElementKind.enumElement:
                return getSymbolRange(document, item);

            case ScriptElementKind.memberFunctionElement:
            case ScriptElementKind.memberGetAccessorElement:
            case ScriptElementKind.memberSetAccessorElement:
            case ScriptElementKind.constructorImplementationElement:
            case ScriptElementKind.memberVariableElement:
                // Don't show if child and parent have same start
                // For https://github.com/microsoft/vscode/issues/90396
                if (parent &&
                    typeConverters.Position.isEqual(
                        typeConverters.Position.fromLocation(parent.spans[0].start),
                        typeConverters.Position.fromLocation(item.spans[0].start),
                    )
                ) {
                    return undefined;
                }

                // Only show if parent is a class type object (not a literal)
                switch (parent?.kind) {
                    case ScriptElementKind.classElement:
                    case ScriptElementKind.interfaceElement:
                    case ScriptElementKind.typeElement:
                        return getSymbolRange(document, item);
                }
                break;
        }

        return undefined;
    }
}
