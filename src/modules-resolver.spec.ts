import * as chai from 'chai';
import * as path from 'path';
import { findPathToModule } from './modules-resolver';

describe('findPathToModule', () => {
    it('resolves the local tsserver', () => {
        const tsserverPath = findPathToModule(__dirname, 'typescript/bin/tsserver')
        chai.assert.equal(path.resolve(__dirname, '../node_modules/typescript/bin/tsserver'), tsserverPath)
    })
})