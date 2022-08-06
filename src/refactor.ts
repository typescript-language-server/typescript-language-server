/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as lsp from 'vscode-languageserver';
import type tsp from 'typescript/lib/protocol.d.js';
import { Commands } from './commands.js';

export function provideRefactors(response: tsp.GetApplicableRefactorsResponse | undefined, args: tsp.FileRangeRequestArgs): Array<lsp.CodeAction> {
    if (!response || !response.body) {
        return [];
    }
    const actions: Array<lsp.CodeAction> = [];
    for (const info of response.body) {
        if (info.inlineable === false) {
            actions.push(asSelectRefactoring(info, args));
        } else {
            for (const action of info.actions) {
                actions.push(asApplyRefactoring(action, info, args));
            }
        }
    }
    return actions;
}

export function asSelectRefactoring(info: tsp.ApplicableRefactorInfo, args: tsp.FileRangeRequestArgs): lsp.CodeAction {
    return lsp.CodeAction.create(
        info.description,
        lsp.Command.create(info.description, Commands.SELECT_REFACTORING, info, args),
        lsp.CodeActionKind.Refactor
    );
}

export function asApplyRefactoring(action: tsp.RefactorActionInfo, info: tsp.ApplicableRefactorInfo, args: tsp.FileRangeRequestArgs): lsp.CodeAction {
    return lsp.CodeAction.create(
        action.description,
        lsp.Command.create(action.description, Commands.APPLY_REFACTORING, <tsp.GetEditsForRefactorRequestArgs>{
            ...args,
            refactor: info.name,
            action: action.name
        }),
        asKind(info)
    );
}

function asKind(refactor: tsp.RefactorActionInfo): lsp.CodeActionKind {
    if (refactor.name.startsWith('function_')) {
        return lsp.CodeActionKind.RefactorExtract + '.function';
    } else if (refactor.name.startsWith('constant_')) {
        return lsp.CodeActionKind.RefactorExtract + '.constant';
    } else if (refactor.name.startsWith('Move')) {
        return lsp.CodeActionKind.Refactor + '.move';
    }
    return lsp.CodeActionKind.Refactor;
}
