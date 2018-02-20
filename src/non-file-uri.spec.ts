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
import { PublishDiagnosticsParams, Diagnostic } from 'vscode-languageserver/lib/main';
import { Deferred } from './utils';

const assert = chai.assert;
const expect = chai.expect;

describe('test non-file uris', () => {
  it('simple test', async () => {
    const gitDiag = new Deferred('gitdiag', 2000);
    const fileDiag = new Deferred('filediag', 2000);
    const fileUri = uri('module2.ts')
    const gitrevUri = 'gitrev://' + fileUri.substr(7) + "?foo=test";
    const server = await createServer({
        rootUri: uri(),
        publishDiagnostics: (diagnostics) => {
          if (diagnostics.uri === fileUri) {
            fileDiag.resolve(diagnostics.diagnostics);
          } else if (diagnostics.uri === gitrevUri) {
              gitDiag.resolve(diagnostics.diagnostics);
          } else {
              gitDiag.reject(diagnostics);
          }
        }
      });
    const doc = {
      uri: gitrevUri,
      languageId: 'typescript',
      version: 1,
      text: `
      import { nothing } from './module1';

      /**
       * A regular class
       */
      export class MyClass {
          doSomething() {
              return doStuff();
          }
      }
      `
    };
    const goodDoc = {
      uri: uri('module2.ts'),
      languageId: 'typescript',
      version: 1,
      text: readContents(filePath('module2.ts'))
    };
    server.didOpenTextDocument({
      textDocument: doc
    });
    server.didOpenTextDocument({
      textDocument: goodDoc
    });

    await gitDiag;
    await fileDiag;
  }).timeout(5000);
});