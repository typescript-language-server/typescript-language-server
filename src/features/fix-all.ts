/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import tsp, { CommandTypes } from 'typescript/lib/protocol';
import * as lsp from 'vscode-languageserver/node';
import { CodeActions } from '../commands';
import { LspDocuments } from '../document';
import { toFileRangeRequestArgs, toTextDocumentEdit } from '../protocol-translation';
import { TspClient } from '../tsp-client';
import * as errorCodes from '../utils/errorCodes';
import * as fixNames from '../utils/fixNames';

interface AutoFix {
    readonly codes: Set<number>;
    readonly fixName: string;
}

async function buildIndividualFixes(
    fixes: readonly AutoFix[],
    client: TspClient,
    file: string,
    documents: LspDocuments,
    diagnostics: readonly lsp.Diagnostic[]
): Promise<lsp.TextDocumentEdit[]> {
    const edits: lsp.TextDocumentEdit[] = [];
    for (const diagnostic of diagnostics) {
        for (const { codes, fixName } of fixes) {
            if (!codes.has(diagnostic.code as number)) {
                continue;
            }

            const args: tsp.CodeFixRequestArgs = {
                ...toFileRangeRequestArgs(file, diagnostic.range),
                errorCodes: [+diagnostic.code!]
            };

            const response = await client.request(CommandTypes.GetCodeFixes, args);
            if (response.type !== 'response') {
                continue;
            }

            const fix = response.body?.find(fix => fix.fixName === fixName);
            if (fix) {
                edits.push(...fix.changes.map(change => toTextDocumentEdit(change, documents)));
                break;
            }
        }
    }
    return edits;
}

async function buildCombinedFix(
    fixes: readonly AutoFix[],
    client: TspClient,
    file: string,
    documents: LspDocuments,
    diagnostics: readonly lsp.Diagnostic[]
): Promise<lsp.TextDocumentEdit[]> {
    const edits: lsp.TextDocumentEdit[] = [];
    for (const diagnostic of diagnostics) {
        for (const { codes, fixName } of fixes) {
            if (!codes.has(diagnostic.code as number)) {
                continue;
            }

            const args: tsp.CodeFixRequestArgs = {
                ...toFileRangeRequestArgs(file, diagnostic.range),
                errorCodes: [+diagnostic.code!]
            };

            const response = await client.request(CommandTypes.GetCodeFixes, args);
            if (response.type !== 'response' || !response.body?.length) {
                continue;
            }

            const fix = response.body?.find(fix => fix.fixName === fixName);
            if (!fix) {
                continue;
            }

            if (!fix.fixId) {
                edits.push(...fix.changes.map(change => toTextDocumentEdit(change, documents)));
                return edits;
            }

            const combinedArgs: tsp.GetCombinedCodeFixRequestArgs = {
                scope: {
                    type: 'file',
                    args: { file }
                },
                fixId: fix.fixId
            };

            const combinedResponse = await client.request(CommandTypes.GetCombinedCodeFix, combinedArgs);
            if (combinedResponse.type !== 'response' || !combinedResponse.body) {
                return edits;
            }

            edits.push(...combinedResponse.body.changes.map(change => toTextDocumentEdit(change, documents)));
            return edits;
        }
    }
    return edits;
}

// #region Source Actions

abstract class SourceAction {
    abstract build(
        client: TspClient,
        file: string,
        documents: LspDocuments,
        diagnostics: readonly lsp.Diagnostic[]
    ): Promise<lsp.CodeAction | null>;
}

class SourceFixAll extends SourceAction {
    private readonly title = 'Fix all';
    static readonly kind = CodeActions.SourceFixAllTs;

    async build(
        client: TspClient,
        file: string,
        documents: LspDocuments,
        diagnostics: readonly lsp.Diagnostic[]
    ): Promise<lsp.CodeAction | null> {
        const edits: lsp.TextDocumentEdit[] = [];
        edits.push(...await buildIndividualFixes([
            { codes: errorCodes.incorrectlyImplementsInterface, fixName: fixNames.classIncorrectlyImplementsInterface },
            { codes: errorCodes.asyncOnlyAllowedInAsyncFunctions, fixName: fixNames.awaitInSyncFunction }
        ], client, file, documents, diagnostics));
        edits.push(...await buildCombinedFix([
            { codes: errorCodes.unreachableCode, fixName: fixNames.unreachableCode }
        ], client, file, documents, diagnostics));
        if (!edits.length) {
            return null;
        }
        return lsp.CodeAction.create(this.title, { documentChanges: edits }, SourceFixAll.kind);
    }
}

class SourceRemoveUnused extends SourceAction {
    private readonly title = 'Remove all unused code';
    static readonly kind = CodeActions.SourceRemoveUnusedTs;

    async build(
        client: TspClient,
        file: string,
        documents: LspDocuments,
        diagnostics: readonly lsp.Diagnostic[]
    ): Promise<lsp.CodeAction | null> {
        const edits = await buildCombinedFix([
            { codes: errorCodes.variableDeclaredButNeverUsed, fixName: fixNames.unusedIdentifier }
        ], client, file, documents, diagnostics);
        if (!edits.length) {
            return null;
        }
        return lsp.CodeAction.create(this.title, { documentChanges: edits }, SourceRemoveUnused.kind);
    }
}

class SourceAddMissingImports extends SourceAction {
    private readonly title = 'Add all missing imports';
    static readonly kind = CodeActions.SourceAddMissingImportsTs;

    async build(
        client: TspClient,
        file: string,
        documents: LspDocuments,
        diagnostics: readonly lsp.Diagnostic[]
    ): Promise<lsp.CodeAction | null> {
        const edits = await buildCombinedFix([
            { codes: errorCodes.cannotFindName, fixName: fixNames.fixImport }
        ], client, file, documents, diagnostics);
        if (!edits.length) {
            return null;
        }
        return lsp.CodeAction.create(this.title, { documentChanges: edits }, SourceAddMissingImports.kind);
    }
}

//#endregion

export class TypeScriptAutoFixProvider {
    private static kindProviders = [
        SourceFixAll,
        SourceRemoveUnused,
        SourceAddMissingImports
    ];
    private providers: SourceAction[];

    constructor(private readonly client: TspClient) {
        this.providers = TypeScriptAutoFixProvider.kindProviders.map(provider => new provider());
    }

    public static get kinds(): lsp.CodeActionKind[] {
        return TypeScriptAutoFixProvider.kindProviders.map(provider => provider.kind);
    }

    public async provideCodeActions(file: string, diagnostics: lsp.Diagnostic[], documents: LspDocuments): Promise<lsp.CodeAction[]> {
        const results = await Promise.all(this.providers.map(action => action.build(this.client, file, documents, diagnostics)));
        return results.flatMap(result => result || []);
    }
}
