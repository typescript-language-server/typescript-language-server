/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

export namespace Commands {
    export const APPLY_WORKSPACE_EDIT = "_typescript.applyWorkspaceEdit";
    export const APPLY_CODE_ACTION = "_typescript.applyCodeAction";
    export const APPLY_REFACTORING = "_typescript.applyRefactoring";
    export const ORGANIZE_IMPORTS = '_typescript.organizeImports';
    export const APPLY_RENAME_FILE = '_typescript.applyRenameFile';
    /** Commands below should be implemented by the client */
    export const APPLY_COMPLETION_CODE_ACTION = "_typescript.applyCompletionCodeAction";
    export const SELECT_REFACTORING = '_typescript.selectRefactoring'
}
