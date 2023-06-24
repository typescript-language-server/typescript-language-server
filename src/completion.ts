/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as lsp from 'vscode-languageserver';
import { LspDocument } from './document.js';
import { toTextEdit, normalizePath } from './protocol-translation.js';
import { Commands } from './commands.js';
import { TspClient } from './tsp-client.js';
import { CommandTypes, KindModifiers, ScriptElementKind, SupportedFeatures, SymbolDisplayPartKind, toSymbolDisplayPartKind } from './ts-protocol.js';
import type { ts } from './ts-protocol.js';
import * as Previewer from './utils/previewer.js';
import { IFilePathToResourceConverter } from './utils/previewer.js';
import SnippetString from './utils/SnippetString.js';
import { Range, Position } from './utils/typeConverters.js';
import type { WorkspaceConfigurationCompletionOptions } from './configuration-manager.js';

interface ParameterListParts {
    readonly parts: ReadonlyArray<ts.server.protocol.SymbolDisplayPart>;
    readonly hasOptionalParameters: boolean;
}

export interface CompletionContext {
    readonly isMemberCompletion: boolean;
    readonly dotAccessorContext?: {
        range: lsp.Range;
        text: string;
    };
    readonly line: string;
    readonly optionalReplacementRange: lsp.Range | undefined;
}

export function asCompletionItem(
    entry: ts.server.protocol.CompletionEntry,
    file: string,
    position: lsp.Position,
    document: LspDocument,
    filePathConverter: IFilePathToResourceConverter,
    options: WorkspaceConfigurationCompletionOptions,
    features: SupportedFeatures,
    completionContext: CompletionContext,
): lsp.CompletionItem | null {
    const item: lsp.CompletionItem = {
        label: entry.name,
        kind: asCompletionItemKind(entry.kind),
        sortText: entry.sortText,
        preselect: entry.isRecommended,
        data: {
            file,
            line: position.line + 1,
            offset: position.character + 1,
            entryNames: [
                entry.source || entry.data ? {
                    name: entry.name,
                    source: entry.source,
                    data: entry.data,
                } : entry.name,
            ],
        },
    };

    if (features.completionCommitCharactersSupport) {
        item.commitCharacters = asCommitCharacters(entry.kind);
    }

    if (features.completionLabelDetails) {
        item.labelDetails = entry.labelDetails;
    }

    if (entry.source && entry.hasAction) {
        // De-prioritze auto-imports
        // https://github.com/Microsoft/vscode/issues/40311
        item.sortText = `\uffff${entry.sortText}`;
    }

    const { isSnippet, replacementSpan, sourceDisplay } = entry;
    if (isSnippet && !features.completionSnippets) {
        return null;
    }
    if (features.completionSnippets && (isSnippet || canCreateSnippetOfFunctionCall(item.kind, options))) {
        // Import statements, Functions and Methods can result in a snippet completion when resolved.
        item.insertTextFormat = lsp.InsertTextFormat.Snippet;
    }
    if (sourceDisplay) {
        item.detail = Previewer.plainWithLinks(sourceDisplay, filePathConverter);
    }

    const { line, optionalReplacementRange, isMemberCompletion, dotAccessorContext } = completionContext;
    let range = getRangeFromReplacementSpan(replacementSpan, optionalReplacementRange, position, document, features);
    let { insertText } = entry;
    if (!features.completionDisableFilterText) {
        item.filterText = getFilterText(entry, optionalReplacementRange, line, insertText);
    }

    if (isMemberCompletion && dotAccessorContext && !entry.isSnippet) {
        const newInsertText = dotAccessorContext.text + (insertText || item.label);
        if (!features.completionDisableFilterText) {
            item.filterText = newInsertText;
        }
        if (!range) {
            if (features.completionInsertReplaceSupport && optionalReplacementRange) {
                range = {
                    insert: dotAccessorContext.range,
                    replace: Range.union(dotAccessorContext.range, optionalReplacementRange),
                };
            } else {
                range = { replace: dotAccessorContext.range };
            }
            insertText = newInsertText;
        }
    }

    if (entry.kindModifiers) {
        const kindModifiers = new Set(entry.kindModifiers.split(/,|\s+/g));
        if (kindModifiers.has(KindModifiers.optional)) {
            if (!insertText) {
                insertText = item.label;
            }
            if (!item.filterText) {
                item.filterText = item.label;
            }
            item.label += '?';
        }

        if (kindModifiers.has(KindModifiers.deprecated)) {
            item.tags = [lsp.CompletionItemTag.Deprecated];
        }

        if (entry.kind === ScriptElementKind.scriptElement) {
            for (const extModifier of KindModifiers.fileExtensionKindModifiers) {
                if (kindModifiers.has(extModifier)) {
                    if (entry.name.toLowerCase().endsWith(extModifier)) {
                        item.detail = entry.name;
                    } else {
                        item.detail = entry.name + extModifier;
                    }
                    break;
                }
            }
        }
    }

    if (range) {
        item.textEdit = range.insert
            ? lsp.InsertReplaceEdit.create(insertText || item.label, range.insert, range.replace)
            : lsp.TextEdit.replace(range.replace, insertText || item.label);
    } else {
        item.insertText = insertText;
    }

    return item;
}

