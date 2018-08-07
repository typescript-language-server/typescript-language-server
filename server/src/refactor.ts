/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as lsp from 'vscode-languageserver';
import * as tsp from 'typescript/lib/protocol';
import { Commands } from './commands';
import { toTextDocumentEdit } from './protocol-translation';
import { LspDocument } from './document';

export function provideRefactors(response: tsp.GetApplicableRefactorsResponse | undefined, result: (lsp.Command | lsp.CodeAction)[], args: tsp.FileRangeRequestArgs): void {
    if (!response || !response.body) {
        return;
    }
    for (const info of response.body) {
        if (info.inlineable === false) {
            result.push(asSelectRefactoring(info, args));
        } else {
            for (const action of info.actions) {
                result.push(asApplyRefactoring(action, info, args));
            }
        }
    }
}

export function asSelectRefactoring(info: tsp.ApplicableRefactorInfo, args: tsp.FileRangeRequestArgs): lsp.CodeAction {
    return lsp.CodeAction.create(info.description,
        lsp.Command.create(info.description, Commands.SELECT_REFACTORING, info, args),
        lsp.CodeActionKind.Refactor
    )
}

export function asApplyRefactoring(action: tsp.RefactorActionInfo, info: tsp.ApplicableRefactorInfo, args: tsp.FileRangeRequestArgs): lsp.CodeAction {
    return lsp.CodeAction.create(action.description,
        lsp.Command.create(action.description, Commands.APPLY_REFACTORING, <tsp.GetEditsForRefactorRequestArgs>{
            ...args,
            refactor: info.name,
            action: action.name
        }),
        asKind(info)
    )
}

export function asKind(refactor: tsp.RefactorActionInfo): lsp.CodeActionKind {
    if (refactor.name.startsWith('function_')) {
        return lsp.CodeActionKind.RefactorExtract + '.function';
    } else if (refactor.name.startsWith('constant_')) {
        return lsp.CodeActionKind.RefactorExtract + '.constant';
    } else if (refactor.name.startsWith('Move')) {
        return lsp.CodeActionKind.Refactor + '.move';
    }
    return lsp.CodeActionKind.Refactor;
}
