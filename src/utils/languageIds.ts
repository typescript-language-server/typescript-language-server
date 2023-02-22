/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/*
 * Copyright (C) 2023 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { TextDocument } from 'vscode-languageserver-textdocument';

export const typescript = 'typescript';
export const typescriptreact = 'typescriptreact';
export const javascript = 'javascript';
export const javascriptreact = 'javascriptreact';
export const jsxTags = 'jsx-tags';

const jsTsLanguageModes = [
    javascript,
    javascriptreact,
    typescript,
    typescriptreact,
];

const tsLanguageModes = [typescript, typescriptreact];

export function isSupportedLanguageMode(doc: TextDocument): boolean {
    return jsTsLanguageModes.includes(doc.languageId);
}

export function isTypeScriptDocument(doc: TextDocument): boolean {
    return tsLanguageModes.includes(doc.languageId);
}
