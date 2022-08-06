import * as chai from 'chai';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPathToModule } from './modules-resolver.js';
import { MODULE_FOLDERS } from './versionProvider.js';
import { PACKAGE_ROOT } from '../test-utils.js';

export const CURDIR = dirname(fileURLToPath(import.meta.url));

describe('findPathToModule', () => {
    it('resolves tsserver in own directory', () => {
        const tsserverPath = findPathToModule(PACKAGE_ROOT, MODULE_FOLDERS);
        chai.assert.equal(tsserverPath, resolve(PACKAGE_ROOT, 'node_modules', 'typescript', 'lib'));
    });
    it('resolves tsserver in parent directory', () => {
        const tsserverPath = findPathToModule(CURDIR, MODULE_FOLDERS);
        chai.assert.equal(tsserverPath, resolve(CURDIR, '..', '..', 'node_modules', 'typescript', 'lib'));
    });
});
