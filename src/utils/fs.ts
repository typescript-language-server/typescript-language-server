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

export function looksLikeAbsoluteWindowsPath(path: string): boolean {
    return /^[a-zA-Z]:[/\\]/.test(path);
}

import { getTempFile } from './temp.js';

export const onCaseInsensitiveFileSystem = (() => {
    let value: boolean | undefined;
    return (): boolean => {
        if (typeof value === 'undefined') {
            if (process.platform === 'win32') {
                value = true;
            } else if (process.platform !== 'darwin') {
                value = false;
            } else {
                const temp = getTempFile('typescript-case-check');
                fs.writeFileSync(temp, '');
                value = fs.existsSync(temp.toUpperCase());
            }
        }
        return value;
    };
})();
