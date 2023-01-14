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

import path from 'node:path';
import * as lsp from 'vscode-languageserver';
import type { LspDocuments } from '../document.js';
import { pathToUri } from '../protocol-translation.js';
import { ScriptElementKind, ScriptElementKindModifier } from '../ts-protocol.js';
import type { ts } from '../ts-protocol.js';
import { Range } from '../utils/typeConverters.js';

export function fromProtocolCallHierarchyItem(item: ts.server.protocol.CallHierarchyItem, documents: LspDocuments, workspaceRoot: string | undefined): lsp.CallHierarchyItem {
    const useFileName = isSourceFileItem(item);
    const name = useFileName ? path.basename(item.file) : item.name;
    const detail = useFileName
        ? workspaceRoot ? path.relative(workspaceRoot, path.dirname(item.file)) : path.dirname(item.file)
        : item.containerName ?? '';
    const result: lsp.CallHierarchyItem = {
        kind: fromProtocolScriptElementKind(item.kind),
        name,
        detail,
        uri: pathToUri(item.file, documents),
        range: Range.fromTextSpan(item.span),
        selectionRange: Range.fromTextSpan(item.selectionSpan),
    };

    const kindModifiers = item.kindModifiers ? parseKindModifier(item.kindModifiers) : undefined;
    if (kindModifiers?.has(ScriptElementKindModifier.deprecatedModifier)) {
        result.tags = [lsp.SymbolTag.Deprecated];
    }
    return result;
}

export function fromProtocolCallHierarchyIncomingCall(item: ts.server.protocol.CallHierarchyIncomingCall, documents: LspDocuments, workspaceRoot: string | undefined): lsp.CallHierarchyIncomingCall {
    return {
        from: fromProtocolCallHierarchyItem(item.from, documents, workspaceRoot),
        fromRanges: item.fromSpans.map(Range.fromTextSpan),
    };
}

export function fromProtocolCallHierarchyOutgoingCall(item: ts.server.protocol.CallHierarchyOutgoingCall, documents: LspDocuments, workspaceRoot: string | undefined): lsp.CallHierarchyOutgoingCall {
    return {
        to: fromProtocolCallHierarchyItem(item.to, documents, workspaceRoot),
        fromRanges: item.fromSpans.map(Range.fromTextSpan),
    };
}

function isSourceFileItem(item: ts.server.protocol.CallHierarchyItem) {
    return item.kind === ScriptElementKind.scriptElement || item.kind === ScriptElementKind.moduleElement && item.selectionSpan.start.line === 1 && item.selectionSpan.start.offset === 1;
}

function fromProtocolScriptElementKind(kind: ScriptElementKind): lsp.SymbolKind {
    switch (kind) {
        case ScriptElementKind.moduleElement:return lsp.SymbolKind.Module;
        case ScriptElementKind.classElement:return lsp.SymbolKind.Class;
        case ScriptElementKind.enumElement:return lsp.SymbolKind.Enum;
        case ScriptElementKind.enumMemberElement:return lsp.SymbolKind.EnumMember;
        case ScriptElementKind.interfaceElement:return lsp.SymbolKind.Interface;
        case ScriptElementKind.indexSignatureElement:return lsp.SymbolKind.Method;
        case ScriptElementKind.callSignatureElement:return lsp.SymbolKind.Method;
        case ScriptElementKind.memberFunctionElement:return lsp.SymbolKind.Method;
        case ScriptElementKind.memberVariableElement:return lsp.SymbolKind.Property;
        case ScriptElementKind.memberGetAccessorElement:return lsp.SymbolKind.Property;
        case ScriptElementKind.memberSetAccessorElement:return lsp.SymbolKind.Property;
        case ScriptElementKind.variableElement:return lsp.SymbolKind.Variable;
        case ScriptElementKind.letElement:return lsp.SymbolKind.Variable;
        case ScriptElementKind.constElement:return lsp.SymbolKind.Variable;
        case ScriptElementKind.localVariableElement:return lsp.SymbolKind.Variable;
        case ScriptElementKind.alias:return lsp.SymbolKind.Variable;
        case ScriptElementKind.functionElement:return lsp.SymbolKind.Function;
        case ScriptElementKind.localFunctionElement:return lsp.SymbolKind.Function;
        case ScriptElementKind.constructSignatureElement:return lsp.SymbolKind.Constructor;
        case ScriptElementKind.constructorImplementationElement:return lsp.SymbolKind.Constructor;
        case ScriptElementKind.typeParameterElement:return lsp.SymbolKind.TypeParameter;
        case ScriptElementKind.string:return lsp.SymbolKind.String;
        default: return lsp.SymbolKind.Variable;
    }
}

function parseKindModifier(kindModifiers: string): Set<string> {
    return new Set(kindModifiers.split(/,|\s+/g));
}
