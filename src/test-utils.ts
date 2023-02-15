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
import deepmerge from 'deepmerge';
import * as lsp from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { WorkspaceConfiguration } from './configuration-manager.js';
import { normalizePath, pathToUri } from './protocol-translation.js';
import { TypeScriptInitializationOptions } from './ts-protocol.js';
import { LspClient, WithProgressOptions } from './lsp-client.js';
import { LspServer } from './lsp-server.js';
import { ConsoleLogger, LogLevel } from './utils/logger.js';
import { TypeScriptVersionProvider } from './tsServer/versionProvider.js';
import { TsServerLogLevel, TypeScriptServiceConfiguration } from './utils/configuration.js';

const CONSOLE_LOG_LEVEL = LogLevel.fromString(process.env.CONSOLE_LOG_LEVEL);
export const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));

const DEFAULT_TEST_CLIENT_CAPABILITIES: lsp.ClientCapabilities = {
    textDocument: {
        completion: {
            completionItem: {
                insertReplaceSupport: true,
                snippetSupport: true,
                labelDetailsSupport: true,
            },
        },
        documentSymbol: {
            hierarchicalDocumentSymbolSupport: true,
        },
        publishDiagnostics: {
            tagSupport: {
                valueSet: [
                    lsp.DiagnosticTag.Unnecessary,
                    lsp.DiagnosticTag.Deprecated,
                ],
            },
        },
        moniker: {},
    },
};

const DEFAULT_TEST_CLIENT_INITIALIZATION_OPTIONS: TypeScriptInitializationOptions = {
    plugins: [],
    preferences: {
        allowIncompleteCompletions: true,
        allowRenameOfImportPath: true,
        allowTextChangesInNewFiles: true,
        displayPartsForJSDoc: true,
        generateReturnInDocTemplate: true,
        includeAutomaticOptionalChainCompletions: true,
        includeCompletionsForImportStatements: true,
        includeCompletionsForModuleExports: true,
        includeCompletionsWithClassMemberSnippets: true,
        includeCompletionsWithInsertText: true,
        includeCompletionsWithSnippetText: true,
        jsxAttributeCompletionStyle: 'auto',
        providePrefixAndSuffixTextForRename: true,
    },
    tsserver: {
        // With default `auto`, due to dynamic routing, some requests would be routed to syntax server while the project
        // is loading and return incomplete results so force just a single server for tests.
        useSyntaxServer: 'never',
    },
};

const DEFAULT_WORKSPACE_SETTINGS: WorkspaceConfiguration = {};

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

export function documentFromFile({ path, languageId = 'typescript' }: { path: string; languageId?: string; }): lsp.TextDocumentItem {
    const pathComponents = path.split('/');
    return {
        languageId,
        text: readContents(filePath(...pathComponents)),
        uri: uri(...pathComponents),
        version: 1,
    };
}

export function positionAt(document: lsp.TextDocumentItem, idx: number): lsp.Position {
    const doc = TextDocument.create(document.uri, document.languageId, document.version, document.text);
    const pos = doc.positionAt(idx);
    return {
        line: pos.line,
        character: pos.character,
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

export class TestLspClient implements LspClient {
    private workspaceEditsListener: ((args: lsp.ApplyWorkspaceEditParams) => void) | null = null;

    constructor(
        protected options: TestLspServerOptions,
        protected logger: ConsoleLogger,
    ) {}

    async createProgressReporter(_token?: lsp.CancellationToken, _workDoneProgress?: lsp.WorkDoneProgressReporter): Promise<lsp.WorkDoneProgressReporter> {
        const reporter = new class implements lsp.WorkDoneProgressReporter {
            begin(_title: string, _percentage?: number, _message?: string, _cancellable?: boolean): void {}
            report(_message: any): void {}
            done(): void {}
        };
        return reporter;
    }

    async withProgress<R = void>(_options: WithProgressOptions, task: (progress: lsp.WorkDoneProgressReporter) => Promise<R>): Promise<R> {
        const progress = await this.createProgressReporter();
        return await task(progress);
    }

    publishDiagnostics(args: lsp.PublishDiagnosticsParams): void {
        return this.options.publishDiagnostics(args);
    }

    showErrorMessage(message: string): void {
        this.logger.error(`[showErrorMessage] ${message}`);
    }

    logMessage(args: lsp.LogMessageParams): void {
        this.logger.log('logMessage', JSON.stringify(args));
    }

    addApplyWorkspaceEditListener(listener: (args: lsp.ApplyWorkspaceEditParams) => void): void {
        this.workspaceEditsListener = listener;
    }

    async applyWorkspaceEdit(args: lsp.ApplyWorkspaceEditParams): Promise<lsp.ApplyWorkspaceEditResult> {
        if (this.workspaceEditsListener) {
            this.workspaceEditsListener(args);
        }
        return { applied: true };
    }

    rename(): Promise<void> {
        throw new Error('unsupported');
    }

    sendNotification<P>(_type: lsp.NotificationType<P>, _params: P): Promise<void> {
        throw new Error('unsupported');
    }
}

export class TestLspServer extends LspServer {
    workspaceEdits: lsp.ApplyWorkspaceEditParams[] = [];

    updateWorkspaceSettings(settings: WorkspaceConfiguration): void {
        const configuration: lsp.DidChangeConfigurationParams = {
            settings: deepmerge(DEFAULT_WORKSPACE_SETTINGS, settings),
        };
        this.didChangeConfiguration(configuration);
    }
}

interface TestLspServerOptions {
    rootUri: string | null;
    tsserverLogVerbosity?: string;
    publishDiagnostics: (args: lsp.PublishDiagnosticsParams) => void;
    clientCapabilitiesOverride?: lsp.ClientCapabilities;
}

export async function createServer(options: TestLspServerOptions): Promise<TestLspServer> {
    const logger = new ConsoleLogger(CONSOLE_LOG_LEVEL);
    const lspClient = new TestLspClient(options, logger);
    const serverOptions: TypeScriptServiceConfiguration = {
        logger,
        lspClient,
        tsserverLogVerbosity: TsServerLogLevel.Off,
    };
    const typescriptVersionProvider = new TypeScriptVersionProvider(serverOptions.tsserverPath, logger);
    const bundled = typescriptVersionProvider.bundledVersion();
    const server = new TestLspServer({
        ...serverOptions,
        tsserverPath: bundled!.tsServerPath,
    });

    lspClient.addApplyWorkspaceEditListener(args => {
        server.workspaceEdits.push(args);
    });

    await server.initialize({
        rootPath: undefined,
        rootUri: options.rootUri,
        processId: 42,
        capabilities: deepmerge(DEFAULT_TEST_CLIENT_CAPABILITIES, options.clientCapabilitiesOverride || {}),
        initializationOptions: DEFAULT_TEST_CLIENT_INITIALIZATION_OPTIONS,
        workspaceFolders: null,
    });
    server.updateWorkspaceSettings({});
    return server;
}
