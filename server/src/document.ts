/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as lsp from 'vscode-languageserver';

export class LspDocument implements lsp.TextDocument {

    protected document: lsp.TextDocument;

    constructor(doc: lsp.TextDocumentItem) {
        const { uri, languageId, version, text } = doc;
        this.document = lsp.TextDocument.create(uri, languageId, version, text);
    }

    get uri(): string {
        return this.document.uri;
    }

    get languageId(): string {
        return this.document.languageId;
    }

    get version(): number {
        return this.document.version;
    }

    getText(range?: lsp.Range): string {
        return this.document.getText(range);
    }

    positionAt(offset: number): lsp.Position {
        return this.document.positionAt(offset);
    }

    offsetAt(position: lsp.Position): number {
        return this.document.offsetAt(position);
    }

    get lineCount(): number {
        return this.document.lineCount;
    }

    getLine(line: number): string {
        const lineRange = this.getLineRange(line);
        return this.getText(lineRange);
    }

    getLineRange(line: number): lsp.Range {
        const lineStart = this.getLineStart(line);
        const lineEnd = this.getLineEnd(line);
        return lsp.Range.create(lineStart, lineEnd);
    }

    getLineEnd(line: number): lsp.Position {
        const nextLineOffset = this.getLineOffset(line + 1);
        return this.positionAt(nextLineOffset - 1);
    }

    getLineOffset(line: number): number {
        const lineStart = this.getLineStart(line);
        return this.offsetAt(lineStart);
    }

    getLineStart(line: number): lsp.Position {
        return lsp.Position.create(line, 0);
    }
    // lsp.TextDocumentContentChangeEvent
    applyEdit(version: number, change: any): void {
        const content = this.getText();
        let newContent = change.text;
        if (change.range) {
            const start = this.offsetAt(change.range.start);
            const end = this.offsetAt(change.range.end);
            newContent = content.substr(0, start) + change.text + content.substr(end);
        }
        this.document = lsp.TextDocument.create(this.uri, this.languageId, version, newContent);
    }

}

export class LspDocuments {

    private readonly _files: string[] = [];
    private readonly documents = new Map<string, LspDocument>();

    /**
     * Sorted by last access.
     */
    get files(): string[] {
        return this._files;
    }

    get(file: string): LspDocument | undefined {
        const document = this.documents.get(file);
        if (!document) {
            return undefined;
        }
        if (this.files[0] !== file) {
            this._files.splice(this._files.indexOf(file), 1);
            this._files.unshift(file);
        }
        return document;
    }

    open(file: string, doc: lsp.TextDocumentItem): boolean {
        if (this.documents.has(file)) {
            return false;
        }
        this.documents.set(file, new LspDocument(doc));
        this._files.unshift(file);
        return true;
    }

    close(file: string): LspDocument | undefined {
        const document = this.documents.get(file);
        if (!document) {
            return undefined;
        }
        this.documents.delete(file);
        this._files.splice(this._files.indexOf(file), 1);
        return document;
    }

}