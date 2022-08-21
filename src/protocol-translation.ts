/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as lsp from 'vscode-languageserver';
import type tsp from 'typescript/lib/protocol.d.js';
import vscodeUri from 'vscode-uri';
import { LspDocuments } from './document.js';
import { SupportedFeatures } from './ts-protocol.js';
import { Position } from './utils/typeConverters.js';

const RE_PATHSEP_WINDOWS = /\\/g;

export function uriToPath(stringUri: string): string | undefined {
    // Vim may send `zipfile:` URIs which tsserver with Yarn v2+ hook can handle. Keep as-is.
    // Example: zipfile:///foo/bar/baz.zip::path/to/module
    if (stringUri.startsWith('zipfile:')) {
        return stringUri;
    }
    const uri = vscodeUri.URI.parse(stringUri);
    if (uri.scheme !== 'file') {
        return undefined;
    }
    return normalizeFsPath(uri.fsPath);
}

export function pathToUri(filepath: string, documents: LspDocuments | undefined): string {
    // Yarn v2+ hooks tsserver and sends `zipfile:` URIs for Vim. Keep as-is.
    // Example: zipfile:///foo/bar/baz.zip::path/to/module
    if (filepath.startsWith('zipfile:')) {
        return filepath;
    }
    const fileUri = vscodeUri.URI.file(filepath);
    const normalizedFilepath = normalizePath(fileUri.fsPath);
    const document = documents && documents.get(normalizedFilepath);
    return document ? document.uri : fileUri.toString();
}

/**
 * Normalizes the file system path.
 *
 * On systems other than Windows it should be an no-op.
 *
 * On Windows, an input path in a format like "C:/path/file.ts"
 * will be normalized to "c:/path/file.ts".
 */
export function normalizePath(filePath: string): string {
    const fsPath = vscodeUri.URI.file(filePath).fsPath;
    return normalizeFsPath(fsPath);
}

/**
 * Normalizes the path obtained through the "fsPath" property of the URI module.
 */
export function normalizeFsPath(fsPath: string): string {
    return fsPath.replace(RE_PATHSEP_WINDOWS, '/');
}

function currentVersion(filepath: string, documents: LspDocuments | undefined): number | null {
    const fileUri = vscodeUri.URI.file(filepath);
    const normalizedFilepath = normalizePath(fileUri.fsPath);
    const document = documents && documents.get(normalizedFilepath);
    return document ? document.version : null;
}

export function toLocation(fileSpan: tsp.FileSpan, documents: LspDocuments | undefined): lsp.Location {
    return {
        uri: pathToUri(fileSpan.file, documents),
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

export function toDiagnostic(diagnostic: tsp.Diagnostic, documents: LspDocuments | undefined, features: SupportedFeatures): lsp.Diagnostic {
    const lspDiagnostic: lsp.Diagnostic = {
        range: {
            start: Position.fromLocation(diagnostic.start),
            end: Position.fromLocation(diagnostic.end),
        },
        message: diagnostic.text,
        severity: toDiagnosticSeverity(diagnostic.category),
        code: diagnostic.code,
        source: diagnostic.source || 'typescript',
        relatedInformation: asRelatedInformation(diagnostic.relatedInformation, documents),
    };
    if (features.diagnosticsTagSupport) {
        lspDiagnostic.tags = getDiagnosticTags(diagnostic);
    }
    return lspDiagnostic;
}

function getDiagnosticTags(diagnostic: tsp.Diagnostic): lsp.DiagnosticTag[] {
    const tags: lsp.DiagnosticTag[] = [];
    if (diagnostic.reportsUnnecessary) {
        tags.push(lsp.DiagnosticTag.Unnecessary);
    }
    if (diagnostic.reportsDeprecated) {
        tags.push(lsp.DiagnosticTag.Deprecated);
    }
    return tags;
}

function asRelatedInformation(info: tsp.DiagnosticRelatedInformation[] | undefined, documents: LspDocuments | undefined): lsp.DiagnosticRelatedInformation[] | undefined {
    if (!info) {
        return undefined;
    }
    const result: lsp.DiagnosticRelatedInformation[] = [];
    for (const item of info) {
        const span = item.span;
        if (span) {
            result.push(lsp.DiagnosticRelatedInformation.create(
                toLocation(span, documents),
                item.message,
            ));
        }
    }
    return result;
}

export function toTextEdit(edit: tsp.CodeEdit): lsp.TextEdit {
    return {
        range: {
            start: Position.fromLocation(edit.start),
            end: Position.fromLocation(edit.end),
        },
        newText: edit.newText,
    };
}

export function toTextDocumentEdit(change: tsp.FileCodeEdits, documents: LspDocuments | undefined): lsp.TextDocumentEdit {
    return {
        textDocument: {
            uri: pathToUri(change.fileName, documents),
            version: currentVersion(change.fileName, documents),
        },
        edits: change.textChanges.map(c => toTextEdit(c)),
    };
}

export function toDocumentHighlight(item: tsp.DocumentHighlightsItem): lsp.DocumentHighlight[] {
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

// copied because the protocol module is not available at runtime (js version).
enum HighlightSpanKind {
    none = 'none',
    definition = 'definition',
    reference = 'reference',
    writtenReference = 'writtenReference',
}

function toDocumentHighlightKind(kind: tsp.HighlightSpanKind): lsp.DocumentHighlightKind {
    switch (kind) {
        case HighlightSpanKind.definition: return lsp.DocumentHighlightKind.Write;
        case HighlightSpanKind.reference:
        case HighlightSpanKind.writtenReference: return lsp.DocumentHighlightKind.Read;
        default: return lsp.DocumentHighlightKind.Text;
    }
}

export function asDocumentation(data: {
    documentation?: tsp.SymbolDisplayPart[];
    tags?: tsp.JSDocTagInfo[];
}): lsp.MarkupContent | undefined {
    let value = '';
    if (data.documentation) {
        value += asPlainText(data.documentation);
    }
    if (data.tags) {
        const tagsDocumentation = asTagsDocumentation(data.tags);
        if (tagsDocumentation) {
            value += '\n\n' + tagsDocumentation;
        }
    }
    return value.length ? {
        kind: lsp.MarkupKind.Markdown,
        value,
    } : undefined;
}

export function asTagsDocumentation(tags: tsp.JSDocTagInfo[]): string {
    return tags.map(asTagDocumentation).join('  \n\n');
}

export function asTagDocumentation(tag: tsp.JSDocTagInfo): string {
    switch (tag.name) {
        case 'param': {
            if (!tag.text) {
                break;
            }
            const text = asPlainText(tag.text);
            const body = text.split(/^([\w.]+)\s*-?\s*/);
            if (body && body.length === 3) {
                const param = body[1];
                const doc = body[2];
                const label = `*@${tag.name}* \`${param}\``;
                if (!doc) {
                    return label;
                }
                return label + (doc.match(/\r\n|\n/g) ? '  \n' + doc : ` — ${doc}`);
            }
            break;
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

    const text = asPlainText(tag.text);

    switch (tag.name) {
        case 'example':
        case 'default':
            // Convert to markdown code block if it not already one
            if (text.match(/^\s*[~`]{3}/g)) {
                return text;
            }
            return '```\n' + text + '\n```';
    }

    return text;
}

export function asPlainText(parts: string | tsp.SymbolDisplayPart[]): string {
    if (typeof parts === 'string') {
        return parts;
    }
    return parts.map(part => part.text).join('');
}
