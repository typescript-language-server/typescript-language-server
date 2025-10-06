/*
 * Copyright (C) 2024 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as lsp from 'vscode-languageserver';
import { type ITypeScriptServiceClient } from '../../typescriptService.js';
import type FileConfigurationManager from '../fileConfigurationManager.js';
import { CommandManager } from '../../commands/commandManager.js';
import { LspDocument } from '../../document.js';
import { type CodeActionProvider, type TsCodeAction } from './codeActionProvider.js';
import { TypeScriptAutoFixProvider } from './fixAll.js';
import { TypeScriptQuickFixProvider } from './quickFix.js';
import { nulToken } from '../../utils/cancellation.js';
import { type SupportedFeatures } from '../../ts-protocol.js';
import { type DiagnosticsManager } from '../../diagnosticsManager.js';

interface ResolveData {
    globalId?: number;
    providerId?: number;
}

/**
 * Requests code actions from registered providers and ensures that returned code actions have global IDs assigned
 * and are cached for the purpose of codeAction/resolve request.
 */
export class CodeActionManager {
    private providerMap = new Map<number, CodeActionProvider>;
    private nextProviderId = 1;
    private resolveCodeActionsMap = new Map<number, TsCodeAction>;
    private nextGlobalCodeActionId = 1;

    constructor(
        client: ITypeScriptServiceClient,
        fileConfigurationManager: FileConfigurationManager,
        commandManager: CommandManager,
        diagnosticsManager: DiagnosticsManager,
        private readonly features: SupportedFeatures,
    ) {
        this.addProvider(new TypeScriptAutoFixProvider(client, fileConfigurationManager, diagnosticsManager));
        this.addProvider(new TypeScriptQuickFixProvider(client, fileConfigurationManager, commandManager, diagnosticsManager, features));
    }

    public get kinds(): lsp.CodeActionKind[] {
        const allKinds: lsp.CodeActionKind[] = [];

        for (const [_, provider] of this.providerMap) {
            allKinds.push(...provider.getMetadata().providedCodeActionKinds || []);
        }

        return allKinds;
    }

    public async provideCodeActions(document: LspDocument, range: lsp.Range, context: lsp.CodeActionContext, token?: lsp.CancellationToken): Promise<(lsp.Command | lsp.CodeAction)[]> {
        this.resolveCodeActionsMap.clear();

        const allCodeActions: (lsp.Command | lsp.CodeAction)[] = [];

        for (const [providerId, provider] of this.providerMap.entries()) {
            const codeActions = await provider.provideCodeActions(document, range, context, token || nulToken);
            if (!codeActions) {
                continue;
            }

            for (const action of codeActions) {
                if (lsp.Command.is(action)) {
                    allCodeActions.push(action);
                    continue;
                }

                const lspCodeAction = action.toLspCodeAction();

                if (provider.isCodeActionResolvable(action)) {
                    const globalId = this.nextGlobalCodeActionId++;
                    this.resolveCodeActionsMap.set(globalId, action);
                    lspCodeAction.data = {
                        globalId,
                        providerId,
                    } satisfies ResolveData;
                }

                allCodeActions.push(lspCodeAction);
            }
        }

        return allCodeActions;
    }

    public async resolveCodeAction(codeAction: lsp.CodeAction, token?: lsp.CancellationToken): Promise<lsp.CodeAction> {
        if (!this.features.codeActionResolveSupport) {
            return codeAction;
        }

        const { globalId, providerId } = codeAction.data as ResolveData || {};
        if (globalId === undefined || providerId === undefined) {
            return codeAction;
        }

        const provider = this.providerMap.get(providerId);
        if (!provider || !provider.resolveCodeAction) {
            return codeAction;
        }

        const tsCodeAction = this.resolveCodeActionsMap.get(globalId);
        if (!tsCodeAction || !providerId) {
            return codeAction;
        }

        const resolvedTsCodeAction = await provider.resolveCodeAction(tsCodeAction, token || nulToken);
        if (!resolvedTsCodeAction) {
            return codeAction;
        }

        const lspCodeAction = resolvedTsCodeAction.toLspCodeAction();
        for (const property of this.features.codeActionResolveSupport.properties as Array<keyof lsp.CodeAction>) {
            if (property in lspCodeAction) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                codeAction[property] = lspCodeAction[property];
            }
        }

        return codeAction;
    }

    private addProvider(provider: CodeActionProvider): void {
        this.providerMap.set(this.nextProviderId++, provider);
    }
}
