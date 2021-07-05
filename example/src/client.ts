/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { listen, MessageConnection } from 'vscode-ws-jsonrpc';
import {
    MonacoLanguageClient, CloseAction, ErrorAction,
    MonacoServices, createConnection,
} from 'monaco-languageclient';
import normalizeUrl = require('normalize-url');
const ReconnectingWebSocket = require('reconnecting-websocket');

// register Monaco languages
monaco.languages.register({
    id: 'typescript',
    aliases: [
        'TypeScript',
        'typescript',
        'ts'
    ],
    extensions: [
        '.ts'
    ],
    mimetypes: [
        'text/typescript'
    ]
});

// create Monaco editor
const value = `export class Bar {
}
`;
const rootUri = (window as any).rootUri;
const editor = monaco.editor.create(document.getElementById("container")!, {
    model: monaco.editor.createModel(value, "typescript", monaco.Uri.parse(rootUri + '/bar.ts')),
    glyphMargin: true,
    lightbulb: {
        enabled: true
    }
});

// install Monaco language client services
MonacoServices.install(editor, { rootUri });

// create the web socket
const url = createUrl('/sampleServer')
const webSocket = createWebSocket(url);
// listen when the web socket is opened
listen({
    webSocket,
    onConnection: connection => {
        // create and start the language client
        const languageClient = createLanguageClient(connection);
        languageClient.onReady().then(() => {
            console.log('registering notification listeners')

            languageClient.onNotification('window/logMessage', (notification) => {
                console.log('window/logMessage', notification)
            });

            languageClient.onNotification('window/showMessage', (notification) => {
                alert(notification);
            });
        });
        const disposable = languageClient.start();
        connection.onClose(() => disposable.dispose());
    }
});

function createLanguageClient(connection: MessageConnection): MonacoLanguageClient {
    return new MonacoLanguageClient({
        name: "TypeScript Language Client",
        clientOptions: {
            // use a language id as a document selector
            documentSelector: ['typescript'],
            // disable the default error handler
            errorHandler: {
                error: () => ErrorAction.Continue,
                closed: () => CloseAction.DoNotRestart
            }
        },
        // create a language client connection from the JSON RPC connection on demand
        connectionProvider: {
            get: (errorHandler, closeHandler) => {
                return Promise.resolve(createConnection(connection, errorHandler, closeHandler))
            }
        }
    });
}

function createUrl(path: string): string {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    return normalizeUrl(`${protocol}://${location.host}${location.pathname}${path}`);
}

function createWebSocket(url: string): WebSocket {
    const socketOptions = {
        maxReconnectionDelay: 10000,
        minReconnectionDelay: 1000,
        reconnectionDelayGrowFactor: 1.3,
        connectionTimeout: 10000,
        maxRetries: Infinity,
        debug: false
    };
    return new ReconnectingWebSocket(url, undefined, socketOptions);
}