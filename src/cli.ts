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
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), { encoding: 'utf8' })) as { version: string; };

const program = new Command('typescript-language-server')
    .version(version)
    .requiredOption('--stdio', 'use stdio')
    .option<number>('--log-level <logLevel>', 'A number indicating the log level (4 = log, 3 = info, 2 = warn, 1 = error). Defaults to `2`.', value => parseInt(value, 10), 2)
    .parse(process.argv);

const options = program.opts<{ logLevel: number; }>();

let logLevel = DEFAULT_LOG_LEVEL;
if (options.logLevel && (options.logLevel < 1 || options.logLevel > 4)) {
    console.error(`Invalid '--log-level ${logLevel}'. Falling back to 'info' level.`);
    logLevel = DEFAULT_LOG_LEVEL;
}

createLspConnection({
    showMessageLevel: logLevel as lsp.MessageType,
}).listen();
