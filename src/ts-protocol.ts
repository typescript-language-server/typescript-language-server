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
import type tsp from 'typescript/lib/protocol.d.js';
import type { TraceValue } from './tsServer/tracer.js';

export namespace TypeScriptRenameRequest {
    export const type = new lsp.RequestType<lsp.TextDocumentPositionParams, void, void>('_typescript.rename');
}

export class DisplayPartKind {
    public static readonly functionName = 'functionName';
    public static readonly methodName = 'methodName';
    public static readonly parameterName = 'parameterName';
    public static readonly propertyName = 'propertyName';
    public static readonly punctuation = 'punctuation';
    public static readonly text = 'text';
}

export enum SemicolonPreference {
    Ignore = 'ignore',
    Insert = 'insert',
    Remove = 'remove'
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
