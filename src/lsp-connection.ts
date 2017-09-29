/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as lsp from 'vscode-languageserver';

import { Logger, LspClientLogger } from './logger';
import { LspServer } from './lsp-server';
import { LspClient, LspClientImpl } from './lsp-client';

export interface IServerOptions {
    tsserverPath: string;
    tsserverLogFile?: string;
    showMessageLevel?: lsp.MessageType
}

export function createLspConnection(options: IServerOptions): lsp.IConnection {
    const connection = lsp.createConnection();
    const lspClient = new LspClientImpl(connection);
    const logger = new LspClientLogger(lspClient, options.showMessageLevel || lsp.MessageType.Warning);
    const server: LspServer = new LspServer({
        logger,
        lspClient,
        tsserverPath: options.tsserverPath,
        tsserverLogFile: options.tsserverLogFile
    });

    connection.onInitialize(server.initialize.bind(server));
    connection.onDidOpenTextDocument(server.didOpenTextDocument.bind(server));
    connection.onDidSaveTextDocument(server.didSaveTextDocument.bind(server));
    connection.onDidCloseTextDocument(server.didCloseTextDocument.bind(server));
    connection.onDidChangeTextDocument(server.didChangeTextDocument.bind(server));
    connection.onDefinition(server.definition.bind(server));
    connection.onDocumentSymbol(server.documentSymbol.bind(server));
    connection.onCompletion(server.completion.bind(server));
    connection.onCompletionResolve(server.completionResolve.bind(server));
    connection.onHover(server.hover.bind(server));
    connection.onReferences(server.references.bind(server));
    connection.onRenameRequest(server.rename.bind(server));
    connection.onWorkspaceSymbol(server.workspaceSymbol.bind(server));

    return connection;
}
