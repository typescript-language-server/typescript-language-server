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

import { ServerResponse } from '../typescriptService.js';
import type { ts } from '../ts-protocol.js';

export interface CallbackItem<R> {
    readonly onSuccess: (value: R) => void;
    readonly onError: (err: Error) => void;
    readonly queuingStartTime: number;
    readonly isAsync: boolean;
}

export class CallbackMap<R extends ts.server.protocol.Response> {
    private readonly _callbacks = new Map<number, CallbackItem<ServerResponse.Response<R> | undefined>>();
    private readonly _asyncCallbacks = new Map<number, CallbackItem<ServerResponse.Response<R> | undefined>>();

    public destroy(cause: string): void {
        const cancellation = new ServerResponse.Cancelled(cause);
        for (const callback of this._callbacks.values()) {
            callback.onSuccess(cancellation);
        }
        this._callbacks.clear();
        for (const callback of this._asyncCallbacks.values()) {
            callback.onSuccess(cancellation);
        }
        this._asyncCallbacks.clear();
    }

    public add(seq: number, callback: CallbackItem<ServerResponse.Response<R> | undefined>, isAsync: boolean): void {
        if (isAsync) {
            this._asyncCallbacks.set(seq, callback);
        } else {
            this._callbacks.set(seq, callback);
        }
    }

    public fetch(seq: number): CallbackItem<ServerResponse.Response<R> | undefined> | undefined {
        const callback = this._callbacks.get(seq) || this._asyncCallbacks.get(seq);
        this.delete(seq);
        return callback;
    }

    private delete(seq: number) {
        if (!this._callbacks.delete(seq)) {
            this._asyncCallbacks.delete(seq);
        }
    }
}
