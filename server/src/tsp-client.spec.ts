/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as chai from 'chai';
import * as path from 'path';
import { TspClient } from './tsp-client';
import { ConsoleLogger } from './logger';
import { filePath, readContents } from './test-utils';
import { CommandTypes } from './tsp-command-types';
import { findPathToModule } from './modules-resolver';

const assert = chai.assert;

const executableServer = new TspClient({
  logger: new ConsoleLogger(),
  tsserverPath: 'tsserver'
});

const tsserverModuleRelativePath = path.join("typescript", "lib", "tsserver.js");
const bundled = findPathToModule(__dirname, tsserverModuleRelativePath) as string;
const moduleServer = new TspClient({
  logger: new ConsoleLogger(),
  tsserverPath: bundled
});

const servers = { executableServer, moduleServer };
Object.keys(servers).forEach(serverName => {
  const server = servers[serverName];
  server.start();

  describe('ts server client using ' + serverName, () => {
    it('completion', () => {
      const f = filePath('module2.ts')
      server.notify(CommandTypes.Open, {
        file: f,
        fileContent: readContents(f)
      });
      return server.request(CommandTypes.Completions, {
        file: f,
        line: 1,
        offset: 0,
        prefix: 'im',
        includeExternalModuleExports: true,
        includeInsertTextCompletions: true
      }).then(completions => {
        assert.equal(completions.body![1].name, "ImageData");
      });
    }).timeout(5000);

    it('references', () => {
      const f = filePath('module2.ts')
      server.notify(CommandTypes.Open, {
        file: f,
        fileContent: readContents(f)
      });
      return server.request(CommandTypes.References, {
        file: f,
        line: 8,
        offset: 16
      }).then(references => {
        assert.equal(references.body!.symbolName, "doStuff");
      });
    }).timeout(5000);

    it('documentHighlight', () => {
      const f = filePath('module2.ts')
      server.notify(CommandTypes.Open, {
        file: f,
        fileContent: readContents(f)
      });
      return server.request(CommandTypes.DocumentHighlights, {
        file: f,
        line: 8,
        offset: 16,
        filesToSearch: [f]
      }).then(response => {
        assert.isTrue(response.body!.some(({ file }) => file.endsWith('module2.ts')), JSON.stringify(response.body, undefined, 2));
        assert.isFalse(response.body!.some(({ file }) => file.endsWith('module1.ts')), JSON.stringify(response.body, undefined, 2));
      });
    }).timeout(5000);
  });

});