/*
 * Copyright (C) 2026 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { describe, it, expect } from 'vitest';
import { TsServerLogLevel } from './configuration.js';

describe('TsServerLogLevel', () => {
    it.each(['off', 'normal', 'terse', 'requestTime', 'verbose'])('round-trips "%s"', value => {
        expect(TsServerLogLevel.toString(TsServerLogLevel.fromString(value))).toBe(value);
    });
});
