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

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function makeRandomHexString(length: number): string {
    const chars = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'];
    let result = '';
    for (let i = 0; i < length; i++) {
        const idx = Math.floor(chars.length * Math.random());
        result += chars[idx];
    }
    return result;
}

const getRootTempDir = (() => {
    let dir: string | undefined;
    return () => {
        if (!dir) {
            const filename = `typescript-language-server${process.platform !== 'win32' && process.getuid ? process.getuid() : ''}`;
            dir = path.join(os.tmpdir(), filename);
        }
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
        return dir;
    };
})();

export const getInstanceTempDir = (() => {
    let dir: string | undefined;
    return () => {
        dir ??= path.join(getRootTempDir(), makeRandomHexString(20));
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
        return dir;
    };
})();

export function getTempFile(prefix: string): string {
    return path.join(getInstanceTempDir(), `${prefix}-${makeRandomHexString(20)}.tmp`);
}
