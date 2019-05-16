/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as lsp from 'vscode-languageserver';
import * as tsp from 'typescript/lib/protocol';
import URI from "vscode-uri";
import { LspDocuments } from './document';

export function uriToPath(stringUri: string): string | undefined {
    const uri = URI.parse(stringUri);
    if (uri.scheme !== 'file') {
        return undefined;
    }
    return uri.fsPath;
}

export function pathToUri(filepath: string, documents: LspDocuments | undefined): string {
    const fileUri = URI.file(filepath);
    const document = documents && documents.get(fileUri.fsPath);
    return document ? document.uri : fileUri.toString();
}

export function currentVersion(filepath: string, documents: LspDocuments | undefined): number {
    const fileUri = URI.file(filepath);
    const document = documents && documents.get(fileUri.fsPath);
    return document ? document.version : 0;
}

export function toPosition(location: tsp.Location): lsp.Position {
    return {
        line: location.line - 1,
        character: location.offset - 1
    }
}

export function toLocation(fileSpan: tsp.FileSpan, documents: LspDocuments | undefined): lsp.Location {
    return {
        uri: pathToUri(fileSpan.file, documents),
        range: {
            start: toPosition(fileSpan.start),
            end: toPosition(fileSpan.end)
        }
    };
}

export function toFileRangeRequestArgs(file: string, range: lsp.Range): tsp.FileRangeRequestArgs {
    return {
        file,
        startLine: range.start.line + 1,
        startOffset: range.start.character + 1,
        endLine: range.end.line + 1,
        endOffset: range.end.character + 1
    }
};

const symbolKindsMapping: { [name: string]: lsp.SymbolKind } = {
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
    var: lsp.SymbolKind.Variable
};

export function toSymbolKind(tspKind: string): lsp.SymbolKind {
    return symbolKindsMapping[tspKind] || lsp.SymbolKind.Variable
}

export function toDiagnosticSeverity(category: string): lsp.DiagnosticSeverity {
    switch (category) {
        case 'error': return lsp.DiagnosticSeverity.Error
        case 'warning': return lsp.DiagnosticSeverity.Warning
        case 'suggestion': return lsp.DiagnosticSeverity.Hint
        default: return lsp.DiagnosticSeverity.Error
    }
}

export function toDiagnostic(diagnostic: tsp.Diagnostic, documents: LspDocuments | undefined): lsp.Diagnostic {
    return {
        range: {
            start: toPosition(diagnostic.start),
            end: toPosition(diagnostic.end)
        },
        message: diagnostic.text,
        severity: toDiagnosticSeverity(diagnostic.category),
        code: diagnostic.code,
        source: diagnostic.source || 'typescript',
        relatedInformation: asRelatedInformation(diagnostic.relatedInformation, documents)
    }
}

export function asRelatedInformation(info: tsp.DiagnosticRelatedInformation[] | undefined, documents: LspDocuments | undefined): lsp.DiagnosticRelatedInformation[] | undefined {
    if (!info) {
        return undefined;
    }
    const result: lsp.DiagnosticRelatedInformation[] = [];
    for (const item of info) {
        const span = item.span;
        if (span) {
            result.push(lsp.DiagnosticRelatedInformation.create(
                toLocation(span, documents),
                item.message
            ));
        }
    }
    return result;
}

export function toTextEdit(edit: tsp.CodeEdit): lsp.TextEdit {
    return {
        range: {
            start: toPosition(edit.start),
            end: toPosition(edit.end)
        },
        newText: edit.newText
    }
}

function tagsMarkdownPreview(tags: tsp.JSDocTagInfo[]): string {
    return (tags || [])
        .map(tag => {
            const label = `*@${tag.name}*`;
            if (!tag.text) {
                return label;
            }
            return label + (tag.text.match(/\r\n|\n/g) ? '  \n' + tag.text : ` — ${tag.text}`);
        })
        .join('  \n\n');
}

export function toMarkDown(documentation: tsp.SymbolDisplayPart[], tags: tsp.JSDocTagInfo[]): string {
    let result = "";
    result += asPlainText(documentation);
    const tagsPreview = tagsMarkdownPreview(tags);
    if (tagsPreview) {
        result += '\n\n' + tagsPreview;
    }
    return result;
}

export function toTextDocumentEdit(change: tsp.FileCodeEdits, documents: LspDocuments | undefined): lsp.TextDocumentEdit {
    return {
        textDocument: {
            uri: pathToUri(change.fileName, documents),
            version: currentVersion(change.fileName, documents)
        },
        edits: change.textChanges.map(c => toTextEdit(c))
    }
}

export function toDocumentHighlight(item: tsp.DocumentHighlightsItem): lsp.DocumentHighlight[] {
    return item.highlightSpans.map(i => {
        return <lsp.DocumentHighlight>{
            kind: toDocumentHighlightKind(i.kind),
            range: {
                start: toPosition(i.start),
                end: toPosition(i.end)
            }
        }
    });
}

