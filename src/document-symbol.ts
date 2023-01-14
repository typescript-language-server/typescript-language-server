/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as lsp from 'vscode-languageserver';
import { toSymbolKind } from './protocol-translation.js';
import { ScriptElementKind } from './ts-protocol.js';
import type { ts } from './ts-protocol.js';
import { Range } from './utils/typeConverters.js';

export function collectDocumentSymbols(parent: ts.server.protocol.NavigationTree, symbols: lsp.DocumentSymbol[]): boolean {
    return collectDocumentSymbolsInRange(parent, symbols, { start: Range.fromTextSpan(parent.spans[0]).start, end: Range.fromTextSpan(parent.spans[parent.spans.length - 1]).end });
}

function collectDocumentSymbolsInRange(parent: ts.server.protocol.NavigationTree, symbols: lsp.DocumentSymbol[], range: lsp.Range): boolean {
    let shouldInclude = shouldIncludeEntry(parent);

    for (const span of parent.spans) {
        const spanRange = Range.fromTextSpan(span);
        if (!Range.intersection(range, spanRange)) {
            continue;
        }

        const children: lsp.DocumentSymbol[] = [];
        if (parent.childItems) {
            for (const child of parent.childItems) {
                if (child.spans.some(childSpan => !!Range.intersection(spanRange, Range.fromTextSpan(childSpan)))) {
                    const includedChild = collectDocumentSymbolsInRange(child, children, spanRange);
                    shouldInclude = shouldInclude || includedChild;
                }
            }
        }
        let selectionRange = spanRange;
        if (parent.nameSpan) {
            const nameRange = Range.fromTextSpan(parent.nameSpan);
            // In the case of mergeable definitions, the nameSpan is only correct for the first definition.
            if (Range.intersection(spanRange, nameRange)) {
                selectionRange = nameRange;
            }
        }
        if (shouldInclude) {
            symbols.push({
                name: parent.text,
                detail: '',
                kind: toSymbolKind(parent.kind),
                range: spanRange,
                selectionRange: selectionRange,
                children,
            });
        }
    }

    return shouldInclude;
}

export function collectSymbolInformation(uri: string, current: ts.server.protocol.NavigationTree, symbols: lsp.SymbolInformation[], containerName?: string): boolean {
    let shouldInclude = shouldIncludeEntry(current);
    const name = current.text;
    for (const span of current.spans) {
        const range = Range.fromTextSpan(span);
        const children: lsp.SymbolInformation[] = [];
        if (current.childItems) {
            for (const child of current.childItems) {
                if (child.spans.some(span => !!Range.intersection(range, Range.fromTextSpan(span)))) {
                    const includedChild = collectSymbolInformation(uri, child, children, name);
                    shouldInclude = shouldInclude || includedChild;
                }
            }
        }
        if (shouldInclude) {
            symbols.push({
                name,
                kind: toSymbolKind(current.kind),
                location: {
                    uri,
                    range,
                },
                containerName,
            });
            symbols.push(...children);
        }
    }

    return shouldInclude;
}

export function shouldIncludeEntry(item: ts.server.protocol.NavigationTree | ts.server.protocol.NavigationBarItem): boolean {
    if (item.kind === ScriptElementKind.alias) {
        return false;
    }
    return !!(item.text && item.text !== '<function>' && item.text !== '<class>');
}
