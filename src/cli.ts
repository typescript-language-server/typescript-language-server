#!/usr/bin/env node
/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Command } from 'commander';
import { getTsserverExecutable } from './utils';
import { createLspConnection } from './lsp-connection';
import * as lsp from 'vscode-languageserver';

const program = new Command('typescript-language-server')
    .version(require('../package.json').version)
    .option('--stdio', 'use stdio')
    .option('--node-ipc', 'use node-ipc')
    .option('--log-level <log-level>', 'A number indicating the log level (4 = log, 3 = info, 2 = warn, 1 = error). Defaults to `3`.')
    .option('--socket <port>', 'use socket. example: --socket=5000')
    .option('--tsserver-log-file <tsServerLogFile>', 'Specify a tsserver log file. example: --tsserver-log-file=ts-logs.txt')
    .option('--tsserver-path <path>', `Specifiy path to tsserver. example: --tsserver-path=${getTsserverExecutable()}`)
    .parse(process.argv);

if (!(program.stdio || program.socket || program['node-ipc'])) {
    console.error('Connection type required (stdio, node-ipc, socket). Refer to --help for more details.');
    process.exit(1);
}

let logLevel: number = parseInt(program['log-level'], 10);
if (logLevel && (logLevel < 1 || logLevel > 4)) {
    console.error('Invalid `--log-level ' + logLevel + '`. Falling back to `info` level.');
    logLevel = lsp.MessageType.Info;
}

createLspConnection({
    tsserverPath: program.tsserverPath as string,
    tsserverLogFile: program.tsserverLogFile as string,
    showMessageLevel: logLevel as lsp.MessageType
}).listen();
