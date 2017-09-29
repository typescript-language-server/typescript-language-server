/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as path from 'path';
import * as fs from 'fs';
import * as lsp from 'vscode-languageserver';
import { pathToUri } from './protocol-translation';

export function uri(
    suffix: string): string {
    const resolved =  this.filePath(suffix);
    return pathToUri(resolved);
}

export function filePath(suffix: string): string {
    return path.resolve(__dirname, `../test-data/${suffix}`);
}

export function readContents(path: string): string {
    return fs.readFileSync(path, 'utf-8').toString();
}