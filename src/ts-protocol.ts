/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * **IMPORTANT** this module should not depend on `vscode-languageserver` only protocol and types
 */
import * as lsp from 'vscode-languageserver-protocol';
import type tsp from 'typescript/lib/protocol.d.js';

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

export interface SupportedFeatures {
    codeActionDisabledSupport?: boolean;
    completionLabelDetails?: boolean;
    completionSnippets?: boolean;
    diagnosticsTagSupport?: boolean;
    definitionLinkSupport?: boolean;
}

export interface TypeScriptPlugin {
    name: string;
    location: string;
}

export interface TypeScriptInitializationOptions {
    disableAutomaticTypingAcquisition?: boolean;
    logVerbosity?: string;
    maxTsServerMemory?: number;
    npmLocation?: string;
    locale?: string;
    plugins: TypeScriptPlugin[];
    preferences?: tsp.UserPreferences;
    hostInfo?: string;
}

export type TypeScriptInitializeParams = lsp.InitializeParams & {
    initializationOptions?: Partial<TypeScriptInitializationOptions>;
};

export interface TypeScriptInitializeResult extends lsp.InitializeResult {
    logFileUri?: string;
}
