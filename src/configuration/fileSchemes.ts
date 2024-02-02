/**
 * Copyright (C) 2023 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const file = 'file';
export const untitled = 'untitled';
export const git = 'git';
export const github = 'github';
export const azurerepos = 'azurerepos';
// Equivalent of "untitled" in Sublime Text.
export const buffer = 'buffer';
// For yarn berry support in neovim.
export const zipfile = 'zipfile';

/** Live share scheme */
export const vsls = 'vsls';
export const walkThroughSnippet = 'walkThroughSnippet';
export const vscodeNotebookCell = 'vscode-notebook-cell';
export const memFs = 'memfs';
export const vscodeVfs = 'vscode-vfs';
export const officeScript = 'office-script';

export function getSemanticSupportedSchemes(): string[] {
    return [
        file,
        untitled,
        buffer,
        // walkThroughSnippet,
        // vscodeNotebookCell,
        zipfile,
    ];
}

/**
 * File scheme for which JS/TS language feature should be disabled
 */
export const disabledSchemes = new Set([
    git,
    vsls,
    github,
    azurerepos,
]);
