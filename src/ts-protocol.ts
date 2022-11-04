/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * **IMPORTANT** this module should not depend on `vscode-languageserver` only protocol and types
 */
import lsp from 'vscode-languageserver-protocol';
import tslib from 'typescript/lib/tsserverlibrary.js';
import type { TraceValue } from './tsServer/tracer.js';

import tsp = tslib.server.protocol;

export { tslib, tsp };

export namespace TypeScriptRenameRequest {
    export const type = new lsp.RequestType<lsp.TextDocumentPositionParams, void, void>('_typescript.rename');
}

declare module 'typescript/lib/tsserverlibrary.js' {
    namespace server.protocol {
        enum CommandTypes {
            // Needed because it's not considered part of the public API - https://github.com/microsoft/TypeScript/issues/51410
            EncodedSemanticClassificationsFull = 'encodedSemanticClassifications-full',
        }
    }
}

export const enum EventTypes {
    ConfigFileDiag = 'configFileDiag',
    SyntaxDiag = 'syntaxDiag',
    SementicDiag = 'semanticDiag',
    SuggestionDiag = 'suggestionDiag',
    ProjectLoadingStart = 'projectLoadingStart',
    ProjectLoadingFinish = 'projectLoadingFinish',
}

export class KindModifiers {
    public static readonly optional = 'optional';
    public static readonly deprecated = 'deprecated';
    public static readonly dtsFile = '.d.ts';
    public static readonly tsFile = '.ts';
    public static readonly tsxFile = '.tsx';
    public static readonly jsFile = '.js';
    public static readonly jsxFile = '.jsx';
    public static readonly jsonFile = '.json';

    public static readonly fileExtensionKindModifiers = [
        KindModifiers.dtsFile,
        KindModifiers.tsFile,
        KindModifiers.tsxFile,
        KindModifiers.jsFile,
        KindModifiers.jsxFile,
        KindModifiers.jsonFile,
    ];
}

const SYMBOL_DISPLAY_PART_KIND_MAP: Record<keyof typeof tslib.SymbolDisplayPartKind, tslib.SymbolDisplayPartKind> = {
    aliasName: 0,
    className: 1,
    enumName: 2,
    fieldName: 3,
    interfaceName: 4,
    keyword: 5,
    lineBreak: 6,
    numericLiteral: 7,
    stringLiteral: 8,
    localName: 9,
    methodName: 10,
    moduleName: 11,
    operator: 12,
    parameterName: 13,
    propertyName: 14,
    punctuation: 15,
    space: 16,
    text: 17,
    typeParameterName: 18,
    enumMemberName: 19,
    functionName: 20,
    regularExpressionLiteral: 21,
    link: 22,
    linkName: 23,
    linkText: 24,
};

export function toSymbolDisplayPartKind(kind: string): tslib.SymbolDisplayPartKind {
    return SYMBOL_DISPLAY_PART_KIND_MAP[kind as keyof typeof tslib.SymbolDisplayPartKind];
}

export interface SupportedFeatures {
    codeActionDisabledSupport?: boolean;
    completionInsertReplaceSupport?: boolean;
    completionLabelDetails?: boolean;
    completionSnippets?: boolean;
    definitionLinkSupport?: boolean;
    diagnosticsTagSupport?: boolean;
}

export interface TypeScriptPlugin {
    name: string;
    location: string;
}

export interface TypeScriptInitializationOptions {
    disableAutomaticTypingAcquisition?: boolean;
    hostInfo?: string;
    locale?: string;
    maxTsServerMemory?: number;
    npmLocation?: string;
    plugins: TypeScriptPlugin[];
    preferences?: tsp.UserPreferences;
    tsserver?: TsserverOptions;
}

interface TsserverOptions {
    /**
     * The path to the directory where the `tsserver` log files will be created.
     * If not provided, the log files will be created within the workspace, inside the `.log` directory.
     * If no workspace root is provided when initializating the server and no custom path is specified then
     * the logs will not be created.
     * @default undefined
     */
    logDirectory?: string;
    /**
     * Verbosity of the information logged into the `tsserver` log files.
     *
     * Log levels from least to most amount of details: `'terse'`, `'normal'`, `'requestTime`', `'verbose'`.
     * Enabling particular level also enables all lower levels.
     *
     * @default 'off'
     */
    logVerbosity?: 'off' | 'terse' | 'normal' | 'requestTime' | 'verbose';
    /**
     * The path to the `tsserver.js` file or the typescript lib directory. For example: `/Users/me/typescript/lib/tsserver.js`.
     */
    path?: string;
    /**
     * The verbosity of logging the tsserver communication through the LSP messages.
     * This doesn't affect the file logging.
     * @default 'off'
     */
    trace?: TraceValue;
}

export type TypeScriptInitializeParams = lsp.InitializeParams & {
    initializationOptions?: Partial<TypeScriptInitializationOptions>;
};
