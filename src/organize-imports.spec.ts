import { provideOrganizeImports } from './organize-imports.js';
import { filePath, uri } from './test-utils.js';
import type { ts } from './ts-protocol.js';
import { CodeActionKind } from './utils/types.js';

describe('provideOrganizeImports', () => {
    it('converts tsserver response to lsp code actions', () => {
        const fileName = filePath('file');
        const response = {
            body: [
                {
                    fileName,
                    textChanges: [],
                },
            ],
        };
        const actual = provideOrganizeImports(response as any as ts.server.protocol.OrganizeImportsResponse, undefined);
        const expected = [{
            title: 'Organize imports',
            kind: CodeActionKind.SourceOrganizeImportsTs.value,
            edit: {
                documentChanges: [
                    {
                        edits: [],
                        textDocument: {
                            uri: uri('file'),
                            version: null,
                        },
                    },
                ],
            },
        }];
        expect(actual).toEqual(expected);
    });

    it('handles a missing response', () => {
        expect(provideOrganizeImports(undefined, undefined)).toHaveLength(0);
    });
});
