/*
 * Copyright (C) 2022 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as lsp from 'vscode-languageserver';
import { uri, createServer, TestLspServer, positionAfter, documentFromFile } from '../test-utils.js';

const diagnostics: Map<string, lsp.PublishDiagnosticsParams> = new Map();
let server: TestLspServer;

interface CallHierarchyItemWithChildren extends lsp.CallHierarchyItem {
    children: CallHierarchyItemWithChildren[];
}

async function getIncomingCalls(server: TestLspServer, item: lsp.CallHierarchyItem): Promise<CallHierarchyItemWithChildren> {
    const incomingCalls = await server.callHierarchyIncomingCalls({ item });
    const children = await Promise.all((incomingCalls || []).map(incomingCall => getIncomingCalls(server, incomingCall.from)));
    return {
        ...item,
        children,
    };
}

async function getOutgoingCalls(server: TestLspServer, item: lsp.CallHierarchyItem): Promise<CallHierarchyItemWithChildren> {
    const outgoingCalls = await server.callHierarchyOutgoingCalls({ item });
    const children = await Promise.all((outgoingCalls || []).map(outgoingCall => getOutgoingCalls(server, outgoingCall.to)));
    return {
        ...item,
        children,
    };
}

function itemToString(item: lsp.CallHierarchyItem | null, indentLevel: number): string {
    if (!item) {
        return '<not found>';
    }
    return `${new Array(indentLevel * 2 + 1).join(' ')}-|> ${item.name} (symbol: ${item.uri.split('/').pop()}#${item.selectionRange.start.line})`;
}

function callsToString(item: CallHierarchyItemWithChildren, indentLevel: number, lines: string[]): void {
    for (const child of item.children) {
        lines.push(itemToString(child, indentLevel + 1));
        callsToString(child, indentLevel + 1, lines);
    }
}

beforeAll(async () => {
    server = await createServer({
        rootUri: uri(),
        publishDiagnostics: args => diagnostics.set(args.uri, args),
    });
});

beforeEach(() => {
    server.closeAll();
    // "closeAll" triggers final publishDiagnostics with an empty list so clear last.
    diagnostics.clear();
});

afterAll(() => {
    server.closeAll();
    server.shutdown();
});

describe('call hierarchy', () => {
    const oneDoc = documentFromFile({ path: 'call-hierarchy/one.ts' });
    const twoDoc = documentFromFile({ path: 'call-hierarchy/two.ts' });
    const threeDoc = documentFromFile({ path: 'call-hierarchy/three.ts' });

    function openDocuments() {
        for (const textDocument of [oneDoc, twoDoc, threeDoc]) {
            server.didOpenTextDocument({ textDocument });
        }
    }

    it('incoming calls', async () => {
        openDocuments();
        const items = await server.prepareCallHierarchy({
            textDocument: twoDoc,
            position: positionAfter(twoDoc, 'new Three().tada'),
        });
        expect(items).not.toBeNull();
        expect(items).toHaveLength(1);
        const lines: string[] = [];
        for (const item of items!) {
            lines.push(itemToString(item, 0));
            const incomingCalls = await getIncomingCalls(server, item);
            callsToString(incomingCalls, 0, lines);
        }
        expect(lines.join('\n')).toEqual(`
-|> tada (symbol: three.ts#2)
  -|> callThreeTwice (symbol: two.ts#3)
    -|> main (symbol: one.ts#2)
            `.trim(),
        );
    });

    it('outgoing calls', async () => {
        openDocuments();
        const items = await server.prepareCallHierarchy({
            textDocument: oneDoc,
            position: positionAfter(oneDoc, 'new Two().callThreeTwice'),
        });
        expect(items).not.toBeNull();
        expect(items).toHaveLength(1);
        const lines: string[] = [];
        for (const item of items!) {
            lines.push(itemToString(item, 0));
            const outgoingCalls = await getOutgoingCalls(server, item);
            callsToString(outgoingCalls, 0, lines);
        }
        expect(lines.join('\n')).toEqual(`
-|> callThreeTwice (symbol: two.ts#3)
  -|> tada (symbol: three.ts#2)
    -|> print (symbol: three.ts#6)
      -|> log (symbol: console.d.ts#220)
  -|> Three (symbol: three.ts#1)
`.trim(),
        );
    });
});
