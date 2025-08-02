/*
 * Copyright (C) 2025 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as lsp from 'vscode-languageserver';
import type { TsClient } from '../ts-client.js';
import { type ExecuteInfo, type TypeScriptRequestTypes } from '../typescriptService.js';

interface RequestArgs {
    readonly file?: unknown;
}

export class TSServerRequestCommand {
    public static readonly id = 'typescript.tsserverRequest';

    public static async execute(
        client: TsClient,
        command: keyof TypeScriptRequestTypes,
        args?: any,
        config?: ExecuteInfo,
        token?: lsp.CancellationToken,
    ): Promise<unknown> {
        if (args && typeof args === 'object' && !Array.isArray(args)) {
            const requestArgs = args as RequestArgs;
            const hasFile = typeof requestArgs.file === 'string';
            if (hasFile) {
                const newArgs = { ...args };
                if (hasFile) {
                    const document = client.toOpenDocument(requestArgs.file);
                    if (document) {
                        newArgs.file = document.filepath;
                    }
                }
                args = newArgs;
            }
        }

        if (config && token && typeof config === 'object' && !Array.isArray(config)) {
            config.token = token;
        }

        return client.executeCustom(command, args, config);
    }
}
