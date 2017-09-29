#!/usr/bin/env node
/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Command } from 'commander';
import { isWindows } from './protocol-translation';
import { createLspConnection } from './lsp-connection';

const program = new Command('typescript-lsp')
    .version(require('../package.json').version)
    .option('--stdio', 'use stdio')
    .option('--node-ipc', 'use node-ipc')
    .option('--socket <port>', 'use socket. example: --socket=5000')
    .option('--tsserver-logFile <tsServerLogFile>', 'Specify a tsserver log file. example: --tsServerLogFile=ts-logs.txt')
    .option('--tsserver-path <path>',
        `absolute path to tsserver. example: --tsserver-path=${isWindows() ? 'c:\\tsc\\tsserver.cmd' : '/bin/tsserver'}`,
        isWindows() ? 'tsserver.cmd' : 'tsserver')
    .parse(process.argv);

if (!(program.stdio || program.socket || program['node-ipc'])) {
    console.error('Connection type required (stdio, node-ipc, socket). Refer to --help for more details.');
    process.exit(1);
}

createLspConnection({
    tsserverPath: program.path || (isWindows() ? 'tsserver.cmd' : 'tsserver'),
    tsserverLogFile: program.tsServerLogFile
}).listen();
