/*
 * Copyright (C) 2026 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { describe, it, expect } from 'vitest';
import { deepMerge } from './objects.js';

type Nested = { a?: number; b?: { c?: number; d?: number; e?: number; }; f?: number; };
type WithArray = { a: number[]; };
type WithObject = { a: { b?: number; d?: number; }; c: number[]; };
type Polluted = { polluted?: boolean; nested?: Polluted; safe?: number; };

describe('deepMerge', () => {
    it('merges nested objects', () => {
        const result = deepMerge<Nested, Nested>({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 4, e: 5 }, f: 6 });
        expect(result).toEqual({ a: 1, b: { c: 2, d: 4, e: 5 }, f: 6 });
    });

    it('concatenates arrays', () => {
        const result = deepMerge<WithArray, WithArray>({ a: [1, 2] }, { a: [3] });
        expect(result).toEqual({ a: [1, 2, 3] });
    });

    it('does not modify the inputs', () => {
        const target: WithObject = { a: { b: 1 }, c: [1] };
        const source: WithObject = { a: { d: 2 }, c: [2] };
        const result = deepMerge<WithObject, WithObject>(target, source);
        expect(target).toEqual({ a: { b: 1 }, c: [1] });
        expect(source).toEqual({ a: { d: 2 }, c: [2] });
        expect(result.a).not.toBe(target.a);
        expect(result.a).not.toBe(source.a);
        result.a.b = 10;
        expect(target.a.b).toBe(1);
    });

    it('ignores __proto__, constructor and prototype keys', () => {
        const source = JSON.parse(
            '{"__proto__": {"polluted": true}, "constructor": {"prototype": {"polluted": true}}, "nested": {"__proto__": {"polluted": true}}, "safe": 1}',
        ) as Polluted;
        const result = deepMerge<Polluted, Polluted>({}, source);
        expect(result).toEqual({ nested: {}, safe: 1 });
        expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
        expect(Object.getPrototypeOf(result.nested)).toBe(Object.prototype);
        expect(result.polluted).toBeUndefined();
        expect(result.nested?.polluted).toBeUndefined();
        expect(({} as Polluted).polluted).toBeUndefined();
    });
});
