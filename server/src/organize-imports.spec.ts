import tsp from 'typescript/lib/protocol';
import * as chai from 'chai';
import { provideOrganizeImports } from './organize-imports';

describe('provideOrganizeImports', () => {
    it('converts tsserver response to lsp code actions', () => {
        const response = {
            body: [
                {
                    fileName: '/my/file',
                    textChanges: []
                }
            ]
        };
        const actual = provideOrganizeImports(response as any as tsp.OrganizeImportsResponse);
        const expected = [{
            title: 'Organize imports',
            kind: 'source.organizeImports',
            command: {
                title: '',
                command: '_typescript.organizeImports',
                arguments: ['/my/file']
            }
        }];
        chai.assert.deepEqual(actual, expected);
    });

    it('handles a missing response', () => {
        chai.assert.equal(provideOrganizeImports(undefined).length, 0);
    });
});
