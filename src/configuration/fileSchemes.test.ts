import { URI } from 'vscode-uri';
import { describe, it, expect } from 'vitest';
import { isWindows } from '../test-utils.js';
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
