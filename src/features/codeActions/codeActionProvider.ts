/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/*
 * Copyright (C) 2022 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as lsp from 'vscode-languageserver';
import type { LspDocument } from '../../document.js';

export interface TsCodeActionProvider {
    getQuickFixAllTsCodeActionByFixName(fixName: string): TsCodeAction | undefined;
}

export class TsCodeAction implements lsp.CodeAction {
    public command: lsp.CodeAction['command'];
    public diagnostics: lsp.CodeAction['diagnostics'];
    public disabled: lsp.CodeAction['disabled'];
    public edit: lsp.CodeAction['edit'];
    public isPreferred: lsp.CodeAction['isPreferred'];

    constructor(
        public readonly title: string,
        public readonly kind: lsp.CodeActionKind,
    ) {
    }

    toLspCodeAction(): lsp.CodeAction {
        const codeAction = lsp.CodeAction.create(this.title, this.kind);

        if (this.command !== undefined) {
            codeAction.command = this.command;
        }
        if (this.diagnostics !== undefined) {
            codeAction.diagnostics = this.diagnostics;
        }
        if (this.disabled !== undefined) {
            codeAction.disabled = this.disabled;
        }
        if (this.edit !== undefined) {
            codeAction.edit = this.edit;
        }
        if (this.isPreferred !== undefined) {
            codeAction.isPreferred = this.isPreferred;
        }

        return codeAction;
    }
}

type ProviderResult<T> = T | undefined | null | Thenable<T | undefined | null>;

/**
 * Provides contextual actions for code. Code actions typically either fix problems or beautify/refactor code.
 */
export interface CodeActionProvider<T extends TsCodeAction = TsCodeAction> {
    getMetadata(): CodeActionProviderMetadata;

    /**
     * Get code actions for a given range in a document.
     */
    provideCodeActions(document: LspDocument, range: lsp.Range, context: lsp.CodeActionContext, token: lsp.CancellationToken): ProviderResult<(lsp.Command | T)[]>;

    /**
     * Whether given code action can be resolved with `resolveCodeAction`.
     */
    isCodeActionResolvable(codeAction: T): boolean;

    /**
     * Given a code action fill in its {@linkcode lsp.CodeAction.edit edit}-property. Changes to
     * all other properties, like title, are ignored. A code action that has an edit
     * will not be resolved.
     *
     * *Note* that a code action provider that returns commands, not code actions, cannot successfully
     * implement this function. Returning commands is deprecated and instead code actions should be
     * returned.
     *
     * @param codeAction A code action.
     * @param token A cancellation token.
     * @returns The resolved code action or a thenable that resolves to such. It is OK to return the given
     * `item`. When no result is returned, the given `item` will be used.
     */
    resolveCodeAction?(codeAction: T, token: lsp.CancellationToken): ProviderResult<T>;
}

/**
 * Metadata about the type of code actions that a {@link CodeActionProvider} provides.
 */
export interface CodeActionProviderMetadata {
    /**
     * List of {@link CodeActionKind CodeActionKinds} that a {@link CodeActionProvider} may return.
     *
     * This list is used to determine if a given `CodeActionProvider` should be invoked or not.
     * To avoid unnecessary computation, every `CodeActionProvider` should list use `providedCodeActionKinds`. The
     * list of kinds may either be generic, such as `[CodeActionKind.Refactor]`, or list out every kind provided,
     * such as `[CodeActionKind.Refactor.Extract.append('function'), CodeActionKind.Refactor.Extract.append('constant'), ...]`.
     */
    readonly providedCodeActionKinds?: readonly lsp.CodeActionKind[];
}