// copied because the protocol module is not available at runtime (js version).
enum HighlightSpanKind {
    none = "none",
    definition = "definition",
    reference = "reference",
    writtenReference = "writtenReference",
}

function toDocumentHighlightKind(kind: tsp.HighlightSpanKind): lsp.DocumentHighlightKind {
    switch (kind) {
        case HighlightSpanKind.definition: return lsp.DocumentHighlightKind.Write
        case HighlightSpanKind.reference:
        case HighlightSpanKind.writtenReference: return lsp.DocumentHighlightKind.Read
        default: return lsp.DocumentHighlightKind.Text
    }
}

export function asRange(span: tsp.TextSpan): lsp.Range {
    return lsp.Range.create(
        Math.max(0, span.start.line - 1), Math.max(0, span.start.offset - 1),
        Math.max(0, span.end.line - 1), Math.max(0, span.end.offset - 1)
    );
}

export function asDocumentation(data: {
    documentation?: tsp.SymbolDisplayPart[]
    tags?: tsp.JSDocTagInfo[]
}): lsp.MarkupContent | undefined {
    let value = '';
    const documentation = asPlainText(data.documentation);
    if (documentation) {
        value += documentation;
    }
    if (data.tags) {
        const tagsDocumentation = asTagsDocumentation(data.tags);
        if (tagsDocumentation) {
            value += '\n\n' + tagsDocumentation;
        }
    }
    return value.length ? {
        kind: lsp.MarkupKind.Markdown,
        value
    } : undefined;
}

export function asTagsDocumentation(tags: tsp.JSDocTagInfo[]): string {
    return tags.map(asTagDocumentation).join('  \n\n');
}

export function asTagDocumentation(tag: tsp.JSDocTagInfo): string {
    switch (tag.name) {
        case 'param':
            const body = (tag.text || '').split(/^([\w\.]+)\s*-?\s*/);
            if (body && body.length === 3) {
                const param = body[1];
                const doc = body[2];
                const label = `*@${tag.name}* \`${param}\``;
                if (!doc) {
                    return label;
                }
                return label + (doc.match(/\r\n|\n/g) ? '  \n' + doc : ` — ${doc}`);
            }
    }

    // Generic tag
    const label = `*@${tag.name}*`;
    const text = asTagBodyText(tag);
    if (!text) {
        return label;
    }
    return label + (text.match(/\r\n|\n/g) ? '  \n' + text : ` — ${text}`);
}

export function asTagBodyText(tag: tsp.JSDocTagInfo): string | undefined {
    if (!tag.text) {
        return undefined;
    }

    switch (tag.name) {
        case 'example':
        case 'default':
            // Convert to markdown code block if it not already one
            if (tag.text.match(/^\s*[~`]{3}/g)) {
                return tag.text;
            }
            return '```\n' + tag.text + '\n```';
    }

    return tag.text;
}

export function asPlainText(parts: undefined): undefined;
export function asPlainText(parts: tsp.SymbolDisplayPart[]): string;
export function asPlainText(parts: tsp.SymbolDisplayPart[] | undefined): string | undefined;
export function asPlainText(parts: tsp.SymbolDisplayPart[] | undefined): string | undefined {
    if (!parts) {
        return undefined;
    }
    return parts.map(part => part.text).join('');
}

export namespace Position {
    export function Min(): undefined;
    export function Min(...positions: lsp.Position[]): lsp.Position;
    export function Min(...positions: lsp.Position[]): lsp.Position | undefined {
        if (!positions.length) {
            return undefined;
        }
        let result = positions.pop()!;
        for (let p of positions) {
            if (isBefore(p, result)) {
                result = p;
            }
        }
        return result;
    }
    export function isBefore(one: lsp.Position, other: lsp.Position): boolean {
        if (one.line < other.line) {
            return true;
        }
        if (other.line < one.line) {
            return false;
        }
        return one.character < other.character;
    }
    export function Max(): undefined;
    export function Max(...positions: lsp.Position[]): lsp.Position;
    export function Max(...positions: lsp.Position[]): lsp.Position | undefined {
        if (!positions.length) {
            return undefined;
        }
        let result = positions.pop()!;
        for (let p of positions) {
            if (isAfter(p, result)) {
                result = p;
            }
        }
        return result;
    }
    export function isAfter(one: lsp.Position, other: lsp.Position): boolean {
        return !isBeforeOrEqual(one, other);
    }
    export function isBeforeOrEqual(one: lsp.Position, other: lsp.Position): boolean {
        if (one.line < other.line) {
            return true;
        }
        if (other.line < one.line) {
            return false;
        }
        return one.character <= other.character;
    }
}

export namespace Range {
    export function intersection(one: lsp.Range, other: lsp.Range): lsp.Range | undefined {
        const start = Position.Max(other.start, one.start);
        const end = Position.Min(other.end, one.end);
        if (Position.isAfter(start, end)) {
            // this happens when there is no overlap:
            // |-----|
            //          |----|
            return undefined;
        }
        return lsp.Range.create(start, end);
    }
}