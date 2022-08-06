/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Helpers for converting FROM LanguageServer types language-server ts types
 */
import type * as lsp from 'vscode-languageserver-protocol';
import type tsp from 'typescript/lib/protocol.d.js';

export namespace Position {
    export const fromLocation = (tslocation: tsp.Location): lsp.Position => {
        return {
            line: tslocation.line - 1,
            character: tslocation.offset - 1
        };
    };

    export const toLocation = (position: lsp.Position): tsp.Location => ({
        line: position.line + 1,
        offset: position.character + 1
    });

    export const toFileLocationRequestArgs = (file: string, position: lsp.Position): tsp.FileLocationRequestArgs => ({
        file,
        line: position.line + 1,
        offset: position.character + 1
    });
}
