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

import type { ITypeScriptServiceClient, ExecuteInfo, TypeScriptRequestTypes } from '../typescriptService.js';
import type { Command } from './commandManager.js';

interface RequestArgs {
    readonly file?: unknown;
}

export class TSServerRequestCommand implements Command {
    public static readonly ID = 'typescript.tsserverRequest';
    public readonly id = TSServerRequestCommand.ID;

    public constructor(
        private readonly tsClient: ITypeScriptServiceClient,
    ) { }

    public async execute<K extends keyof TypeScriptRequestTypes>(
        command: K,
        args: TypeScriptRequestTypes[K][0],
        config?: ExecuteInfo,
    ): Promise<unknown> {
        if (args && typeof args === 'object' && !Array.isArray(args)) {
            const requestArgs = args as RequestArgs;
            const hasFile = typeof requestArgs.file === 'string';
            if (hasFile) {
                const newArgs: TypeScriptRequestTypes[K][0] & { file?: string; } = { ...args };
                if (hasFile) {
                    const document = this.tsClient.toOpenDocument(requestArgs.file);
                    if (document) {
                        newArgs.file = document.filepath;
                    }
                }
                args = newArgs;
            }
        }

        return await this.tsClient.executeCustom(command, args, config);
    }
}
