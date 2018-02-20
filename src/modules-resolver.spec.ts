/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as chai from 'chai';
import * as path from 'path';
import { findPathToModule } from './modules-resolver';

describe('findPathToModule', () => {
    it('resolves the local tsserver', () => {
        const tsserverPath = findPathToModule(__dirname, 'typescript/bin/tsserver')
        chai.assert.equal(path.resolve(__dirname, '../node_modules/typescript/bin/tsserver'), tsserverPath)
    })
})