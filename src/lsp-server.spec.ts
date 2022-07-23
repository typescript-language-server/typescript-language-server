/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as chai from 'chai';
import * as fs from 'fs-extra';
import * as lsp from 'vscode-languageserver/node';
import * as lspcalls from './lsp-protocol.calls.proposed';
import { uri, createServer, position, lastPosition, filePath, getDefaultClientCapabilities, positionAfter, readContents, TestLspServer } from './test-utils';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Commands } from './commands';
import { TypeScriptWorkspaceSettings } from './ts-protocol';
import { CodeActionKind } from './utils/types';

const assert = chai.assert;

const diagnostics: Map<string, lsp.PublishDiagnosticsParams> = new Map();

let server: TestLspServer;

before(async () => {
    server = await createServer({
        rootUri: null,
        publishDiagnostics: args => diagnostics.set(args.uri, args)
    });
    server.didChangeConfiguration({
        settings: {
            completions: {
                completeFunctionCalls: true
            }
        } as TypeScriptWorkspaceSettings
    });
});
beforeEach(() => {
    server.closeAll();
    // "closeAll" triggers final publishDiagnostics with an empty list so clear last.
    diagnostics.clear();
    server.workspaceEdits = [];
});

after(() => {
    server.closeAll();
});

describe('completion', () => {
    it('simple test', async () => {
        const doc = {
            uri: uri('bar.ts'),
            languageId: 'typescript',
            version: 1,
            text: `
        export function foo(): void {
          console.log('test')
        }
      `
        };
        server.didOpenTextDocument({
            textDocument: doc
        });
        const pos = position(doc, 'console');
        const proposals = await server.completion({ textDocument: doc, position: pos });
        assert.isNotNull(proposals);
        assert.isAtLeast(proposals!.items.length, 800);
        const item = proposals!.items.find(i => i.label === 'addEventListener');
        assert.isDefined(item);
        const resolvedItem = await server.completionResolve(item!);
        assert.isNotTrue(resolvedItem.deprecated, 'resolved item is not deprecated');
        assert.isDefined(resolvedItem.detail);
        server.didCloseTextDocument({ textDocument: doc });
    });

    it('simple JS test', async () => {
        const doc = {
            uri: uri('bar.js'),
            languageId: 'javascript',
            version: 1,
            text: `
        export function foo() {
          console.log('test')
        }
      `
        };
        server.didOpenTextDocument({
            textDocument: doc
        });
        const pos = position(doc, 'console');
        const proposals = await server.completion({ textDocument: doc, position: pos });
        assert.isNotNull(proposals);
        assert.isAtLeast(proposals!.items.length, 800);
        const item = proposals!.items.find(i => i.label === 'addEventListener');
        assert.isDefined(item);
        const resolvedItem = await server.completionResolve(item!);
        assert.isDefined(resolvedItem.detail);

        const containsInvalidCompletions = proposals!.items.reduce((accumulator, current) => {
            if (accumulator) {
                return accumulator;
            }

            // console.log as a warning is erroneously mapped to a non-function type
            return current.label === 'log' &&
                (current.kind !== lsp.CompletionItemKind.Function && current.kind !== lsp.CompletionItemKind.Method);
        }, false);

        assert.isFalse(containsInvalidCompletions);
        server.didCloseTextDocument({ textDocument: doc });
    });

    it('deprecated by JSDoc', async () => {
        const doc = {
            uri: uri('bar.ts'),
            languageId: 'typescript',
            version: 1,
            text: `
            /**
             * documentation
             * @deprecated for a reason
             */
            export function foo() {
                console.log('test')
            }

            foo(); // call me
            `
        };
        server.didOpenTextDocument({
            textDocument: doc
        });
        const pos = position(doc, 'foo(); // call me');
        const proposals = await server.completion({ textDocument: doc, position: pos });
        assert.isNotNull(proposals);
        const item = proposals!.items.find(i => i.label === 'foo');
        assert.isDefined(item);
        const resolvedItem = await server.completionResolve(item!);
        assert.isDefined(resolvedItem.detail);
        assert.isArray(resolvedItem.tags);
        assert.include(resolvedItem.tags!, lsp.CompletionItemTag.Deprecated, 'resolved item is deprecated');
        server.didCloseTextDocument({ textDocument: doc });
    });

    it('incorrect source location', async () => {
        const doc = {
            uri: uri('bar.ts'),
            languageId: 'typescript',
            version: 1,
            text: `
        export function foo(): void {
          console.log('test')
        }
      `
        };
        server.didOpenTextDocument({
            textDocument: doc
        });
        const pos = position(doc, 'foo');
        const proposals = await server.completion({ textDocument: doc, position: pos });
        assert.isNull(proposals);
        server.didCloseTextDocument({ textDocument: doc });
    });

    it('includes completions from global modules', async () => {
        const doc = {
            uri: uri('bar.ts'),
            languageId: 'typescript',
            version: 1,
            text: 'pathex'
        };
        server.didOpenTextDocument({ textDocument: doc });
        const proposals = await server.completion({ textDocument: doc, position: position(doc, 'ex') });
        assert.isNotNull(proposals);
        const pathExistsCompletion = proposals!.items.find(completion => completion.label === 'pathExists');
        assert.isDefined(pathExistsCompletion);
        server.didCloseTextDocument({ textDocument: doc });
    });

    it('includes completions with invalid identifier names', async () => {
        const doc = {
            uri: uri('bar.ts'),
            languageId: 'typescript',
            version: 1,
            text: `
                interface Foo {
                    'invalid-identifier-name': string
                }

                const foo: Foo
                foo.i
            `
        };
        server.didOpenTextDocument({ textDocument: doc });
        const proposals = await server.completion({ textDocument: doc, position: positionAfter(doc, '.i') });
        assert.isNotNull(proposals);
        const completion = proposals!.items.find(completion => completion.label === 'invalid-identifier-name');
        assert.isDefined(completion);
        assert.isDefined(completion!.textEdit);
        assert.equal(completion!.textEdit!.newText, '["invalid-identifier-name"]');
        server.didCloseTextDocument({ textDocument: doc });
    });

    it('includes detail field with package name for auto-imports', async () => {
        const doc = {
            uri: uri('bar.ts'),
            languageId: 'typescript',
            version: 1,
            text: 'readFile'
        };
        server.didOpenTextDocument({ textDocument: doc });
        const proposals = await server.completion({ textDocument: doc, position: positionAfter(doc, 'readFile') });
        assert.isNotNull(proposals);
        const completion = proposals!.items.find(completion => completion.label === 'readFile');
        assert.isDefined(completion);
        assert.strictEqual(completion!.detail, 'fs');
        assert.strictEqual(completion!.insertTextFormat, /* snippet */2);
        server.didCloseTextDocument({ textDocument: doc });
    });

    it('resolves text edit for auto-import completion', async () => {
        const doc = {
            uri: uri('bar.ts'),
            languageId: 'typescript',
            version: 1,
            text: 'readFile'
        };
        server.didOpenTextDocument({ textDocument: doc });
        const proposals = await server.completion({ textDocument: doc, position: positionAfter(doc, 'readFile') });
        assert.isNotNull(proposals);
        const completion = proposals!.items.find(completion => completion.label === 'readFile');
        assert.isDefined(completion);
        const resolvedItem = await server.completionResolve(completion!);
        assert.deepEqual(resolvedItem.additionalTextEdits, [
            {
                newText: 'import { readFile } from "fs";\n\n',
                range: {
                    end: {
                        character: 0,
                        line: 0
                    },
                    start: {
                        character: 0,
                        line: 0
                    }
                }
            }
        ]);
        server.didCloseTextDocument({ textDocument: doc });
    });

    it('resolves text edit for auto-import completion in right format', async () => {
        server.didChangeConfiguration({
            settings: {
                typescript: {
                    format: {
                        semicolons: 'remove',
                        insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: false
                    }
                }
            }
        });

        const doc = {
            uri: uri('bar.ts'),
            languageId: 'typescript',
            version: 1,
            text: 'readFile'
        };
        server.didOpenTextDocument({ textDocument: doc });
        const proposals = await server.completion({ textDocument: doc, position: positionAfter(doc, 'readFile') });
        assert.isNotNull(proposals);
        const completion = proposals!.items.find(completion => completion.label === 'readFile');
        assert.isDefined(completion);
        const resolvedItem = await server.completionResolve(completion!);
        assert.deepEqual(resolvedItem.additionalTextEdits, [
            {
                newText: 'import {readFile} from "fs"\n\n',
                range: {
                    end: {
                        character: 0,
                        line: 0
                    },
                    start: {
                        character: 0,
                        line: 0
                    }
                }
            }
        ]);
        server.didCloseTextDocument({ textDocument: doc });
        server.didChangeConfiguration({
            settings: {
                completions: {
                    completeFunctionCalls: true
                },
                typescript: {
                    format: {
                        semicolons: 'ignore',
                        insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true
                    }
                }
            }
        });
    });

    it('resolves a snippet for method completion', async () => {
        const doc = {
            uri: uri('bar.ts'),
            languageId: 'typescript',
            version: 1,
            text: `
                import fs from 'fs'
                fs.readFile
            `
        };
        server.didOpenTextDocument({ textDocument: doc });
        const proposals = await server.completion({ textDocument: doc, position: positionAfter(doc, 'readFile') });
        assert.isNotNull(proposals);
        const completion = proposals!.items.find(completion => completion.label === 'readFile');
        assert.strictEqual(completion!.insertTextFormat, lsp.InsertTextFormat.Snippet);
        assert.strictEqual(completion!.label, 'readFile');
        const resolvedItem = await server.completionResolve(completion!);
        assert.strictEqual(resolvedItem.insertTextFormat, lsp.InsertTextFormat.Snippet);
        // eslint-disable-next-line no-template-curly-in-string
        assert.strictEqual(resolvedItem.insertText, 'readFile(${1:path}, ${2:options}, ${3:callback})$0');
        server.didCloseTextDocument({ textDocument: doc });
    });

    it('includes textEdit for string completion', async () => {
        const doc = {
            uri: uri('bar.ts'),
            languageId: 'typescript',
            version: 1,
            text: `
              function test(value: "fs/read" | "hello/world") {
                return true;
              }
              
              test("fs/")
            `
        };
        server.didOpenTextDocument({ textDocument: doc });
        const proposals = await server.completion({
            textDocument: doc,
            position: positionAfter(doc, 'test("fs/'),
            context: {
                triggerCharacter: '/',
                triggerKind: 2
            }
        });
        assert.isNotNull(proposals);
        const completion = proposals!.items.find(completion => completion.label === 'fs/read');
        assert.strictEqual(completion!.label, 'fs/read');
        assert.deepStrictEqual(completion!.textEdit, {
            range: {
                start: { line: 5, character: 20 },
                end: { line: 5, character: 23 }
            },
            newText: 'fs/read'
        });
    });
});

