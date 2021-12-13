/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as lsp from 'vscode-languageserver/node';

export class CodeActionKind {
    private static readonly sep = '.';

    public static readonly Empty = new CodeActionKind(lsp.CodeActionKind.Empty);
    public static readonly QuickFix = new CodeActionKind(lsp.CodeActionKind.QuickFix);
    public static readonly Refactor = new CodeActionKind(lsp.CodeActionKind.Refactor);
    public static readonly Source = new CodeActionKind(lsp.CodeActionKind.Source);
    public static readonly SourceAddMissingImportsTs = CodeActionKind.Source.append('SourceAddMissingImportsTs').append('ts');
    public static readonly SourceRemoveUnusedTs = CodeActionKind.Source.append('removeUnused').append('ts');
    public static readonly SourceOrganizeImports = new CodeActionKind(lsp.CodeActionKind.SourceOrganizeImports);
    public static readonly SourceOrganizeImportsTs = CodeActionKind.SourceOrganizeImports.append('ts');
    public static readonly SourceFixAll = new CodeActionKind(lsp.CodeActionKind.SourceFixAll);
    public static readonly SourceFixAllTs = CodeActionKind.SourceFixAll.append('ts');

    constructor(
        public readonly value: string
    ) { }

    public equals(other: CodeActionKind): boolean {
        return this.value === other.value;
    }

    public contains(other: CodeActionKind): boolean {
        return this.equals(other) || this.value === '' || other.value.startsWith(this.value + CodeActionKind.sep);
    }

    public intersects(other: CodeActionKind): boolean {
        return this.contains(other) || other.contains(this);
    }

    public append(part: string): CodeActionKind {
        return new CodeActionKind(this.value + CodeActionKind.sep + part);
    }
}
