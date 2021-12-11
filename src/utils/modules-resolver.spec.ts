import * as chai from 'chai';
import * as path from 'path';
import { findPathToModule } from './modules-resolver';
import { MODULE_FOLDERS } from './versionProvider';

describe('findPathToModule', () => {
    it('resolves tsserver in own directory', () => {
        const dir = path.join(__dirname, '../..');
        const tsserverPath = findPathToModule(dir, MODULE_FOLDERS);
        chai.assert.equal(tsserverPath, path.resolve(dir, 'node_modules/typescript/lib'));
    });
    it('resolves tsserver in parent directory', () => {
        const tsserverPath = findPathToModule(__dirname, MODULE_FOLDERS);
        chai.assert.equal(tsserverPath, path.resolve(__dirname, '../../node_modules/typescript/lib'));
    });
});