describe('diagnostics', () => {
    it('simple test', async () => {
        const doc = {
            uri: uri('diagnosticsBar.ts'),
            languageId: 'typescript',
            version: 1,
            text: `
        export function foo(): void {
          missing('test')
        }
      `
        };
        server.didOpenTextDocument({
            textDocument: doc
        });

        await server.requestDiagnostics();
        await new Promise(resolve => setTimeout(resolve, 200));
        const resultsForFile = diagnostics.get(doc.uri);
        assert.isDefined(resultsForFile);
        const fileDiagnostics = resultsForFile!.diagnostics;
        assert.equal(fileDiagnostics.length, 1);
        assert.equal("Cannot find name 'missing'.", fileDiagnostics[0].message);
    });

    it('supports diagnostic tags', async () => {
        const doc = {
            uri: uri('diagnosticsBar.ts'),
            languageId: 'typescript',
            version: 1,
            text: `
        import { join } from 'path';

        /** @deprecated */
        function foo(): void {}
        foo();
      `
        };
        server.didOpenTextDocument({
            textDocument: doc
        });

        await server.requestDiagnostics();
        await new Promise(resolve => setTimeout(resolve, 200));
        const resultsForFile = diagnostics.get(doc.uri);
        assert.isDefined(resultsForFile);
        const fileDiagnostics = resultsForFile!.diagnostics;
        assert.equal(fileDiagnostics.length, 2);
        const unusedDiagnostic = fileDiagnostics.find(d => d.code === 6133);
        assert.isDefined(unusedDiagnostic);
        assert.deepEqual(unusedDiagnostic!.tags, [lsp.DiagnosticTag.Unnecessary]);
        const deprecatedDiagnostic = fileDiagnostics.find(d => d.code === 6387);
        assert.isDefined(deprecatedDiagnostic);
        assert.deepEqual(deprecatedDiagnostic!.tags, [lsp.DiagnosticTag.Deprecated]);
    });

    it('multiple files test', async () => {
        const doc = {
            uri: uri('multipleFileDiagnosticsBar.ts'),
            languageId: 'typescript',
            version: 1,
            text: `
    export function bar(): void {
        missing('test')
    }
`
        };
        const doc2 = {
            uri: uri('multipleFileDiagnosticsFoo.ts'),
            languageId: 'typescript',
            version: 1,
            text: `
    export function foo(): void {
        missing('test')
    }
`
        };
        server.didOpenTextDocument({
            textDocument: doc
        });
        server.didOpenTextDocument({
            textDocument: doc2
        });

        await server.requestDiagnostics();
        await new Promise(resolve => setTimeout(resolve, 200));
        assert.equal(diagnostics.size, 2);
        const diagnosticsForDoc = diagnostics.get(doc.uri);
        const diagnosticsForDoc2 = diagnostics.get(doc2.uri);
        assert.isDefined(diagnosticsForDoc);
        assert.isDefined(diagnosticsForDoc2);
        assert.equal(diagnosticsForDoc!.diagnostics.length, 1, JSON.stringify(diagnostics));
        assert.equal(diagnosticsForDoc2!.diagnostics.length, 1, JSON.stringify(diagnostics));
    });

    it('code 6133 (ununsed variable) is ignored', async () => {
        server.didChangeConfiguration({
            settings: {
                diagnostics: {
                    ignoredCodes: [6133]
                }
            }
        });

        const doc = {
            uri: uri('diagnosticsBar2.ts'),
            languageId: 'typescript',
            version: 1,
            text: `
                export function foo() {
                    const x = 42;
                    return 1;
                }
          `
        };
        server.didOpenTextDocument({
            textDocument: doc
        });

        await server.requestDiagnostics();
        await new Promise(resolve => setTimeout(resolve, 200));
        const diagnosticsForThisFile = diagnostics.get(doc.uri);
        assert.isDefined(diagnosticsForThisFile);
        const fileDiagnostics = diagnosticsForThisFile!.diagnostics;
        assert.equal(fileDiagnostics.length, 0, JSON.stringify(fileDiagnostics));
    });
});

