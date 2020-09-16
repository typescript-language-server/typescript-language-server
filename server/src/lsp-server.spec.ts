/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as chai from 'chai';
import * as lsp from 'vscode-languageserver';
import * as lspcalls from './lsp-protocol.calls.proposed';
import { LspServer } from './lsp-server';
import { uri, createServer, position, lastPosition } from './test-utils';
import { TextDocument } from 'vscode-languageserver';
import { TSCompletionItem } from './completion';

const assert = chai.assert;

let diagnostics: Array<lsp.PublishDiagnosticsParams | undefined>;

let server: LspServer;

before(async () => {
    server = await createServer({
        rootUri: null,
        publishDiagnostics: args => diagnostics.push(args)
    })
});
beforeEach(() => {
    diagnostics = [];
    server.closeAll();
})

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
        }
        server.didOpenTextDocument({
            textDocument: doc
        })
        const pos = position(doc, 'console');
        const proposals = await server.completion({
            textDocument: doc,
            position: pos
        }) as TSCompletionItem[];
        assert.isTrue(proposals.length > 800, String(proposals.length));
        const item = proposals.filter(i => i.label === 'addEventListener')[0];
        const resolvedItem = await server.completionResolve(item)
        assert.isTrue(resolvedItem.detail !== undefined, JSON.stringify(resolvedItem, undefined, 2));
        server.didCloseTextDocument({
            textDocument: doc
        });
    }).timeout(10000);

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
        }
        server.didOpenTextDocument({
            textDocument: doc
        })
        const pos = position(doc, 'console');
        const proposals = await server.completion({
            textDocument: doc,
            position: pos
        }) as TSCompletionItem[];
        assert.isTrue(proposals.length > 800, String(proposals.length));
        const item = proposals.filter(i => i.label === 'addEventListener')[0];
        const resolvedItem = await server.completionResolve(item)
        assert.isTrue(resolvedItem.detail !== undefined, JSON.stringify(resolvedItem, undefined, 2));

        const containsInvalidCompletions = proposals.reduce((accumulator, current) => {
            if (accumulator) {
                return accumulator
            }

            // console.log as a warning is erroneously mapped to a non-function type
            return current.label === "log" && current.kind !== lsp.CompletionItemKind.Function
        }, false)

        assert.isFalse(containsInvalidCompletions)
        server.didCloseTextDocument({
            textDocument: doc
        });
    }).timeout(10000);

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
        }
        server.didOpenTextDocument({
            textDocument: doc
        })
        const pos = position(doc, 'foo');
        const proposals = await server.completion({
            textDocument: doc,
            position: pos
        }) as TSCompletionItem[];
        assert.isTrue(proposals === null);
        server.didCloseTextDocument({
            textDocument: doc
        });
    }).timeout(10000);
})

