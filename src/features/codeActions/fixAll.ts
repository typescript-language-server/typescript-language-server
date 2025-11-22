// sync: file[extensions/typescript-language-features/src/languageFeatures/fixAll.ts] sha[f76ac124233270762d11ec3afaaaafcba53b3bbf]
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/*
 * Copyright (C) 2024 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import type * as lsp from 'vscode-languageserver';
import { type ts, CommandTypes } from '../../ts-protocol.js';
import * as errorCodes from '../../utils/errorCodes.js';
import * as fixNames from '../../utils/fixNames.js';
import * as typeConverters from '../../utils/typeConverters.js';
import type { ITypeScriptServiceClient } from '../../typescriptService.js';
// import { DiagnosticsManager } from './diagnostics.js';
import type FileConfigurationManager from '../fileConfigurationManager.js';
import { type CodeActionProvider, type CodeActionProviderMetadata, TsCodeAction } from './codeActionProvider.js';
import { CodeActionKind } from '../../utils/types.js';
import type { LspDocument } from '../../document.js';
import { toTextDocumentEdit } from '../../protocol-translation.js';
import type { DiagnosticsManager } from '../../diagnosticsManager.js';

interface AutoFix {
    readonly codes: Set<number>;
    readonly fixName: string;
}

async function buildIndividualFixes(
    fixes: readonly AutoFix[],
    client: ITypeScriptServiceClient,
    file: string,
    diagnostics: readonly lsp.Diagnostic[],
    token: lsp.CancellationToken,
): Promise<lsp.WorkspaceEdit | undefined> {
    const documentChanges: lsp.TextDocumentEdit[] = [];

    for (const diagnostic of diagnostics) {
        for (const { codes, fixName } of fixes) {
            if (token.isCancellationRequested) {
                return;
            }

            if (!codes.has(diagnostic.code as number)) {
                continue;
            }

            const args: ts.server.protocol.CodeFixRequestArgs = {
                ...typeConverters.Range.toFileRangeRequestArgs(file, diagnostic.range),
                errorCodes: [+(diagnostic.code!)],
            };

            const response = await client.execute(CommandTypes.GetCodeFixes, args, token);
            if (response.type !== 'response') {
                continue;
            }

            const fix = response.body?.find(fix => fix.fixName === fixName);
            if (fix) {
                documentChanges.push(...fix.changes.map(change => toTextDocumentEdit(change, client)));
                break;
            }
        }
    }

    return {
        documentChanges,
    };
}

async function buildCombinedFix(
    fixes: readonly AutoFix[],
    client: ITypeScriptServiceClient,
    file: string,
    diagnostics: readonly lsp.Diagnostic[],
    token: lsp.CancellationToken,
): Promise<lsp.WorkspaceEdit | undefined> {
    for (const diagnostic of diagnostics) {
        for (const { codes, fixName } of fixes) {
            if (token.isCancellationRequested) {
                return;
            }

            if (!codes.has(diagnostic.code as number)) {
                continue;
            }

            const args: ts.server.protocol.CodeFixRequestArgs = {
                ...typeConverters.Range.toFileRangeRequestArgs(file, diagnostic.range),
                errorCodes: [+(diagnostic.code!)],
            };

            const response = await client.execute(CommandTypes.GetCodeFixes, args, token);
            if (response.type !== 'response' || !response.body?.length) {
                continue;
            }

            const fix = response.body?.find(fix => fix.fixName === fixName);
            if (!fix) {
                continue;
            }

            if (!fix.fixId) {
                return {
                    documentChanges: fix.changes.map(change => toTextDocumentEdit(change, client)),
                } satisfies lsp.WorkspaceEdit;
            }

            const combinedArgs: ts.server.protocol.GetCombinedCodeFixRequestArgs = {
                scope: {
                    type: 'file',
                    args: { file },
                },
                fixId: fix.fixId,
            };

            const combinedResponse = await client.execute(CommandTypes.GetCombinedCodeFix, combinedArgs, token);
            if (combinedResponse.type !== 'response' || !combinedResponse.body) {
                return;
            }

            return {
                documentChanges: combinedResponse.body.changes.map(change => toTextDocumentEdit(change, client)),
            } satisfies lsp.WorkspaceEdit;
        }
    }
}

// #region Source Actions

abstract class SourceAction extends TsCodeAction {
    abstract build(
        client: ITypeScriptServiceClient,
        file: string,
        diagnostics: readonly lsp.Diagnostic[],
        token: lsp.CancellationToken,
    ): Promise<void>;
}

class SourceFixAll extends SourceAction {
    static readonly kind = CodeActionKind.SourceFixAllTs;

    constructor() {
        super('Fix all fixable JS/TS issues', SourceFixAll.kind.value);
    }

    async build(client: ITypeScriptServiceClient, file: string, diagnostics: readonly lsp.Diagnostic[], token: lsp.CancellationToken): Promise<void> {
        this.edit = await buildIndividualFixes([
            { codes: errorCodes.incorrectlyImplementsInterface, fixName: fixNames.classIncorrectlyImplementsInterface },
            { codes: errorCodes.asyncOnlyAllowedInAsyncFunctions, fixName: fixNames.awaitInSyncFunction },
        ], client, file, diagnostics, token);

        const edits = await buildCombinedFix([
            { codes: errorCodes.unreachableCode, fixName: fixNames.unreachableCode },
        ], client, file, diagnostics, token);
        if (edits?.documentChanges) {
            this.edit?.documentChanges?.push(...edits.documentChanges);
        }
    }
}

class SourceRemoveUnused extends SourceAction {
    static readonly kind = CodeActionKind.SourceRemoveUnusedTs;

    constructor() {
        super('Remove all unused code', SourceRemoveUnused.kind.value);
    }

    async build(client: ITypeScriptServiceClient, file: string, diagnostics: readonly lsp.Diagnostic[], token: lsp.CancellationToken): Promise<void> {
        this.edit = await buildCombinedFix([
            { codes: errorCodes.variableDeclaredButNeverUsed, fixName: fixNames.unusedIdentifier },
        ], client, file, diagnostics, token);
    }
}

class SourceAddMissingImports extends SourceAction {
    static readonly kind = CodeActionKind.SourceAddMissingImportsTs;

    constructor() {
        super('Add all missing imports', SourceAddMissingImports.kind.value);
    }

    async build(client: ITypeScriptServiceClient, file: string, diagnostics: readonly lsp.Diagnostic[], token: lsp.CancellationToken): Promise<void> {
        this.edit = await buildCombinedFix([
            { codes: errorCodes.cannotFindName, fixName: fixNames.fixImport },
        ], client, file, diagnostics, token);
    }
}

//#endregion

export class TypeScriptAutoFixProvider implements CodeActionProvider {
    private static readonly kindProviders = [
        SourceFixAll,
        SourceRemoveUnused,
        SourceAddMissingImports,
    ];

    constructor(
        private readonly client: ITypeScriptServiceClient,
        private readonly fileConfigurationManager: FileConfigurationManager,
        private readonly diagnosticsManager: DiagnosticsManager,
    ) { }

    public getMetadata(): CodeActionProviderMetadata {
        return {
            providedCodeActionKinds: TypeScriptAutoFixProvider.kindProviders.map(x => x.kind.value),
        };
    }

    public async provideCodeActions(
        document: LspDocument,
        _range: lsp.Range,
        context: lsp.CodeActionContext,
        token: lsp.CancellationToken,
    ): Promise<TsCodeAction[] | undefined> {
        if (!context.only?.length) {
            return undefined;
        }

        const sourceKinds = context.only
            .map(kind => new CodeActionKind(kind))
            .filter(codeActionKind => CodeActionKind.Source.intersects(codeActionKind));
        if (!sourceKinds.length) {
            return undefined;
        }

        // TODO: Since we rely on diagnostics pointing at errors in the correct places, we can't proceed if we are not
        // sure that diagnostics are up-to-date. Thus we check if there are pending diagnostic requests for the file.
        // In general would be better to replace the whole diagnostics handling logic with the one from
        // bufferSyncSupport.ts in VSCode's typescript language features.
        if (this.client.hasPendingDiagnostics(document.uri)) {
            return undefined;
        }

        const actions = this.getFixAllActions(sourceKinds);
        const diagnostics = this.diagnosticsManager.getDiagnosticsForFile(document.filepath);
        if (!diagnostics.length) {
            // Actions are a no-op in this case but we still want to return them
            return actions;
        }

        await this.fileConfigurationManager.ensureConfigurationForDocument(document, token);

        if (token.isCancellationRequested) {
            return undefined;
        }

        await Promise.all(actions.map(action => action.build(this.client, document.filepath, diagnostics, token)));

        return actions;
    }

    public isCodeActionResolvable(_codeAction: TsCodeAction): boolean {
        return false;
    }

    private getFixAllActions(kinds: CodeActionKind[]): SourceAction[] {
        return TypeScriptAutoFixProvider.kindProviders
            .filter(provider => kinds.some(only => only.intersects(provider.kind)))
            .map(provider => new provider());
    }
}
