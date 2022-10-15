/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/*
 * Copyright (C) 2022 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import type * as lsp from 'vscode-languageserver/node.js';

export const enum MarkdownStringTextNewlineStyle {
    Paragraph = 0,
    Break = 1,
}

export class MarkdownString {
    constructor(public value = '') {}

    appendText(value: string, newlineStyle: MarkdownStringTextNewlineStyle = MarkdownStringTextNewlineStyle.Paragraph): MarkdownString {
        this.value += escapeMarkdownSyntaxTokens(value)
            .replace(/([ \t]+)/g, (_match, g1) => '&nbsp;'.repeat(g1.length))
            .replace(/>/gm, '\\>')
            .replace(/\n/g, newlineStyle === MarkdownStringTextNewlineStyle.Break ? '\\\n' : '\n\n');

        return this;
    }

    appendMarkdown(value: string): MarkdownString {
        this.value += value;
        return this;
    }

    appendCodeblock(langId: string, code: string): MarkdownString {
        this.value += '\n```';
        this.value += langId;
        this.value += '\n';
        this.value += code;
        this.value += '\n```\n';
        return this;
    }

    toMarkupContent(): lsp.MarkupContent {
        return {
            kind: 'markdown',
            value: this.value,
        };
    }
}

export function escapeMarkdownSyntaxTokens(text: string): string {
    // escape markdown syntax tokens: http://daringfireball.net/projects/markdown/syntax#backslash
    return text.replace(/[\\`*_{}[\]()#+\-!]/g, '\\$&');
}
