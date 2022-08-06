/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { platform } from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as lsp from 'vscode-languageserver';
import { normalizePath, pathToUri } from './protocol-translation.js';
import { LspServer } from './lsp-server.js';
import { ConsoleLogger } from './logger.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TypeScriptVersionProvider } from './utils/versionProvider.js';

const CONSOLE_LOG_LEVEL = ConsoleLogger.toMessageTypeLevel(process.env.CONSOLE_LOG_LEVEL);
export const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));

export function getDefaultClientCapabilities(): lsp.ClientCapabilities {
    return {
        textDocument: {
            completion: {
                completionItem: {
                    labelDetailsSupport: true
                }
            },
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

export function uri(...components: string[]): string {
    const resolved = filePath(...components);
    return pathToUri(resolved, undefined);
}

export function filePath(...components: string[]): string {
    return normalizePath(path.resolve(PACKAGE_ROOT, 'test-data', ...components));
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

export function toPlatformEOL(text: string): string {
    if (platform() === 'win32') {
        return text.replace(/(?!\r)\n/g, '\r\n');
    }
    return text;
}

export class TestLspServer extends LspServer {
    workspaceEdits: lsp.ApplyWorkspaceEditParams[] = [];
}

export async function createServer(options: {
    rootUri: string | null;
    tsserverLogVerbosity?: string;
    publishDiagnostics: (args: lsp.PublishDiagnosticsParams) => void;
    clientCapabilitiesOverride?: lsp.ClientCapabilities;
}): Promise<TestLspServer> {
    const typescriptVersionProvider = new TypeScriptVersionProvider();
    const bundled = typescriptVersionProvider.bundledVersion();
    const logger = new ConsoleLogger(CONSOLE_LOG_LEVEL);
    const server = new TestLspServer({
        logger,
        tsserverPath: bundled!.tsServerPath,
        tsserverLogVerbosity: options.tsserverLogVerbosity,
        tsserverLogFile: path.resolve(PACKAGE_ROOT, 'tsserver.log'),
        lspClient: {
            setClientCapabilites() {},
            createProgressReporter() {
                return {
                    begin() {},
                    report() {},
                    end() {}
                };
            },
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
            async applyWorkspaceEdit(args: lsp.ApplyWorkspaceEditParams): Promise<lsp.ApplyWorkspaceEditResult> {
                server.workspaceEdits.push(args);
                return { applied: true };
            },
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
