// sync: file[extensions/typescript-language-features/src/utils/cancellation.ts] sha[f76ac124233270762d11ec3afaaaafcba53b3bbf]
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/*
 * Copyright (C) 2024 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as lsp from 'vscode-languageserver';

const noopDisposable = lsp.Disposable.create(() => {});

export const nulToken: lsp.CancellationToken = {
    isCancellationRequested: false,
    onCancellationRequested: () => noopDisposable,
};
