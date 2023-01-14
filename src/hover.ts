/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as lsp from 'vscode-languageserver';
import type { ts } from './ts-protocol.js';
import * as Previewer from './utils/previewer.js';
import { IFilePathToResourceConverter } from './utils/previewer.js';

export function asSignatureHelp(
    info: ts.server.protocol.SignatureHelpItems,
    context: lsp.SignatureHelpContext | undefined,
    filePathConverter: IFilePathToResourceConverter,
): lsp.SignatureHelp {
    const signatures = info.items.map(item => asSignatureInformation(item, filePathConverter));
    return {
        activeSignature: getActiveSignature(info, signatures, context),
        activeParameter: getActiveParameter(info),
        signatures,
    };
}

function getActiveSignature(info: ts.server.protocol.SignatureHelpItems, signatures: readonly lsp.SignatureInformation[], context?: lsp.SignatureHelpContext): number {
    // Try matching the previous active signature's label to keep it selected
    if (context?.activeSignatureHelp?.activeSignature !== undefined) {
        const previouslyActiveSignature = context.activeSignatureHelp.signatures[context.activeSignatureHelp.activeSignature];
        if (previouslyActiveSignature && context.isRetrigger) {
            const existingIndex = signatures.findIndex(other => other.label === previouslyActiveSignature.label);
            if (existingIndex !== -1) {
                return existingIndex;
            }
        }
    }

    return info.selectedItemIndex;
}

function getActiveParameter(info: ts.server.protocol.SignatureHelpItems): number {
    const activeSignature = info.items[info.selectedItemIndex];
    if (activeSignature?.isVariadic) {
        return Math.min(info.argumentIndex, activeSignature.parameters.length - 1);
    }
    return info.argumentIndex;
}

function asSignatureInformation(item: ts.server.protocol.SignatureHelpItem, filePathConverter: IFilePathToResourceConverter): lsp.SignatureInformation {
    const parameters = item.parameters.map(parameter => asParameterInformation(parameter, filePathConverter));
    const signature: lsp.SignatureInformation = {
        label: Previewer.plainWithLinks(item.prefixDisplayParts, filePathConverter),
        documentation: Previewer.markdownDocumentation(item.documentation, item.tags.filter(x => x.name !== 'param'), filePathConverter),
        parameters,
    };
    signature.label += parameters.map(parameter => parameter.label).join(Previewer.plainWithLinks(item.separatorDisplayParts, filePathConverter));
    signature.label += Previewer.plainWithLinks(item.suffixDisplayParts, filePathConverter);
    return signature;
}

function asParameterInformation(parameter: ts.server.protocol.SignatureHelpParameter, filePathConverter: IFilePathToResourceConverter): lsp.ParameterInformation {
    const { displayParts, documentation } = parameter;
    return {
        label: Previewer.plainWithLinks(displayParts, filePathConverter),
        documentation: Previewer.markdownDocumentation(documentation, undefined, filePathConverter),
    };
}

export function toTsTriggerReason(context: lsp.SignatureHelpContext): ts.server.protocol.SignatureHelpTriggerReason {
    switch (context.triggerKind) {
        case lsp.SignatureHelpTriggerKind.TriggerCharacter:
            if (context.triggerCharacter) {
                if (context.isRetrigger) {
                    return { kind: 'retrigger', triggerCharacter: context.triggerCharacter as any };
                } else {
                    return { kind: 'characterTyped', triggerCharacter: context.triggerCharacter as any };
                }
            } else {
                return { kind: 'invoked' };
            }
        case lsp.SignatureHelpTriggerKind.ContentChange:
            return context.isRetrigger ? { kind: 'retrigger' } : { kind: 'invoked' };
        case lsp.SignatureHelpTriggerKind.Invoked:
        default:
            return { kind: 'invoked' };
    }
}
