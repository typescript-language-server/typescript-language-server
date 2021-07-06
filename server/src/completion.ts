/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as lsp from 'vscode-languageserver/node';
import type tsp from 'typescript/lib/protocol';
import { LspDocument } from './document';
import { ScriptElementKind } from './tsp-command-types';
import { asRange, toTextEdit, asPlainText, asDocumentation } from './protocol-translation';
import { Commands } from './commands';

interface TSCompletionItem extends lsp.CompletionItem {
    data: tsp.CompletionDetailsRequestArgs;
}

export function asCompletionItem(entry: tsp.CompletionEntry, file: string, position: lsp.Position, document: LspDocument): TSCompletionItem {
    const item: TSCompletionItem = {
        label: entry.name,
        kind: asCompletionItemKind(entry.kind),
        sortText: entry.sortText,
        commitCharacters: asCommitCharacters(entry.kind),
        data: {
            file,
            line: position.line + 1,
            offset: position.character + 1,
            entryNames: [
                entry.source ? { name: entry.name, source: entry.source } : entry.name
            ]
        }
    };
    if (entry.isRecommended) {
        // Make sure isRecommended property always comes first
        // https://github.com/Microsoft/vscode/issues/40325
        item.preselect = true;
    } else if (entry.source) {
        // De-prioritze auto-imports
        // https://github.com/Microsoft/vscode/issues/40311
        item.sortText = '\uffff' + entry.sortText;
    }
    if (item.kind === lsp.CompletionItemKind.Function || item.kind === lsp.CompletionItemKind.Method) {
        item.insertTextFormat = lsp.InsertTextFormat.Snippet;
    }

    let insertText = entry.insertText;
    let replacementRange = entry.replacementSpan && asRange(entry.replacementSpan);
    // Make sure we only replace a single line at most
    if (replacementRange && replacementRange.start.line !== replacementRange.end.line) {
        replacementRange = lsp.Range.create(replacementRange.start, document.getLineEnd(replacementRange.start.line));
    }
    if (insertText && replacementRange && insertText[0] === '[') { // o.x -> o['x']
        item.filterText = '.' + item.label;
    }
    if (entry.kindModifiers && entry.kindModifiers.match(/\boptional\b/)) {
        if (!insertText) {
            insertText = item.label;
        }
        if (!item.filterText) {
            item.filterText = item.label;
        }
        item.label += '?';
    }
    if (insertText && replacementRange) {
        item.textEdit = lsp.TextEdit.replace(replacementRange, insertText);
    } else {
        item.insertText = insertText;
    }
    return item;
}

function asCompletionItemKind(kind: ScriptElementKind): lsp.CompletionItemKind {
    switch (kind) {
        case ScriptElementKind.primitiveType:
        case ScriptElementKind.keyword:
            return lsp.CompletionItemKind.Keyword;
        case ScriptElementKind.constElement:
            return lsp.CompletionItemKind.Constant;
        case ScriptElementKind.letElement:
        case ScriptElementKind.variableElement:
        case ScriptElementKind.localVariableElement:
        case ScriptElementKind.alias:
            return lsp.CompletionItemKind.Variable;
        case ScriptElementKind.memberVariableElement:
        case ScriptElementKind.memberGetAccessorElement:
        case ScriptElementKind.memberSetAccessorElement:
            return lsp.CompletionItemKind.Field;
        case ScriptElementKind.functionElement:
            return lsp.CompletionItemKind.Function;
        case ScriptElementKind.memberFunctionElement:
        case ScriptElementKind.constructSignatureElement:
        case ScriptElementKind.callSignatureElement:
        case ScriptElementKind.indexSignatureElement:
            return lsp.CompletionItemKind.Method;
        case ScriptElementKind.enumElement:
            return lsp.CompletionItemKind.Enum;
        case ScriptElementKind.moduleElement:
        case ScriptElementKind.externalModuleName:
            return lsp.CompletionItemKind.Module;
        case ScriptElementKind.classElement:
        case ScriptElementKind.typeElement:
            return lsp.CompletionItemKind.Class;
        case ScriptElementKind.interfaceElement:
            return lsp.CompletionItemKind.Interface;
        case ScriptElementKind.warning:
        case ScriptElementKind.scriptElement:
            return lsp.CompletionItemKind.File;
        case ScriptElementKind.directory:
            return lsp.CompletionItemKind.Folder;
        case ScriptElementKind.string:
            return lsp.CompletionItemKind.Constant;
    }
    return lsp.CompletionItemKind.Property;
}

