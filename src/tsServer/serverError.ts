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

import type { ts } from '../ts-protocol.js';
import type { TypeScriptVersion } from './versionProvider.js';

export class TypeScriptServerError extends Error {
    public static create(
        serverId: string,
        version: TypeScriptVersion,
        response: ts.server.protocol.Response,
    ): TypeScriptServerError {
        const parsedResult = TypeScriptServerError.parseErrorText(response);
        return new TypeScriptServerError(serverId, version, response, parsedResult?.message, parsedResult?.stack);
    }

    private constructor(
        public readonly serverId: string,
        public readonly version: TypeScriptVersion,
        private readonly response: ts.server.protocol.Response,
        public readonly serverMessage: string | undefined,
        public readonly serverStack: string | undefined,
    ) {
        super(`<${serverId}> TypeScript Server Error (${version.versionString})\n${serverMessage}\n${serverStack}`);
    }

    public get serverErrorText(): string | undefined {
        return this.response.message;
    }

    public get serverCommand(): string {
        return this.response.command;
    }

    /**
     * Given a `errorText` from a tsserver request indicating failure in handling a request.
     */
    private static parseErrorText(response: ts.server.protocol.Response) {
        const errorText = response.message;
        if (errorText) {
            const errorPrefix = 'Error processing request. ';
            if (errorText.startsWith(errorPrefix)) {
                const prefixFreeErrorText = errorText.substr(errorPrefix.length);
                const newlineIndex = prefixFreeErrorText.indexOf('\n');
                if (newlineIndex >= 0) {
                    // Newline expected between message and stack.
                    const stack = prefixFreeErrorText.substring(newlineIndex + 1);
                    return {
                        message: prefixFreeErrorText.substring(0, newlineIndex),
                        stack,
                    };
                }
            }
        }
        return undefined;
    }
}
