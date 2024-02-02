import { URI } from 'vscode-uri';
import * as lsp from 'vscode-languageserver';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { uri, createServer, position, TestLspServer, openDocumentAndWaitForDiagnostics, readContents, filePath, isWindows } from '../test-utils.js';
import { ZipfileURI } from '../utils/uri.js';

const ZIPFILE_URI = 'zipfile:///dir/foo.zip::path/file.ts';

describe('uri handling', () => {
    it('parses zipfile:// uri', () => {
        const parsed = URI.parse(ZIPFILE_URI);
        expect(parsed.scheme).toBe('zipfile');
        expect(parsed.authority).toBe('');
        expect(parsed.path).toBe('/dir/foo.zip::path/file.ts');
        expect(parsed.fsPath).toBe(isWindows ? '\\dir\\foo.zip::path\\file.ts' : '/dir/foo.zip::path/file.ts');
        expect(parsed.query).toBe('');
        expect(parsed.fragment).toBe('');
    });

    it('stringifies zipfile uri without encoding', () => {
        const parsed = URI.parse(ZIPFILE_URI);
        expect(parsed.toString(true)).toBe('zipfile:/dir/foo.zip::path/file.ts');
    });

    it('stringifies zipfile uri with encoding', () => {
        const parsed = URI.parse(ZIPFILE_URI);
        expect(parsed.toString()).toBe('zipfile:/dir/foo.zip%3A%3Apath/file.ts');
    });
});

describe('zipfileuri handling', () => {
    it('parses zipfile:// uri', () => {
        const parsed = ZipfileURI.parse(ZIPFILE_URI);
        expect(parsed.scheme).toBe('zipfile');
        expect(parsed.authority).toBe('');
        expect(parsed.path).toBe('/dir/foo.zip::path/file.ts');
        expect(parsed.fsPath).toBe(isWindows ? '\\dir\\foo.zip::path\\file.ts' : '/dir/foo.zip::path/file.ts');
        expect(parsed.query).toBe('');
        expect(parsed.fragment).toBe('');
    });

    it('stringifies zipfile uri with and without encoding', () => {
        const parsed = ZipfileURI.parse(ZIPFILE_URI);
        expect(parsed.toString(true)).toBe('zipfile:///dir/foo.zip::path/file.ts');
        expect(parsed.toString()).toBe('zipfile:///dir/foo.zip::path/file.ts');
    });
});

describe('neovim zipfile scheme handling with yarn pnp', () => {
    let server: TestLspServer;

    beforeAll(async () => {
        server = await createServer({
            rootUri: uri('yarn-pnp'),
            initializationOptionsOverrides: {
                hostInfo: 'neovim',
            },
            publishDiagnostics() {},
        });
    });

    beforeEach(() => {
        server.closeAllForTesting();
    });

    afterAll(() => {
        server.closeAllForTesting();
        server.shutdown();
    });

    it('returns zipfile: uri for definition inside node_modules', async () => {
        const doc = {
            uri: uri('yarn-pnp', 'testfile.ts'),
            languageId: 'typescript',
            version: 1,
            text: readContents(filePath('yarn-pnp', 'testfile.ts')),
        };
        await openDocumentAndWaitForDiagnostics(server, doc);
        const pos = position(doc, 'AxiosHeaderValue');
        const results = await server.definition({ textDocument: doc, position: pos });
        const defintion = Array.isArray(results) ? results[0] as lsp.Location : null;
        expect(defintion).toBeDefined();
        expect(defintion!.uri).toMatch(/zipfile:\/\/.+.zip::node_modules\/axios\/.+/);
    });
});
