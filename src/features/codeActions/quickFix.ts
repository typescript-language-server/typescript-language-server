// sync: file[extensions/typescript-language-features/src/languageFeatures/quickFix.ts] sha[f76ac124233270762d11ec3afaaaafcba53b3bbf]
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

import * as lsp from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { type ts, CommandTypes, type SupportedFeatures } from '../../ts-protocol.js';
import { type Command, CommandManager } from '../../commands/commandManager.js';
import * as fixNames from '../../utils/fixNames.js';
import * as typeConverters from '../../utils/typeConverters.js';
import { type ITypeScriptServiceClient } from '../../typescriptService.js';
import { memoizeGetter } from '../../utils/memoize.js';
import { equals } from '../../utils/objects.js';
// import { DiagnosticsManager } from './diagnostics.js';
import FileConfigurationManager from '../fileConfigurationManager.js';
import { applyCodeActionCommands, getEditForCodeAction } from '../util/codeAction.js';
import { CodeActionProvider, CodeActionProviderMetadata, TsCodeAction, TsCodeActionProvider } from './codeActionProvider.js';
import { LspDocument } from '../../document.js';
import { toTextDocumentEdit } from '../../protocol-translation.js';
import { CodeActionKind } from '../../utils/types.js';
import { type DiagnosticsManager } from '../../diagnosticsManager.js';

type ApplyCodeActionCommand_args = {
    readonly documentUri: string;
    readonly diagnostic: lsp.Diagnostic;
    readonly action: ts.server.protocol.CodeFixAction;
};

class ApplyCodeActionCommand implements Command {
    public static readonly ID = '_typescript.applyCodeActionCommand';
    public readonly id = ApplyCodeActionCommand.ID;

    constructor(
        private readonly client: ITypeScriptServiceClient,
        // private readonly diagnosticManager: DiagnosticsManager,
    ) { }

    // public async execute({ documentUri, action, diagnostic }: ApplyCodeActionCommand_args): Promise<boolean> {
    public async execute({ action }: ApplyCodeActionCommand_args): Promise<boolean> {
        // this.diagnosticManager.deleteDiagnostic(documentUri, diagnostic);
        const codeActionResult = await applyCodeActionCommands(this.client, action.commands);
        return codeActionResult;
    }
}

type ApplyFixAllCodeAction_args = {
    readonly tsActionId: string;
};

class ApplyFixAllCodeAction implements Command {
    public static readonly ID = '_typescript.applyFixAllCodeAction';
    public readonly id = ApplyFixAllCodeAction.ID;

    constructor(
        private readonly client: ITypeScriptServiceClient,
        private readonly tsCodeActionProvider: TsCodeActionProvider,
    ) { }

    public async execute(args: ApplyFixAllCodeAction_args): Promise<void> {
        const tsAction = this.tsCodeActionProvider.getQuickFixAllTsCodeActionByFixName(args.tsActionId);
        if (tsAction instanceof TsQuickFixAllCodeAction && tsAction.combinedResponse) {
            await applyCodeActionCommands(this.client, tsAction.combinedResponse.body.commands);
        }
    }
}

/**
 * Unique set of diagnostics keyed on diagnostic range and error code.
 */
class DiagnosticsSet {
    public static from(diagnostics: lsp.Diagnostic[]) {
        const values = new Map<string, lsp.Diagnostic>();
        for (const diagnostic of diagnostics) {
            values.set(DiagnosticsSet.key(diagnostic), diagnostic);
        }
        return new DiagnosticsSet(values);
    }

    private static key(diagnostic: lsp.Diagnostic) {
        const { start, end } = diagnostic.range;
        return `${diagnostic.code}-${start.line},${start.character}-${end.line},${end.character}`;
    }

    private constructor(
        private readonly _values: Map<string, lsp.Diagnostic>,
    ) { }

    public get values(): Iterable<lsp.Diagnostic> {
        return this._values.values();
    }

    public get size() {
        return this._values.size;
    }
}

class TsQuickFixCodeAction extends TsCodeAction {
    constructor(
        public readonly tsAction: ts.server.protocol.CodeFixAction,
        title: string,
        kind: lsp.CodeActionKind,
    ) {
        super(title, kind);
    }
}