describe('diagnostics', () => {
    it('simple test', async () => {
        const doc = {
            uri: uri('diagnosticsBar.ts'),
            languageId: 'typescript',
            version: 1,
            text: `
        export function foo(): void {
          unknown('test')
        }
      `
        }
        server.didOpenTextDocument({
            textDocument: doc
        })

        server.requestDiagnostics();
        await server.requestDiagnostics();
        await new Promise(resolve => setTimeout(resolve, 200));
        const diagnosticsForThisFile = diagnostics.filter(d => d!.uri === doc.uri);
        assert.equal(diagnosticsForThisFile.length, 1, JSON.stringify(diagnostics));
        const fileDiagnostics = diagnosticsForThisFile[0]!.diagnostics;
        assert.equal(fileDiagnostics.length, 1);
        assert.equal("Cannot find name 'unknown'.", fileDiagnostics[0].message);
    }).timeout(10000);

    it('multiple files test', async () => {
        const doc = {
            uri: uri('multipleFileDiagnosticsBar.ts'),
            languageId: 'typescript',
            version: 1,
            text: `
    export function bar(): void {
        unknown('test')
    }
`
        }
        const doc2 = {
            uri: uri('multipleFileDiagnosticsFoo.ts'),
            languageId: 'typescript',
            version: 1,
            text: `
    export function foo(): void {
        unknown('test')
    }
`
        }
        server.didOpenTextDocument({
            textDocument: doc
        })
        server.didOpenTextDocument({
            textDocument: doc2
        })

        await server.requestDiagnostics();
        await new Promise(resolve => setTimeout(resolve, 200));
        const diagnosticsForThisTest = diagnostics.filter(d => d!.uri === doc.uri || d!.uri === doc2.uri);
        await new Promise(resolve => setTimeout(resolve, 200));
        assert.equal(diagnosticsForThisTest.length, 2, JSON.stringify(diagnostics));
    }).timeout(10000);
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
        }
        server.didOpenTextDocument({
            textDocument: doc
        })
        const symbols = await server.documentSymbol({
            textDocument: doc,
            position: lsp.Position.create(1, 1)
        });

        assert.equal(`
Foo
  foo
  myFunction
`, symbolsAsString(symbols) + '\n');
    }).timeout(10000);

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
        }
        server.didOpenTextDocument({
            textDocument: doc
        })
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
    }).timeout(10000);

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
        }
        server.didOpenTextDocument({
            textDocument: doc
        })
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
        assert.deepEqual(symbols[0].selectionRange, {"start": {"line": 1, "character": 21}, "end": {"line": 1, "character": 24}});
        assert.deepEqual(symbols[0].range, {"start": {"line": 1, "character": 8}, "end": {"line": 5, "character": 9}});

        assert.deepEqual(symbols[1].selectionRange, symbols[1].range);
        assert.deepEqual(symbols[1].range, {"start": {"line": 6, "character": 8}, "end": {"line": 10, "character": 9}});

    }).timeout(10000);
});

function symbolsAsString(symbols: (lsp.DocumentSymbol | lsp.SymbolInformation)[], indentation: string = ''): string {
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
        }
        server.didOpenTextDocument({
            textDocument: doc
        })
        server.didChangeTextDocument({
            textDocument: doc,
            contentChanges: [
                {
                    text: `
          export function foo(): void {
            unknown('test');
          }
          `
                }
            ]
        })
        await server.requestDiagnostics()
        await server.requestDiagnostics()
        await new Promise(resolve => setTimeout(resolve, 200));
        const fileDiagnostics = diagnostics.filter(d => d!.uri === doc.uri)[0]!.diagnostics;
        assert.isTrue(fileDiagnostics.length >= 1, fileDiagnostics.map(d => d.message).join(','));
        assert.equal("Cannot find name 'unknown'.", fileDiagnostics[0].message);
    }).timeout(10000);
});

