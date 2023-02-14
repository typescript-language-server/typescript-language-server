/*
 * Copyright (C) 2021.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

/* eslint-disable @typescript-eslint/no-unnecessary-qualifier */

import type { Logger } from '../utils/logger.js';
import type { LspClient } from '../lsp-client.js';

export enum TsServerLogLevel {
    Off,
    Normal,
    Terse,
    RequestTime,
    Verbose,
}

export namespace TsServerLogLevel {
    export function fromString(value: string): TsServerLogLevel {
        switch (value?.toLowerCase()) {
            case 'normal':
                return TsServerLogLevel.Normal;
            case 'terse':
                return TsServerLogLevel.Terse;
            case 'requestTime':
                return TsServerLogLevel.RequestTime;
            case 'verbose':
                return TsServerLogLevel.Verbose;
            case 'off':
            default:
                return TsServerLogLevel.Off;
        }
    }

    export function toString(value: TsServerLogLevel): string {
        switch (value) {
            case TsServerLogLevel.Normal:
                return 'normal';
            case TsServerLogLevel.Terse:
                return 'terse';
            case TsServerLogLevel.Verbose:
                return 'verbose';
            case TsServerLogLevel.Off:
            default:
                return 'off';
        }
    }
}

export interface TypeScriptServiceConfiguration {
    readonly logger: Logger;
    readonly lspClient: LspClient;
    readonly tsserverLogVerbosity: TsServerLogLevel;
    readonly tsserverPath?: string;
}

export const enum SyntaxServerConfiguration {
    Never,
    Always,  // Unused
    Auto,
}

export function toSyntaxServerConfiguration(value?: string): SyntaxServerConfiguration {
    switch (value) {
        case 'never': return SyntaxServerConfiguration.Never;
        // case 'always': return SyntaxServerConfiguration.Always;
        case 'auto': return SyntaxServerConfiguration.Auto;
    }

    return SyntaxServerConfiguration.Auto;
}
