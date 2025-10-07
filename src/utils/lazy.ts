// sync: file[extensions/typescript-language-features/src/utils/lazy.ts] sha[c738ec6c40099671c763e1ee7023e321589cf815]
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/*
 * Copyright (C) 2025 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

export class Lazy<T> {
    private _didRun: boolean = false;
    private _value?: T;
    private _error: Error | undefined;

    constructor(
        private readonly executor: () => T,
    ) { }

    /**
     * True if the lazy value has been resolved.
     */
    get hasValue(): boolean {
        return this._didRun;
    }

    /**
     * Get the wrapped value.
     *
     * This will force evaluation of the lazy value if it has not been resolved yet. Lazy values are only
     * resolved once. `getValue` will re-throw exceptions that are hit while resolving the value
     */
    get value(): T {
        if (!this._didRun) {
            try {
                this._value = this.executor();
            } catch (err) {
                this._error = err as Error;
            } finally {
                this._didRun = true;
            }
        }
        if (this._error) {
            throw this._error;
        }
        return this._value!;
    }

    /**
     * Get the wrapped value without forcing evaluation.
     */
    get rawValue(): T | undefined {
        return this._value;
    }
}
