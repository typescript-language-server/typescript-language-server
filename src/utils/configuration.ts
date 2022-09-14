/*
 * Copyright (C) 2021.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import type { Logger } from '../utils/logger.js';
import type { LspClient } from '../lsp-client.js';

export interface TypeScriptServiceConfiguration {
    readonly logger: Logger;
    readonly lspClient: LspClient;
    readonly tsserverLogFile?: string;
    readonly tsserverLogVerbosity?: string;
    readonly tsserverPath?: string;
}
