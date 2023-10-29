/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { URI } from 'vscode-uri';
import * as lsp from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as languageModeIds from './configuration/languageIds.js';
import { CommandTypes, type ts } from './ts-protocol.js';
import { ClientCapability, type ITypeScriptServiceClient } from './typescriptService.js';
import API from './utils/api.js';
import { coalesce } from './utils/arrays.js';
import { Delayer } from './utils/async.js';
import { ResourceMap } from './utils/resourceMap.js';

function mode2ScriptKind(mode: string): ts.server.protocol.ScriptKindName | undefined {
    switch (mode) {
        case languageModeIds.typescript: return 'TS';
        case languageModeIds.typescriptreact: return 'TSX';
        case languageModeIds.javascript: return 'JS';
        case languageModeIds.javascriptreact: return 'JSX';
    }
    return undefined;
}

class PendingDiagnostics extends ResourceMap<number> {
    public getOrderedFileSet(): ResourceMap<void> {
        const orderedResources = Array.from(this.entries())
            .sort((a, b) => a.value - b.value)
            .map(entry => entry.resource);

        const map = new ResourceMap<void>(this._normalizePath, this.config);
        for (const resource of orderedResources) {
            map.set(resource, undefined);
        }
        return map;
    }
}

class GetErrRequest {
    public static executeGetErrRequest(
        client: ITypeScriptServiceClient,
        files: ResourceMap<void>,
        onDone: () => void,
    ) {
        return new GetErrRequest(client, files, onDone);
    }

    private _done: boolean = false;
    private readonly _token: lsp.CancellationTokenSource = new lsp.CancellationTokenSource();

    private constructor(
        private readonly client: ITypeScriptServiceClient,
        public readonly files: ResourceMap<void>,
        onDone: () => void,
    ) {
        if (!this.isErrorReportingEnabled()) {
            this._done = true;
            setImmediate(onDone);
            return;
        }

        const supportsSyntaxGetErr = this.client.apiVersion.gte(API.v440);
        const allFiles = coalesce(Array.from(files.entries())
            .filter(entry => supportsSyntaxGetErr || client.hasCapabilityForResource(entry.resource, ClientCapability.Semantic))
            .map(entry => client.toTsFilePath(entry.resource.toString())));

        if (!allFiles.length) {
            this._done = true;
            setImmediate(onDone);
        } else {
            const request = this.areProjectDiagnosticsEnabled()
                // Note that geterrForProject is almost certainly not the api we want here as it ends up computing far
                // too many diagnostics
                ? client.executeAsync(CommandTypes.GeterrForProject, { delay: 0, file: allFiles[0] }, this._token.token)
                : client.executeAsync(CommandTypes.Geterr, { delay: 0, files: allFiles }, this._token.token);

            request.finally(() => {
                if (this._done) {
                    return;
                }
                this._done = true;
                onDone();
            });
        }
    }

    private isErrorReportingEnabled() {
        if (this.client.apiVersion.gte(API.v440)) {
            return true;
        } else {
            // Older TS versions only support `getErr` on semantic server
            return this.client.capabilities.has(ClientCapability.Semantic);
        }
    }

    private areProjectDiagnosticsEnabled() {
        // return this.client.configuration.enableProjectDiagnostics && this.client.capabilities.has(ClientCapability.Semantic);
        return false;
    }

    public cancel(): any {
        if (!this._done) {
            this._token.cancel();
        }

        this._token.dispose();
    }
}

export class LspDocument {
    private _document: TextDocument;
    private _uri: URI;
    private _filepath: string;

    constructor(doc: lsp.TextDocumentItem, filepath: string) {
        const { uri, languageId, version, text } = doc;
        this._document = TextDocument.create(uri, languageId, version, text);
        this._uri = URI.parse(uri);
        this._filepath = filepath;
    }

    get uri(): URI {
        return this._uri;
    }

    get filepath(): string {
        return this._filepath;
    }

    get languageId(): string {
        return this._document.languageId;
    }

    get version(): number {
        return this._document.version;
    }

    getText(range?: lsp.Range): string {
        return this._document.getText(range);
    }

    positionAt(offset: number): lsp.Position {
        return this._document.positionAt(offset);
    }

    offsetAt(position: lsp.Position): number {
        return this._document.offsetAt(position);
    }

    get lineCount(): number {
        return this._document.lineCount;
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
        const nextLine = line + 1;
        const nextLineOffset = this.getLineOffset(nextLine);
        // If next line doesn't exist then the offset is at the line end already.
        return this.positionAt(nextLine < this._document.lineCount ? nextLineOffset - 1 : nextLineOffset);
    }

