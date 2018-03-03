/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as chai from 'chai';
import * as path from 'path';
import { LspServer } from './lsp-server';
import { uri, createServer, lastPosition, filePath, readContents } from './test-utils';

const assert = chai.assert;
const expect = chai.expect;

let server: LspServer;

before(async () => {
  uri()
  server = await createServer({
    rootUri: uri(),
    publishDiagnostics: () => { }
  });
});
beforeEach(() => {
  server.closeAll();
})

describe('documentHighlight', () => {
  it('simple test', async () => {
    const doc = {
      uri: uri('module2.ts'),
      languageId: 'typescript',
      version: 1,
      text: readContents(filePath('module2.ts'))
    };
    server.didOpenTextDocument({
      textDocument: doc
    });

    const result = await server.documentHighlight({
      textDocument: doc,
      position: lastPosition(doc, 'doStuff')
    });
    assert.equal(2, result.length, JSON.stringify(result, undefined, 2));
  }).timeout(10000);
});