describe('document symbol', () => {
    it('simple test', async () => {
        const doc = {
            uri: uri('bar.ts'),
            languageId: 'typescript',
            version: 1,
            text: `
        export class Foo {
          protected foo: string;
          public myFunction(arg: string) {
          }
        }
      `
        };
        server.didOpenTextDocument({
            textDocument: doc
        });
        const symbols = await server.documentSymbol({
            textDocument: doc,
            position: lsp.Position.create(1, 1)
        });

        assert.equal(`
Foo
  foo
  myFunction
`, symbolsAsString(symbols) + '\n');
    });

    it('merges interfaces correctly', async () => {
        const doc = {
            uri: uri('bar.ts'),
            languageId: 'typescript',
            version: 1,
            text: `
interface Box {
    height: number;
    width: number;
}

interface Box {
    scale: number;
}`
        };
        server.didOpenTextDocument({
            textDocument: doc
        });
        const symbols = await server.documentSymbol({
            textDocument: doc,
            position: lsp.Position.create(1, 1)
        });

        assert.equal(`
Box
  height
  width
Box
  scale
`, symbolsAsString(symbols) + '\n');
    });

    it('duplication test', async () => {
        const doc = {
            uri: uri('bar.ts'),
            languageId: 'typescript',
            version: 1,
            text: `
        export class Foo {
          protected foo: string;
          public myFunction(arg: string) {
          }
        }
        export class Foo {
          protected foo: string;
          public myFunction(arg: string) {
          }
        }
      `
        };
        server.didOpenTextDocument({
            textDocument: doc
        });
        const symbols = await server.documentSymbol({
            textDocument: doc,
            position: lsp.Position.create(1, 1)
        }) as lsp.DocumentSymbol[];

        const expectation = `
Foo
  foo
  myFunction
Foo
  foo
  myFunction
`;
        assert.equal(symbolsAsString(symbols) + '\n', expectation);
        assert.deepEqual(symbols[0].selectionRange, { start: { line: 1, character: 21 }, end: { line: 1, character: 24 } });
        assert.deepEqual(symbols[0].range, { start: { line: 1, character: 8 }, end: { line: 5, character: 9 } });

        assert.deepEqual(symbols[1].selectionRange, symbols[1].range);
        assert.deepEqual(symbols[1].range, { start: { line: 6, character: 8 }, end: { line: 10, character: 9 } });
    });
});

