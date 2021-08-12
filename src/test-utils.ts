/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as path from 'path';
import * as fs from 'fs';
import * as lsp from 'vscode-languageserver/node';
import { pathToUri } from './protocol-translation';
import { LspServer } from './lsp-server';
import { ConsoleLogger } from './logger';
import { TextDocument } from 'vscode-languageserver-textdocument';

export function getDefaultClientCapabilities(): lsp.ClientCapabilities {
    return {
        textDocument: {
            documentSymbol: {
                hierarchicalDocumentSymbolSupport: true
            },
            publishDiagnostics: {
                tagSupport: {
                    valueSet: [
                        lsp.DiagnosticTag.Unnecessary,
                        lsp.DiagnosticTag.Deprecated
                    ]
                }
            },
            moniker: {}
        }
    };
}

export function uri(suffix = ''): string {
    const resolved = this.filePath(suffix);
    return pathToUri(resolved, undefined);
}

export function filePath(suffix = ''): string {
    return path.resolve(__dirname, '../test-data', suffix);
}

export function readContents(path: string): string {
    return fs.readFileSync(path, 'utf-8').toString();
}

export function positionAt(document: lsp.TextDocumentItem, idx: number): lsp.Position {
    const doc = TextDocument.create(document.uri, document.languageId, document.version, document.text);
    const pos = doc.positionAt(idx);
    return {
        line: pos.line,
        character: pos.character
    };
}

export function position(document: lsp.TextDocumentItem, match: string): lsp.Position {
    return positionAt(document, document.text.indexOf(match));
}

export function positionAfter(document: lsp.TextDocumentItem, match: string): lsp.Position {
    return positionAt(document, document.text.indexOf(match) + match.length);
}

export function lastPosition(document: lsp.TextDocumentItem, match: string): lsp.Position {
    return positionAt(document, document.text.lastIndexOf(match));
}

export async function createServer(options: {
    rootUri: string | null;
    tsserverLogVerbosity?: string;
    publishDiagnostics: (args: lsp.PublishDiagnosticsParams) => void;
    clientCapabilitiesOverride?: lsp.ClientCapabilities;
}): Promise<LspServer> {
    const logger = new ConsoleLogger(false);
    const server = new LspServer({
        logger,
        tsserverPath: 'tsserver',
        tsserverLogVerbosity: options.tsserverLogVerbosity,
        tsserverLogFile: path.resolve(__dirname, '../tsserver.log'),
        lspClient: {
            publishDiagnostics: options.publishDiagnostics,
            showMessage(args: lsp.ShowMessageParams): void {
                throw args; // should not be called.
            },
            logMessage(args: lsp.LogMessageParams): void {
                logger.log('logMessage', JSON.stringify(args));
            },
            telemetry(args): void {
                logger.log('telemetry', JSON.stringify(args));
            },
            applyWorkspaceEdit: () => Promise.reject(new Error('unsupported')),
            rename: () => Promise.reject(new Error('unsupported'))
        }
    });

    await server.initialize({
        rootPath: undefined,
        rootUri: options.rootUri,
        processId: 42,
        capabilities: options.clientCapabilitiesOverride || getDefaultClientCapabilities(),
        workspaceFolders: null
    });
    return server;
}
