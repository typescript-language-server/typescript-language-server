/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as tsp from 'typescript/lib/protocol';
import * as lsp from 'vscode-languageserver';
import * as lspTypeHierarchy from './type-hierarchy.lsp.proposal';
import { TspClient } from "./tsp-client";
import { uriToPath, toLocation, asRange, Range, toSymbolKind, pathToUri, asTextSpan } from './protocol-translation';
import { CommandTypes } from './tsp-command-types';

export type DocumentProvider = (file: string) => lsp.TextDocument | undefined;


// tslint:disable-next-line:max-line-length
export async function computeTypeHierarchy(tspClient: TspClient, documentProvider: DocumentProvider, params: lspTypeHierarchy.TypeHierarchyParams): Promise<lspTypeHierarchy.TypeHierarchyItem | null> {
    const item = await getItem(tspClient, params);
    if (item === null) {
        return null;
    }
    const direction = params.direction !== undefined ? params.direction : lspTypeHierarchy.TypeHierarchyDirection.Parents;
    const levelsToResolve = params.resolve || 0;
    await resovleItem(tspClient, documentProvider, item!, levelsToResolve, direction);
    return item;
}

// tslint:disable-next-line:max-line-length
export async function resolveTypeHierarchy(tspClient: TspClient, documentProvider: DocumentProvider, params: lspTypeHierarchy.ResolveTypeHierarchyItemParams): Promise<lspTypeHierarchy.TypeHierarchyItem> {
    const item = params.item;
    await resovleItem(tspClient, documentProvider, item, params.resolve, params.direction);
    return item;
}

// tslint:disable-next-line:max-line-length
async function resovleItem(tspClient: TspClient, documentProvider: DocumentProvider, item: lspTypeHierarchy.TypeHierarchyItem, levelsToResolve: number, direction: lspTypeHierarchy.TypeHierarchyDirection, ): Promise<void> {
    if (levelsToResolve < 1) {
        return;
    }
    if (direction === lspTypeHierarchy.TypeHierarchyDirection.Parents || direction === lspTypeHierarchy.TypeHierarchyDirection.Both) {
        const parents = await resolveParents(tspClient, documentProvider, item);
        item.parents = parents;
        for (const parent of parents) {
            await resovleItem(tspClient, documentProvider, parent, levelsToResolve - 1, lspTypeHierarchy.TypeHierarchyDirection.Parents);
        }
    }
    if (direction === lspTypeHierarchy.TypeHierarchyDirection.Children || direction === lspTypeHierarchy.TypeHierarchyDirection.Both) {
        const children = await resolveChildren(tspClient, documentProvider, item);
        item.children = children;
        for (const child of children) {
            await resovleItem(tspClient, documentProvider, child, levelsToResolve - 1, lspTypeHierarchy.TypeHierarchyDirection.Children);
        }
    }
}

async function resolveParents(tspClient: TspClient, documentProvider: DocumentProvider, item: lspTypeHierarchy.TypeHierarchyItem): Promise<lspTypeHierarchy.TypeHierarchyItem[]> {
    const parents: lspTypeHierarchy.TypeHierarchyItem[] = [];
    const { uri, range } = item;
    const file = uriToPath(uri)!;
    const document = documentProvider(file);
    if (!document) {
        return parents;
    }
    const start = document.offsetAt(range.start)
    const candidates = getCandidatesForSupertypesAtPosition(document.getText(), start);
    const candidatePositions = candidates.map(s => document.positionAt(s.start));
    for (const position of candidatePositions) {
        let definitionSymbol: lsp.DocumentSymbol | undefined;
        let uri: string | undefined;
        const definitionReferences = await findDefinitionReferences(tspClient, { file, ...asTextSpan(lsp.Range.create(position, position)) });
        for (const definitionReference of definitionReferences) {
            definitionSymbol = await findEnclosingSymbol(tspClient, definitionReference);
            if (definitionSymbol && isInterfaceOrClass(definitionSymbol)) {
                uri = pathToUri(definitionReference.file, undefined);
                break;
            }
        }
        if (!definitionSymbol || !uri) {
            continue;
        }
        const { name, detail, kind, range, selectionRange } = definitionSymbol;
        parents.push({ uri, name, detail, kind, range, selectionRange });
    }
    return parents;
}

async function resolveChildren(tspClient: TspClient, documentProvider: DocumentProvider, item: lspTypeHierarchy.TypeHierarchyItem): Promise<lspTypeHierarchy.TypeHierarchyItem[]> {
    const result: lspTypeHierarchy.TypeHierarchyItem[] = [];
    const { uri, selectionRange } = item;
    const file = uriToPath(uri)!;
    const references = await findNonDefinitionReferences(tspClient, { file, ...asTextSpan(selectionRange) });

    for (const reference of references) {
        const symbol = await findEnclosingSymbol(tspClient, reference);
        if (!symbol || !isInterfaceOrClass(symbol)) {
            continue;
        }
        const document = documentProvider(reference.file);
        if (!document) {
            return [];
        }
        const start = document.offsetAt(symbol.selectionRange.start);
        const candidates = getCandidatesForSupertypesAtPosition(document.getText(), start);
        if (candidates.some(c => c.symbol === item.name)) {
            const { name, detail, kind, range, selectionRange } = symbol;
            const uri = pathToUri(reference.file, undefined)
            result.push({ uri, name, detail, kind, range, selectionRange });
        }
    }
    return result;
}