function symbolsAsString(symbols: (lsp.DocumentSymbol | lsp.SymbolInformation)[], indentation = ''): string {
    return symbols.map(symbol => {
        let result = '\n' + indentation + symbol.name;
        if (lsp.DocumentSymbol.is(symbol)) {
            if (symbol.children) {
                result = result + symbolsAsString(symbol.children, indentation + '  ');
            }
        } else {
            if (symbol.containerName) {
                result = result + ` in ${symbol.containerName}`;
            }
        }
        return result;
    }).join('');
}

describe('editing', () => {
    it('open and change', async () => {
        const doc = {
            uri: uri('openAndChangeBar.ts'),
            languageId: 'typescript',
            version: 1,
            text: `
        export function foo(): void {
        }
      `
        };
        server.didOpenTextDocument({
            textDocument: doc
        });
        server.didChangeTextDocument({
            textDocument: doc,
            contentChanges: [
                {
                    text: `
          export function foo(): void {
            missing('test');
          }
          `
                }
            ]
        });
        await server.requestDiagnostics();
        await new Promise(resolve => setTimeout(resolve, 200));
        const resultsForFile = diagnostics.get(doc.uri);
        assert.isDefined(resultsForFile);
        const fileDiagnostics = resultsForFile!.diagnostics;
        assert.isTrue(fileDiagnostics.length >= 1, fileDiagnostics.map(d => d.message).join(','));
        assert.equal("Cannot find name 'missing'.", fileDiagnostics[0].message);
    });
});

describe('references', () => {
    it('respects "includeDeclaration" in the request', async () => {
        const doc = {
            uri: uri('foo.ts'),
            languageId: 'typescript',
            version: 1,
            text: `
                function foo() {};
                foo();
            `
        };
        server.didOpenTextDocument({
            textDocument: doc
        });
        // Without declaration/definition.
        const position = lastPosition(doc, 'function foo()');
        let references = await server.references({
            context: { includeDeclaration: false },
            textDocument: doc,
            position
        });
        assert.strictEqual(references.length, 1);
        assert.strictEqual(references[0].range.start.line, 2);
        // With declaration/definition.
        references = await server.references({
            context: { includeDeclaration: true },
            textDocument: doc,
            position
        });
        assert.strictEqual(references.length, 2);
    });
});

describe('workspace configuration', () => {
    it('receives workspace configuration notification', async ()=>{
        const doc = {
            uri: uri('bar.ts'),
            languageId: 'typescript',
            version: 1,
            text: `
                export function foo(): void {
                  console.log('test')
                }
            `
        };
        server.didOpenTextDocument({
            textDocument: doc
        });

        server.didChangeConfiguration({
            settings: {
                typescript: {
                    format: {
                        insertSpaceAfterCommaDelimiter: true
                    }
                },
                javascript: {
                    format: {
                        insertSpaceAfterCommaDelimiter: false
                    }
                }
            }
        });

        const file = filePath('bar.ts');
        const settings = server.getWorkspacePreferencesForDocument(file);
        assert.deepEqual(settings, { format: { insertSpaceAfterCommaDelimiter: true } });
    });
});

describe('formatting', () => {
    const uriString = uri('bar.ts');
    const languageId = 'typescript';
    const version = 1;

    it('full document formatting', async () => {
        const text = 'export  function foo (     )   :  void   {   }';
        const textDocument = {
            uri: uriString, languageId, version, text
        };
        server.didOpenTextDocument({ textDocument });
        const edits = await server.documentFormatting({
            textDocument,
            options: {
                tabSize: 4,
                insertSpaces: true
            }
        });
        const result = TextDocument.applyEdits(TextDocument.create(uriString, languageId, version, text), edits);
        assert.equal('export function foo(): void { }', result);
    });

    it('indent settings (3 spaces)', async () => {
        const text = 'function foo() {\n// some code\n}';
        const textDocument = {
            uri: uriString, languageId, version, text
        };
        server.didOpenTextDocument({ textDocument });
        const edits = await server.documentFormatting({
            textDocument,
            options: {
                tabSize: 3,
                insertSpaces: true
            }
        });
        const result = TextDocument.applyEdits(TextDocument.create(uriString, languageId, version, text), edits);
        assert.equal('function foo() {\n   // some code\n}', result);
    });

    it('indent settings (tabs)', async () => {
        const text = 'function foo() {\n// some code\n}';
        const textDocument = {
            uri: uriString, languageId, version, text
        };
        server.didOpenTextDocument({ textDocument });
        const edits = await server.documentFormatting({
            textDocument,
            options: {
                tabSize: 4,
                insertSpaces: false
            }
        });
        const result = TextDocument.applyEdits(TextDocument.create(uriString, languageId, version, text), edits);
        assert.equal('function foo() {\n\t// some code\n}', result);
    });

    it('formatting setting set through workspace configuration', async () => {
        const text = 'function foo() {\n// some code\n}';
        const textDocument = {
            uri: uriString, languageId, version, text
        };
        server.didOpenTextDocument({ textDocument });

        server.didChangeConfiguration({
            settings: {
                typescript: {
                    format: {
                        newLineCharacter: '\n',
                        placeOpenBraceOnNewLineForFunctions: true
                    }
                }
            }
        });

        const edits = await server.documentFormatting({
            textDocument,
            options: {
                tabSize: 4,
                insertSpaces: false
            }
        });
        const result = TextDocument.applyEdits(TextDocument.create(uriString, languageId, version, text), edits);
        assert.equal('function foo()\n{\n\t// some code\n}', result);
    });

    it('selected range', async () => {
        const text = 'function foo() {\nconst first = 1;\nconst second = 2;\nconst val = foo( "something" );\n//const fourth = 4;\n}';
        const textDocument = {
            uri: uriString, languageId, version, text
        };
        server.didOpenTextDocument({ textDocument });
        const edits = await server.documentRangeFormatting({
            textDocument,
            range: {
                start: {
                    line: 2,
                    character: 0
                },
                end: {
                    line: 3,
                    character: 30
                }
            },
            options: {
                tabSize: 4,
                insertSpaces: true
            }
        });
        const result = TextDocument.applyEdits(TextDocument.create(uriString, languageId, version, text), edits);
        assert.equal('function foo() {\nconst first = 1;\n    const second = 2;\n    const val = foo("something");\n//const fourth = 4;\n}', result);
    });
});

