/**
 * Copyright (C) 2023 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LspDocument } from '../document.js';
import { ServerResponse } from '../typescriptService.js';
import type { ts } from '../ts-protocol.js';

type Resolve<T extends ts.server.protocol.Response> = () => Promise<ServerResponse.Response<T>>;

/**
 * Caches a class of TS Server request based on document.
 */
export class CachedResponse<T extends ts.server.protocol.Response> {
    private response?: Promise<ServerResponse.Response<T>>;
    private version: number = -1;
    private document: string = '';

    /**
     * Execute a request. May return cached value or resolve the new value
     *
     * Caller must ensure that all input `resolve` functions return equivilent results (keyed only off of document).
     */
    public execute(
        document: LspDocument,
        resolve: Resolve<T>,
    ): Promise<ServerResponse.Response<T>> {
        if (this.response && this.matches(document)) {
            // Chain so that on cancellation we fall back to the next resolve
            return this.response = this.response.then(result => result.type === 'cancelled' ? resolve() : result);
        }
        return this.reset(document, resolve);
    }

    public onDocumentClose(
        document: LspDocument,
    ): void {
        if (this.document === document.uri.toString()) {
            this.response = undefined;
            this.version = -1;
            this.document = '';
        }
    }

    private matches(document: LspDocument): boolean {
        return this.version === document.version && this.document === document.uri.toString();
    }

    private async reset(
        document: LspDocument,
        resolve: Resolve<T>,
    ): Promise<ServerResponse.Response<T>> {
        this.version = document.version;
        this.document = document.uri.toString();
        return this.response = resolve();
    }
}
