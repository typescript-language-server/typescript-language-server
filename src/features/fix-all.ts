/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as lsp from 'vscode-languageserver';
import { toTextDocumentEdit } from '../protocol-translation.js';
import { CommandTypes } from '../ts-protocol.js';
import type { ts } from '../ts-protocol.js';
import { TsClient } from '../ts-client.js';
import * as errorCodes from '../utils/errorCodes.js';
import * as fixNames from '../utils/fixNames.js';
import { CodeActionKind } from '../utils/types.js';
import { Range } from '../utils/typeConverters.js';

interface AutoFix {
    readonly codes: Set<number>;
    readonly fixName: string;
}

async function buildIndividualFixes(
    fixes: readonly AutoFix[],
    client: TsClient,
    file: string,
    diagnostics: readonly lsp.Diagnostic[],
): Promise<lsp.TextDocumentEdit[]> {
    const edits: lsp.TextDocumentEdit[] = [];
    for (const diagnostic of diagnostics) {
        for (const { codes, fixName } of fixes) {
            if (!codes.has(diagnostic.code as number)) {
                continue;
            }

            const args: ts.server.protocol.CodeFixRequestArgs = {
                ...Range.toFileRangeRequestArgs(file, diagnostic.range),
                errorCodes: [+diagnostic.code!],
            };

            const response = await client.execute(CommandTypes.GetCodeFixes, args);
            if (response.type !== 'response') {
                continue;
            }

            const fix = response.body?.find(fix => fix.fixName === fixName);
            if (fix) {
                edits.push(...fix.changes.map(change => toTextDocumentEdit(change, client)));
                break;
            }
        }
    }
    return edits;
}

async function buildCombinedFix(
    fixes: readonly AutoFix[],
    client: TsClient,
    file: string,
    diagnostics: readonly lsp.Diagnostic[],
): Promise<lsp.TextDocumentEdit[]> {
    const edits: lsp.TextDocumentEdit[] = [];
    for (const diagnostic of diagnostics) {
        for (const { codes, fixName } of fixes) {
            if (!codes.has(diagnostic.code as number)) {
                continue;
            }

            const args: ts.server.protocol.CodeFixRequestArgs = {
                ...Range.toFileRangeRequestArgs(file, diagnostic.range),
                errorCodes: [+diagnostic.code!],
            };

            const response = await client.execute(CommandTypes.GetCodeFixes, args);
            if (response.type !== 'response' || !response.body?.length) {
                continue;
            }

            const fix = response.body?.find(fix => fix.fixName === fixName);
            if (!fix) {
                continue;
            }

            if (!fix.fixId) {
                edits.push(...fix.changes.map(change => toTextDocumentEdit(change, client)));
                return edits;
            }

            const combinedArgs: ts.server.protocol.GetCombinedCodeFixRequestArgs = {
                scope: {
                    type: 'file',
                    args: { file },
                },
                fixId: fix.fixId,
            };

            const combinedResponse = await client.execute(CommandTypes.GetCombinedCodeFix, combinedArgs);
            if (combinedResponse.type !== 'response' || !combinedResponse.body) {
                return edits;
            }

            edits.push(...combinedResponse.body.changes.map(change => toTextDocumentEdit(change, client)));
            return edits;
        }
    }
    return edits;
}

// #region Source Actions

abstract class SourceAction {
    abstract build(
        client: TsClient,
        file: string,
        diagnostics: readonly lsp.Diagnostic[]
    ): Promise<lsp.CodeAction | null>;
}

class SourceFixAll extends SourceAction {
    private readonly title = 'Fix all';
    static readonly kind = CodeActionKind.SourceFixAllTs;

    async build(
        client: TsClient,
        file: string,
        diagnostics: readonly lsp.Diagnostic[],
    ): Promise<lsp.CodeAction | null> {
        const edits: lsp.TextDocumentEdit[] = [];
        edits.push(...await buildIndividualFixes([
            { codes: errorCodes.incorrectlyImplementsInterface, fixName: fixNames.classIncorrectlyImplementsInterface },
            { codes: errorCodes.asyncOnlyAllowedInAsyncFunctions, fixName: fixNames.awaitInSyncFunction },
        ], client, file, diagnostics));
        edits.push(...await buildCombinedFix([
            { codes: errorCodes.unreachableCode, fixName: fixNames.unreachableCode },
        ], client, file, diagnostics));
        if (!edits.length) {
            return null;
        }
        return lsp.CodeAction.create(this.title, { documentChanges: edits }, SourceFixAll.kind.value);
    }
}

class SourceRemoveUnused extends SourceAction {
    private readonly title = 'Remove all unused code';
    static readonly kind = CodeActionKind.SourceRemoveUnusedTs;

    async build(
        client: TsClient,
        file: string,
        diagnostics: readonly lsp.Diagnostic[],
    ): Promise<lsp.CodeAction | null> {
        const edits = await buildCombinedFix([
            { codes: errorCodes.variableDeclaredButNeverUsed, fixName: fixNames.unusedIdentifier },
        ], client, file, diagnostics);
        if (!edits.length) {
            return null;
        }
        return lsp.CodeAction.create(this.title, { documentChanges: edits }, SourceRemoveUnused.kind.value);
    }
}

class SourceAddMissingImports extends SourceAction {
    private readonly title = 'Add all missing imports';
    static readonly kind = CodeActionKind.SourceAddMissingImportsTs;

    async build(
        client: TsClient,
        file: string,
        diagnostics: readonly lsp.Diagnostic[],
    ): Promise<lsp.CodeAction | null> {
        const edits = await buildCombinedFix([
            { codes: errorCodes.cannotFindName, fixName: fixNames.fixImport },
        ], client, file, diagnostics);
        if (!edits.length) {
            return null;
        }
        return lsp.CodeAction.create(this.title, { documentChanges: edits }, SourceAddMissingImports.kind.value);
    }
}

//#endregion

export class TypeScriptAutoFixProvider {
    private static kindProviders = [
        SourceFixAll,
        SourceRemoveUnused,
        SourceAddMissingImports,
    ];

    public static get kinds(): CodeActionKind[] {
        return TypeScriptAutoFixProvider.kindProviders.map(provider => provider.kind);
    }

    constructor(private readonly client: TsClient) {}

    public async provideCodeActions(
        kinds: CodeActionKind[],
        file: string,
        diagnostics: lsp.Diagnostic[],
    ): Promise<lsp.CodeAction[]> {
        const results: Promise<lsp.CodeAction | null>[] = [];
        for (const provider of TypeScriptAutoFixProvider.kindProviders) {
            if (kinds.some(kind => kind.contains(provider.kind))) {
                results.push((new provider).build(this.client, file, diagnostics));
            }
        }
        return (await Promise.all(results)).flatMap(result => result || []);
    }
}
