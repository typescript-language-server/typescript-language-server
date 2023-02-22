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

import { basename } from 'path';
import { URI as Uri } from 'vscode-uri';
import * as languageIds from './languageIds.js';

export const enum DiagnosticLanguage {
    JavaScript,
    TypeScript
}

export const allDiagnosticLanguages = [DiagnosticLanguage.JavaScript, DiagnosticLanguage.TypeScript];

export interface LanguageDescription {
    readonly id: string;
    readonly diagnosticOwner: string;
    readonly diagnosticSource: string;
    readonly diagnosticLanguage: DiagnosticLanguage;
    readonly languageIds: readonly string[];
    readonly configFilePattern?: RegExp;
    readonly isExternal?: boolean;
    readonly standardFileExtensions: readonly string[];
}

export const standardLanguageDescriptions: LanguageDescription[] = [
    {
        id: 'typescript',
        diagnosticOwner: 'typescript',
        diagnosticSource: 'ts',
        diagnosticLanguage: DiagnosticLanguage.TypeScript,
        languageIds: [languageIds.typescript, languageIds.typescriptreact],
        configFilePattern: /^tsconfig(\..*)?\.json$/gi,
        standardFileExtensions: [
            'ts',
            'tsx',
            'cts',
            'mts',
        ],
    }, {
        id: 'javascript',
        diagnosticOwner: 'typescript',
        diagnosticSource: 'ts',
        diagnosticLanguage: DiagnosticLanguage.JavaScript,
        languageIds: [languageIds.javascript, languageIds.javascriptreact],
        configFilePattern: /^jsconfig(\..*)?\.json$/gi,
        standardFileExtensions: [
            'js',
            'jsx',
            'cjs',
            'mjs',
            'es6',
            'pac',
        ],
    },
];

export function isTsConfigFileName(fileName: string): boolean {
    return /^tsconfig\.(.+\.)?json$/i.test(basename(fileName));
}

export function isJsConfigOrTsConfigFileName(fileName: string): boolean {
    return /^[jt]sconfig\.(.+\.)?json$/i.test(basename(fileName));
}

export function doesResourceLookLikeATypeScriptFile(resource: Uri): boolean {
    return /\.(tsx?|mts|cts)$/i.test(resource.fsPath);
}

export function doesResourceLookLikeAJavaScriptFile(resource: Uri): boolean {
    return /\.(jsx?|mjs|cjs)$/i.test(resource.fsPath);
}