function asCommitCharacters(kind: ScriptElementKind): string[] | undefined {
    const commitCharacters: string[] = [];
    switch (kind) {
        case ScriptElementKind.memberGetAccessorElement:
        case ScriptElementKind.memberSetAccessorElement:
        case ScriptElementKind.constructSignatureElement:
        case ScriptElementKind.callSignatureElement:
        case ScriptElementKind.indexSignatureElement:
        case ScriptElementKind.enumElement:
        case ScriptElementKind.interfaceElement:
            commitCharacters.push('.');
            break;

        case ScriptElementKind.moduleElement:
        case ScriptElementKind.alias:
        case ScriptElementKind.constElement:
        case ScriptElementKind.letElement:
        case ScriptElementKind.variableElement:
        case ScriptElementKind.localVariableElement:
        case ScriptElementKind.memberVariableElement:
        case ScriptElementKind.classElement:
        case ScriptElementKind.functionElement:
        case ScriptElementKind.memberFunctionElement:
            commitCharacters.push('.', ',');
            commitCharacters.push('(');
            break;
    }

    return commitCharacters.length === 0 ? undefined : commitCharacters;
}

export function asResolvedCompletionItem(item: lsp.CompletionItem, details: tsp.CompletionEntryDetails): lsp.CompletionItem {
    item.detail = asDetail(details);
    item.documentation = asDocumentation(details);
    Object.assign(item, asCodeActions(details, item.data.file));
    return item;
}

function asCodeActions(details: tsp.CompletionEntryDetails, filepath: string): {
    command?: lsp.Command; additionalTextEdits?: lsp.TextEdit[];
} {
    if (!details.codeActions || !details.codeActions.length) {
        return {};
    }

    // Try to extract out the additionalTextEdits for the current file.
    // Also check if we still have to apply other workspace edits and commands
    // using a vscode command
    const additionalTextEdits: lsp.TextEdit[] = [];
    let hasRemainingCommandsOrEdits = false;
    for (const tsAction of details.codeActions) {
        if (tsAction.commands) {
            hasRemainingCommandsOrEdits = true;
        }

        // Apply all edits in the current file using `additionalTextEdits`
        if (tsAction.changes) {
            for (const change of tsAction.changes) {
                if (change.fileName === filepath) {
                    for (const textChange of change.textChanges) {
                        additionalTextEdits.push(toTextEdit(textChange));
                    }
                } else {
                    hasRemainingCommandsOrEdits = true;
                }
            }
        }
    }

    let command: lsp.Command | undefined = undefined;
    if (hasRemainingCommandsOrEdits) {
        // Create command that applies all edits not in the current file.
        command = {
            title: '',
            command: Commands.APPLY_COMPLETION_CODE_ACTION,
            arguments: [filepath, details.codeActions.map(codeAction => ({
                commands: codeAction.commands,
                description: codeAction.description,
                changes: codeAction.changes.filter(x => x.fileName !== filepath)
            }))]
        };
    }

    return {
        command,
        additionalTextEdits: additionalTextEdits.length ? additionalTextEdits : undefined
    };
}

function asDetail({ displayParts, sourceDisplay, source: deprecatedSource }: tsp.CompletionEntryDetails): string | undefined {
    const result: string[] = [];
    const source = sourceDisplay || deprecatedSource;
    if (source) {
        result.push(`Auto import from '${asPlainText(source)}'`);
    }
    const detail = asPlainText(displayParts);
    if (detail) {
        result.push(detail);
    }
    return result.join('\n');
}
