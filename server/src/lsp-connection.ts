/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as lsp from 'vscode-languageserver';
import * as lspcalls from './lsp-protocol.calls.proposed'

import { Logger, LspClientLogger } from './logger';
import { LspServer } from './lsp-server';
import { LspClient, LspClientImpl } from './lsp-client';

export interface IServerOptions {
    tsserverPath: string;
    tsserverFallbackPath?: string;
    tsserverLogFile?: string;
    tsserverLogVerbosity?: string;
    showMessageLevel: lsp.MessageType
}

export function createLspConnection(options: IServerOptions): lsp.IConnection {
    const connection = lsp.createConnection();
    const lspClient = new LspClientImpl(connection);
    const logger = new LspClientLogger(lspClient, options.showMessageLevel);
    const server: LspServer = new LspServer({
        logger,
        lspClient,
        tsserverFallbackPath: options.tsserverFallbackPath,
        tsserverPath: options.tsserverPath,
        tsserverLogFile: options.tsserverLogFile,
        tsserverLogVerbosity: options.tsserverLogVerbosity
    });

    connection.onInitialize(server.initialize.bind(server));

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
    connection.onDocumentHighlight(server.documentHighlight.bind(server));
    connection.onDocumentSymbol(server.documentSymbol.bind(server));
    connection.onExecuteCommand(server.executeCommand.bind(server));
    connection.onHover(server.hover.bind(server));
    connection.onReferences(server.references.bind(server));
    connection.onRenameRequest(server.rename.bind(server));
    connection.onSignatureHelp(server.signatureHelp.bind(server));
    connection.onWorkspaceSymbol(server.workspaceSymbol.bind(server));
    connection.onFoldingRanges(server.foldingRanges.bind(server));

    // proposed `textDocument/calls` request
    connection.onRequest(lspcalls.CallsRequest.type, server.calls.bind(server));

    return connection;
}