async function getItem(tspClient: TspClient, params: lspTypeHierarchy.TypeHierarchyParams): Promise<lspTypeHierarchy.TypeHierarchyItem | null> {
    let uri: string | undefined;
    let contextSymbol: lsp.DocumentSymbol | undefined;
    const contextDefinitions = await getDefinitions(tspClient, params);
    for (const contextDefinition of contextDefinitions) {
        uri = pathToUri(contextDefinition.file, undefined);
        contextSymbol = await findEnclosingSymbol(tspClient, contextDefinition);
        if (contextSymbol && isInterfaceOrClass(contextSymbol)) {
            break;
        } else {
            uri = undefined;
            contextSymbol = undefined;
        }
    }
    if (!contextSymbol || !uri) {
        return null;
    }
    const { name, detail, kind, range, selectionRange } = contextSymbol;
    if (!isInterfaceOrClass(contextSymbol)) {
        return null;
    }
    return { uri, name, detail, kind, range, selectionRange };
}

function isInterfaceOrClass(symbol: lsp.DocumentSymbol): boolean {
    return symbol.kind === lsp.SymbolKind.Class || symbol.kind === lsp.SymbolKind.Interface;
}

async function getDefinitions(tspClient: TspClient, args: lsp.TextDocumentPositionParams): Promise<tsp.FileSpan[]> {
    const file = uriToPath(args.textDocument.uri);
    if (!file) {
        return [];
    }
    const definitionResult = await tspClient.request(CommandTypes.Definition, {
        file,
        line: args.position.line + 1,
        offset: args.position.character + 1
    });
    const spans = definitionResult.body;
    return spans || [];
}

async function findEnclosingSymbol(tspClient: TspClient, args: tsp.FileSpan): Promise<lsp.DocumentSymbol | undefined> {
    const file = args.file;
    const response = await tspClient.request(CommandTypes.NavTree, { file });
    const tree = response.body;
    if (!tree || !tree.childItems) {
        return undefined;
    }
    const pos = lsp.Position.create(args.start.line - 1, args.start.offset - 1);
    const symbol = await findEnclosingSymbolInTree(tree, lsp.Range.create(pos, pos));
    return symbol;
}

async function findEnclosingSymbolInTree(parent: tsp.NavigationTree, range: lsp.Range): Promise<lsp.DocumentSymbol | undefined> {
    const inSpan = (span: tsp.TextSpan) => !!Range.intersection(asRange(span), range);
    const inTree = (tree: tsp.NavigationTree) => tree.spans.some(span => inSpan(span));

    let candidate = inTree(parent) ? parent : undefined;
    outer: while (candidate) {
        const children = candidate.childItems || [];
        for (const child of children) {
            if (inTree(child)) {
                candidate = child;
                continue outer;
            }
        }
        break;
    }
    if (!candidate) {
        return undefined;
    }
    const span = candidate.spans.find(span => inSpan(span))!;
    const spanRange = asRange(span);
    let selectionRange = spanRange;
    if (candidate.nameSpan) {
        const nameRange = asRange(candidate.nameSpan);
        if (Range.intersection(spanRange, nameRange)) {
            selectionRange = nameRange;
        }
    }
    return {
        name: candidate.text,
        kind: toSymbolKind(candidate.kind),
        range: spanRange,
        selectionRange: selectionRange
    }
}

async function findDefinitionReferences(tspClient: TspClient, args: tsp.FileSpan): Promise<tsp.FileSpan[]> {
    return (await findReferences(tspClient, args)).filter(ref => ref.isDefinition);
}

async function findNonDefinitionReferences(tspClient: TspClient, args: tsp.FileSpan): Promise<tsp.FileSpan[]> {
    return (await findReferences(tspClient, args)).filter(ref => !ref.isDefinition);
}

async function findReferences(tspClient: TspClient, args: tsp.FileSpan): Promise<tsp.ReferencesResponseItem[]> {
    const file = args.file;
    const result = await tspClient.request(CommandTypes.References, {
        file,
        line: args.start.line,
        offset: args.start.offset
    });
    if (!result.body) {
        return [];
    }
    return result.body.refs;
}

function getCandidatesForSupertypesAtPosition(document: string, start: number) {
    const end = document.indexOf('{', start) - 1;
    let substring = document.substring(start, end);
    let match = /\Wextends\W/.exec(substring) || /\Wimplements\W/.exec(substring);
    if (!match) {
        return [];
    }
    start = start + match.index;
    substring = document.substring(start, end);

    function getSymbols(substring: string): { start: number, symbol: string }[] {
        const result: { start: number, symbol: string }[] = [];
        const idRegex = /[$_a-zA-Z0-9\u{00C0}-\u{E007F}]/u;
        let start: number | undefined;
        let symbol = '';
        const pushChar = (i: number, c: string) => {
            if (start === undefined) {
                start = i;
            }
            symbol += c;
        };
        const pushSymbol = () => {
            if (start !== undefined) {
                result.push({ start, symbol });
                start = undefined;
                symbol = '';
            }
        }
        let bracketLevel = 0;
        for (let i = 0; i <= substring.length; i++) {
            const c = substring.charAt(i);
            if (c === '<') {
                pushSymbol();
                bracketLevel++;
            }
            if (c === '>') {
                bracketLevel = Math.max(bracketLevel - 1, 0);
            }
            if (bracketLevel === 0) {
                if (c.match(idRegex)) {
                    pushChar(i, c);
                } else {
                    pushSymbol();
                }
            }
        }
        pushSymbol();
        return result.filter(s => s.symbol !== 'implements' && s.symbol !== 'extends');
    }
    const result = getSymbols(substring).map(s => ({ start: start + s.start, symbol: s.symbol }));
    return result;
}
