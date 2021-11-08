import tsp from 'typescript/lib/protocol';
import * as chai from 'chai';
import { provideOrganizeImports } from './organize-imports';
import { filePath, uri } from './test-utils';

describe('provideOrganizeImports', () => {
    it('converts tsserver response to lsp code actions', () => {
        const fileName = filePath('file');
        const response = {
            body: [
                {
                    fileName,
                    textChanges: []
                }
            ]
        };
        const actual = provideOrganizeImports(response as any as tsp.OrganizeImportsResponse, undefined);
        const expected = [{
            title: 'Organize imports',
            kind: 'source.organizeImports',
            edit: {
                documentChanges: [
                    {
                        edits: [],
                        textDocument: {
                            uri: uri('file'),
                            version: null
                        }
                    }
                ]
            }
        }];
        chai.assert.deepEqual(actual, expected);
    });

    it('handles a missing response', () => {
        chai.assert.equal(provideOrganizeImports(undefined, undefined).length, 0);
    });
});
