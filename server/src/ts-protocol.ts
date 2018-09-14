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

export namespace TypeScriptRenameRequest {
    export const type = new lsp.RequestType<lsp.TextDocumentPositionParams, any, void, void>("_typescript.rename");
}

export interface TypeScriptPlugin {
    name: string
    location: string
}

export interface TypeScriptInitializationOptions {
    logVerbosity?: string
    plugins: TypeScriptPlugin[]
}

export type TypeScriptInitializeParams = lsp.InitializeParams & {
    initializationOptions?: Partial<TypeScriptInitializationOptions>
}

export interface TypeScriptInitializeResult extends lsp.InitializeResult {
    logFileUri?: string
}
