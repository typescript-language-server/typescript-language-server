/*
 * Copyright (C) 2026 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TypeScriptVersionProvider } from './versionProvider.js';
import { ConsoleLogger } from '../utils/logger.js';

const logger = new ConsoleLogger();
const createdFolders: string[] = [];

function createWorkspace(typescriptVersion: string, files: string[]): string {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tsls-version-provider-'));
    createdFolders.push(workspace);
    const packageFolder = path.join(workspace, 'node_modules', 'typescript');
    fs.mkdirSync(path.join(packageFolder, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(packageFolder, 'package.json'), JSON.stringify({ name: 'typescript', version: typescriptVersion }));
    for (const file of files) {
        fs.writeFileSync(path.join(packageFolder, 'lib', file), '');
    }
    return workspace;
}

afterEach(() => {
    for (const workspace of createdFolders.splice(0)) {
        fs.rmSync(workspace, { force: true, recursive: true });
    }
});

describe('getWorkspaceVersion', () => {
    it('resolves the TypeScript of the workspace', () => {
        const workspace = createWorkspace('5.9.2', ['tsserver.js']);
        const result = new TypeScriptVersionProvider(undefined, logger).getWorkspaceVersion([workspace]);
        expect(result.version?.versionString).toBe('5.9.2');
        expect(result.unusable).toEqual([]);
    });

    it('reports a TypeScript that has no tsserver.js', () => {
        const workspace = createWorkspace('7.0.1-rc', ['tsc.js', 'typescript.js', 'getExePath.js']);
        const result = new TypeScriptVersionProvider(undefined, logger).getWorkspaceVersion([workspace]);
        expect(result.version).toBeNull();
        expect(result.unusable).toEqual([
            {
                libFolder: path.join(workspace, 'node_modules', 'typescript', 'lib'),
                versionString: '7.0.1-rc',
            },
        ]);
    });

    it('reports nothing if the workspace has no TypeScript', () => {
        const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tsls-version-provider-'));
        createdFolders.push(workspace);
        const result = new TypeScriptVersionProvider(undefined, logger).getWorkspaceVersion([workspace]);
        expect(result.version).toBeNull();
        expect(result.unusable).toEqual([]);
    });
});
