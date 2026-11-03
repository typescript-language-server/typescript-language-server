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

import * as array from './arrays.js';

export function equals(one: any, other: any): boolean {
    if (one === other) {
        return true;
    }
    if (one === null || one === undefined || other === null || other === undefined) {
        return false;
    }
    if (typeof one !== typeof other) {
        return false;
    }
    if (typeof one !== 'object') {
        return false;
    }
    if (Array.isArray(one) !== Array.isArray(other)) {
        return false;
    }

    if (Array.isArray(one)) {
        if (!Array.isArray(other)) {
            return false;
        }
        return array.equals(one, other, equals);
    } else {
        const oneKeys: string[] = [];
        for (const key in one) {
            oneKeys.push(key);
        }
        oneKeys.sort();
        const otherKeys: string[] = [];
        for (const key in other) {
            otherKeys.push(key);
        }
        otherKeys.sort();
        if (!array.equals(oneKeys, otherKeys)) {
            return false;
        }
        return oneKeys.every(key => equals((one as Record<string, any>)[key], (other as Record<string, any>)[key]));
    }
}

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (value === null || typeof value !== 'object') {
        return false;
    }
    const proto: unknown = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

function cloneValue(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(cloneValue);
    }
    if (isPlainObject(value)) {
        return mergeInto({}, value);
    }
    return value;
}

function mergeInto(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
    for (const key of Object.keys(source)) {
        // Skip keys that could modify the prototype chain of the result.
        if (UNSAFE_KEYS.has(key)) {
            continue;
        }
        const sourceValue = source[key];
        const targetValue = Object.prototype.hasOwnProperty.call(target, key) ? target[key] : undefined;
        let value: unknown;
        if (Array.isArray(targetValue) && Array.isArray(sourceValue)) {
            value = [...(targetValue as unknown[]), ...(sourceValue as unknown[])].map(cloneValue);
        } else if (isPlainObject(targetValue) && isPlainObject(sourceValue)) {
            value = mergeInto(mergeInto({}, targetValue), sourceValue);
        } else {
            value = cloneValue(sourceValue);
        }
        Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
    }
    return target;
}

/**
 * Deep merges `source` into a copy of `target` without modifying either input.
 * Plain objects are merged recursively and arrays are concatenated.
 * The `__proto__`, `constructor` and `prototype` keys are ignored.
 */
export function deepMerge<T1, T2>(target: Partial<T1>, source: Partial<T2>): T1 & T2 {
    const result = mergeInto({}, target);
    return mergeInto(result, source) as T1 & T2;
}
