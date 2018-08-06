/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as lsp from 'vscode-languageserver';
import * as tsp from 'typescript/lib/protocol';
import { asDocumentation, asPlainText } from './protocol-translation';

export function asSignatureHelp(info: tsp.SignatureHelpItems): lsp.SignatureHelp {
    return {
        activeSignature: info.selectedItemIndex,
        activeParameter: getActiveParameter(info),
        signatures: info.items.map(asSignatureInformation)
    };
}

export function getActiveParameter(info: tsp.SignatureHelpItems): number {
    const activeSignature = info.items[info.selectedItemIndex];
    if (activeSignature && activeSignature.isVariadic) {
        return Math.min(info.argumentIndex, activeSignature.parameters.length - 1);
    }
    return info.argumentIndex;
}

export function asSignatureInformation(item: tsp.SignatureHelpItem): lsp.SignatureInformation {
    const parameters = item.parameters.map(asParameterInformation);
    const signature: lsp.SignatureInformation = {
        label: asPlainText(item.prefixDisplayParts),
        documentation: asDocumentation({
            documentation: item.documentation,
            tags: item.tags.filter(x => x.name !== 'param')
        }),
        parameters
    };
    signature.label += parameters.map(parameter => parameter.label).join(asPlainText(item.separatorDisplayParts));
    signature.label += asPlainText(item.suffixDisplayParts);
    return signature;
}

export function asParameterInformation(parameter: tsp.SignatureHelpParameter): lsp.ParameterInformation {
    return {
        label: asPlainText(parameter.displayParts),
        documentation: asDocumentation(parameter)
    }
}