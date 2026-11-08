/*
 * Copyright (C) 2026 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { describe, it, expect } from 'vitest';
import { LspDocument } from './document.js';

function createDocument(text: string): LspDocument {
    return new LspDocument({ uri: 'file:///test.ts', languageId: 'typescript', version: 1, text }, '/test.ts');
}

describe('LspDocument.applyEdit', () => {
    it('applies sequential incremental changes', () => {
        const document = createDocument('const a = 1;\nconst b = 2;\n');
        document.applyEdit(2, {
            range: { start: { line: 0, character: 6 }, end: { line: 0, character: 7 } },
            text: 'alpha',
        });
        document.applyEdit(2, {
            range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } },
            text: '\n',
        });
        document.applyEdit(2, {
            range: { start: { line: 2, character: 6 }, end: { line: 2, character: 7 } },
            text: 'beta',
        });
        expect(document.getText()).toBe('const alpha = 1;\n\nconst beta = 2;\n');
        expect(document.version).toBe(2);
        expect(document.lineCount).toBe(4);
        expect(document.getLine(2)).toBe('const beta = 2;');
        expect(document.offsetAt({ line: 2, character: 6 })).toBe(24);
        expect(document.positionAt(24)).toEqual({ line: 2, character: 6 });
    });

    it('applies multi-line deletions', () => {
        const document = createDocument('a\nb\nc\nd\n');
        document.applyEdit(2, {
            range: { start: { line: 0, character: 1 }, end: { line: 2, character: 1 } },
            text: '',
        });
        expect(document.getText()).toBe('a\nd\n');
        expect(document.lineCount).toBe(3);
        expect(document.getLine(1)).toBe('d');
    });

    it('applies full content changes', () => {
        const document = createDocument('const a = 1;\n');
        document.applyEdit(3, { text: 'let x;\nlet y;' });
        expect(document.getText()).toBe('let x;\nlet y;');
        expect(document.version).toBe(3);
        expect(document.lineCount).toBe(2);
        expect(document.getFullRange()).toEqual({ start: { line: 0, character: 0 }, end: { line: 1, character: 6 } });
    });
});