    getLineOffset(line: number): number {
        const lineStart = this.getLineStart(line);
        return this.offsetAt(lineStart);
    }

    getLineStart(line: number): lsp.Position {
        return lsp.Position.create(line, 0);
    }

    getFullRange(): lsp.Range {
        return lsp.Range.create(
            lsp.Position.create(0, 0),
            this.getLineEnd(Math.max(this.lineCount - 1, 0)),
        );
    }

    applyEdit(version: number, change: lsp.TextDocumentContentChangeEvent): void {
        const content = this.getText();
        let newContent = change.text;
        if (lsp.TextDocumentContentChangeEvent.isIncremental(change)) {
            const start = this.offsetAt(change.range.start);
            const end = this.offsetAt(change.range.end);
            newContent = content.substr(0, start) + change.text + content.substr(end);
        }
        this._document = TextDocument.create(this._uri.toString(), this.languageId, version, newContent);
    }
}

export class LspDocuments {
    private readonly client: ITypeScriptServiceClient;

    private _validateJavaScript = true;
    private _validateTypeScript = true;

    private readonly modeIds: Set<string>;
    private readonly _files: string[] = [];
    private readonly documents = new Map<string, LspDocument>();
    private readonly pendingDiagnostics: PendingDiagnostics;
    private readonly diagnosticDelayer: Delayer<any>;
    private pendingGetErr: GetErrRequest | undefined;

    constructor(
        client: ITypeScriptServiceClient,
        onCaseInsensitiveFileSystem: boolean,
    ) {
        this.client = client;
        this.modeIds = new Set<string>(languageModeIds.jsTsLanguageModes);

        const pathNormalizer = (path: URI) => this.client.toTsFilePath(path.toString());
        this.pendingDiagnostics = new PendingDiagnostics(pathNormalizer, { onCaseInsensitiveFileSystem });
        this.diagnosticDelayer = new Delayer<any>(300);
    }

    /**
     * Sorted by last access.
     */
    public get files(): string[] {
        return this._files;
    }

