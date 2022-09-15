/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/*
 * Copyright (C) 2022 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import fs from 'node:fs';
import path from 'node:path';

export interface ILogDirectoryProvider {
    getNewLogDirectory(): string | undefined;
}

export class LogDirectoryProvider implements ILogDirectoryProvider {
    public constructor(
        private readonly rootPath?: string,
    ) { }

    public getNewLogDirectory(): string | undefined {
        const root = this.logDirectory();
        if (root) {
            try {
                return fs.mkdtempSync(path.join(root, 'tsserver-log-'));
            } catch (e) {
                return undefined;
            }
        }
        return undefined;
    }

    private logDirectory(): string | undefined {
        if (!this.rootPath) {
            return undefined;
        }
        try {
            if (!fs.existsSync(this.rootPath)) {
                fs.mkdirSync(this.rootPath);
            }
            return this.rootPath;
        } catch {
            return undefined;
        }
    }
}

export const noopLogDirectoryProvider = new class implements ILogDirectoryProvider {
    public getNewLogDirectory(): undefined {
        return undefined;
    }
};
