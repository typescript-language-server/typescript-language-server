/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as chai from 'chai';
import { TspClient } from './tsp-client.js';
import { ConsoleLogger } from './logger.js';
import { filePath, readContents } from './test-utils.js';
import { CommandTypes } from './tsp-command-types.js';
import API from './utils/api.js';
import { TypeScriptVersionProvider } from './utils/versionProvider.js';

const assert = chai.assert;
const typescriptVersionProvider = new TypeScriptVersionProvider();
const bundled = typescriptVersionProvider.bundledVersion();
let server: TspClient;

before(() => {
    server = new TspClient({
        apiVersion: API.defaultVersion,
        logger: new ConsoleLogger(),
        tsserverPath: bundled!.tsServerPath,
    });
});

after(() => {
    server.shutdown();
});

describe('ts server client', () => {
    before(() => {
        server.start();
    });

    it('completion', async () => {
        const f = filePath('module2.ts');
        server.notify(CommandTypes.Open, {
            file: f,
            fileContent: readContents(f),
        });
        const completions = await server.request(CommandTypes.CompletionInfo, {
            file: f,
            line: 1,
            offset: 0,
            prefix: 'im',
        });
        assert.isDefined(completions.body);
        assert.equal(completions.body!.entries[1].name, 'ImageBitmap');
    });

    it('references', async () => {
        const f = filePath('module2.ts');
        server.notify(CommandTypes.Open, {
            file: f,
            fileContent: readContents(f),
        });
        const references = await server.request(CommandTypes.References, {
            file: f,
            line: 8,
            offset: 16,
        });
        assert.isDefined(references.body);
        assert.equal(references.body!.symbolName, 'doStuff');
    });

    it('inlayHints', async () => {
        const f = filePath('module2.ts');
        server.notify(CommandTypes.Open, {
            file: f,
            fileContent: readContents(f),
        });
        await server.request(CommandTypes.Configure, {
            preferences: {
                includeInlayFunctionLikeReturnTypeHints: true,
            },
        });
        const inlayHints = await server.request(
            CommandTypes.ProvideInlayHints,
            {
                file: f,
                start: 0,
                length: 1000,
            },
        );
        assert.isDefined(inlayHints.body);
        assert.equal(inlayHints.body![0].text, ': boolean');
    });

    it('documentHighlight', async () => {
        const f = filePath('module2.ts');
        server.notify(CommandTypes.Open, {
            file: f,
            fileContent: readContents(f),
        });
        const response = await server.request(CommandTypes.DocumentHighlights, {
            file: f,
            line: 8,
            offset: 16,
            filesToSearch: [f],
        });
        assert.isDefined(response.body);
        assert.isTrue(response.body!.some(({ file }) => file.endsWith('module2.ts')), JSON.stringify(response.body, undefined, 2));
        assert.isFalse(response.body!.some(({ file: file_1 }) => file_1.endsWith('module1.ts')), JSON.stringify(response.body, undefined, 2));
    });
});
