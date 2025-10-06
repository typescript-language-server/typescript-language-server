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

type MemoizeKey = '$memoize$';

export function memoizeGetter<T = any>(_target: any, _key: string, descriptor: TypedPropertyDescriptor<T> & { [K in MemoizeKey]?: T; }): void {
    if (typeof descriptor.get !== 'function') {
        throw new Error('decorator only supports getter');
    }

    const origGetter = descriptor.get;
    const memoizeKey: MemoizeKey = '$memoize$';

    descriptor.get = function() {
        if (!Object.prototype.hasOwnProperty.call(this, memoizeKey)) {
            Object.defineProperty(this, memoizeKey, {
                configurable: false,
                enumerable: false,
                writable: false,
                value: origGetter.call(this),
            });
        }

        return this[memoizeKey]!;
    };
}
