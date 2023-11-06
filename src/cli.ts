/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import lsp from 'vscode-languageserver';
import { createLspConnection } from './lsp-connection.js';

const DEFAULT_LOG_LEVEL = lsp.MessageType.Info;
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), { encoding: 'utf8' }));

const program = new Command('typescript-language-server')
    .version(version)
    .requiredOption('--stdio', 'use stdio')
    .option('--log-level <logLevel>', 'A number indicating the log level (4 = log, 3 = info, 2 = warn, 1 = error). Defaults to `2`.')
    .parse(process.argv);

const options = program.opts();

let logLevel = DEFAULT_LOG_LEVEL;
if (options.logLevel) {
    logLevel = parseInt(options.logLevel, 10);
    if (logLevel && (logLevel < 1 || logLevel > 4)) {
        console.error(`Invalid '--log-level ${logLevel}'. Falling back to 'info' level.`);
        logLevel = DEFAULT_LOG_LEVEL;
    }
}

createLspConnection({
    showMessageLevel: logLevel as lsp.MessageType,
}).listen();
