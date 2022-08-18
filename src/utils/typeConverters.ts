/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Helpers for converting FROM LanguageServer types language-server ts types
 */
import * as lsp from 'vscode-languageserver-protocol';
import type tsp from 'typescript/lib/protocol.d.js';

export namespace Range {
    export const fromTextSpan = (span: tsp.TextSpan): lsp.Range => fromLocations(span.start, span.end);

    export const toTextSpan = (range: lsp.Range): tsp.TextSpan => ({
        start: Position.toLocation(range.start),
        end: Position.toLocation(range.end)
    });

    export const fromLocations = (start: tsp.Location, end: tsp.Location): lsp.Range =>
        lsp.Range.create(
            Math.max(0, start.line - 1), Math.max(start.offset - 1, 0),
            Math.max(0, end.line - 1), Math.max(0, end.offset - 1));

    export const toFileRangeRequestArgs = (file: string, range: lsp.Range): tsp.FileRangeRequestArgs => ({
        file,
        startLine: range.start.line + 1,
        startOffset: range.start.character + 1,
        endLine: range.end.line + 1,
        endOffset: range.end.character + 1
    });

    export const toFormattingRequestArgs = (file: string, range: lsp.Range): tsp.FormatRequestArgs => ({
        file,
        line: range.start.line + 1,
        offset: range.start.character + 1,
        endLine: range.end.line + 1,
        endOffset: range.end.character + 1
    });
}

export namespace Position {
    export const fromLocation = (tslocation: tsp.Location): lsp.Position => {
        // Clamping on the low side to 0 since Typescript returns 0, 0 when creating new file
        // even though position is supposed to be 1-based.
        return {
            line: Math.max(tslocation.line - 1, 0),
            character: Math.max(tslocation.offset - 1, 0)
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

export namespace Location {
    export const fromTextSpan = (resource: lsp.DocumentUri, tsTextSpan: tsp.TextSpan): lsp.Location =>
        lsp.Location.create(resource, Range.fromTextSpan(tsTextSpan));
}
