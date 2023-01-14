/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as lsp from 'vscode-languageserver';
import { Commands } from './commands.js';
import type { ts, SupportedFeatures } from './ts-protocol.js';

export function provideRefactors(response: ts.server.protocol.GetApplicableRefactorsResponse | undefined, args: ts.server.protocol.FileRangeRequestArgs, features: SupportedFeatures): lsp.CodeAction[] {
    if (!response?.body) {
        return [];
    }
    const actions: lsp.CodeAction[] = [];
    for (const info of response.body) {
        if (info.inlineable === false) {
            actions.push(asSelectRefactoring(info, args));
        } else {
            const relevantActions = features.codeActionDisabledSupport
                ? info.actions
                : info.actions.filter(action => !action.notApplicableReason);
            for (const action of relevantActions) {
                actions.push(asApplyRefactoring(action, info, args));
            }
        }
    }
    return actions;
}

export function asSelectRefactoring(info: ts.server.protocol.ApplicableRefactorInfo, args: ts.server.protocol.FileRangeRequestArgs): lsp.CodeAction {
    return lsp.CodeAction.create(
        info.description,
        lsp.Command.create(info.description, Commands.SELECT_REFACTORING, info, args),
        lsp.CodeActionKind.Refactor,
    );
}

export function asApplyRefactoring(action: ts.server.protocol.RefactorActionInfo, info: ts.server.protocol.ApplicableRefactorInfo, args: ts.server.protocol.FileRangeRequestArgs): lsp.CodeAction {
    const codeAction = lsp.CodeAction.create(action.description, asKind(info));
    if (action.notApplicableReason) {
        codeAction.disabled = { reason: action.notApplicableReason };
    } else {
        codeAction.command = lsp.Command.create(
            action.description,
            Commands.APPLY_REFACTORING,
            {
                ...args,
                refactor: info.name,
                action: action.name,
            },
        );
    }
    return codeAction;
}

function asKind(refactor: ts.server.protocol.RefactorActionInfo): lsp.CodeActionKind {
    if (refactor.name.startsWith('function_')) {
        return `${lsp.CodeActionKind.RefactorExtract}.function`;
    } else if (refactor.name.startsWith('constant_')) {
        return `${lsp.CodeActionKind.RefactorExtract}.constant`;
    } else if (refactor.name.startsWith('Move')) {
        return `${lsp.CodeActionKind.Refactor}.move`;
    }
    return lsp.CodeActionKind.Refactor;
}
