import { TextDocument } from 'vscode-languageserver-textdocument';

/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

export class Deferred<T> {
    resolve: (value: T) => void;
    reject: (err?: unknown) => void;

    promise = new Promise<T>((resolve, reject) => {
        this.resolve = resolve;
        this.reject = reject;
    });
}

export function getTsserverExecutable(): string {
    return isWindows() ? 'tsserver.cmd' : 'tsserver';
}

function isWindows(): boolean {
    return /^win/.test(process.platform);
}

export function isTypeScriptDocument(textDocument: TextDocument): boolean {
    return ['typescript', 'typescriptreact'].includes(textDocument.languageId);
}
