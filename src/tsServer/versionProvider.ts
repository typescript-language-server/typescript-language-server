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
import { createRequire } from 'node:module';
import path from 'node:path';
import which from 'which';
import { pkgUpSync } from 'pkg-up';
import API from '../utils/api.js';
import { findPathToModule } from '../utils/modules-resolver.js';
import type { Logger } from '../utils/logger.js';

export const enum TypeScriptVersionSource {
    Bundled = 'bundled',
    UserSetting = 'user-setting',
    Workspace = 'workspace',
}

export class TypeScriptVersion {
    private _api: API | null | undefined;
    constructor(
        public readonly source: TypeScriptVersionSource,
        public readonly path: string,
        private readonly logger: Logger,
    ) {
        this._api = null;
    }

    public get tsServerPath(): string {
        return this.path;
    }

    public get isValid(): boolean {
        return this.version !== null;
    }

    public get version(): API | null {
        if (this._api) {
            return this._api;
        }
        this._api = this.getTypeScriptVersion(this.tsServerPath);
        return this._api;
    }

    public get versionString(): string | null {
        const version = this.version;
        return version ? version.displayName : null;
    }

    private getTypeScriptVersion(serverPath: string): API | null {
        this.logger.log(`Resolving TypeScript version from path "${serverPath}"...`);
        if (!fs.existsSync(serverPath)) {
            this.logger.log('Server path does not exist on disk');
            return null;
        }

        const p = serverPath.split(path.sep);
        if (p.length <= 2) {
            this.logger.log('Server path is invalid (has less than two path components).');
            return null;
        }
        const p2 = p.slice(0, -2);
        const modulePath = p2.join(path.sep);
        let fileName = path.join(modulePath, 'package.json');
        if (!fs.existsSync(fileName)) {
            // Special case for ts dev versions
            if (path.basename(modulePath) === 'built') {
                fileName = path.join(modulePath, '..', 'package.json');
            }
        }
        if (!fs.existsSync(fileName)) {
            this.logger.log(`Failed to find package.json at path "${fileName}"`);
            return null;
        }

        this.logger.log(`Reading version from package.json at "${fileName}"`);
        const contents = fs.readFileSync(fileName).toString();
        let desc: any = null;
        try {
            desc = JSON.parse(contents);
        } catch (err) {
            this.logger.log('Failed parsing contents of package.json.');
            return null;
        }
        if (!desc?.version) {
            this.logger.log('Failed reading version number from package.json.');
            return null;
        }
        this.logger.log(`Resolved TypeScript version to "${desc.version}"`);
        return API.fromVersionString(desc.version);
    }
}

export const MODULE_FOLDERS = ['node_modules/typescript/lib', '.vscode/pnpify/typescript/lib', '.yarn/sdks/typescript/lib'];

export class TypeScriptVersionProvider {
    public constructor(private userTsserverPath: string | undefined, private logger: Logger) {}

    public getUserSettingVersion(): TypeScriptVersion | null {
        if (!this.userTsserverPath) {
            return null;
        }
        this.logger.log(`Resolving user-provided tsserver path "${this.userTsserverPath}"...`);
        let resolvedPath = this.userTsserverPath;
        // Resolve full path to the binary if path is not absolute.
        if (!path.isAbsolute(resolvedPath)) {
            const binaryPath = which.sync(resolvedPath, { nothrow:true });
            if (binaryPath) {
                resolvedPath = binaryPath;
            }
            this.logger.log(`Non-absolute tsserver path resolved to "${binaryPath ? resolvedPath : '<failed>'}"`);
        }
        // Resolve symbolic link.
        let stat = fs.lstatSync(resolvedPath, { throwIfNoEntry: false });
        if (stat?.isSymbolicLink()) {
            resolvedPath = fs.realpathSync(resolvedPath);
            this.logger.log(`Symbolic link tsserver path resolved to "${resolvedPath}"`);
        }
        // Get directory path
        stat = fs.lstatSync(resolvedPath, { throwIfNoEntry: false });
        if (stat?.isFile()) {
            if (path.basename(resolvedPath) === 'tsserver.js') {
                this.logger.log(`Resolved tsserver location: ${resolvedPath}`);
                return new TypeScriptVersion(TypeScriptVersionSource.UserSetting, resolvedPath, this.logger);
            }
            resolvedPath = path.dirname(resolvedPath);
            this.logger.log(`Resolved directory path from a file path: ${resolvedPath}`);
        }
        // Resolve path to the "lib" dir.
        try {
            const packageJsonPath = pkgUpSync({ cwd: resolvedPath });
            this.logger.log(`Resolved package.json location: "${packageJsonPath}"`);
            if (packageJsonPath) {
                resolvedPath = path.join(path.dirname(packageJsonPath), 'lib', 'tsserver.js');
                this.logger.log(`Resolved tsserver location: "${resolvedPath}"`);
            }
        } catch {
            // ignore
        }
        return new TypeScriptVersion(TypeScriptVersionSource.UserSetting, resolvedPath, this.logger);
    }

    public getWorkspaceVersion(workspaceFolders: string[]): TypeScriptVersion | null {
        for (const p of workspaceFolders) {
            const libFolder = findPathToModule(p, MODULE_FOLDERS);
            if (libFolder) {
                const tsServerPath = path.join(libFolder, 'tsserver.js');
                const version = new TypeScriptVersion(TypeScriptVersionSource.Workspace, tsServerPath, this.logger);
                if (version.isValid) {
                    return version;
                }
            }
        }
        return null;
    }

    public bundledVersion(): TypeScriptVersion | null {
        const require = createRequire(import.meta.url);
        try {
            const file = require.resolve('typescript');
            const tsServerPath = path.join(path.dirname(file), 'tsserver.js');
            const bundledVersion = new TypeScriptVersion(TypeScriptVersionSource.Bundled, tsServerPath, this.logger);
            return bundledVersion;
        } catch (e) {
            // window.showMessage('Bundled typescript module not found', 'error');
            return null;
        }
    }
}
