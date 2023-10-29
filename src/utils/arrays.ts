/**
 * Copyright (C) 2023 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function equals<T>(
    a: ReadonlyArray<T>,
    b: ReadonlyArray<T>,
    itemEquals: (a: T, b: T) => boolean = (a, b) => a === b,
): boolean {
    if (a === b) {
        return true;
    }
    if (a.length !== b.length) {
        return false;
    }
    return a.every((x, i) => itemEquals(x, b[i]));
}

export function coalesce<T>(array: ReadonlyArray<T | undefined>): T[] {
    return <T[]>array.filter(e => !!e);
}