describe('signatureHelp', () => {
    it('simple test', async () => {
        const doc = {
            uri: uri('bar.ts'),
            languageId: 'typescript',
            version: 1,
            text: `
        export function foo(bar: string, baz?:boolean): void {}
        foo(param1, param2)
      `
        };
        server.didOpenTextDocument({
            textDocument: doc
        });
        let result = (await server.signatureHelp({
            textDocument: doc,
            position: position(doc, 'param1')
        }))!;

        assert.equal('bar: string', result.signatures[result.activeSignature!].parameters![result.activeParameter!].label);

        result = (await server.signatureHelp({
            textDocument: doc,
            position: position(doc, 'param2')
        }))!;

        assert.equal('baz?: boolean', result.signatures[result.activeSignature!].parameters![result.activeParameter!].label);
    });
});

describe('code actions', () => {
    const doc = {
        uri: uri('bar.ts'),
        languageId: 'typescript',
        version: 1,
        text: `import { something } from "something";
    export function foo(bar: string, baz?:boolean): void {}
    foo(param1, param2)
    `
    };

    it('can provide quickfix code actions', async () => {
        server.didOpenTextDocument({
            textDocument: doc
        });
        const result = (await server.codeAction({
            textDocument: doc,
            range: {
                start: { line: 1, character: 25 },
                end: { line: 1, character: 49 }
            },
            context: {
                diagnostics: [{
                    range: {
                        start: { line: 1, character: 25 },
                        end: { line: 1, character: 49 }
                    },
                    code: 6133,
                    message: 'unused arg'
                }]
            }
        }))!;

        assert.strictEqual(result.length, 2);
        const quickFixDiagnostic = result.find(diagnostic => diagnostic.kind === 'quickfix');
        assert.isDefined(quickFixDiagnostic);
        assert.deepEqual(quickFixDiagnostic, {
            title: "Prefix 'bar' with an underscore",
            command: {
                title: "Prefix 'bar' with an underscore",
                command: '_typescript.applyWorkspaceEdit',
                arguments: [
                    {
                        documentChanges: [
                            {
                                textDocument: {
                                    uri: uri('bar.ts'),
                                    version: 1
                                },
                                edits: [
                                    {
                                        range: {
                                            start: {
                                                line: 1,
                                                character: 24
                                            },
                                            end: {
                                                line: 1,
                                                character: 27
                                            }
                                        },
                                        newText: '_bar'
                                    }
                                ]
                            }
                        ]
                    }
                ]
            },
            kind: 'quickfix'
        });
        const refactorDiagnostic = result.find(diagnostic => diagnostic.kind === 'refactor');
        assert.isDefined(refactorDiagnostic);
        assert.deepEqual(refactorDiagnostic, {
            title: 'Convert parameters to destructured object',
            command: {
                title: 'Convert parameters to destructured object',
                command: '_typescript.applyRefactoring',
                arguments: [
                    {
                        file: filePath('bar.ts'),
                        startLine: 2,
                        startOffset: 26,
                        endLine: 2,
                        endOffset: 50,
                        refactor: 'Convert parameters to destructured object',
                        action: 'Convert parameters to destructured object'
                    }
                ]
            },
            kind: 'refactor'
        });
    });

    it('can filter quickfix code actions filtered by only', async () => {
        server.didOpenTextDocument({
            textDocument: doc
        });
        const result = (await server.codeAction({
            textDocument: doc,
            range: {
                start: { line: 1, character: 25 },
                end: { line: 1, character: 49 }
            },
            context: {
                diagnostics: [{
                    range: {
                        start: { line: 1, character: 25 },
                        end: { line: 1, character: 49 }
                    },
                    code: 6133,
                    message: 'unused arg'
                }],
                only: ['refactor', 'invalid-action']
            }
        }))!;

        assert.deepEqual(result, [
            {
                command: {
                    arguments: [
                        {
                            action: 'Convert parameters to destructured object',
                            endLine: 2,
                            endOffset: 50,
                            file: filePath('bar.ts'),
                            refactor: 'Convert parameters to destructured object',
                            startLine: 2,
                            startOffset: 26
                        }
                    ],
                    command: '_typescript.applyRefactoring',
                    title: 'Convert parameters to destructured object'
                },
                kind: 'refactor',
                title: 'Convert parameters to destructured object'
            }
        ]);
    });

    it('does not provide organize imports when there are errors', async () => {
        server.didOpenTextDocument({
            textDocument: doc
        });
        await server.requestDiagnostics();
        await new Promise(resolve => setTimeout(resolve, 200));
        const result = (await server.codeAction({
            textDocument: doc,
            range: {
                start: { line: 1, character: 29 },
                end: { line: 1, character: 53 }
            },
            context: {
                diagnostics: [{
                    range: {
                        start: { line: 1, character: 25 },
                        end: { line: 1, character: 49 }
                    },
                    code: 6133,
                    message: 'unused arg'
                }],
                only: [CodeActionKind.SourceOrganizeImportsTs.value]
            }
        }))!;

        assert.deepEqual(result, []);
    });

    it('provides "add missing imports" when explicitly requested in only', async () => {
        const doc = {
            uri: uri('bar.ts'),
            languageId: 'typescript',
            version: 1,
            text: 'existsSync(\'t\');'
        };
        server.didOpenTextDocument({
            textDocument: doc
        });
        await server.requestDiagnostics();
        await new Promise(resolve => setTimeout(resolve, 200));
        const result = (await server.codeAction({
            textDocument: doc,
            range: {
                start: { line: 1, character: 29 },
                end: { line: 1, character: 53 }
            },
            context: {
                diagnostics: [],
                only: [CodeActionKind.SourceAddMissingImportsTs.value]
            }
        }))!;

        assert.deepEqual(result, [
            {
                kind: CodeActionKind.SourceAddMissingImportsTs.value,
                title: 'Add all missing imports',
                edit: {
                    documentChanges: [
                        {
                            edits: [
                                {
                                    // Prefers import that is declared in package.json.
                                    newText: 'import { existsSync } from "fs-extra";\n\n',
                                    range: {
                                        end: {
                                            character: 0,
                                            line: 0
                                        },
                                        start: {
                                            character: 0,
                                            line: 0
                                        }
                                    }
                                }
                            ],
                            textDocument: {
                                uri: uri('bar.ts'),
                                version: 1
                            }
                        }
                    ]
                }
            }
        ]);
    });

    it('provides "fix all" when explicitly requested in only', async () => {
        const doc = {
            uri: uri('bar.ts'),
            languageId: 'typescript',
            version: 1,
            text: `function foo() {
  return
  setTimeout(() => {})
}`
        };
        server.didOpenTextDocument({
            textDocument: doc
        });
        await server.requestDiagnostics();
        await new Promise(resolve => setTimeout(resolve, 200));
        const result = (await server.codeAction({
            textDocument: doc,
            range: {
                start: { line: 0, character: 0 },
                end: { line: 4, character: 0 }
            },
            context: {
                diagnostics: [],
                only: [CodeActionKind.SourceFixAllTs.value]
            }
        }))!;

        assert.deepEqual(result, [
            {
                kind: CodeActionKind.SourceFixAllTs.value,
                title: 'Fix all',
                edit: {
                    documentChanges: [
                        {
                            edits: [
                                {
                                    newText: '',
                                    range: {
                                        end: {
                                            character: 0,
                                            line: 3
                                        },
                                        start: {
                                            character: 0,
                                            line: 2
                                        }
                                    }
                                }
                            ],
                            textDocument: {
                                uri: uri('bar.ts'),
                                version: 1
                            }
                        }
                    ]
                }
            }
        ]);
    });

    it('provides organize imports when explicitly requested in only', async () => {
        const doc = {
            uri: uri('bar.ts'),
            languageId: 'typescript',
            version: 1,
            text: `import { existsSync } from 'fs';
import { accessSync } from 'fs';
existsSync('t');`
        };
        server.didOpenTextDocument({
            textDocument: doc
        });
        const result = (await server.codeAction({
            textDocument: doc,
            range: {
                start: { line: 0, character: 0 },
                end: { line: 3, character: 0 }
            },
            context: {
                diagnostics: [{
                    range: {
                        start: { line: 1, character: 25 },
                        end: { line: 1, character: 49 }
                    },
                    code: 6133,
                    message: 'unused arg'
                }],
                only: [CodeActionKind.SourceOrganizeImportsTs.value]
            }
        }))!;

        assert.deepEqual(result, [
            {
                kind: CodeActionKind.SourceOrganizeImportsTs.value,
                title: 'Organize imports',
                edit: {
                    documentChanges: [
                        {
                            edits: [
                                {
                                    newText: "import { accessSync, existsSync } from 'fs';\n",
                                    range: {
                                        end: {
                                            character: 0,
                                            line: 1
                                        },
                                        start: {
                                            character: 0,
                                            line: 0
                                        }
                                    }
                                },
                                {
                                    newText: '',
                                    range: {
                                        end: {
                                            character: 0,
                                            line: 2
                                        },
                                        start: {
                                            character: 0,
                                            line: 1
                                        }
                                    }
                                }
                            ],
                            textDocument: {
                                uri: uri('bar.ts'),
                                version: 1
                            }
                        }
                    ]
                }
            }
        ]);
    });

    it('provides "remove unused" when explicitly requested in only', async () => {
        const doc = {
            uri: uri('bar.ts'),
            languageId: 'typescript',
            version: 1,
            text: 'import { existsSync } from \'fs\';'
        };
        server.didOpenTextDocument({
            textDocument: doc
        });
        await server.requestDiagnostics();
        await new Promise(resolve => setTimeout(resolve, 200));
        const result = (await server.codeAction({
            textDocument: doc,
            range: {
                start: position(doc, 'existsSync'),
                end: positionAfter(doc, 'existsSync')
            },
            context: {
                diagnostics: [],
                only: [CodeActionKind.SourceRemoveUnusedTs.value]
            }
        }))!;

        assert.deepEqual(result, [
            {
                kind: CodeActionKind.SourceRemoveUnusedTs.value,
                title: 'Remove all unused code',
                edit: {
                    documentChanges: [
                        {
                            edits: [
                                {
                                    newText: '',
                                    range: {
                                        end: {
                                            character: 32,
                                            line: 0
                                        },
                                        start: {
                                            character: 0,
                                            line: 0
                                        }
                                    }
                                }
                            ],
                            textDocument: {
                                uri: uri('bar.ts'),
                                version: 1
                            }
                        }
                    ]
                }
            }
        ]);
    });

    it('only provides the "source.fixAll" kind if requested in only', async () => {
        const doc = {
            uri: uri('bar.ts'),
            languageId: 'typescript',
            version: 1,
            text: `
                existsSync('x');
                export function foo() {
                    return
                    setTimeout(() => {})
                }
            `
        };
        server.didOpenTextDocument({
            textDocument: doc
        });
        await server.requestDiagnostics();
        await new Promise(resolve => setTimeout(resolve, 200));
        const result = (await server.codeAction({
            textDocument: doc,
            range: {
                start: { line: 0, character: 0 },
                end: lastPosition(doc, '}')
            },
            context: {
                diagnostics: [],
                only: [CodeActionKind.SourceFixAllTs.value]
            }
        }))!;
        assert.strictEqual(result.length, 1, JSON.stringify(result, null, 2));
        assert.deepEqual(result, [
            {
                kind: CodeActionKind.SourceFixAllTs.value,
                title: 'Fix all',
                edit: {
                    documentChanges: [
                        {
                            edits: [
                                {
                                    newText: '',
                                    range: {
                                        start: {
                                            line: 4,
                                            character: 0
                                        },
                                        end: {
                                            line: 5,
                                            character: 0
                                        }
                                    }
                                }
                            ],
                            textDocument: {
                                uri: uri('bar.ts'),
                                version: 1
                            }
                        }
                    ]
                }
            }
        ]);
    });
});

