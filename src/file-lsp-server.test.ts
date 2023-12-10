/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { uri, createServer, lastPosition, filePath, readContents, positionAfter, openDocumentAndWaitForDiagnostics, TestLspServer } from './test-utils.js';

let server: TestLspServer;

describe('documentHighlight', () => {
    beforeAll(async () => {
        server = await createServer({
            rootUri: uri(),
            publishDiagnostics: () => { },
        });
    });

    beforeEach(() => {
        server.closeAllForTesting();
    });

    afterAll(() => {
        server.closeAllForTesting();
        server.shutdown();
    });

    it('simple test', async () => {
        const doc = {
            uri: uri('module2.ts'),
            languageId: 'typescript',
            version: 1,
            text: readContents(filePath('module2.ts')),
        };
        await openDocumentAndWaitForDiagnostics(server, doc);
        const result = await server.documentHighlight({
            textDocument: doc,
            position: lastPosition(doc, 'doStuff'),
        });
        expect(result).toHaveLength(2);
    });
});

describe('completions', () => {
    beforeAll(async () => {
        server = await createServer({
            rootUri: uri(),
            publishDiagnostics: () => { },
        });
    });

    beforeEach(() => {
        server.closeAllForTesting();
    });

    afterAll(() => {
        server.closeAllForTesting();
        server.shutdown();
    });

    it('receives completion that auto-imports from another module', async () => {
        const doc = {
            uri: uri('completion.ts'),
            languageId: 'typescript',
            version: 1,
            text: readContents(filePath('completion.ts')),
        };
        await openDocumentAndWaitForDiagnostics(server, doc);
        const proposals = await server.completion({
            textDocument: doc,
            position: positionAfter(doc, 'doStuff'),
        });
        expect(proposals).not.toBeNull();
        const completion = proposals!.items.find(item => item.label === 'doStuff');
        expect(completion).toBeDefined();
        const resolvedCompletion = await server.completionResolve(completion!);
        expect(resolvedCompletion.additionalTextEdits).toBeDefined();
        expect(resolvedCompletion.command).toBeUndefined();
    });
});