class TsQuickFixAllCodeAction extends TsQuickFixCodeAction {
    constructor(
        tsAction: ts.server.protocol.CodeFixAction,
        public readonly file: string,
        title: string,
        kind: lsp.CodeActionKind,
    ) {
        super(tsAction, title, kind);
    }

    public combinedResponse?: ts.server.protocol.GetCombinedCodeFixResponse;
}

class CodeActionSet {
    private readonly _actions = new Set<TsQuickFixCodeAction>();
    private readonly _fixAllActions = new Map<object, TsQuickFixCodeAction>();
    private readonly _aiActions = new Set<TsQuickFixCodeAction>();

    public *values(): Iterable<TsQuickFixCodeAction> {
        yield* this._actions;
        yield* this._aiActions;
    }

    public addAction(action: TsQuickFixCodeAction) {
        for (const existing of this._actions) {
            if (action.tsAction.fixName === existing.tsAction.fixName && equals(action.edit, existing.edit)) {
                this._actions.delete(existing);
            }
        }

        this._actions.add(action);

        if (action.tsAction.fixId) {
            // If we have an existing fix all action, then make sure it follows this action
            const existingFixAll = this._fixAllActions.get(action.tsAction.fixId);
            if (existingFixAll) {
                this._actions.delete(existingFixAll);
                this._actions.add(existingFixAll);
            }
        }
    }

    public addFixAllAction(fixId: object, action: TsQuickFixCodeAction) {
        const existing = this._fixAllActions.get(fixId);
        if (existing) {
            // reinsert action at back of actions list
            this._actions.delete(existing);
        }
        this.addAction(action);
        this._fixAllActions.set(fixId, action);
    }

    public hasFixAllAction(fixId: object) {
        return this._fixAllActions.has(fixId);
    }
}

class SupportedCodeActionProvider {
    public constructor(
        private readonly client: ITypeScriptServiceClient,
    ) { }

    public async getFixableDiagnosticsForContext(diagnostics: readonly lsp.Diagnostic[]): Promise<DiagnosticsSet> {
        const fixableCodes = await this.fixableDiagnosticCodes;
        return DiagnosticsSet.from(
            diagnostics.filter(diagnostic => typeof diagnostic.code !== 'undefined' && fixableCodes.has(diagnostic.code + '')));
    }

    @memoizeGetter
    private get fixableDiagnosticCodes(): Thenable<Set<string>> {
        return this.client.execute(CommandTypes.GetSupportedCodeFixes, null)
            .then(response => response.type === 'response' ? response.body || [] : [])
            .then(codes => new Set(codes));
    }
}

export class TypeScriptQuickFixProvider implements CodeActionProvider<TsQuickFixCodeAction>, TsCodeActionProvider {
    private static readonly _maxCodeActionsPerFile: number = 1000;
    /** Map from `fixName` to `TsQuickFixAllCodeAction` for use by the `ApplyFixAllCodeAction` Command. */
    private _quickFixAllTsCodeActionMap = new Map<string, TsQuickFixAllCodeAction>();
    private readonly supportedCodeActionProvider: SupportedCodeActionProvider;

    constructor(
        private readonly client: ITypeScriptServiceClient,
        private readonly fileConfigurationManager: FileConfigurationManager,
        commandManager: CommandManager,
        private readonly diagnosticsManager: DiagnosticsManager,
        private features: SupportedFeatures,
    ) {
        commandManager.register(new ApplyCodeActionCommand(client/*, diagnosticsManager*/));
        commandManager.register(new ApplyFixAllCodeAction(client, this));

        this.supportedCodeActionProvider = new SupportedCodeActionProvider(client);
    }

    public getMetadata(): CodeActionProviderMetadata {
        return {
            providedCodeActionKinds: [CodeActionKind.QuickFix.value],
        };
    }

