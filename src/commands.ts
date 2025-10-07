/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as lsp from 'vscode-languageserver';
import { SourceDefinitionCommand } from './features/source-definition.js';
import { TypeScriptVersionSource } from './tsServer/versionProvider.js';
import { TSServerRequestCommand } from './commands/tsserverRequests.js';

export const Commands = {
    APPLY_REFACTORING: '_typescript.applyRefactoring',
    CONFIGURE_PLUGIN: '_typescript.configurePlugin',
    ORGANIZE_IMPORTS: '_typescript.organizeImports',
    APPLY_RENAME_FILE: '_typescript.applyRenameFile',
    APPLY_COMPLETION_CODE_ACTION: '_typescript.applyCompletionCodeAction',
    /** Commands below should be implemented by the client */
    SELECT_REFACTORING: '_typescript.selectRefactoring',
    SOURCE_DEFINITION: SourceDefinitionCommand.id,
    TS_SERVER_REQUEST: TSServerRequestCommand.id,
};

type TypescriptVersionNotificationParams = {
    version: string;
    source: TypeScriptVersionSource;
};

export const TypescriptVersionNotification = new lsp.NotificationType<TypescriptVersionNotificationParams>('$/typescriptVersion');

