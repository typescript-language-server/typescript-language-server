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

import fs from 'node:fs';
import { temporaryFile } from 'tempy';
import Tracer from './tracer.js';

export interface OngoingRequestCanceller {
    readonly cancellationPipeName: string | undefined;
    tryCancelOngoingRequest(seq: number): boolean;
}

export interface OngoingRequestCancellerFactory {
    create(serverId: string, tracer: Tracer): OngoingRequestCanceller;
}

const noopRequestCanceller = new class implements OngoingRequestCanceller {
    public readonly cancellationPipeName = undefined;

    public tryCancelOngoingRequest(_seq: number): boolean {
        return false;
    }
};

export const noopRequestCancellerFactory = new class implements OngoingRequestCancellerFactory {
    create(_serverId: string, _tracer: Tracer): OngoingRequestCanceller {
        return noopRequestCanceller;
    }
};

export class NodeRequestCanceller implements OngoingRequestCanceller {
    public readonly cancellationPipeName: string;

    public constructor(
        private readonly _serverId: string,
        private readonly _tracer: Tracer,
    ) {
        this.cancellationPipeName = temporaryFile({ name: 'tscancellation' });
    }

    public tryCancelOngoingRequest(seq: number): boolean {
        if (!this.cancellationPipeName) {
            return false;
        }
        this._tracer.logTrace(this._serverId, `TypeScript Server: trying to cancel ongoing request with sequence number ${seq}`);
        try {
            fs.writeFileSync(this.cancellationPipeName + String(seq), '');
        } catch {
            // noop
        }
        return true;
    }
}

export const nodeRequestCancellerFactory = new class implements OngoingRequestCancellerFactory {
    create(serverId: string, tracer: Tracer): OngoingRequestCanceller {
        return new NodeRequestCanceller(serverId, tracer);
    }
};