    public async provideCodeActions(
        document: LspDocument,
        range: lsp.Range,
        context: lsp.CodeActionContext,
        token: lsp.CancellationToken,
    ): Promise<TsQuickFixCodeAction[] | undefined> {
        this._quickFixAllTsCodeActionMap.clear();

        let diagnostics = context.diagnostics;
        if (this.client.hasPendingDiagnostics(document.uri)) {
            // Delay for 500ms when there are pending diagnostics before recomputing up-to-date diagnostics.
            await new Promise((resolve) => {
                setTimeout(resolve, 500);
            });

            if (token.isCancellationRequested) {
                return;
            }
            const allDiagnostics: lsp.Diagnostic[] = [];

            // // Match ranges again after getting new diagnostics
            for (const diagnostic of this.diagnosticsManager.getDiagnosticsForFile(document.filepath)) {
                if (typeConverters.Range.intersection(range, diagnostic.range)) {
                    const newLen = allDiagnostics.push(diagnostic);
                    if (newLen > TypeScriptQuickFixProvider._maxCodeActionsPerFile) {
                        break;
                    }
                }
            }
            diagnostics = allDiagnostics;
        }

        const fixableDiagnostics = await this.supportedCodeActionProvider.getFixableDiagnosticsForContext(diagnostics);
        if (!fixableDiagnostics.size || token.isCancellationRequested) {
            return;
        }

        await this.fileConfigurationManager.ensureConfigurationForDocument(document, token);
        if (token.isCancellationRequested) {
            return;
        }

        const results = new CodeActionSet();
        for (const diagnostic of fixableDiagnostics.values) {
            await this.getFixesForDiagnostic(document, diagnostic, results, token);
            if (token.isCancellationRequested) {
                return;
            }
        }

        const allActions = Array.from(results.values());
        for (const action of allActions) {
            action.isPreferred = isPreferredFix(action, allActions);
        }
        return allActions;
    }

    public isCodeActionResolvable(codeAction: TsQuickFixCodeAction): codeAction is TsQuickFixAllCodeAction {
        return codeAction instanceof TsQuickFixAllCodeAction;
    }

    public async resolveCodeAction(codeAction: TsQuickFixCodeAction, token: lsp.CancellationToken): Promise<TsQuickFixCodeAction> {
        if (!this.isCodeActionResolvable(codeAction) || !codeAction.tsAction.fixId) {
            return codeAction;
        }

        const arg: ts.server.protocol.GetCombinedCodeFixRequestArgs = {
            scope: {
                type: 'file',
                args: { file: codeAction.file },
            },
            fixId: codeAction.tsAction.fixId,
        };

        const response = await this.client.execute(CommandTypes.GetCombinedCodeFix, arg, token);
        if (response.type === 'response') {
            codeAction.combinedResponse = response;
            codeAction.edit = { documentChanges: response.body.changes.map(change => toTextDocumentEdit(change, this.client)) };
        }

        return codeAction;
    }

    public getQuickFixAllTsCodeActionByFixName(fixName: string): TsCodeAction | undefined {
        return this._quickFixAllTsCodeActionMap.get(fixName);
    }

    private async getFixesForDiagnostic(
        document: LspDocument,
        diagnostic: lsp.Diagnostic,
        results: CodeActionSet,
        token: lsp.CancellationToken,
    ): Promise<CodeActionSet> {
        const args: ts.server.protocol.CodeFixRequestArgs = {
            ...typeConverters.Range.toFileRangeRequestArgs(document.filepath, diagnostic.range),
            errorCodes: [+(diagnostic.code!)],
        };
        const response = await this.client.execute(CommandTypes.GetCodeFixes, args, token);
        if (response.type !== 'response' || !response.body) {
            return results;
        }

        for (const tsCodeFix of response.body) {
            for (const action of this.getFixesForTsCodeAction(document, diagnostic, tsCodeFix)) {
                results.addAction(action);
            }
            if (this.features.codeActionResolveSupport) {
                this.addFixAllForTsCodeAction(results, document.uri, document.filepath, diagnostic, tsCodeFix);
            }
        }
        return results;
    }

    private getFixesForTsCodeAction(
        document: LspDocument,
        diagnostic: lsp.Diagnostic,
        action: ts.server.protocol.CodeFixAction,
    ): TsQuickFixCodeAction[] {
        const actions: TsQuickFixCodeAction[] = [];
        const codeAction = new TsQuickFixCodeAction(action, action.description, lsp.CodeActionKind.QuickFix);
        codeAction.edit = getEditForCodeAction(this.client, action);
        codeAction.diagnostics = [diagnostic];
        codeAction.command = {
            command: ApplyCodeActionCommand.ID,
            arguments: [{ action, diagnostic, documentUri: document.uri.toString() } satisfies ApplyCodeActionCommand_args],
            title: '',
        };
        actions.push(codeAction);
        return actions;
    }

