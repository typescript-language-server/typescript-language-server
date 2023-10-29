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

import { type LspDocument } from '../document.js';

export const typescript = 'typescript';
export const typescriptreact = 'typescriptreact';
export const javascript = 'javascript';
export const javascriptreact = 'javascriptreact';
export const jsxTags = 'jsx-tags';

export const jsTsLanguageModes = [
    javascript,
    javascriptreact,
    typescript,
    typescriptreact,
];

export function isSupportedLanguageMode(doc: LspDocument): boolean {
    return [typescript, typescriptreact, javascript, javascriptreact].includes(doc.languageId);
}

export function isTypeScriptDocument(doc: LspDocument): boolean {
    return [typescript, typescriptreact].includes(doc.languageId);
}
