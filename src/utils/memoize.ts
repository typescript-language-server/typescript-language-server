// sync: file[extensions/typescript-language-features/src/utils/memoize.ts] sha[f76ac124233270762d11ec3afaaaafcba53b3bbf]
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/*
 * Copyright (C) 2024 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

export function memoize(_target: any, key: string, descriptor: any): void {
    let fnKey: string | undefined;
    let fn: (...args: any[]) => void | undefined;

    if (typeof descriptor.value === 'function') {
        fnKey = 'value';
        fn = descriptor.value;
    } else if (typeof descriptor.get === 'function') {
        fnKey = 'get';
        fn = descriptor.get;
    } else {
        throw new Error('not supported');
    }

    const memoizeKey = `$memoize$${key}`;

    descriptor[fnKey] = function(...args: any[]) {
        // eslint-disable-next-line no-prototype-builtins
        if (!this.hasOwnProperty(memoizeKey)) {
            Object.defineProperty(this, memoizeKey, {
                configurable: false,
                enumerable: false,
                writable: false,
                value: fn!.apply(this, args),
            });
        }

        return this[memoizeKey];
    };
}