    private addFixAllForTsCodeAction(
        results: CodeActionSet,
        _resource: URI,
        file: string,
        diagnostic: lsp.Diagnostic,
        tsAction: ts.server.protocol.CodeFixAction,
    ): CodeActionSet {
        if (!tsAction.fixId || results.hasFixAllAction(tsAction.fixId)) {
            return results;
        }

        // Make sure there are multiple diagnostics of the same type in the file
        if (!this.diagnosticsManager.getDiagnosticsForFile(file).some(x => {
            if (x === diagnostic) {
                return false;
            }
            return x.code === diagnostic.code
                || fixAllErrorCodes.has(x.code as number) && fixAllErrorCodes.get(x.code as number) === fixAllErrorCodes.get(diagnostic.code as number);
        })) {
            return results;
        }

        const action = new TsQuickFixAllCodeAction(
            tsAction,
            file,
            tsAction.fixAllDescription || `${tsAction.description} (Fix all in file)`,
            lsp.CodeActionKind.QuickFix);

        action.diagnostics = [diagnostic];
        action.command = {
            command: ApplyFixAllCodeAction.ID,
            arguments: [{ tsActionId: tsAction.fixName } satisfies ApplyFixAllCodeAction_args],
            title: '',
        };
        this._quickFixAllTsCodeActionMap.set(tsAction.fixName, action);
        results.addFixAllAction(tsAction.fixId, action);
        return results;
    }
}

// Some fix all actions can actually fix multiple differnt diagnostics. Make sure we still show the fix all action
// in such cases
const fixAllErrorCodes = new Map<number, number>([
    // Missing async
    [2339, 2339],
    [2345, 2339],
]);

const preferredFixes = new Map<string, { readonly priority: number; readonly thereCanOnlyBeOne?: boolean; }>([
    [fixNames.annotateWithTypeFromJSDoc, { priority: 2 }],
    [fixNames.constructorForDerivedNeedSuperCall, { priority: 2 }],
    [fixNames.extendsInterfaceBecomesImplements, { priority: 2 }],
    [fixNames.awaitInSyncFunction, { priority: 2 }],
    [fixNames.removeUnnecessaryAwait, { priority: 2 }],
    [fixNames.classIncorrectlyImplementsInterface, { priority: 3 }],
    [fixNames.classDoesntImplementInheritedAbstractMember, { priority: 3 }],
    [fixNames.unreachableCode, { priority: 2 }],
    [fixNames.unusedIdentifier, { priority: 2 }],
    [fixNames.forgottenThisPropertyAccess, { priority: 2 }],
    [fixNames.spelling, { priority: 0 }],
    [fixNames.addMissingAwait, { priority: 2 }],
    [fixNames.addMissingOverride, { priority: 2 }],
    [fixNames.addMissingNewOperator, { priority: 2 }],
    [fixNames.fixImport, { priority: 1, thereCanOnlyBeOne: true }],
]);

function isPreferredFix(
    action: TsQuickFixCodeAction,
    allActions: readonly TsQuickFixCodeAction[],
): boolean {
    if (action instanceof TsQuickFixAllCodeAction) {
        return false;
    }

    const fixPriority = preferredFixes.get(action.tsAction.fixName);
    if (!fixPriority) {
        return false;
    }

    return allActions.every(otherAction => {
        if (otherAction === action) {
            return true;
        }

        if (otherAction instanceof TsQuickFixAllCodeAction) {
            return true;
        }

        const otherFixPriority = preferredFixes.get(otherAction.tsAction.fixName);
        if (!otherFixPriority || otherFixPriority.priority < fixPriority.priority) {
            return true;
        } else if (otherFixPriority.priority > fixPriority.priority) {
            return false;
        }

        if (fixPriority.thereCanOnlyBeOne && action.tsAction.fixName === otherAction.tsAction.fixName) {
            return false;
        }

        return true;
    });
}
