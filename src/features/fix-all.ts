/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type tsp from 'typescript/lib/protocol.d.js';
import * as lsp from 'vscode-languageserver';
import { LspDocuments } from '../document.js';
import { toTextDocumentEdit } from '../protocol-translation.js';
import { TspClient } from '../tsp-client.js';
import { CommandTypes } from '../tsp-command-types.js';
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
    client: TspClient,
    file: string,
    documents: LspDocuments,
    diagnostics: readonly lsp.Diagnostic[],
): Promise<lsp.TextDocumentEdit[]> {
    const edits: lsp.TextDocumentEdit[] = [];
    for (const diagnostic of diagnostics) {
        for (const { codes, fixName } of fixes) {
            if (!codes.has(diagnostic.code as number)) {
                continue;
            }

            const args: tsp.CodeFixRequestArgs = {
                ...Range.toFileRangeRequestArgs(file, diagnostic.range),
                errorCodes: [+diagnostic.code!],
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
    diagnostics: readonly lsp.Diagnostic[],
): Promise<lsp.TextDocumentEdit[]> {
    const edits: lsp.TextDocumentEdit[] = [];
    for (const diagnostic of diagnostics) {
        for (const { codes, fixName } of fixes) {
            if (!codes.has(diagnostic.code as number)) {
                continue;
            }

            const args: tsp.CodeFixRequestArgs = {
                ...Range.toFileRangeRequestArgs(file, diagnostic.range),
                errorCodes: [+diagnostic.code!],
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
                    args: { file },
                },
                fixId: fix.fixId,
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
    static readonly kind = CodeActionKind.SourceFixAllTs;

    async build(
        client: TspClient,
        file: string,
        documents: LspDocuments,
        diagnostics: readonly lsp.Diagnostic[],
    ): Promise<lsp.CodeAction | null> {
        const edits: lsp.TextDocumentEdit[] = [];
        edits.push(...await buildIndividualFixes([
            { codes: errorCodes.incorrectlyImplementsInterface, fixName: fixNames.classIncorrectlyImplementsInterface },
            { codes: errorCodes.asyncOnlyAllowedInAsyncFunctions, fixName: fixNames.awaitInSyncFunction },
        ], client, file, documents, diagnostics));
        edits.push(...await buildCombinedFix([
            { codes: errorCodes.unreachableCode, fixName: fixNames.unreachableCode },
        ], client, file, documents, diagnostics));
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
        client: TspClient,
        file: string,
        documents: LspDocuments,
        diagnostics: readonly lsp.Diagnostic[],
    ): Promise<lsp.CodeAction | null> {
        const edits = await buildCombinedFix([
            { codes: errorCodes.variableDeclaredButNeverUsed, fixName: fixNames.unusedIdentifier },
        ], client, file, documents, diagnostics);
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
        client: TspClient,
        file: string,
        documents: LspDocuments,
        diagnostics: readonly lsp.Diagnostic[],
    ): Promise<lsp.CodeAction | null> {
        const edits = await buildCombinedFix([
            { codes: errorCodes.cannotFindName, fixName: fixNames.fixImport },
        ], client, file, documents, diagnostics);
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

    constructor(private readonly client: TspClient) {}

    public async provideCodeActions(kinds: CodeActionKind[], file: string, diagnostics: lsp.Diagnostic[], documents: LspDocuments): Promise<lsp.CodeAction[]> {
        const results: Promise<lsp.CodeAction | null>[] = [];
        for (const provider of TypeScriptAutoFixProvider.kindProviders) {
            if (kinds.some(kind => kind.contains(provider.kind))) {
                results.push((new provider).build(this.client, file, documents, diagnostics));
            }
        }
        return (await Promise.all(results)).flatMap(result => result || []);
    }
}