    public get(file: string): LspDocument | undefined {
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

    public openTextDocument(textDocument: lsp.TextDocumentItem): boolean {
        if (!this.modeIds.has(textDocument.languageId)) {
            return false;
        }
        const resource = textDocument.uri;
        const filepath = this.client.toTsFilePath(resource);
        if (!filepath) {
            return false;
        }

        if (this.documents.has(filepath)) {
            return true;
        }

        const document = new LspDocument(textDocument, filepath);
        this.documents.set(filepath, document);
        this._files.unshift(filepath);
        this.client.executeWithoutWaitingForResponse(CommandTypes.Open, {
            file: filepath,
            fileContent: textDocument.text,
            scriptKindName: mode2ScriptKind(textDocument.languageId),
            projectRootPath: this.getProjectRootPath(document.uri),
        });
        this.requestDiagnostic(document);
        return true;
    }

    public onDidCloseTextDocument(textDocument: lsp.TextDocumentIdentifier): void {
        const document = this.client.toOpenDocument(textDocument.uri);
        if (!document) {
            return;
        }

        this._files.splice(this._files.indexOf(document.filepath), 1);
        this.pendingDiagnostics.delete(document.uri);
        this.pendingGetErr?.files.delete(document.uri);
        this.documents.delete(document.filepath);
        this.client.cancelInflightRequestsForResource(document.uri);
        this.client.executeWithoutWaitingForResponse(CommandTypes.Close, { file: document.filepath });
        this.requestAllDiagnostics();
    }

    public closeAllForTesting(): void {
        for (const document of this.documents.values()) {
            this.onDidCloseTextDocument({ uri: document.uri.toString() });
        }
    }

    public requestDiagnosticsForTesting(): void {
        this.triggerDiagnostics(0);
    }

    public onDidChangeTextDocument(params: lsp.DidChangeTextDocumentParams): void {
        const { textDocument } = params;
        if (textDocument.version === null) {
            throw new Error(`Received document change event for ${textDocument.uri} without valid version identifier`);
        }

        const filepath = this.client.toTsFilePath(textDocument.uri);
        if (!filepath) {
            return;
        }
        const document = this.documents.get(filepath);
        if (!document) {
            return;
        }

        this.client.cancelInflightRequestsForResource(document.uri);

        for (const change of params.contentChanges) {
            let line = 0;
            let offset = 0;
            let endLine = 0;
            let endOffset = 0;
            if (lsp.TextDocumentContentChangeEvent.isIncremental(change)) {
                line = change.range.start.line + 1;
                offset = change.range.start.character + 1;
                endLine = change.range.end.line + 1;
                endOffset = change.range.end.character + 1;
            } else {
                line = 1;
                offset = 1;
                const endPos = document.positionAt(document.getText().length);
                endLine = endPos.line + 1;
                endOffset = endPos.character + 1;
            }
            this.client.executeWithoutWaitingForResponse(CommandTypes.Change, {
                file: filepath,
                line,
                offset,
                endLine,
                endOffset,
                insertString: change.text,
            });
            document.applyEdit(textDocument.version, change);
        }

        const didTrigger = this.requestDiagnostic(document);

        if (!didTrigger && this.pendingGetErr) {
            // In this case we always want to re-trigger all diagnostics
            this.pendingGetErr.cancel();
            this.pendingGetErr = undefined;
            this.triggerDiagnostics();
        }
    }

    public interruptGetErr<R>(f: () => R): R {
        if (
            !this.pendingGetErr
            /*|| this.client.configuration.enableProjectDiagnostics*/  // `geterr` happens on separate server so no need to cancel it.
        ) {
            return f();
        }

        this.pendingGetErr.cancel();
        this.pendingGetErr = undefined;
        const result = f();
        this.triggerDiagnostics();
        return result;
    }

    // --- BufferSyncSupport ---

    private getProjectRootPath(resource: URI): string | undefined {
        const workspaceRoot = this.client.getWorkspaceRootForResource(resource);
        if (workspaceRoot) {
            return this.client.toTsFilePath(workspaceRoot.toString());
        }

        return undefined;
    }

    public handles(resource: URI): boolean {
        const filepath = this.client.toTsFilePath(resource.toString());
        return filepath !== undefined && this.documents.has(filepath);
    }

    public requestAllDiagnostics(): void {
        for (const buffer of this.documents.values()) {
            if (this.shouldValidate(buffer)) {
                this.pendingDiagnostics.set(buffer.uri, Date.now());
            }
        }
        this.triggerDiagnostics();
    }

    public hasPendingDiagnostics(resource: URI): boolean {
        return this.pendingDiagnostics.has(resource);
    }

    public getErr(resources: readonly URI[]): void {
        const handledResources = resources.filter(resource => this.handles(resource));
        if (!handledResources.length) {
            return;
        }

        for (const resource of handledResources) {
            this.pendingDiagnostics.set(resource, Date.now());
        }

        this.triggerDiagnostics();
    }

    private triggerDiagnostics(delay: number = 200): void {
        this.diagnosticDelayer.trigger(() => {
            this.sendPendingDiagnostics();
        }, delay);
    }

    private requestDiagnostic(buffer: LspDocument): boolean {
        if (!this.shouldValidate(buffer)) {
            return false;
        }

        this.pendingDiagnostics.set(buffer.uri, Date.now());

        const delay = Math.min(Math.max(Math.ceil(buffer.lineCount / 20), 300), 800);
        this.triggerDiagnostics(delay);
        return true;
    }

    private sendPendingDiagnostics(): void {
        const orderedFileSet = this.pendingDiagnostics.getOrderedFileSet();

        if (this.pendingGetErr) {
            this.pendingGetErr.cancel();

            for (const { resource } of this.pendingGetErr.files.entries()) {
                const filename = this.client.toTsFilePath(resource.toString());
                if (filename && this.documents.get(filename)) {
                    orderedFileSet.set(resource, undefined);
                }
            }

            this.pendingGetErr = undefined;
        }

        // Add all open TS buffers to the geterr request. They might be visible
        for (const buffer of this.documents.values()) {
            orderedFileSet.set(buffer.uri, undefined);
        }

        if (orderedFileSet.size) {
            const getErr = this.pendingGetErr = GetErrRequest.executeGetErrRequest(this.client, orderedFileSet, () => {
                if (this.pendingGetErr === getErr) {
                    this.pendingGetErr = undefined;
                }
            });
        }

        this.pendingDiagnostics.clear();
    }

    private shouldValidate(buffer: LspDocument): boolean {
        switch (buffer.languageId) {
            case 'javascript':
            case 'javascriptreact':
                return this._validateJavaScript;

            case 'typescript':
            case 'typescriptreact':
            default:
                return this._validateTypeScript;
        }
    }
}
