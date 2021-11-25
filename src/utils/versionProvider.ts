/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import fs from 'fs';
import path from 'path';
import which from 'which';
import pkgUp from 'pkg-up';
import API from './api';
import { IServerOptions } from './configuration';
import { findPathToModule } from './modules-resolver';

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
        private readonly _pathLabel?: string
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
        if (!fs.existsSync(serverPath)) {
            return null;
        }

        const p = serverPath.split(path.sep);
        if (p.length <= 2) {
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
            return null;
        }

        const contents = fs.readFileSync(fileName).toString();
        let desc: any = null;
        try {
            desc = JSON.parse(contents);
        } catch (err) {
            return null;
        }
        if (!desc || !desc.version) {
            return null;
        }
        return desc.version ? API.fromVersionString(desc.version) : null;
    }
}

export const MODULE_FOLDERS = ['node_modules/typescript/lib', '.vscode/pnpify/typescript/lib', '.yarn/sdks/typescript/lib'];

export class TypeScriptVersionProvider {
    public constructor(private configuration?: IServerOptions) {}

    public getUserSettingVersion(): TypeScriptVersion | null {
        const { tsserverPath } = this.configuration || {};
        if (!tsserverPath) {
            return null;
        }
        let resolvedPath = tsserverPath;
        // Resolve full path to the binary if path is not absolute.
        if (!path.isAbsolute(resolvedPath)) {
            const binaryPath = which.sync(tsserverPath, { nothrow:true });
            if (binaryPath) {
                resolvedPath = binaryPath;
            }
        }
        // Resolve symbolic link.
        let stat = fs.lstatSync(resolvedPath, { throwIfNoEntry: false });
        if (stat?.isSymbolicLink()) {
            resolvedPath = fs.realpathSync(resolvedPath);
        }
        // Get directory path
        stat = fs.lstatSync(resolvedPath, { throwIfNoEntry: false });
        if (stat?.isFile()) {
            resolvedPath = path.dirname(resolvedPath);
        }
        // Resolve path to the "lib" dir.
        try {
            const packageJsonPath = pkgUp.sync({ cwd: resolvedPath });
            if (packageJsonPath) {
                resolvedPath = path.join(path.dirname(packageJsonPath), 'lib');
            }
        } catch {
            // ignore
        }
        return new TypeScriptVersion(
            TypeScriptVersionSource.UserSetting,
            resolvedPath
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
