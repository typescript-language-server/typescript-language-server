/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import lsp from 'vscode-languageserver/node.js';
import { LspClientLogger } from './utils/logger.js';
import { LspServer } from './lsp-server.js';
import { LspClientImpl } from './lsp-client.js';
import type { TsServerLogLevel } from './utils/configuration.js';

export interface LspConnectionOptions {
    cmdLineTsserverPath: string;
    cmdLineTsserverLogVerbosity: TsServerLogLevel;
    showMessageLevel: lsp.MessageType;
}

export function createLspConnection(options: LspConnectionOptions): lsp.Connection {
    const connection = lsp.createConnection(lsp.ProposedFeatures.all);
    const lspClient = new LspClientImpl(connection);
    const logger = new LspClientLogger(lspClient, options.showMessageLevel);
    const server: LspServer = new LspServer({
        logger,
        lspClient,
        tsserverPath: options.cmdLineTsserverPath,
        tsserverLogVerbosity: options.cmdLineTsserverLogVerbosity,
    });

    connection.onInitialize(server.initialize.bind(server));
    connection.onInitialized(server.initialized.bind(server));
    connection.onDidChangeConfiguration(server.didChangeConfiguration.bind(server));

    connection.onDidOpenTextDocument(server.didOpenTextDocument.bind(server));
    connection.onDidSaveTextDocument(server.didSaveTextDocument.bind(server));
    connection.onDidCloseTextDocument(server.didCloseTextDocument.bind(server));
    connection.onDidChangeTextDocument(server.didChangeTextDocument.bind(server));

    connection.onCodeAction(server.codeAction.bind(server));
    connection.onCompletion(server.completion.bind(server));
    connection.onCompletionResolve(server.completionResolve.bind(server));
    connection.onDefinition(server.definition.bind(server));
    connection.onImplementation(server.implementation.bind(server));
    connection.onTypeDefinition(server.typeDefinition.bind(server));
    connection.onDocumentFormatting(server.documentFormatting.bind(server));
    connection.onDocumentRangeFormatting(server.documentRangeFormatting.bind(server));
    connection.onDocumentHighlight(server.documentHighlight.bind(server));
    connection.onDocumentSymbol(server.documentSymbol.bind(server));
    connection.onExecuteCommand(server.executeCommand.bind(server));
    connection.onHover(server.hover.bind(server));
    connection.onReferences(server.references.bind(server));
    connection.onRenameRequest(server.rename.bind(server));
    connection.onPrepareRename(server.prepareRename.bind(server));
    connection.onSelectionRanges(server.selectionRanges.bind(server));
    connection.onSignatureHelp(server.signatureHelp.bind(server));
    connection.onWorkspaceSymbol(server.workspaceSymbol.bind(server));
    connection.onFoldingRanges(server.foldingRanges.bind(server));
    connection.languages.callHierarchy.onPrepare(server.prepareCallHierarchy.bind(server));
    connection.languages.callHierarchy.onIncomingCalls(server.callHierarchyIncomingCalls.bind(server));
    connection.languages.callHierarchy.onOutgoingCalls(server.callHierarchyOutgoingCalls.bind(server));
    connection.languages.inlayHint.on(server.inlayHints.bind(server));
    connection.languages.semanticTokens.on(server.semanticTokensFull.bind(server));
    connection.languages.semanticTokens.onRange(server.semanticTokensRange.bind(server));
    connection.workspace.onWillRenameFiles(server.willRenameFiles.bind(server));

    return connection;
}
