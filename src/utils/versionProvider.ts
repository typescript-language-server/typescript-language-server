/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import which from 'which';
import { pkgUpSync } from 'pkg-up';
import API from './api.js';
import { IServerOptions } from './configuration.js';
import { findPathToModule } from './modules-resolver.js';
import type { Logger } from '../logger.js';

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
        private readonly _pathLabel?: string,
        private readonly logger?: Logger,
    ) {
        this._api = null;
    }

    public get tscPath(): string {
        return path.resolve(this.path, '../bin/tsc');
    }

    public get tsServerPath(): string {
        return path.resolve(this.path, 'tsserver.js');
    }

    public get pathLabel(): string {
        return typeof this._pathLabel === 'undefined' ? this.path : this._pathLabel;
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
        this.logger?.info(`Resolving TypeScript version from path "${serverPath}"...`);
        if (!fs.existsSync(serverPath)) {
            this.logger?.info('Server path does not exist on disk');
            return null;
        }

        const p = serverPath.split(path.sep);
        if (p.length <= 2) {
            this.logger?.info('Server path is invalid (has less than two path components).');
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
            this.logger?.info(`Failed to find package.json at path "${fileName}"`);
            return null;
        }

        this.logger?.info(`Reading version from package.json at "${fileName}"`);
        const contents = fs.readFileSync(fileName).toString();
        let desc: any = null;
        try {
            desc = JSON.parse(contents);
        } catch (err) {
            this.logger?.info('Failed parsing contents of package.json.');
            return null;
        }
        if (!desc || !desc.version) {
            this.logger?.info('Failed reading version number from package.json.');
            return null;
        }
        this.logger?.info(`Resolved TypeScript version to "${desc.version}"`);
        return API.fromVersionString(desc.version);
    }
}

export const MODULE_FOLDERS = ['node_modules/typescript/lib', '.vscode/pnpify/typescript/lib', '.yarn/sdks/typescript/lib'];

export class TypeScriptVersionProvider {
    public constructor(private configuration?: IServerOptions, private logger?: Logger) {}

    public getUserSettingVersion(): TypeScriptVersion | null {
        const { tsserverPath } = this.configuration || {};
        if (!tsserverPath) {
            return null;
        }
        this.logger?.info(`Resolving user-provided tsserver path "${tsserverPath}"...`);
        let resolvedPath = tsserverPath;
        // Resolve full path to the binary if path is not absolute.
        if (!path.isAbsolute(resolvedPath)) {
            const binaryPath = which.sync(tsserverPath, { nothrow:true });
            if (binaryPath) {
                resolvedPath = binaryPath;
            }
            this.logger?.info(`Non-absolute tsserver path resolved to "${binaryPath ? resolvedPath : '<failed>'}"`);
        }
        // Resolve symbolic link.
        let stat = fs.lstatSync(resolvedPath, { throwIfNoEntry: false });
        if (stat?.isSymbolicLink()) {
            resolvedPath = fs.realpathSync(resolvedPath);
            this.logger?.info(`Symbolic link tsserver path resolved to "${resolvedPath}"`);
        }
        // Get directory path
        stat = fs.lstatSync(resolvedPath, { throwIfNoEntry: false });
        if (stat?.isFile()) {
            resolvedPath = path.dirname(resolvedPath);
            this.logger?.info(`Resolved directory path from a file path: ${resolvedPath}`);
        }
        // Resolve path to the "lib" dir.
        try {
            const packageJsonPath = pkgUpSync({ cwd: resolvedPath });
            this.logger?.info(`Resolved package.json location: "${packageJsonPath}"`);
            if (packageJsonPath) {
                resolvedPath = path.join(path.dirname(packageJsonPath), 'lib');
                this.logger?.info(`Assumed tsserver lib location: "${resolvedPath}"`);
            }
        } catch {
            // ignore
        }
        return new TypeScriptVersion(
            TypeScriptVersionSource.UserSetting,
            resolvedPath,
            undefined,
            this.logger,
        );
    }

    public getWorkspaceVersion(workspaceFolders: string[]): TypeScriptVersion | null {
        for (const p of workspaceFolders) {
            const libFolder = findPathToModule(p, MODULE_FOLDERS);
            if (libFolder) {
                const version = new TypeScriptVersion(TypeScriptVersionSource.Workspace, libFolder);
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
            const bundledVersion = new TypeScriptVersion(
                TypeScriptVersionSource.Bundled,
                path.dirname(file),
                '');
            return bundledVersion;
        } catch (e) {
            // window.showMessage('Bundled typescript module not found', 'error');
            return null;
        }
    }
}