describe('executeCommand', () => {
    it('apply refactoring (move to new file)', async () => {
        const fooUri = uri('foo.ts');
        const doc = {
            uri: fooUri,
            languageId: 'typescript',
            version: 1,
            text: 'export function fn(): void {}\nexport function newFn(): void {}'
        };
        server.didOpenTextDocument({
            textDocument: doc
        });
        const codeActions = (await server.codeAction({
            textDocument: doc,
            range: {
                start: position(doc, 'newFn'),
                end: position(doc, 'newFn')
            },
            context: {
                diagnostics: []
            }
        }))!;
        // Find refactoring code action.
        const applyRefactoringAction = codeActions.find(action => action.command?.command === Commands.APPLY_REFACTORING);
        assert.isDefined(applyRefactoringAction);
        // Execute refactoring action.
        await server.executeCommand({
            command: applyRefactoringAction!.command!.command,
            arguments: applyRefactoringAction!.command!.arguments
        });
        assert.equal(1, server.workspaceEdits.length);
        const { changes } = server.workspaceEdits[0].edit;
        assert.isDefined(changes);
        assert.equal(2, Object.keys(changes!).length);
        const change1 = changes![fooUri];
        assert.isDefined(change1);
        const change2 = changes![uri('newFn.ts')];
        assert.isDefined(change2);
        // Clean up file that is created on applying edit.
        fs.unlink(filePath('newFn.ts'));
        assert.deepEqual(
            change1,
            [
                {
                    range: {
                        start: {
                            line: 1,
                            character: 0
                        },
                        end: {
                            line: 1,
                            character: 32
                        }
                    },
                    newText: ''
                }
            ]
        );
        assert.deepEqual(
            change2,
            [
                {
                    range: {
                        start: {
                            line: 0,
                            character: 0
                        },
                        end: {
                            line: 0,
                            character: 0
                        }
                    },
                    newText: 'export function newFn(): void { }\n'
                }
            ]
        );
    });
});

