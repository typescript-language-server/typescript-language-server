/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { TspClient } from './tsp-client.js';
import { ConsoleLogger } from './utils/logger.js';
import { filePath, readContents, TestLspClient, uri } from './test-utils.js';
import { CommandTypes } from './ts-protocol.js';
import { Trace } from './tsServer/tracer.js';
import { TypeScriptVersionProvider } from './tsServer/versionProvider.js';
import { SyntaxServerConfiguration, TsServerLogLevel, TypeScriptServiceConfiguration } from './utils/configuration.js';
import { noopLogDirectoryProvider } from './tsServer/logDirectoryProvider.js';

const logger = new ConsoleLogger();
const lspClientOptions = {
    rootUri: uri(),
    publishDiagnostics: () => { },
};
const lspClient = new TestLspClient(lspClientOptions, logger);
const configuration: TypeScriptServiceConfiguration = {
    logger,
    lspClient,
    tsserverLogVerbosity: TsServerLogLevel.Off,
};
const typescriptVersionProvider = new TypeScriptVersionProvider(configuration.tsserverPath, logger);
const bundled = typescriptVersionProvider.bundledVersion();
let server: TspClient;

beforeAll(() => {
    server = new TspClient({
        ...configuration,
        logDirectoryProvider: noopLogDirectoryProvider,
        logVerbosity: configuration.tsserverLogVerbosity,
        trace: Trace.Off,
        typescriptVersion: bundled!,
        useSyntaxServer: SyntaxServerConfiguration.Never,
    });
});

afterAll(() => {
    server.shutdown();
});

describe('ts server client', () => {
    beforeAll(() => {
        server.start();
    });

    it('completion', async () => {
        const f = filePath('module2.ts');
        server.notify(CommandTypes.Open, {
            file: f,
            fileContent: readContents(f),
        });
        const response = await server.request(CommandTypes.CompletionInfo, {
            file: f,
            line: 1,
            offset: 0,
            prefix: 'im',
        });
        if (response.type !== 'response') {
            throw Error('Not a response');
        }
        expect(response.body).not.toBeNull();
        expect(response.body!.entries[1].name).toBe('import');
    });

    it('references', async () => {
        const f = filePath('module2.ts');
        server.notify(CommandTypes.Open, {
            file: f,
            fileContent: readContents(f),
        });
        const response = await server.request(CommandTypes.References, {
            file: f,
            line: 8,
            offset: 16,
        });
        if (response.type !== 'response') {
            throw Error('Not a response');
        }
        expect(response.body).not.toBeNull();
        expect(response.body!.symbolName).toBe('doStuff');
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
        const response = await server.request(
            CommandTypes.ProvideInlayHints,
            {
                file: f,
                start: 0,
                length: 1000,
            },
        );
        if (response.type !== 'response') {
            throw Error('Not a response');
        }
        expect(response.body).not.toBeNull();
        expect(response.body![0].text).toBe(': boolean');
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
        if (response.type !== 'response') {
            throw Error('Not a response');
        }
        expect(response.body).not.toBeNull();
        expect(response.body!.some(({ file }) => file.endsWith('module2.ts'))).toBeTruthy();
        expect(response.body!.some(({ file: file_1 }) => file_1.endsWith('module1.ts'))).toBeFalsy();
    });
});
