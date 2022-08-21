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
import type tsp from 'typescript/lib/protocol.d.js';
import { asDocumentation, asPlainText } from './protocol-translation.js';

export function asSignatureHelp(info: tsp.SignatureHelpItems, context?: lsp.SignatureHelpContext): lsp.SignatureHelp {
    const signatures = info.items.map(asSignatureInformation);
    return {
        activeSignature: getActiveSignature(info, signatures, context),
        activeParameter: getActiveParameter(info),
        signatures,
    };
}

function getActiveSignature(info: tsp.SignatureHelpItems, signatures: readonly lsp.SignatureInformation[], context?: lsp.SignatureHelpContext): number {
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

function getActiveParameter(info: tsp.SignatureHelpItems): number {
    const activeSignature = info.items[info.selectedItemIndex];
    if (activeSignature?.isVariadic) {
        return Math.min(info.argumentIndex, activeSignature.parameters.length - 1);
    }
    return info.argumentIndex;
}

function asSignatureInformation(item: tsp.SignatureHelpItem): lsp.SignatureInformation {
    const parameters = item.parameters.map(asParameterInformation);
    const signature: lsp.SignatureInformation = {
        label: asPlainText(item.prefixDisplayParts),
        documentation: asDocumentation({
            documentation: item.documentation,
            tags: item.tags.filter(x => x.name !== 'param'),
        }),
        parameters,
    };
    signature.label += parameters.map(parameter => parameter.label).join(asPlainText(item.separatorDisplayParts));
    signature.label += asPlainText(item.suffixDisplayParts);
    return signature;
}

function asParameterInformation(parameter: tsp.SignatureHelpParameter): lsp.ParameterInformation {
    return {
        label: asPlainText(parameter.displayParts),
        documentation: asDocumentation(parameter),
    };
}

export function toTsTriggerReason(context: lsp.SignatureHelpContext): tsp.SignatureHelpTriggerReason {
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
