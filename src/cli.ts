#!/usr/bin/env node
/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Command } from 'commander';
import { getTsserverExecutable } from './utils';
import { createLspConnection } from './lsp-connection';
import * as lsp from 'vscode-languageserver/node';

const program = new Command('typescript-language-server')
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    .version(require('../package.json').version)
    .option('--stdio', 'use stdio')
    .option('--node-ipc', 'use node-ipc')
    .option('--log-level <logLevel>', 'A number indicating the log level (4 = log, 3 = info, 2 = warn, 1 = error). Defaults to `2`.')
    .option('--socket <port>', 'use socket. example: --socket=5000')
    .option('--tsserver-log-file <tsserverLogFile>', 'Specify a tsserver log file. example: --tsserver-log-file ts-logs.txt')
    .option('--tsserver-log-verbosity <tsserverLogVerbosity>', 'Specify a tsserver log verbosity (terse, normal, verbose). Defaults to `normal`.' +
      ' example: --tsserver-log-verbosity verbose')
    .option('--tsserver-path <path>', `Specify path to tsserver. example: --tsserver-path=${getTsserverExecutable()}`)
    .parse(process.argv);

const options = program.opts();

if (!(options.stdio || options.socket || options.nodeIpc)) {
    console.error('Connection type required (stdio, node-ipc, socket). Refer to --help for more details.');
    process.exit(1);
}

if (options.tsserverLogFile && !options.tsserverLogVerbosity) {
    options.tsserverLogVerbosity = 'normal';
}

let logLevel = lsp.MessageType.Warning;
if (options.logLevel) {
    logLevel = parseInt(options.logLevel, 10);
    if (logLevel && (logLevel < 1 || logLevel > 4)) {
        console.error(`Invalid '--log-level ${logLevel}'. Falling back to 'info' level.`);
        logLevel = lsp.MessageType.Warning;
    }
}

createLspConnection({
    tsserverPath: options.tsserverPath as string,
    tsserverLogFile: options.tsserverLogFile as string,
    tsserverLogVerbosity: options.tsserverLogVerbosity as string,
    showMessageLevel: logLevel as lsp.MessageType
}).listen();