describe('documentHighlight', () => {
    it('simple test', async () => {
        const barDoc = {
            uri: uri('bar.d.ts'),
            languageId: 'typescript',
            version: 1,
            text: `
        export declare const Bar: unique symbol;
        export interface Bar {
        }
      `
        };
        server.didOpenTextDocument({
            textDocument: barDoc
        });
        const fooDoc = {
            uri: uri('bar.ts'),
            languageId: 'typescript',
            version: 1,
            text: `
        import { Bar } from './bar';
        export class Foo implements Bar {
        }
      `
        };
        server.didOpenTextDocument({
            textDocument: fooDoc
        });

        const result = await server.documentHighlight({
            textDocument: fooDoc,
            position: lastPosition(fooDoc, 'Bar')
        });
        assert.equal(2, result.length, JSON.stringify(result, undefined, 2));
    });
});

describe('calls', () => {
    function resultToString(callsResult: lspcalls.CallsResult, direction: lspcalls.CallDirection) {
        if (!callsResult.symbol) {
            if (callsResult.calls.length > 0) {
                return '<unexpected calls>';
            }
            return '<symbol not found>';
        }
        const arrow = lspcalls.CallDirection.Outgoing === direction ? '↖' : '↘';
        const symbolToString = (symbol: lspcalls.DefinitionSymbol) =>
            `${symbol.name} (${symbol.location.uri.split('/').pop()}#${symbol.selectionRange.start.line})`;
        const out: string[] = [];
        out.push(`${arrow} ${symbolToString(callsResult.symbol)}`);
        for (const call of callsResult.calls) {
            out.push(`  ${arrow} ${symbolToString(call.symbol)} - ${call.location.uri.split('/').pop()}#${call.location.range.start.line}`);
        }
        return out.join('\n');
    }
    const doDoc = {
        uri: uri('do.ts'),
        languageId: 'typescript',
        version: 1,
        text: `
export function doStuff(): boolean {
    return two() !== undefined;
}
export function two() {
    three();
    const ttt = three;
    return ttt();
}
export function three() {
    return "".toString();
}
`
    };

    const fooDoc = {
        uri: uri('foo.ts'),
        languageId: 'typescript',
        version: 1,
        text: `import { doStuff } from './do';
class MyClass {
    doSomething() {
        doStuff();
        const x = doStuff();
        function f() {};
    }
}
export function factory() {
    new MyClass().doSomething();
}
`
    };

    function openDocuments() {
        server.didOpenTextDocument({ textDocument: doDoc });
        server.didOpenTextDocument({ textDocument: fooDoc });
    }

    it('callers: first step', async () => {
        openDocuments();
        const callsResult = await server.calls({
            textDocument: fooDoc,
            position: position(fooDoc, 'doStuff();')
        });
        assert.equal(
            resultToString(callsResult, lspcalls.CallDirection.Incoming),
            `
↘ doStuff (do.ts#1)
  ↘ doStuff (foo.ts#0) - foo.ts#0
  ↘ doSomething (foo.ts#2) - foo.ts#3
  ↘ x (foo.ts#4) - foo.ts#4
            `.trim()
        );
    });

    it('callers: second step', async () => {
        openDocuments();
        const callsResult = await server.calls({
            textDocument: fooDoc,
            position: position(fooDoc, 'doSomething() {')
        });
        assert.equal(
            resultToString(callsResult, lspcalls.CallDirection.Incoming),
            `
↘ doSomething (foo.ts#2)
  ↘ factory (foo.ts#8) - foo.ts#9
            `.trim()
        );
    });

    it.skip('callees: first step', async () => {
        openDocuments();
        const direction = lspcalls.CallDirection.Outgoing;
        const callsResult = await server.calls({
            direction,
            textDocument: fooDoc,
            position: position(fooDoc, 'doStuff()')
        });
        assert.equal(
            resultToString(callsResult, direction),
            `
↖ doStuff (do.ts#1)
  ↖ two (do.ts#4) - do.ts#2
            `.trim()
        );
    });

    it.skip('callees: second step', async () => {
        openDocuments();
        const direction = lspcalls.CallDirection.Outgoing;
        const callsResult = await server.calls({
            direction,
            textDocument: doDoc,
            position: position(doDoc, 'function two()')
        });
        assert.equal(
            resultToString(callsResult, direction),
            `
↖ two (do.ts#4)
  ↖ three (do.ts#9) - do.ts#5
  ↖ ttt (do.ts#6) - do.ts#7
            `.trim()
        );
    });
});

