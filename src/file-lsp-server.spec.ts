/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { LspServer } from './lsp-server.js';
import { uri, createServer, lastPosition, filePath, readContents, positionAfter } from './test-utils.js';

let server: LspServer;

beforeAll(async () => {
    server = await createServer({
        rootUri: uri(),
        publishDiagnostics: () => { },
    });
});

beforeEach(() => {
    server.closeAll();
});

afterAll(() => {
    server.closeAll();
    server.shutdown();
});

describe('documentHighlight', () => {
    it('simple test', async () => {
        const doc = {
            uri: uri('module2.ts'),
            languageId: 'typescript',
            version: 1,
            text: readContents(filePath('module2.ts')),
        };
        server.didOpenTextDocument({
            textDocument: doc,
        });

        const result = await server.documentHighlight({
            textDocument: doc,
            position: lastPosition(doc, 'doStuff'),
        });
        expect(result).toHaveLength(2);
    });
});

describe('completions', () => {
    it('receives completion that auto-imports from another module', async () => {
        const doc = {
            uri: uri('completion.ts'),
            languageId: 'typescript',
            version: 1,
            text: readContents(filePath('completion.ts')),
        };
        server.didOpenTextDocument({ textDocument: doc });
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
        server.didCloseTextDocument({ textDocument: doc });
    });
});
