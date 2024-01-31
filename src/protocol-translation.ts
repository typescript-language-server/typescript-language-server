/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as lsp from 'vscode-languageserver';
import { type TsClient } from './ts-client.js';
import { HighlightSpanKind, SupportedFeatures } from './ts-protocol.js';
import type { ts } from './ts-protocol.js';
import { Position, Range } from './utils/typeConverters.js';

export function toLocation(fileSpan: ts.server.protocol.FileSpan, client: TsClient): lsp.Location {
    const uri = client.toResourceUri(fileSpan.file);
    return {
        uri,
        range: {
            start: Position.fromLocation(fileSpan.start),
            end: Position.fromLocation(fileSpan.end),
        },
    };
}

const symbolKindsMapping: { [name: string]: lsp.SymbolKind; } = {
    'enum member': lsp.SymbolKind.Constant,
    'JSX attribute': lsp.SymbolKind.Property,
    'local class': lsp.SymbolKind.Class,
    'local function': lsp.SymbolKind.Function,
    'local var': lsp.SymbolKind.Variable,
    'type parameter': lsp.SymbolKind.Variable,
    alias: lsp.SymbolKind.Variable,
    class: lsp.SymbolKind.Class,
    const: lsp.SymbolKind.Constant,
    constructor: lsp.SymbolKind.Constructor,
    enum: lsp.SymbolKind.Enum,
    field: lsp.SymbolKind.Field,
    file: lsp.SymbolKind.File,
    function: lsp.SymbolKind.Function,
    getter: lsp.SymbolKind.Method,
    interface: lsp.SymbolKind.Interface,
    let: lsp.SymbolKind.Variable,
    method: lsp.SymbolKind.Method,
    module: lsp.SymbolKind.Module,
    parameter: lsp.SymbolKind.Variable,
    property: lsp.SymbolKind.Property,
    setter: lsp.SymbolKind.Method,
    var: lsp.SymbolKind.Variable,
};

export function toSymbolKind(tspKind: string): lsp.SymbolKind {
    return symbolKindsMapping[tspKind] || lsp.SymbolKind.Variable;
}

function toDiagnosticSeverity(category: string): lsp.DiagnosticSeverity {
    switch (category) {
        case 'error': return lsp.DiagnosticSeverity.Error;
        case 'warning': return lsp.DiagnosticSeverity.Warning;
        case 'suggestion': return lsp.DiagnosticSeverity.Hint;
        default: return lsp.DiagnosticSeverity.Error;
    }
}

export function toDiagnostic(diagnostic: ts.server.protocol.Diagnostic, client: TsClient, features: SupportedFeatures): lsp.Diagnostic {
    const lspDiagnostic: lsp.Diagnostic = {
        range: {
            start: Position.fromLocation(diagnostic.start),
            end: Position.fromLocation(diagnostic.end),
        },
        message: diagnostic.text,
        severity: toDiagnosticSeverity(diagnostic.category),
        code: diagnostic.code,
        source: diagnostic.source || 'typescript',
        relatedInformation: asRelatedInformation(diagnostic.relatedInformation, client),
    };
    if (features.diagnosticsTagSupport) {
        lspDiagnostic.tags = getDiagnosticTags(diagnostic);
    }
    return lspDiagnostic;
}

function getDiagnosticTags(diagnostic: ts.server.protocol.Diagnostic): lsp.DiagnosticTag[] {
    const tags: lsp.DiagnosticTag[] = [];
    if (diagnostic.reportsUnnecessary) {
        tags.push(lsp.DiagnosticTag.Unnecessary);
    }
    if (diagnostic.reportsDeprecated) {
        tags.push(lsp.DiagnosticTag.Deprecated);
    }
    return tags;
}

function asRelatedInformation(info: ts.server.protocol.DiagnosticRelatedInformation[] | undefined, client: TsClient): lsp.DiagnosticRelatedInformation[] | undefined {
    if (!info) {
        return undefined;
    }
    const result: lsp.DiagnosticRelatedInformation[] = [];
    for (const item of info) {
        const span = item.span;
        if (span) {
            result.push(lsp.DiagnosticRelatedInformation.create(
                toLocation(span, client),
                item.message,
            ));
        }
    }
    return result;
}

export function toSelectionRange(range: ts.server.protocol.SelectionRange): lsp.SelectionRange {
    return lsp.SelectionRange.create(
        Range.fromTextSpan(range.textSpan),
        range.parent ? toSelectionRange(range.parent) : undefined,
    );
}

export function toTextEdit(edit: ts.server.protocol.CodeEdit): lsp.TextEdit {
    return {
        range: {
            start: Position.fromLocation(edit.start),
            end: Position.fromLocation(edit.end),
        },
        newText: edit.newText,
    };
}

export function toTextDocumentEdit(change: ts.server.protocol.FileCodeEdits, client: TsClient): lsp.TextDocumentEdit {
    const uri = client.toResourceUri(change.fileName);
    const document = client.toOpenDocument(uri);
    return {
        textDocument: {
            uri,
            version: document?.version ?? null,
        },
        edits: change.textChanges.map(c => toTextEdit(c)),
    };
}

export function toDocumentHighlight(item: ts.server.protocol.DocumentHighlightsItem): lsp.DocumentHighlight[] {
    return item.highlightSpans.map(i => {
        return <lsp.DocumentHighlight>{
            kind: toDocumentHighlightKind(i.kind),
            range: {
                start: Position.fromLocation(i.start),
                end: Position.fromLocation(i.end),
            },
        };
    });
}

function toDocumentHighlightKind(kind: HighlightSpanKind): lsp.DocumentHighlightKind {
    switch (kind) {
        case HighlightSpanKind.definition:
            return lsp.DocumentHighlightKind.Write;
        case HighlightSpanKind.reference:
        case HighlightSpanKind.writtenReference:
            return lsp.DocumentHighlightKind.Read;
        default:
            return lsp.DocumentHighlightKind.Text;
    }
}