describe('formatting', () => {
    const uriString = uri('bar.ts');
    const languageId = 'typescript';
    const version = 1;

    it('full document formatting', async () => {
        const text = 'export  function foo (     )   :  void   {   }';
        const textDocument = {
            uri: uriString, languageId, version, text
        }
        server.didOpenTextDocument({ textDocument })
        const edits = await server.documentFormatting({
            textDocument,
            options: {
                tabSize: 4,
                insertSpaces: true
            }
        })
        const result = lsp.TextDocument.applyEdits(TextDocument.create(uriString, languageId, version, text), edits);
        assert.equal('export function foo(): void { }', result);
    }).timeout(10000);

    it('indent settings (3 spaces)', async () => {
        const text = 'function foo() {\n// some code\n}';
        const textDocument = {
            uri: uriString, languageId, version, text
        }
        server.didOpenTextDocument({ textDocument })
        const edits = await server.documentFormatting({
            textDocument,
            options: {
                tabSize: 3,
                insertSpaces: true
            }
        })
        const result = lsp.TextDocument.applyEdits(TextDocument.create(uriString, languageId, version, text), edits);
        assert.equal('function foo() {\n   // some code\n}', result);
    }).timeout(10000);

    it('indent settings (tabs)', async () => {
        const text = 'function foo() {\n// some code\n}';
        const textDocument = {
            uri: uriString, languageId, version, text
        }
        server.didOpenTextDocument({ textDocument })
        const edits = await server.documentFormatting({
            textDocument,
            options: {
                tabSize: 4,
                insertSpaces: false
            }
        })
        const result = lsp.TextDocument.applyEdits(TextDocument.create(uriString, languageId, version, text), edits);
        assert.equal('function foo() {\n\t// some code\n}', result);
    }).timeout(10000);

    it('selected range', async () => {
        const text = 'function foo() {\nconst first = 1;\nconst second = 2;\nconst val = foo( "something" );\n//const fourth = 4;\n}';
        const textDocument = {
            uri: uriString, languageId, version, text
        }
        server.didOpenTextDocument({ textDocument })
        const edits = await server.documentRangeFormatting({
            textDocument,
            range: {
                start: {
                    line: 2,
                    character: 0,
                },
                end: {
                    line: 3,
                    character: 30,
                },
            },
            options: {
                tabSize: 4,
                insertSpaces: true
            }
        })
        const result = lsp.TextDocument.applyEdits(TextDocument.create(uriString, languageId, version, text), edits);
        assert.equal('function foo() {\nconst first = 1;\n    const second = 2;\n    const val = foo("something");\n//const fourth = 4;\n}', result);
    }).timeout(10000);
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
        }
        server.didOpenTextDocument({
            textDocument: doc
        })
        let result = (await server.signatureHelp({
            textDocument: doc,
            position: position(doc, 'param1')
        }))!;

        assert.equal('bar: string', result.signatures[result.activeSignature!].parameters![result.activeParameter!].label)

        result = (await server.signatureHelp({
            textDocument: doc,
            position: position(doc, 'param2')
        }))!;

        assert.equal('baz?: boolean', result.signatures[result.activeSignature!].parameters![result.activeParameter!].label);
    }).timeout(10000);
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
    }).timeout(10000);
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
        server.didOpenTextDocument({
            textDocument: doDoc
        });
        server.didOpenTextDocument({
            textDocument: fooDoc
        });
    }

    it('callers: first step', async () => {
        openDocuments();
        const callsResult = await server.calls({
            textDocument: fooDoc,
            position: lsp.Position.create(3, 9)
        });
        assert.equal(
            resultToString(callsResult, lspcalls.CallDirection.Incoming),
            `
↘ doStuff (do.ts#1)
  ↘ doSomething (foo.ts#2) - foo.ts#3
  ↘ x (foo.ts#4) - foo.ts#4
            `.trim()
        );
    }).timeout(10000);

    it('callers: second step', async () => {
        openDocuments();
        const callsResult = await server.calls({
            textDocument: fooDoc,
            position: lsp.Position.create(2, 5)
        });
        assert.equal(
            resultToString(callsResult, lspcalls.CallDirection.Incoming),
            `
↘ doSomething (foo.ts#2)
  ↘ factory (foo.ts#8) - foo.ts#9
            `.trim()
        );
    }).timeout(10000);

    it('callees: first step', async () => {
        openDocuments();
        const direction = lspcalls.CallDirection.Outgoing;
        const callsResult = await server.calls({
            direction,
            textDocument: fooDoc,
            position: lsp.Position.create(3, 9)
        });
        assert.equal(
            resultToString(callsResult, direction),
            `
↖ doStuff (do.ts#1)
  ↖ two (do.ts#4) - do.ts#2
            `.trim()
        );
    }).timeout(10000);

    it('callees: second step', async () => {
        openDocuments();
        const direction = lspcalls.CallDirection.Outgoing;
        const callsResult = await server.calls({
            direction,
            textDocument: doDoc,
            position: lsp.Position.create(4, 17)
        });
        assert.equal(
            resultToString(callsResult, direction),
            `
↖ two (do.ts#4)
  ↖ three (do.ts#9) - do.ts#5
  ↖ ttt (do.ts#6) - do.ts#7
            `.trim()
        );
    }).timeout(10000);
});