describe('diagnostics (no client support)', () => {
    before(async () => {
        // Remove the "textDocument.publishDiagnostics" client capability.
        const clientCapabilitiesOverride = getDefaultClientCapabilities();
        delete clientCapabilitiesOverride.textDocument?.publishDiagnostics;
        server = await createServer({
            rootUri: null,
            publishDiagnostics: args => diagnostics.set(args.uri, args),
            clientCapabilitiesOverride
        });
    });

    it('diagnostics are published', async () => {
        const doc = {
            uri: uri('diagnosticsBar.ts'),
            languageId: 'typescript',
            version: 1,
            text: `
        export function foo(): void {
          missing('test')
        }
      `
        };
        server.didOpenTextDocument({
            textDocument: doc
        });

        await server.requestDiagnostics();
        await new Promise(resolve => setTimeout(resolve, 200));
        const resultsForFile = diagnostics.get(doc.uri);
        assert.isDefined(resultsForFile);
        assert.strictEqual(resultsForFile?.diagnostics.length, 1);
    });
});

describe('jsx/tsx project', () => {
    before(async () => {
        server = await createServer({
            rootUri: uri('jsx'),
            publishDiagnostics: args => diagnostics.set(args.uri, args)
        });
    });

    it('includes snippet completion for element prop', async () => {
        const doc = {
            uri: uri('jsx', 'app.tsx'),
            languageId: 'typescriptreact',
            version: 1,
            text: readContents(filePath('jsx', 'app.tsx'))
        };
        server.didOpenTextDocument({
            textDocument: doc
        });

        const completion = await server.completion({ textDocument: doc, position: position(doc, 'title') });
        assert.isNotNull(completion);
        const item = completion!.items.find(i => i.label === 'title');
        assert.isDefined(item);
        assert.strictEqual(item?.insertTextFormat, 2);
    });
});

describe('inlayHints', () => {
    it('inlayHints', async () => {
        const doc = {
            uri: uri('module.ts'),
            languageId: 'typescript',
            version: 1,
            text: `
        export function foo() {
          return 3
        }
      `
        };
        await server.initialize({
            initializationOptions: {
                preferences: {
                    includeInlayFunctionLikeReturnTypeHints: true
                }
            },
            processId: null,
            capabilities: getDefaultClientCapabilities(),
            workspaceFolders: [],
            rootUri: ''
        });
        server.didOpenTextDocument({
            textDocument: doc
        });

        const { inlayHints } = await server.inlayHints({
            textDocument: doc
        });

        assert.isDefined(inlayHints);
        assert.strictEqual(inlayHints.length, 1);
        assert.strictEqual(inlayHints[0].text, ': number');
        assert.strictEqual(inlayHints[0].kind, 'Type');
        assert.deepStrictEqual(inlayHints[0].position, { line: 1, character: 29 });
    });

    it('inlayHints options set through workspace configuration ', async () => {
        const doc = {
            uri: uri('module.ts'),
            languageId: 'typescript',
            version: 1,
            text: `
        export function foo() {
          return 3
        }
      `
        };
        await server.initialize({
            processId: null,
            capabilities: getDefaultClientCapabilities(),
            workspaceFolders: [],
            rootUri: ''
        });

        server.didChangeConfiguration({
            settings: {
                typescript: {
                    inlayHints: {
                        includeInlayFunctionLikeReturnTypeHints: true
                    }
                }
            }
        });

        server.didOpenTextDocument({
            textDocument: doc
        });

        const { inlayHints } = await server.inlayHints({
            textDocument: doc
        });

        assert.isDefined(inlayHints);
        assert.strictEqual(inlayHints.length, 1);
        assert.strictEqual(inlayHints[0].text, ': number');
        assert.strictEqual(inlayHints[0].kind, 'Type');
        assert.deepStrictEqual(inlayHints[0].position, { line: 1, character: 29 });
    });
});
