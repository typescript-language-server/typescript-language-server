/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as fs from 'fs';
import * as paths from 'path';

export function findPathToModule(dir: string, moduleName: string): string|undefined {
    const stat = fs.statSync(dir)
    if (stat.isDirectory()) {
        const candidate = paths.resolve(dir, 'node_modules', moduleName)
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    const parent = paths.resolve(dir, '..')
    if (parent !== dir) {
        return findPathToModule(paths.resolve(dir, '..'), moduleName)
    }
    return undefined
}