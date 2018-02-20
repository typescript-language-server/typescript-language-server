/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as lsp from 'vscode-languageserver';

export function applyEdits(before: string, edits: lsp.TextEdit[]): string {
    const sorted = edits.sort((a, b) => {
        if (a.range.start.line === b.range.start.line) {
            return a.range.start.character - b.range.start.character
        }
        return a.range.start.line - b.range.start.line
    })
    const doc = lsp.TextDocument.create('', '', 0, before)
    let currentDoc = '';
    let offset = 0;
    for (const edit of sorted) {
        const startOffset = doc.offsetAt(edit.range.start)
        currentDoc += before.substr(offset, startOffset - offset) + edit.newText;
        offset = doc.offsetAt(edit.range.end)
    }
    return currentDoc + before.substr(offset);
}

export interface Line {
    text: string;
}

export class LspDocument {

    uri: string;
    text: string;
    version: number = 0;
    lastAccessed: number = new Date().getTime();

    constructor(doc: lsp.TextDocumentItem) {
        this.text = doc.text;
        this.uri = doc.uri
        if (lsp.VersionedTextDocumentIdentifier.is(doc)) {
            this.version = doc.version
        }
    }

    private get lines() {
        return this.text.split('\n');
    }

    lineAt(line: number): Line {
        return {
            text: this.lines[line]
        };
    }

    markAccessed(): void {
        this.lastAccessed = new Date().getTime();
    }

    getPosition(offset: number): lsp.Position {
        if (offset > this.text.length) {
            throw new Error('offset ' + offset + ' is out of bounds. Document length was ' + this.text.length)
        }
        const lines = this.lines;
        let currentOffSet = 0;
        for (let i = 0; i < lines.length; i++) {
            const l =  lines[i];
            if (currentOffSet + l.length + 1 > offset) {
                return {
                    line: i,
                    character: offset - currentOffSet
                }
            } else {
                currentOffSet += l.length + 1
            }
        }
        throw new Error('Programming Error.')
    }

    offsetAt(position: lsp.Position): number {
        const lines = this.text.split('\n');
        let currentOffSet = 0;
        for (let i = 0; i < lines.length; i++) {
            const l =  lines[i];
            if (position.line === i) {
                if (l.length < position.character) {
                    throw new Error(`Position ${JSON.stringify(position)} is out of range. Line [${i}] only has length ${l.length}.`);
                }
                return currentOffSet + position.character;
            } else {
                currentOffSet += l.length + 1
            }
        }
        throw new Error(`Position ${JSON.stringify(position)} is out of range. Document only has ${lines.length} lines.`);
    }

    apply(contentChanges: lsp.TextDocumentContentChangeEvent[], version: number) {
        this.applyEdits(contentChanges.map(e => {
                const range = e.range || lsp.Range.create(lsp.Position.create(0, 0), this.getPosition(e.rangeLength || 0));
                return lsp.TextEdit.replace(range, e.text);
            }));
        this.version = version;
    }

    applyEdits(edits: lsp.TextEdit[]) {
        this.text = applyEdits(this.text, edits);
        this.lastAccessed = new Date().getTime();
    }

    async save(): Promise<void> {
        // TODO sync with disc?
    }
}
