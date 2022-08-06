/*
 * Copyright (C) 2021.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { Logger } from '../logger.js';
import { LspClient } from '../lsp-client.js';

export interface IServerOptions {
    logger: Logger;
    tsserverPath?: string;
    tsserverLogFile?: string;
    tsserverLogVerbosity?: string;
    lspClient: LspClient;
}
