/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/*
 * Copyright (C) 2023 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { URI } from 'vscode-uri';
import * as arrays from '../utils/arrays.js';
import { TypeScriptPlugin } from '../ts-protocol.js';

export interface TypeScriptServerPlugin {
    readonly uri: URI;
    readonly name: string;
    readonly languages: ReadonlyArray<string>;
}

namespace TypeScriptServerPlugin {
    export function equals(a: TypeScriptServerPlugin, b: TypeScriptServerPlugin): boolean {
        return a.uri.toString() === b.uri.toString()
            && a.name === b.name
            && arrays.equals(a.languages, b.languages);
    }
}

export class PluginManager {
    private _plugins?: ReadonlyArray<TypeScriptServerPlugin>;

    public setPlugins(plugins: TypeScriptPlugin[]): void {
        this._plugins = this.readPlugins(plugins);
    }

    public get plugins(): ReadonlyArray<TypeScriptServerPlugin> {
        return Array.from(this._plugins || []);
    }

    private readPlugins(plugins: TypeScriptPlugin[]) {
        const newPlugins: TypeScriptServerPlugin[] = [];
        for (const plugin of plugins) {
            newPlugins.push({
                name: plugin.name,
                uri: URI.file(plugin.location),
                languages: Array.isArray(plugin.languages) ? plugin.languages : [],
            });
        }
        return newPlugins;
    }
}