function getRangeFromReplacementSpan(
    replacementSpan: ts.server.protocol.TextSpan | undefined,
    optionalReplacementRange: lsp.Range | undefined,
    position: lsp.Position,
    document: LspDocument,
    features: SupportedFeatures,
): { insert?: lsp.Range; replace: lsp.Range; } | undefined {
    if (replacementSpan) {
        // If TS provides an explicit replacement span with an entry, we should use it and not provide an insert.
        return {
            replace: ensureRangeIsOnSingleLine(Range.fromTextSpan(replacementSpan), document),
        };
    }
    if (features.completionInsertReplaceSupport && optionalReplacementRange) {
        const range = ensureRangeIsOnSingleLine(optionalReplacementRange, document);
        return {
            insert: lsp.Range.create(range.start, position),
            replace: range,
        };
    }
}

function getFilterText(entry: ts.server.protocol.CompletionEntry, wordRange: lsp.Range | undefined, line: string, insertText: string | undefined): string | undefined {
    // Handle private field completions
    if (entry.name.startsWith('#')) {
        const wordStart = wordRange ? line.charAt(wordRange.start.character) : undefined;
        if (insertText) {
            if (insertText.startsWith('this.#')) {
                return wordStart === '#' ? insertText : insertText.replace(/&this\.#/, '');
            } else {
                return wordStart;
            }
        } else {
            return wordStart === '#' ? undefined : entry.name.replace(/^#/, '');
        }
    }

    // For `this.` completions, generally don't set the filter text since we don't want them to be overly prioritized. #74164
    if (insertText?.startsWith('this.')) {
        return undefined;
    }

    // Handle the case:
    // ```
    // const xyz = { 'ab c': 1 };
    // xyz.ab|
    // ```
    // In which case we want to insert a bracket accessor but should use `.abc` as the filter text instead of
    // the bracketed insert text.
    if (insertText?.startsWith('[')) {
        return insertText.replace(/^\[['"](.+)[['"]\]$/, '.$1');
    }

    // In all other cases, fallback to using the insertText
    return insertText;
}

function ensureRangeIsOnSingleLine(range: lsp.Range, document: LspDocument): lsp.Range {
    if (range.start.line !== range.end.line) {
        return lsp.Range.create(range.start, document.getLineEnd(range.start.line));
    }
    return range;
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

export async function asResolvedCompletionItem(
    item: lsp.CompletionItem,
    details: ts.server.protocol.CompletionEntryDetails,
    document: LspDocument | undefined,
    client: TspClient,
    filePathConverter: IFilePathToResourceConverter,
    options: WorkspaceConfigurationCompletionOptions,
    features: SupportedFeatures,
): Promise<lsp.CompletionItem> {
    item.detail = asDetail(details, filePathConverter);
    const { documentation, tags } = details;
    item.documentation = Previewer.markdownDocumentation(documentation, tags, filePathConverter);
    const filepath = normalizePath(item.data.file);
    if (details.codeActions?.length) {
        item.additionalTextEdits = asAdditionalTextEdits(details.codeActions, filepath);
        item.command = asCommand(details.codeActions, item.data.file);
    }

    if (document && features.completionSnippets && canCreateSnippetOfFunctionCall(item.kind, options)) {
        const { line, offset } = item.data;
        const position = Position.fromLocation({ line, offset });
        const shouldCompleteFunction = await isValidFunctionCompletionContext(filepath, position, client, document);
        if (shouldCompleteFunction) {
            createSnippetOfFunctionCall(item, details);
        }
    }

    return item;
}

async function isValidFunctionCompletionContext(filepath: string, position: lsp.Position, client: TspClient, document: LspDocument): Promise<boolean> {
    // Workaround for https://github.com/Microsoft/TypeScript/issues/12677
    // Don't complete function calls inside of destructive assigments or imports
    try {
        const args: ts.server.protocol.FileLocationRequestArgs = Position.toFileLocationRequestArgs(filepath, position);
        const response = await client.request(CommandTypes.Quickinfo, args);
        if (response.type === 'response' && response.body) {
            switch (response.body.kind) {
                case 'var':
                case 'let':
                case 'const':
                case 'alias':
                    return false;
            }
        }
    } catch {
        // Noop
    }

    // Don't complete function call if there is already something that looks like a function call
    // https://github.com/microsoft/vscode/issues/18131
    const after = document.getLine(position.line).slice(position.character);
    return after.match(/^[a-z_$0-9]*\s*\(/gi) === null;
}

function canCreateSnippetOfFunctionCall(kind: lsp.CompletionItemKind | undefined, options: WorkspaceConfigurationCompletionOptions): boolean {
    return options.completeFunctionCalls === true && (kind === lsp.CompletionItemKind.Function || kind === lsp.CompletionItemKind.Method);
}

function createSnippetOfFunctionCall(item: lsp.CompletionItem, detail: ts.server.protocol.CompletionEntryDetails): void {
    const { displayParts } = detail;
    const parameterListParts = getParameterListParts(displayParts);
    const snippet = new SnippetString();
    snippet.appendText(`${item.insertText || item.textEdit?.newText || item.label}(`);
    appendJoinedPlaceholders(snippet, parameterListParts.parts, ', ');
    if (parameterListParts.hasOptionalParameters) {
        snippet.appendTabstop();
    }
    snippet.appendText(')');
    snippet.appendTabstop(0);
    item.insertText = snippet.value;
    item.insertTextFormat = lsp.InsertTextFormat.Snippet;
    if (item.textEdit) {
        item.textEdit.newText = snippet.value;
    }
}

function getParameterListParts(displayParts: ReadonlyArray<ts.server.protocol.SymbolDisplayPart>): ParameterListParts {
    const parts: ts.server.protocol.SymbolDisplayPart[] = [];
    let isInMethod = false;
    let hasOptionalParameters = false;
    let parenCount = 0;
    let braceCount = 0;

    outer: for (let i = 0; i < displayParts.length; ++i) {
        const part = displayParts[i];
        switch (toSymbolDisplayPartKind(part.kind)) {
            case SymbolDisplayPartKind.methodName:
            case SymbolDisplayPartKind.functionName:
            case SymbolDisplayPartKind.text:
            case SymbolDisplayPartKind.propertyName:
                if (parenCount === 0 && braceCount === 0) {
                    isInMethod = true;
                }
                break;

            case SymbolDisplayPartKind.parameterName:
                if (parenCount === 1 && braceCount === 0 && isInMethod) {
                    // Only take top level paren names
                    const next = displayParts[i + 1];
                    // Skip optional parameters
                    const nameIsFollowedByOptionalIndicator = next && next.text === '?';
                    // Skip this parameter
                    const nameIsThis = part.text === 'this';
                    if (!nameIsFollowedByOptionalIndicator && !nameIsThis) {
                        parts.push(part);
                    }
                    hasOptionalParameters = hasOptionalParameters || nameIsFollowedByOptionalIndicator;
                }
                break;

            case SymbolDisplayPartKind.punctuation:
                if (part.text === '(') {
                    ++parenCount;
                } else if (part.text === ')') {
                    --parenCount;
                    if (parenCount <= 0 && isInMethod) {
                        break outer;
                    }
                } else if (part.text === '...' && parenCount === 1) {
                    // Found rest parmeter. Do not fill in any further arguments
                    hasOptionalParameters = true;
                    break outer;
                } else if (part.text === '{') {
                    ++braceCount;
                } else if (part.text === '}') {
                    --braceCount;
                }
                break;
        }
    }
    return { hasOptionalParameters, parts };
}

function appendJoinedPlaceholders(snippet: SnippetString, parts: ReadonlyArray<ts.server.protocol.SymbolDisplayPart>, joiner: string): void {
    for (let i = 0; i < parts.length; ++i) {
        const paramterPart = parts[i];
        snippet.appendPlaceholder(paramterPart.text);
        if (i !== parts.length - 1) {
            snippet.appendText(joiner);
        }
    }
}

function asAdditionalTextEdits(codeActions: ts.server.protocol.CodeAction[], filepath: string): lsp.TextEdit[] | undefined {
    // Try to extract out the additionalTextEdits for the current file.
    const additionalTextEdits: lsp.TextEdit[] = [];
    for (const tsAction of codeActions) {
        // Apply all edits in the current file using `additionalTextEdits`
        if (tsAction.changes) {
            for (const change of tsAction.changes) {
                if (change.fileName === filepath) {
                    for (const textChange of change.textChanges) {
                        additionalTextEdits.push(toTextEdit(textChange));
                    }
                }
            }
        }
    }
    return additionalTextEdits.length ? additionalTextEdits : undefined;
}

function asCommand(codeActions: ts.server.protocol.CodeAction[], filepath: string): lsp.Command | undefined {
    let hasRemainingCommandsOrEdits = false;
    for (const tsAction of codeActions) {
        if (tsAction.commands) {
            hasRemainingCommandsOrEdits = true;
            break;
        }

        if (tsAction.changes) {
            for (const change of tsAction.changes) {
                if (change.fileName !== filepath) {
                    hasRemainingCommandsOrEdits = true;
                    break;
                }
            }
        }
    }

    if (hasRemainingCommandsOrEdits) {
        // Create command that applies all edits not in the current file.
        return {
            title: '',
            command: Commands.APPLY_COMPLETION_CODE_ACTION,
            arguments: [filepath, codeActions.map(codeAction => ({
                commands: codeAction.commands,
                description: codeAction.description,
                changes: codeAction.changes.filter(x => x.fileName !== filepath),
            }))],
        };
    }
}

function asDetail(
    { displayParts, sourceDisplay, source: deprecatedSource }: ts.server.protocol.CompletionEntryDetails,
    filePathConverter: IFilePathToResourceConverter,
): string | undefined {
    const result: string[] = [];
    const source = sourceDisplay || deprecatedSource;
    if (source) {
        result.push(`Auto import from '${Previewer.plainWithLinks(source, filePathConverter)}'`);
    }
    const detail = Previewer.plainWithLinks(displayParts, filePathConverter);
    if (detail) {
        result.push(detail);
    }
    return result.join('\n');
}

export function getCompletionTriggerCharacter(character: string | undefined): ts.server.protocol.CompletionsTriggerCharacter | undefined {
    switch (character) {
        case '@':
        case '#':
        case ' ':
        case '.':
        case '"':
        case '\'':
        case '`':
        case '/':
        case '<':
            return character;
        default:
            return undefined;
    }
}
