/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/*
 * Copyright (C) 2023 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as lsp from 'vscode-languageserver';

export function disposeAll(disposables: lsp.Disposable[]): void {
    while (disposables.length) {
        const item = disposables.pop();
        item?.dispose();
    }
}

export interface IDisposable {
    dispose(): void;
}

export abstract class Disposable {
    private _isDisposed = false;

    protected _disposables: lsp.Disposable[] = [];

    public dispose(): any {
        if (this._isDisposed) {
            return;
        }
        this._isDisposed = true;
        disposeAll(this._disposables);
    }

    protected _register<T extends lsp.Disposable>(value: T): T {
        if (this._isDisposed) {
            value.dispose();
        } else {
            this._disposables.push(value);
        }
        return value;
    }

    protected get isDisposed(): boolean {
        return this._isDisposed;
    }
}
