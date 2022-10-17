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

import vscodeUri from 'vscode-uri';
import * as lsp from 'vscode-languageserver';
import type tsp from 'typescript/lib/protocol.d.js';
import { MarkdownString } from './MarkdownString.js';

export interface IFilePathToResourceConverter {
    /**
     * Convert a typescript filepath to an URI resource.
     */
    toResource(filepath: string): vscodeUri.URI;
}

function replaceLinks(text: string): string {
    return text
        // Http(s) links
        .replace(/\{@(link|linkplain|linkcode) (https?:\/\/[^ |}]+?)(?:[| ]([^{}\n]+?))?\}/gi, (_, tag: string, link: string, text?: string) => {
            switch (tag) {
                case 'linkcode':
                    return `[\`${text ? text.trim() : link}\`](${link})`;

                default:
                    return `[${text ? text.trim() : link}](${link})`;
            }
        });
}

function processInlineTags(text: string): string {
    return replaceLinks(text);
}

function getTagBodyText(
    tag: tsp.JSDocTagInfo,
    filePathConverter: IFilePathToResourceConverter,
): string | undefined {
    if (!tag.text) {
        return undefined;
    }

    // Convert to markdown code block if it does not already contain one
    function makeCodeblock(text: string): string {
        if (/^\s*[~`]{3}/m.test(text)) {
            return text;
        }
        return '```\n' + text + '\n```';
    }

    const text = convertLinkTags(tag.text, filePathConverter);
    switch (tag.name) {
        case 'example': {
            // check for caption tags, fix for #79704
            const captionTagMatches = text.match(/<caption>(.*?)<\/caption>\s*(\r\n|\n)/);
            if (captionTagMatches && captionTagMatches.index === 0) {
                return captionTagMatches[1] + '\n' + makeCodeblock(text.substring(captionTagMatches[0].length));
            } else {
                return makeCodeblock(text);
            }
        }
        case 'author': {
            // fix obsucated email address, #80898
            const emailMatch = text.match(/(.+)\s<([-.\w]+@[-.\w]+)>/);

            if (emailMatch === null) {
                return text;
            } else {
                return `${emailMatch[1]} ${emailMatch[2]}`;
            }
        }
        case 'default':
            return makeCodeblock(text);
    }

    return processInlineTags(text);
}

function getTagDocumentation(
    tag: tsp.JSDocTagInfo,
    filePathConverter: IFilePathToResourceConverter,
): string | undefined {
    switch (tag.name) {
        case 'augments':
        case 'extends':
        case 'param':
        case 'template': {
            const body = convertLinkTags(tag.text, filePathConverter).split(/^(\S+)\s*-?\s*/);
            if (body?.length === 3) {
                const param = body[1];
                const doc = body[2];
                const label = `*@${tag.name}* \`${param}\``;
                if (!doc) {
                    return label;
                }
                return label + (doc.match(/\r\n|\n/g) ? '  \n' + processInlineTags(doc) : ` \u2014 ${processInlineTags(doc)}`);
            }
        }
    }

    // Generic tag
    const label = `*@${tag.name}*`;
    const text = getTagBodyText(tag, filePathConverter);
    if (!text) {
        return label;
    }
    return label + (text.match(/\r\n|\n/g) ? '  \n' + text : ` \u2014 ${text}`);
}

export function plainWithLinks(
    parts: readonly tsp.SymbolDisplayPart[] | string,
    filePathConverter: IFilePathToResourceConverter,
): string {
    return processInlineTags(convertLinkTags(parts, filePathConverter));
}

/**
 * Convert `@link` inline tags to markdown links
 */
function convertLinkTags(
    parts: readonly tsp.SymbolDisplayPart[] | string | undefined,
    filePathConverter: IFilePathToResourceConverter,
): string {
    if (!parts) {
        return '';
    }

    if (typeof parts === 'string') {
        return parts;
    }

    const out: string[] = [];

    let currentLink: { name?: string; target?: tsp.FileSpan; text?: string; readonly linkcode: boolean; } | undefined;
    for (const part of parts) {
        switch (part.kind) {
            case 'link':
                if (currentLink) {
                    if (currentLink.target) {
                        const link = filePathConverter.toResource(currentLink.target.file)
                            .with({
                                fragment: `L${currentLink.target.start.line},${currentLink.target.start.offset}`,
                            });

                        const linkText = currentLink.text ? currentLink.text : escapeMarkdownSyntaxTokensForCode(currentLink.name ?? '');
                        out.push(`[${currentLink.linkcode ? '`' + linkText + '`' : linkText}](${link.toString()})`);
                    } else {
                        const text = currentLink.text ?? currentLink.name;
                        if (text) {
                            if (/^https?:/.test(text)) {
                                const parts = text.split(' ');
                                if (parts.length === 1) {
                                    out.push(parts[0]);
                                } else if (parts.length > 1) {
                                    const linkText = escapeMarkdownSyntaxTokensForCode(parts.slice(1).join(' '));
                                    out.push(`[${currentLink.linkcode ? '`' + linkText + '`' : linkText}](${parts[0]})`);
                                }
                            } else {
                                out.push(escapeMarkdownSyntaxTokensForCode(text));
                            }
                        }
                    }
                    currentLink = undefined;
                } else {
                    currentLink = {
                        linkcode: part.text === '{@linkcode ',
                    };
                }
                break;

            case 'linkName':
                if (currentLink) {
                    currentLink.name = part.text;
                    currentLink.target = (part as tsp.JSDocLinkDisplayPart).target;
                }
                break;

            case 'linkText':
                if (currentLink) {
                    currentLink.text = part.text;
                }
                break;

            default:
                out.push(part.text);
                break;
        }
    }
    return processInlineTags(out.join(''));
}

export function tagsMarkdownPreview(
    tags: readonly tsp.JSDocTagInfo[],
    filePathConverter: IFilePathToResourceConverter,
): string {
    return tags.map(tag => getTagDocumentation(tag, filePathConverter)).join('  \n\n');
}

export function markdownDocumentation(
    documentation: tsp.SymbolDisplayPart[] | string | undefined,
    tags: tsp.JSDocTagInfo[] | undefined,
    filePathConverter: IFilePathToResourceConverter,
): lsp.MarkupContent | undefined {
    const out = new MarkdownString();
    addMarkdownDocumentation(out, documentation, tags, filePathConverter);
    return out.value ? out.toMarkupContent() : undefined;
}

export function addMarkdownDocumentation(
    out: MarkdownString,
    documentation: string | tsp.SymbolDisplayPart[] | undefined,
    tags: tsp.JSDocTagInfo[] | undefined,
    converter: IFilePathToResourceConverter,
): MarkdownString {
    if (documentation) {
        out.appendMarkdown(plainWithLinks(documentation, converter));
    }
    if (tags) {
        const tagsPreview = tagsMarkdownPreview(tags, converter);
        if (tagsPreview) {
            out.appendMarkdown('\n\n' + tagsPreview);
        }
    }
    return out;
}

function escapeMarkdownSyntaxTokensForCode(text: string): string {
    return text.replace(/`/g, '\\$&');
}
