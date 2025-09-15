/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as lsp from 'vscode-languageserver';
import { Commands } from './commands.js';
import type { ts, SupportedFeatures } from './ts-protocol.js';

// Defining locally until new version of vscode-languageserver is reladed.
namespace CodeActionKind {
    export const RefactorMove = 'refactor.move';
}

export function provideRefactors(refactors: ts.server.protocol.ApplicableRefactorInfo[], args: ts.server.protocol.FileRangeRequestArgs, features: SupportedFeatures): lsp.CodeAction[] {
    const actions: lsp.CodeAction[] = [];
    for (const refactor of refactors) {
        if (refactor.inlineable === false) {
            actions.push(asSelectRefactoring(refactor, args));
        } else {
            const relevantActions = refactor.actions.filter(action => {
                if (action.notApplicableReason && !features.codeActionDisabledSupport) {
                    return false;
                }
                if (action.isInteractive && (!features.moveToFileCodeActionSupport || action.name !== 'Move to file')) {
                    return false;
                }
                return true;
            });
            for (const action of relevantActions) {
                actions.push(asApplyRefactoring(action, refactor, args));
            }
        }
    }
    return actions;
}

export function asSelectRefactoring(refactor: ts.server.protocol.ApplicableRefactorInfo, args: ts.server.protocol.FileRangeRequestArgs): lsp.CodeAction {
    return lsp.CodeAction.create(
        refactor.description,
        lsp.Command.create(refactor.description, Commands.SELECT_REFACTORING, refactor, args),
        lsp.CodeActionKind.Refactor,
    );
}

export function asApplyRefactoring(action: ts.server.protocol.RefactorActionInfo, refactor: ts.server.protocol.ApplicableRefactorInfo, args: ts.server.protocol.FileRangeRequestArgs): lsp.CodeAction {
    const codeAction = lsp.CodeAction.create(action.description, asKind(action));
    if (action.notApplicableReason) {
        codeAction.disabled = { reason: action.notApplicableReason };
    } else {
        codeAction.command = lsp.Command.create(
            action.description,
            Commands.APPLY_REFACTORING,
            {
                ...args,
                refactor: refactor.name,
                action: action.name,
            },
        );
    }
    return codeAction;
}

function asKind(action: ts.server.protocol.RefactorActionInfo): lsp.CodeActionKind {
    if (action.kind) {
        return action.kind;
    }
    if (action.name.startsWith('function_')) {
        return `${lsp.CodeActionKind.RefactorExtract}.function`;
    }
    if (action.name.startsWith('constant_')) {
        return `${lsp.CodeActionKind.RefactorExtract}.constant`;
    }
    if (action.name.startsWith('Extract to type alias')) {
        return `${lsp.CodeActionKind.RefactorExtract}.type`;
    }
    if (action.name.startsWith('Extract to interface')) {
        return `${lsp.CodeActionKind.RefactorExtract}.interface`;
    }
    if (action.name.startsWith('Move to file')) {
        return `${CodeActionKind.RefactorMove}.file`;
    }
    if (action.name.startsWith('Move to a new file')) {
        return `${CodeActionKind.RefactorMove}.newFile`;
    }
    if (action.name.startsWith('Convert namespace import') || action.name.startsWith('Convert named imports')) {
        return `${lsp.CodeActionKind.RefactorRewrite}.import`;
    }
    if (action.name.startsWith('Convert default export') || action.name.startsWith('Convert named export')) {
        return `${lsp.CodeActionKind.RefactorRewrite}.export`;
    }
    if (action.name.startsWith('Convert parameters to destructured object')) {
        return `${lsp.CodeActionKind.RefactorRewrite}.parameters.toDestructured`;
    }
    if (action.name.startsWith('Generate \'get\' and \'set\' accessors')) {
        return `${lsp.CodeActionKind.RefactorRewrite}.property.generateAccessors`;
    }
    return lsp.CodeActionKind.Refactor;
}
