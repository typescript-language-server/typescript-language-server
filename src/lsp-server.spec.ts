/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import fs from 'fs-extra';
import * as lsp from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { uri, createServer, position, lastPosition, filePath, positionAfter, readContents, TestLspServer, toPlatformEOL } from './test-utils.js';
import { Commands } from './commands.js';
import { SemicolonPreference } from './ts-protocol.js';
import { CodeActionKind } from './utils/types.js';

const diagnostics: Map<string, lsp.PublishDiagnosticsParams> = new Map();

let server: TestLspServer;

beforeAll(async () => {
    server = await createServer({
        rootUri: uri(),
        publishDiagnostics: args => diagnostics.set(args.uri, args),
    });
});

beforeEach(() => {
    server.closeAll();
    // "closeAll" triggers final publishDiagnostics with an empty list so clear last.
    diagnostics.clear();
    server.workspaceEdits = [];
});

afterAll(() => {
    server.closeAll();
    server.shutdown();
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
      `,
        };
        server.didOpenTextDocument({
            textDocument: doc,
        });
        const pos = position(doc, 'console');
        const proposals = await server.completion({ textDocument: doc, position: pos });
        expect(proposals).not.toBeNull();
        expect(proposals!.items.length).toBeGreaterThan(800);
        const item = proposals!.items.find(i => i.label === 'setTimeout');
        expect(item).toBeDefined();
        const resolvedItem = await server.completionResolve(item!);
        expect(resolvedItem.deprecated).not.toBeTruthy();
        expect(resolvedItem.detail).toBeDefined();
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
      `,
        };
        server.didOpenTextDocument({
            textDocument: doc,
        });
        const pos = position(doc, 'console');
        const proposals = await server.completion({ textDocument: doc, position: pos });
        expect(proposals).not.toBeNull();
        expect(proposals!.items.length).toBeGreaterThan(800);
        const item = proposals!.items.find(i => i.label === 'addEventListener');
        expect(item).toBeDefined();
        const resolvedItem = await server.completionResolve(item!);
        expect(resolvedItem.detail).toBeDefined();

        const containsInvalidCompletions = proposals!.items.reduce((accumulator, current) => {
            if (accumulator) {
                return accumulator;
            }

            // console.log as a warning is erroneously mapped to a non-function type
            return current.label === 'log' &&
                (current.kind !== lsp.CompletionItemKind.Function && current.kind !== lsp.CompletionItemKind.Method);
        }, false);

        expect(containsInvalidCompletions).toBe(false);
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
            `,
        };
        server.didOpenTextDocument({
            textDocument: doc,
        });
        const pos = position(doc, 'foo(); // call me');
        const proposals = await server.completion({ textDocument: doc, position: pos });
        expect(proposals).not.toBeNull();
        const item = proposals!.items.find(i => i.label === 'foo');
        expect(item).toBeDefined();
        const resolvedItem = await server.completionResolve(item!);
        expect(resolvedItem.detail).toBeDefined();
        expect(Array.isArray(resolvedItem.tags)).toBeTruthy();
        expect(resolvedItem.tags).toContain(lsp.CompletionItemTag.Deprecated);
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
      `,
        };
        server.didOpenTextDocument({
            textDocument: doc,
        });
        const pos = position(doc, 'foo');
        const proposals = await server.completion({ textDocument: doc, position: pos });
        expect(proposals).not.toBeNull();
        expect(proposals?.items).toHaveLength(0);
        server.didCloseTextDocument({ textDocument: doc });
    });

    it('includes completions from global modules', async () => {
        const doc = {
            uri: uri('bar.ts'),
            languageId: 'typescript',
            version: 1,
            text: 'pathex',
        };
        server.didOpenTextDocument({ textDocument: doc });
        const proposals = await server.completion({ textDocument: doc, position: position(doc, 'ex') });
        expect(proposals).not.toBeNull();
        const pathExistsCompletion = proposals!.items.find(completion => completion.label === 'pathExists');
        expect(pathExistsCompletion).toBeDefined();
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
            `,
        };
        server.didOpenTextDocument({ textDocument: doc });
        const proposals = await server.completion({ textDocument: doc, position: positionAfter(doc, '.i') });
        expect(proposals).not.toBeNull();
        const completion = proposals!.items.find(completion => completion.label === 'invalid-identifier-name');
        expect(completion).toBeDefined();
        expect(completion!.textEdit).toBeDefined();
        expect(completion!.textEdit!.newText).toBe('["invalid-identifier-name"]');
        server.didCloseTextDocument({ textDocument: doc });
    });

    it('completions for clients that support insertReplaceSupport', async () => {
        const doc = {
            uri: uri('bar.ts'),
            languageId: 'typescript',
            version: 1,
            text: `
                class Foo {
                    getById() {};
                }

                const foo = new Foo()
                foo.getById()
            `,
        };
        server.didOpenTextDocument({ textDocument: doc });
        const proposals = await server.completion({ textDocument: doc, position: positionAfter(doc, '.get') });
        expect(proposals).not.toBeNull();
        const completion = proposals!.items.find(completion => completion.label === 'getById');
        expect(completion).toBeDefined();
        expect(completion).toMatchObject({
            label: 'getById',
            kind: lsp.CompletionItemKind.Method,
            textEdit: {
                newText: 'getById',
                insert: {
                    start: {
                        line: 6,
                        character: 20,
                    },
                    end: {
                        line: 6,
                        character: 23,
                    },
                },
                replace: {
                    start: {
                        line: 6,
                        character: 20,
                    },
                    end: {
                        line: 6,
                        character: 27,
                    },
                },
            },
        });
        server.didCloseTextDocument({ textDocument: doc });
    });

    it('completions for clients that do not support insertReplaceSupport', async () => {
        const clientCapabilitiesOverride: lsp.ClientCapabilities = {
            textDocument: {
                completion: {
                    completionItem: {
                        insertReplaceSupport: false,
                    },
                },
            },
        };
        const localServer = await createServer({
            rootUri: null,
            publishDiagnostics: () => {},
            clientCapabilitiesOverride,
        });
        const doc = {
            uri: uri('bar.ts'),
            languageId: 'typescript',
            version: 1,
            text: `
                class Foo {
                    getById() {};
                }

                const foo = new Foo()
                foo.getById()
            `,
        };
        localServer.didOpenTextDocument({ textDocument: doc });
        const proposals = await localServer.completion({ textDocument: doc, position: positionAfter(doc, '.get') });
        expect(proposals).not.toBeNull();
        const completion = proposals!.items.find(completion => completion.label === 'getById');
        expect(completion).toBeDefined();
        expect(completion!.textEdit).toBeUndefined();
        localServer.didCloseTextDocument({ textDocument: doc });
        localServer.closeAll();
        localServer.shutdown();
    });

    it('provides snippet completion in import statement', async () => {
        const doc = {
            uri: uri('bar.ts'),
            languageId: 'typescript',
            version: 1,
            text: 'import { readFile }',
        };
        server.didOpenTextDocument({ textDocument: doc });
        const proposals = await server.completion({ textDocument: doc, position: positionAfter(doc, 'readFile') });
        expect(proposals).not.toBeNull();
        const completion = proposals!.items.find(completion => completion.label === 'readFile');
        expect(completion).toBeDefined();
        expect(completion).toEqual(expect.objectContaining({
            label: 'readFile',
            kind: lsp.CompletionItemKind.Function,
            insertTextFormat: lsp.InsertTextFormat.Snippet,
            detail: 'fs',
            textEdit: {
                newText: 'import { readFile$1 } from "fs";',
                range: {
                    start: {
                        line: 0,
                        character: 0,
                    },
                    end: {
                        line: 0,
                        character: 19,
                    },
                },
            },
        }));
        server.didCloseTextDocument({ textDocument: doc });
    });

    it('includes detail field with package name for auto-imports', async () => {
        const doc = {
            uri: uri('bar.ts'),
            languageId: 'typescript',
            version: 1,
            text: 'readFile',
        };
        server.didOpenTextDocument({ textDocument: doc });
        const proposals = await server.completion({ textDocument: doc, position: positionAfter(doc, 'readFile') });
        expect(proposals).not.toBeNull();
        const completion = proposals!.items.find(completion => completion.label === 'readFile');
        expect(completion).toBeDefined();
        expect(completion!.detail).toBe('fs');
        server.didCloseTextDocument({ textDocument: doc });
    });

    it('resolves text edit for auto-import completion', async () => {
        const doc = {
            uri: uri('bar.ts'),
            languageId: 'typescript',
            version: 1,
            text: 'readFile',
        };
        server.didOpenTextDocument({ textDocument: doc });
        const proposals = await server.completion({ textDocument: doc, position: positionAfter(doc, 'readFile') });
        expect(proposals).not.toBeNull();
        const completion = proposals!.items.find(completion => completion.label === 'readFile');
        expect(completion).toBeDefined();
        const resolvedItem = await server.completionResolve(completion!);
        expect(resolvedItem.additionalTextEdits).toMatchObject([
            {
                newText: 'import { readFile } from "fs";\n\n',
                range: {
                    end: {
                        character: 0,
                        line: 0,
                    },
                    start: {
                        character: 0,
                        line: 0,
                    },
                },
            },
        ]);
        server.didCloseTextDocument({ textDocument: doc });
    });

    it('resolves text edit for auto-import completion in right format', async () => {
        server.updateWorkspaceSettings({
            typescript: {
                format: {
                    semicolons: SemicolonPreference.Remove,
                    insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: false,
                },
            },
        });

        const doc = {
            uri: uri('bar.ts'),
            languageId: 'typescript',
            version: 1,
            text: 'readFile',
        };
        server.didOpenTextDocument({ textDocument: doc });
        const proposals = await server.completion({ textDocument: doc, position: positionAfter(doc, 'readFile') });
        expect(proposals).not.toBeNull();
        const completion = proposals!.items.find(completion => completion.label === 'readFile');
        expect(completion).toBeDefined();
        const resolvedItem = await server.completionResolve(completion!);
        expect(resolvedItem.additionalTextEdits).toMatchObject([
            {
                newText: 'import {readFile} from "fs"\n\n',
                range: {
                    end: {
                        character: 0,
                        line: 0,
                    },
                    start: {
                        character: 0,
                        line: 0,
                    },
                },
            },
        ]);
        server.didCloseTextDocument({ textDocument: doc });
        server.updateWorkspaceSettings({
            typescript: {
                format: {
                    semicolons: SemicolonPreference.Ignore,
                    insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true,
                },
            },
        });
    });

    it('resolves a snippet for method completion', async () => {
        server.updateWorkspaceSettings({
            completions: {
                completeFunctionCalls: true,
            },
        });
        const doc = {
            uri: uri('bar.ts'),
            languageId: 'typescript',
            version: 1,
            text: `
                import fs from 'fs'
                fs.readFile
            `,
        };
        server.didOpenTextDocument({ textDocument: doc });
        const proposals = await server.completion({ textDocument: doc, position: positionAfter(doc, 'readFile') });
        expect(proposals).not.toBeNull();
        const completion = proposals!.items.find(completion => completion.label === 'readFile');
        const resolvedItem = await server.completionResolve(completion!);
        expect(resolvedItem).toMatchObject({
            label: 'readFile',
            insertTextFormat: lsp.InsertTextFormat.Snippet,
            // eslint-disable-next-line no-template-curly-in-string
            insertText: 'readFile(${1:path}, ${2:options}, ${3:callback})$0',
            textEdit: {
                // eslint-disable-next-line no-template-curly-in-string
                newText: 'readFile(${1:path}, ${2:options}, ${3:callback})$0',
                insert: {
                    start: {
                        line: 2,
                        character: 19,
                    },
                    end: {
                        line: 2,
                        character: 27,
                    },
                },
                replace: {
                    start: {
                        line: 2,
                        character: 19,
                    },
                    end: {
                        line: 2,
                        character: 27,
                    },
                },
            },
        });
        server.didCloseTextDocument({ textDocument: doc });
        server.updateWorkspaceSettings({
            completions: {
                completeFunctionCalls: false,
            },
        });
    });

    it('does not provide snippet completion for "$" function when completeFunctionCalls disabled', async () => {
        const doc = {
            uri: uri('bar.ts'),
            languageId: 'typescript',
            version: 1,
            text: `
                function $(): void {}
                /**/$
            `,
        };
        server.didOpenTextDocument({ textDocument: doc });
        const proposals = await server.completion({ textDocument: doc, position: positionAfter(doc, '/**/') });
        expect(proposals).not.toBeNull();
        const completion = proposals!.items.find(completion => completion.label === '$');
        expect(completion).toMatchObject({
            label: '$',
            textEdit: {
                newText: '$',
                insert: {
                    start: {
                        line: 2,
                        character: 20,
                    },
                    end: {
                        line: 2,
                        character: 20,
                    },
                },
                replace: {
                    start: {
                        line: 2,
                        character: 20,
                    },
                    end: {
                        line: 2,
                        character: 21,
                    },
                },
            },
        });
        const resolvedItem = await server.completionResolve(completion!);
        expect(resolvedItem).toMatchObject({
            label: '$',
            textEdit: {
                newText: '$',
                insert: {
                    start: {
                        line: 2,
                        character: 20,
                    },
                    end: {
                        line: 2,
                        character: 20,
                    },
                },
                replace: {
                    start: {
                        line: 2,
                        character: 20,
                    },
                    end: {
                        line: 2,
                        character: 21,
                    },
                },
            },
        });
        server.didCloseTextDocument({ textDocument: doc });
    });

    it('provides snippet completions for "$" function when completeFunctionCalls enabled', async () => {
        server.updateWorkspaceSettings({
            completions: {
                completeFunctionCalls: true,
            },
        });
        const doc = {
            uri: uri('bar.ts'),
            languageId: 'typescript',
            version: 1,
            text: `
                function $(): void {}
                /**/$
            `,
        };
        server.didOpenTextDocument({ textDocument: doc });
        const proposals = await server.completion({ textDocument: doc, position: positionAfter(doc, '/**/') });
        expect(proposals).not.toBeNull();
        const completion = proposals!.items.find(completion => completion.label === '$');
        // NOTE: Technically not valid until resolved.
        expect(completion).toMatchObject({
            label: '$',
            insertTextFormat: lsp.InsertTextFormat.Snippet,
            textEdit: {
                newText: '$',
                insert: {
                    start: {
                        line: 2,
                        character: 20,
                    },
                    end: {
                        line: 2,
                        character: 20,
                    },
                },
                replace: {
                    start: {
                        line: 2,
                        character: 20,
                    },
                    end: {
                        line: 2,
                        character: 21,
                    },
                },
            },
        });
        const resolvedItem = await server.completionResolve(completion!);
        expect(resolvedItem).toMatchObject({
            label: '$',
            insertTextFormat: lsp.InsertTextFormat.Snippet,
            // eslint-disable-next-line no-template-curly-in-string
            insertText: '\\$()$0',
            textEdit: {
                // eslint-disable-next-line no-template-curly-in-string
                newText: '\\$()$0',
                insert: {
                    start: {
                        line: 2,
                        character: 20,
                    },
                    end: {
                        line: 2,
                        character: 20,
                    },
                },
                replace: {
                    start: {
                        line: 2,
                        character: 20,
                    },
                    end: {
                        line: 2,
                        character: 21,
                    },
                },
            },
        });
        server.didCloseTextDocument({ textDocument: doc });
        server.updateWorkspaceSettings({
            completions: {
                completeFunctionCalls: false,
            },
        });
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

              test("fs/r")
            `,
        };
        server.didOpenTextDocument({ textDocument: doc });
        const proposals = await server.completion({
            textDocument: doc,
            position: positionAfter(doc, 'test("fs/'),
            context: {
                triggerCharacter: '/',
                triggerKind: 2,
            },
        });
        expect(proposals).not.toBeNull();
        const completion = proposals!.items.find(completion => completion.label === 'fs/read');
        expect(completion).toMatchObject({
            label: 'fs/read',
            textEdit: {
                newText: 'fs/read',
                range: {
                    start: {
                        line: 5,
                        character: 20,
                    },
                    end: {
                        line: 5,
                        character: 24,
                    },
                },
            },
        });
    });

    it('includes labelDetails with useLabelDetailsInCompletionEntries enabled', async () => {
        const doc = {
            uri: uri('foo.ts'),
            languageId: 'typescript',
            version: 1,
            text: `
              interface IFoo {
                bar(x: number): void;
              }
              const obj: IFoo = {
                /*a*/
              }
            `,
        };
        server.didOpenTextDocument({ textDocument: doc });
        const proposals = await server.completion({
            textDocument: doc,
            position: positionAfter(doc, '/*a*/'),
        });
        expect(proposals).not.toBeNull();
        expect(proposals!.items).toHaveLength(2);
        expect(proposals!.items[0]).toMatchObject(
            {
                label: 'bar',
                kind: lsp.CompletionItemKind.Method,
            },
        );
        expect(proposals!.items[1]).toMatchObject(
            {
                label: 'bar',
                labelDetails: {
                    detail: '(x)',
                },
                kind: lsp.CompletionItemKind.Method,
                insertText: toPlatformEOL('bar(x) {\n    $0\n},'),
            },
        );
    });
});

describe('definition', () => {
    it('goes to definition', async () => {
        // NOTE: This test needs to reference files that physically exist for the feature to work.
        const indexUri = uri('source-definition', 'index.ts');
        const indexDoc = {
            uri: indexUri,
            languageId: 'typescript',
            version: 1,
            text: readContents(filePath('source-definition', 'index.ts')),
        };
        server.didOpenTextDocument({ textDocument: indexDoc });
        const definitions = await server.definition({
            textDocument: indexDoc,
            position: position(indexDoc, 'a/*identifier*/'),
        }) as lsp.Location[];
        expect(Array.isArray(definitions)).toBeTruthy();
        expect(definitions!).toHaveLength(1);
        expect(definitions![0]).toMatchObject({
            uri: uri('source-definition', 'a.d.ts'),
            range: {
                start: {
                    line: 0,
                    character: 21,
                },
                end: {
                    line: 0,
                    character: 22,
                },
            },
        });
    });
});

describe('definition (definition link supported)', () => {
    let localServer: TestLspServer;

    beforeAll(async () => {
        const clientCapabilitiesOverride: lsp.ClientCapabilities = {
            textDocument: {
                definition: {
                    linkSupport: true,
                },
            },
        };
        localServer = await createServer({
            rootUri: uri('source-definition'),
            publishDiagnostics: args => diagnostics.set(args.uri, args),
            clientCapabilitiesOverride,
        });
    });

    beforeEach(() => {
        localServer.closeAll();
        // "closeAll" triggers final publishDiagnostics with an empty list so clear last.
        diagnostics.clear();
        localServer.workspaceEdits = [];
    });

    afterAll(() => {
        localServer.closeAll();
        localServer.shutdown();
    });

    it('goes to definition', async () => {
        // NOTE: This test needs to reference files that physically exist for the feature to work.
        const indexUri = uri('source-definition', 'index.ts');
        const indexDoc = {
            uri: indexUri,
            languageId: 'typescript',
            version: 1,
            text: readContents(filePath('source-definition', 'index.ts')),
        };
        localServer.didOpenTextDocument({ textDocument: indexDoc });
        const definitions = await localServer.definition({
            textDocument: indexDoc,
            position: position(indexDoc, 'a/*identifier*/'),
        }) as lsp.DefinitionLink[];
        expect(Array.isArray(definitions)).toBeTruthy();
        expect(definitions!).toHaveLength(1);
        expect(definitions![0]).toMatchObject({
            originSelectionRange: {
                start: {
                    line: 1,
                    character: 0,
                },
                end: {
                    line: 1,
                    character: 1,
                },
            },
            targetRange: {
                start: {
                    line: 0,
                    character: 0,
                },
                end: {
                    line: 0,
                    character: 30,
                },
            },
            targetUri: uri('source-definition', 'a.d.ts'),
            targetSelectionRange: {
                start: {
                    line: 0,
                    character: 21,
                },
                end: {
                    line: 0,
                    character: 22,
                },
            },
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
      `,
        };
        server.didOpenTextDocument({
            textDocument: doc,
        });

        await server.requestDiagnostics();
        await new Promise(resolve => setTimeout(resolve, 200));
        const resultsForFile = diagnostics.get(doc.uri);
        expect(resultsForFile).toBeDefined();
        const fileDiagnostics = resultsForFile!.diagnostics;
        expect(fileDiagnostics).toHaveLength(1);
        expect("Cannot find name 'missing'.").toBe(fileDiagnostics[0].message);
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
      `,
        };
        server.didOpenTextDocument({
            textDocument: doc,
        });

        await server.requestDiagnostics();
        await new Promise(resolve => setTimeout(resolve, 200));
        const resultsForFile = diagnostics.get(doc.uri);
        expect(resultsForFile).toBeDefined();
        const fileDiagnostics = resultsForFile!.diagnostics;
        expect(fileDiagnostics).toHaveLength(2);
        const unusedDiagnostic = fileDiagnostics.find(d => d.code === 6133);
        expect(unusedDiagnostic).toBeDefined();
        expect(unusedDiagnostic!.tags).toEqual([lsp.DiagnosticTag.Unnecessary]);
        const deprecatedDiagnostic = fileDiagnostics.find(d => d.code === 6387);
        expect(deprecatedDiagnostic).toBeDefined();
        expect(deprecatedDiagnostic!.tags).toEqual([lsp.DiagnosticTag.Deprecated]);
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
`,
        };
        const doc2 = {
            uri: uri('multipleFileDiagnosticsFoo.ts'),
            languageId: 'typescript',
            version: 1,
            text: `
    export function foo(): void {
        missing('test')
    }
`,
        };
        server.didOpenTextDocument({
            textDocument: doc,
        });
        server.didOpenTextDocument({
            textDocument: doc2,
        });

        await server.requestDiagnostics();
        await new Promise(resolve => setTimeout(resolve, 200));
        expect(diagnostics.size).toBe(2);
        const diagnosticsForDoc = diagnostics.get(doc.uri);
        const diagnosticsForDoc2 = diagnostics.get(doc2.uri);
        expect(diagnosticsForDoc).toBeDefined();
        expect(diagnosticsForDoc2).toBeDefined();
        expect(diagnosticsForDoc!.diagnostics).toHaveLength(1);
        expect(diagnosticsForDoc2!.diagnostics).toHaveLength(1);
    });

    it('code 6133 (ununsed variable) is ignored', async () => {
        server.updateWorkspaceSettings({
            diagnostics: {
                ignoredCodes: [6133],
            },
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
          `,
        };
        server.didOpenTextDocument({
            textDocument: doc,
        });

        await server.requestDiagnostics();
        await new Promise(resolve => setTimeout(resolve, 200));
        const diagnosticsForThisFile = diagnostics.get(doc.uri);
        expect(diagnosticsForThisFile).toBeDefined();
        const fileDiagnostics = diagnosticsForThisFile!.diagnostics;
        expect(fileDiagnostics).toHaveLength(0);
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
      `,
        };
        server.didOpenTextDocument({
            textDocument: doc,
        });
        const symbols = await server.documentSymbol({ textDocument: doc });
        expect(`
Foo
  foo
  myFunction
`).toBe(symbolsAsString(symbols) + '\n');
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
}`,
        };
        server.didOpenTextDocument({
            textDocument: doc,
        });
        const symbols = await server.documentSymbol({ textDocument: doc });
        expect(`
Box
  height
  width
Box
  scale
`).toBe(symbolsAsString(symbols) + '\n');
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
      `,
        };
        server.didOpenTextDocument({
            textDocument: doc,
        });
        const symbols = await server.documentSymbol({ textDocument: doc }) as lsp.DocumentSymbol[];
        const expectation = `
Foo
  foo
  myFunction
Foo
  foo
  myFunction
`;
        expect(symbolsAsString(symbols) + '\n').toBe(expectation);
        expect(symbols[0].selectionRange).toMatchObject({ start: { line: 1, character: 21 }, end: { line: 1, character: 24 } });
        expect(symbols[0].range).toMatchObject({ start: { line: 1, character: 8 }, end: { line: 5, character: 9 } });

        expect(symbols[1].selectionRange).toMatchObject(symbols[1].range);
        expect(symbols[1].range).toMatchObject({ start: { line: 6, character: 8 }, end: { line: 10, character: 9 } });
    });
});

function symbolsAsString(symbols: (lsp.DocumentSymbol | lsp.SymbolInformation)[], indentation = ''): string {
    return symbols.map(symbol => {
        let result = '\n' + indentation + symbol.name;
        if (lsp.DocumentSymbol.is(symbol)) {
            if (symbol.children) {
                result = result + symbolsAsString(symbol.children, `${indentation}  `);
            }
        } else {
            if (symbol.containerName) {
                result = `${result} in ${symbol.containerName}`;
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
      `,
        };
        server.didOpenTextDocument({
            textDocument: doc,
        });
        server.didChangeTextDocument({
            textDocument: doc,
            contentChanges: [
                {
                    text: `
          export function foo(): void {
            missing('test');
          }
          `,
                },
            ],
        });
        await server.requestDiagnostics();
        await new Promise(resolve => setTimeout(resolve, 200));
        const resultsForFile = diagnostics.get(doc.uri);
        expect(resultsForFile).toBeDefined();
        const fileDiagnostics = resultsForFile!.diagnostics;
        expect(fileDiagnostics.length).toBeGreaterThan(0);
        expect(fileDiagnostics[0].message).toBe("Cannot find name 'missing'.");
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
            `,
        };
        server.didOpenTextDocument({
            textDocument: doc,
        });
        // Without declaration/definition.
        const position = lastPosition(doc, 'function foo()');
        let references = await server.references({
            context: { includeDeclaration: false },
            textDocument: doc,
            position,
        });
        expect(references).toHaveLength(1);
        expect(references[0].range.start.line).toBe(2);
        // With declaration/definition.
        references = await server.references({
            context: { includeDeclaration: true },
            textDocument: doc,
            position,
        });
        expect(references).toHaveLength(2);
    });
});

describe('formatting', () => {
    const uriString = uri('bar.ts');
    const languageId = 'typescript';
    const version = 1;

    beforeAll(async () => {
        server.updateWorkspaceSettings({
            typescript: {
                format: {
                    semicolons: SemicolonPreference.Ignore,
                    insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true,
                },
            },
        });
    });

    it('full document formatting', async () => {
        const text = 'export  function foo (     )   :  void   {   }';
        const textDocument = {
            uri: uriString, languageId, version, text,
        };
        server.didOpenTextDocument({ textDocument });
        const edits = await server.documentFormatting({
            textDocument,
            options: {
                tabSize: 4,
                insertSpaces: true,
            },
        });
        const result = TextDocument.applyEdits(TextDocument.create(uriString, languageId, version, text), edits);
        expect('export function foo(): void { }').toBe(result);
    });

    it('indent settings (3 spaces)', async () => {
        const text = 'function foo() {\n// some code\n}';
        const textDocument = {
            uri: uriString, languageId, version, text,
        };
        server.didOpenTextDocument({ textDocument });
        const edits = await server.documentFormatting({
            textDocument,
            options: {
                tabSize: 3,
                insertSpaces: true,
            },
        });
        const result = TextDocument.applyEdits(TextDocument.create(uriString, languageId, version, text), edits);
        expect('function foo() {\n   // some code\n}').toBe(result);
    });

    it('indent settings (tabs)', async () => {
        const text = 'function foo() {\n// some code\n}';
        const textDocument = {
            uri: uriString, languageId, version, text,
        };
        server.didOpenTextDocument({ textDocument });
        const edits = await server.documentFormatting({
            textDocument,
            options: {
                tabSize: 4,
                insertSpaces: false,
            },
        });
        const result = TextDocument.applyEdits(TextDocument.create(uriString, languageId, version, text), edits);
        expect('function foo() {\n\t// some code\n}').toBe(result);
    });

    it('formatting setting set through workspace configuration', async () => {
        const text = 'function foo() {\n// some code\n}';
        const textDocument = {
            uri: uriString, languageId, version, text,
        };
        server.didOpenTextDocument({ textDocument });

        server.updateWorkspaceSettings({
            typescript: {
                format: {
                    newLineCharacter: '\n',
                    placeOpenBraceOnNewLineForFunctions: true,
                },
            },
        });

        const edits = await server.documentFormatting({
            textDocument,
            options: {
                tabSize: 4,
                insertSpaces: false,
            },
        });
        const result = TextDocument.applyEdits(TextDocument.create(uriString, languageId, version, text), edits);
        expect('function foo()\n{\n\t// some code\n}').toBe(result);
    });

    it('selected range', async () => {
        const text = 'function foo() {\nconst first = 1;\nconst second = 2;\nconst val = foo( "something" );\n//const fourth = 4;\n}';
        const textDocument = {
            uri: uriString, languageId, version, text,
        };
        server.didOpenTextDocument({ textDocument });
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
                insertSpaces: true,
            },
        });
        const result = TextDocument.applyEdits(TextDocument.create(uriString, languageId, version, text), edits);
        expect('function foo() {\nconst first = 1;\n    const second = 2;\n    const val = foo("something");\n//const fourth = 4;\n}').toBe(result);
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
        export function foo(n: number, baz?: boolean): void
        foo(param1, param2)
      `,
        };
        server.didOpenTextDocument({
            textDocument: doc,
        });
        let result = (await server.signatureHelp({
            textDocument: doc,
            position: position(doc, 'param1'),
        }))!;

        expect(result.signatures).toHaveLength(2);

        expect(result.signatures[result.activeSignature!].parameters![result.activeParameter!].label).toBe('bar: string');

        result = (await server.signatureHelp({
            textDocument: doc,
            position: position(doc, 'param2'),
        }))!;

        expect(result.signatures[result.activeSignature!].parameters![result.activeParameter!].label).toBe('baz?: boolean');
    });

    it('retrigger with specific signature active', async () => {
        const doc = {
            uri: uri('bar.ts'),
            languageId: 'typescript',
            version: 1,
            text: `
        export function foo(bar: string, baz?: boolean): void {}
        export function foo(n: number, baz?: boolean): void
        foo(param1, param2)
      `,
        };
        server.didOpenTextDocument({ textDocument: doc });
        let result = await server.signatureHelp({
            textDocument: doc,
            position: position(doc, 'param1'),
        });
        expect(result!.signatures).toHaveLength(2);

        result = (await server.signatureHelp({
            textDocument: doc,
            position: position(doc, 'param1'),
            context: {
                isRetrigger: true,
                triggerKind: lsp.SignatureHelpTriggerKind.Invoked,
                activeSignatureHelp: {
                    signatures: result!.signatures,
                    activeSignature: 1,  // select second signature
                },
            },
        }))!;
        const { activeSignature, signatures } = result!;
        expect(activeSignature).toBe(1);
        expect(signatures[activeSignature!]).toMatchObject({
            label: 'foo(n: number, baz?: boolean): void',
        });
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
    `,
    };

    it('can provide quickfix code actions', async () => {
        server.didOpenTextDocument({
            textDocument: doc,
        });
        const result = (await server.codeAction({
            textDocument: doc,
            range: {
                start: { line: 1, character: 25 },
                end: { line: 1, character: 49 },
            },
            context: {
                diagnostics: [{
                    range: {
                        start: { line: 1, character: 25 },
                        end: { line: 1, character: 49 },
                    },
                    code: 6133,
                    message: 'unused arg',
                }],
            },
        }))!;

        expect(result).toHaveLength(2);
        const quickFixDiagnostic = result.find(diagnostic => diagnostic.kind === 'quickfix');
        expect(quickFixDiagnostic).toBeDefined();
        expect(quickFixDiagnostic).toMatchObject({
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
                                    version: 1,
                                },
                                edits: [
                                    {
                                        range: {
                                            start: {
                                                line: 1,
                                                character: 24,
                                            },
                                            end: {
                                                line: 1,
                                                character: 27,
                                            },
                                        },
                                        newText: '_bar',
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
            kind: 'quickfix',
        });
        const refactorDiagnostic = result.find(diagnostic => diagnostic.kind === 'refactor');
        expect(refactorDiagnostic).toBeDefined();
        expect(refactorDiagnostic).toMatchObject({
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
                        action: 'Convert parameters to destructured object',
                    },
                ],
            },
            kind: 'refactor',
        });
    });

    it('can filter quickfix code actions filtered by only', async () => {
        server.didOpenTextDocument({
            textDocument: doc,
        });
        const result = (await server.codeAction({
            textDocument: doc,
            range: {
                start: { line: 1, character: 25 },
                end: { line: 1, character: 49 },
            },
            context: {
                diagnostics: [{
                    range: {
                        start: { line: 1, character: 25 },
                        end: { line: 1, character: 49 },
                    },
                    code: 6133,
                    message: 'unused arg',
                }],
                only: ['refactor', 'invalid-action'],
            },
        }))!;

        expect(result).toMatchObject([
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
                            startOffset: 26,
                        },
                    ],
                    command: '_typescript.applyRefactoring',
                    title: 'Convert parameters to destructured object',
                },
                kind: 'refactor',
                title: 'Convert parameters to destructured object',
            },
        ]);
    });

    it('does not provide organize imports when there are errors', async () => {
        server.didOpenTextDocument({
            textDocument: doc,
        });
        await server.requestDiagnostics();
        await new Promise(resolve => setTimeout(resolve, 200));
        const result = (await server.codeAction({
            textDocument: doc,
            range: {
                start: { line: 1, character: 29 },
                end: { line: 1, character: 53 },
            },
            context: {
                diagnostics: [{
                    range: {
                        start: { line: 1, character: 25 },
                        end: { line: 1, character: 49 },
                    },
                    code: 6133,
                    message: 'unused arg',
                }],
                only: [CodeActionKind.SourceOrganizeImportsTs.value],
            },
        }))!;

        expect(result).toEqual([]);
    });

    it('provides organize imports when there are no errors', async () => {
        const doc = {
            uri: uri('bar.ts'),
            languageId: 'typescript',
            version: 1,
            text: `import { existsSync } from 'fs';
import { accessSync } from 'fs';
existsSync('t');
accessSync('t');`,
        };
        server.didOpenTextDocument({
            textDocument: doc,
        });
        const result = (await server.codeAction({
            textDocument: doc,
            range: {
                start: { line: 0, character: 0 },
                end: { line: 3, character: 0 },
            },
            context: {
                diagnostics: [],
                only: [CodeActionKind.SourceOrganizeImportsTs.value],
            },
        }))!;

        expect(result).toMatchObject([
            {
                kind: CodeActionKind.SourceOrganizeImportsTs.value,
                title: 'Organize Imports',
                edit: {
                    documentChanges: [
                        {
                            edits: [
                                {
                                    newText: "import { accessSync, existsSync } from 'fs';\n",
                                    range: {
                                        end: {
                                            character: 0,
                                            line: 1,
                                        },
                                        start: {
                                            character: 0,
                                            line: 0,
                                        },
                                    },
                                },
                                {
                                    newText: '',
                                    range: {
                                        end: {
                                            character: 0,
                                            line: 2,
                                        },
                                        start: {
                                            character: 0,
                                            line: 1,
                                        },
                                    },
                                },
                            ],
                            textDocument: {
                                uri: uri('bar.ts'),
                                version: 1,
                            },
                        },
                    ],
                },
            },
        ]);
    });

    it('provides "add missing imports" when explicitly requested in only', async () => {
        const doc = {
            uri: uri('bar.ts'),
            languageId: 'typescript',
            version: 1,
            text: 'existsSync(\'t\');',
        };
        server.didOpenTextDocument({
            textDocument: doc,
        });
        await server.requestDiagnostics();
        await new Promise(resolve => setTimeout(resolve, 200));
        const result = (await server.codeAction({
            textDocument: doc,
            range: {
                start: { line: 1, character: 29 },
                end: { line: 1, character: 53 },
            },
            context: {
                diagnostics: [],
                only: [CodeActionKind.SourceAddMissingImportsTs.value],
            },
        }))!;

        expect(result).toMatchObject([
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
                                            line: 0,
                                        },
                                        start: {
                                            character: 0,
                                            line: 0,
                                        },
                                    },
                                },
                            ],
                            textDocument: {
                                uri: uri('bar.ts'),
                                version: 1,
                            },
                        },
                    ],
                },
            },
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
}`,
        };
        server.didOpenTextDocument({
            textDocument: doc,
        });
        await server.requestDiagnostics();
        await new Promise(resolve => setTimeout(resolve, 200));
        const result = (await server.codeAction({
            textDocument: doc,
            range: {
                start: { line: 0, character: 0 },
                end: { line: 4, character: 0 },
            },
            context: {
                diagnostics: [],
                only: [CodeActionKind.SourceFixAllTs.value],
            },
        }))!;

        expect(result).toMatchObject([
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
                                            line: 3,
                                        },
                                        start: {
                                            character: 0,
                                            line: 2,
                                        },
                                    },
                                },
                            ],
                            textDocument: {
                                uri: uri('bar.ts'),
                                version: 1,
                            },
                        },
                    ],
                },
            },
        ]);
    });

    it('provides "remove unused" when explicitly requested in only', async () => {
        const doc = {
            uri: uri('bar.ts'),
            languageId: 'typescript',
            version: 1,
            text: 'import { existsSync } from \'fs\';',
        };
        server.didOpenTextDocument({
            textDocument: doc,
        });
        await server.requestDiagnostics();
        await new Promise(resolve => setTimeout(resolve, 200));
        const result = (await server.codeAction({
            textDocument: doc,
            range: {
                start: position(doc, 'existsSync'),
                end: positionAfter(doc, 'existsSync'),
            },
            context: {
                diagnostics: [],
                only: [CodeActionKind.SourceRemoveUnusedTs.value],
            },
        }))!;

        expect(result).toMatchObject([
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
                                            line: 0,
                                        },
                                        start: {
                                            character: 0,
                                            line: 0,
                                        },
                                    },
                                },
                            ],
                            textDocument: {
                                uri: uri('bar.ts'),
                                version: 1,
                            },
                        },
                    ],
                },
            },
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
            `,
        };
        server.didOpenTextDocument({
            textDocument: doc,
        });
        await server.requestDiagnostics();
        await new Promise(resolve => setTimeout(resolve, 200));
        const result = (await server.codeAction({
            textDocument: doc,
            range: {
                start: { line: 0, character: 0 },
                end: lastPosition(doc, '}'),
            },
            context: {
                diagnostics: [],
                only: [CodeActionKind.SourceFixAllTs.value],
            },
        }))!;
        expect(result).toHaveLength(1);
        expect(result).toMatchObject([
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
                                            character: 0,
                                        },
                                        end: {
                                            line: 5,
                                            character: 0,
                                        },
                                    },
                                },
                            ],
                            textDocument: {
                                uri: uri('bar.ts'),
                                version: 1,
                            },
                        },
                    ],
                },
            },
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
            text: 'export function fn(): void {}\nexport function newFn(): void {}',
        };
        server.didOpenTextDocument({
            textDocument: doc,
        });
        const codeActions = (await server.codeAction({
            textDocument: doc,
            range: {
                start: position(doc, 'newFn'),
                end: position(doc, 'newFn'),
            },
            context: {
                diagnostics: [],
            },
        }))!;
        // Find refactoring code action.
        const applyRefactoringAction = codeActions.find(action => action.command?.command === Commands.APPLY_REFACTORING);
        expect(applyRefactoringAction).toBeDefined();
        // Execute refactoring action.
        await server.executeCommand({
            command: applyRefactoringAction!.command!.command,
            arguments: applyRefactoringAction!.command!.arguments,
        });
        expect(server.workspaceEdits).toHaveLength(1);
        const { changes } = server.workspaceEdits[0].edit;
        expect(changes).toBeDefined();
        expect(Object.keys(changes!)).toHaveLength(2);
        const change1 = changes![fooUri];
        expect(change1).toBeDefined();
        const change2 = changes![uri('newFn.ts')];
        expect(change2).toBeDefined();
        // Clean up file that is created on applying edit.
        fs.unlinkSync(filePath('newFn.ts'));
        expect(change1).toMatchObject([
            {
                range: {
                    start: {
                        line: 1,
                        character: 0,
                    },
                    end: {
                        line: 1,
                        character: 32,
                    },
                },
                newText: '',
            },
        ],
        );
        expect(change2).toMatchObject([
            {
                range: {
                    start: {
                        line: 0,
                        character: 0,
                    },
                    end: {
                        line: 0,
                        character: 0,
                    },
                },
                newText: 'export function newFn(): void { }\n',
            },
        ],
        );
    });

    it('go to source definition', async () => {
        // NOTE: This test needs to reference files that physically exist for the feature to work.
        const indexUri = uri('source-definition', 'index.ts');
        const indexDoc = {
            uri: indexUri,
            languageId: 'typescript',
            version: 1,
            text: readContents(filePath('source-definition', 'index.ts')),
        };
        server.didOpenTextDocument({ textDocument: indexDoc });
        const result: lsp.Location[] | null = await server.executeCommand({
            command: Commands.SOURCE_DEFINITION,
            arguments: [
                indexUri,
                position(indexDoc, '/*identifier*/'),
            ],
        });
        expect(result).not.toBeNull();
        expect(result).toHaveLength(1);
        expect(result![0]).toMatchObject({
            uri: uri('source-definition', 'a.js'),
            range: {
                start: {
                    line: 0,
                    character: 13,
                },
                end: {
                    line: 0,
                    character: 14,
                },
            },
        });
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
      `,
        };
        server.didOpenTextDocument({
            textDocument: barDoc,
        });
        const fooDoc = {
            uri: uri('bar.ts'),
            languageId: 'typescript',
            version: 1,
            text: `
        import { Bar } from './bar';
        export class Foo implements Bar {
        }
      `,
        };
        server.didOpenTextDocument({
            textDocument: fooDoc,
        });

        const result = await server.documentHighlight({
            textDocument: fooDoc,
            position: lastPosition(fooDoc, 'Bar'),
        });
        expect(result).toHaveLength(2);
    });
});

describe('diagnostics (no client support)', () => {
    let localServer: TestLspServer;

    beforeAll(async () => {
        const clientCapabilitiesOverride: lsp.ClientCapabilities = {
            textDocument: {
                publishDiagnostics: undefined,
            },
        };
        localServer = await createServer({
            rootUri: null,
            publishDiagnostics: args => diagnostics.set(args.uri, args),
            clientCapabilitiesOverride,
        });
    });

    beforeEach(() => {
        localServer.closeAll();
        // "closeAll" triggers final publishDiagnostics with an empty list so clear last.
        diagnostics.clear();
        localServer.workspaceEdits = [];
    });

    afterAll(() => {
        localServer.closeAll();
        localServer.shutdown();
    });

    it('diagnostic tags are not returned', async () => {
        const doc = {
            uri: uri('diagnosticsBar.ts'),
            languageId: 'typescript',
            version: 1,
            text: `
        export function foo(): void {
          missing('test')
        }
      `,
        };
        localServer.didOpenTextDocument({
            textDocument: doc,
        });

        await localServer.requestDiagnostics();
        await new Promise(resolve => setTimeout(resolve, 200));
        const resultsForFile = diagnostics.get(doc.uri);
        expect(resultsForFile).toBeDefined();
        expect(resultsForFile!.diagnostics).toHaveLength(1);
        expect(resultsForFile!.diagnostics[0]).not.toHaveProperty('tags');
    });
});

describe('jsx/tsx project', () => {
    let localServer: TestLspServer;

    beforeAll(async () => {
        localServer = await createServer({
            rootUri: uri('jsx'),
            publishDiagnostics: args => diagnostics.set(args.uri, args),
        });
    });

    beforeEach(() => {
        localServer.closeAll();
        // "closeAll" triggers final publishDiagnostics with an empty list so clear last.
        diagnostics.clear();
        localServer.workspaceEdits = [];
    });

    afterAll(() => {
        localServer.closeAll();
        localServer.shutdown();
    });

    it('includes snippet completion for element prop', async () => {
        const doc = {
            uri: uri('jsx', 'app.tsx'),
            languageId: 'typescriptreact',
            version: 1,
            text: readContents(filePath('jsx', 'app.tsx')),
        };
        localServer.didOpenTextDocument({
            textDocument: doc,
        });

        const completion = await localServer.completion({ textDocument: doc, position: position(doc, 'title') });
        expect(completion).not.toBeNull();
        const item = completion!.items.find(i => i.label === 'title');
        expect(item).toBeDefined();
        expect(item?.insertTextFormat).toBe(2);
    });
});

describe('inlayHints', () => {
    beforeAll(async () => {
        server.updateWorkspaceSettings({
            typescript: {
                inlayHints: {
                    includeInlayFunctionLikeReturnTypeHints: true,
                },
            },
        });
    });

    afterAll(() => {
        server.updateWorkspaceSettings({
            typescript: {
                inlayHints: {
                    includeInlayFunctionLikeReturnTypeHints: false,
                },
            },
        });
    });

    it('inlayHints', async () => {
        const doc = {
            uri: uri('module.ts'),
            languageId: 'typescript',
            version: 1,
            text: `
        export function foo() {
          return 3
        }
      `,
        };
        server.didOpenTextDocument({ textDocument: doc });
        const inlayHints = await server.inlayHints({ textDocument: doc, range: lsp.Range.create(0, 0, 4, 0) });
        expect(inlayHints).toBeDefined();
        expect(inlayHints).toHaveLength(1);
        expect(inlayHints![0]).toMatchObject({
            label: ': number',
            position: { line: 1, character: 29 },
            kind: lsp.InlayHintKind.Type,
            paddingLeft: true,
        });
    });
});

describe('completions without client snippet support', () => {
    let localServer: TestLspServer;

    beforeAll(async () => {
        const clientCapabilitiesOverride: lsp.ClientCapabilities = {
            textDocument: {
                completion: {
                    completionItem: {
                        snippetSupport: false,
                    },
                },
            },
        };
        localServer = await createServer({
            rootUri: null,
            publishDiagnostics: args => diagnostics.set(args.uri, args),
            clientCapabilitiesOverride,
        });
    });

    beforeEach(() => {
        localServer.closeAll();
        // "closeAll" triggers final publishDiagnostics with an empty list so clear last.
        diagnostics.clear();
        localServer.workspaceEdits = [];
    });

    afterAll(() => {
        localServer.closeAll();
        localServer.shutdown();
    });

    it('resolves completion for method completion does not contain snippet', async () => {
        const doc = {
            uri: uri('bar.ts'),
            languageId: 'typescript',
            version: 1,
            text: `
            import fs from 'fs'
            fs.readFile
        `,
        };
        localServer.didOpenTextDocument({ textDocument: doc });
        const proposals = await localServer.completion({ textDocument: doc, position: positionAfter(doc, 'readFile') });
        expect(proposals).not.toBeNull();
        const completion = proposals!.items.find(completion => completion.label === 'readFile');
        expect(completion!.insertTextFormat).not.toBe(lsp.InsertTextFormat.Snippet);
        expect(completion!.label).toBe('readFile');
        const resolvedItem = await localServer.completionResolve(completion!);
        expect(resolvedItem!.label).toBe('readFile');
        expect(resolvedItem.insertText).toBeUndefined();
        expect(resolvedItem.insertTextFormat).toBeUndefined();
        localServer.didCloseTextDocument({ textDocument: doc });
    });

    it('does not include snippet completions for element prop', async () => {
        const doc = {
            uri: uri('jsx', 'app.tsx'),
            languageId: 'typescriptreact',
            version: 1,
            text: readContents(filePath('jsx', 'app.tsx')),
        };
        localServer.didOpenTextDocument({
            textDocument: doc,
        });

        const completion = await localServer.completion({ textDocument: doc, position: position(doc, 'title') });
        expect(completion).not.toBeNull();
        const item = completion!.items.find(i => i.label === 'title');
        expect(item).toBeUndefined();
    });

    it('does not include snippet completions for object methods', async () => {
        const doc = {
            uri: uri('foo.ts'),
            languageId: 'typescript',
            version: 1,
            text: `
              interface IFoo {
                bar(x: number): void;
              }
              const obj: IFoo = {
                /*a*/
              }
            `,
        };
        localServer.didOpenTextDocument({ textDocument: doc });
        const proposals = await localServer.completion({
            textDocument: doc,
            position: positionAfter(doc, '/*a*/'),
        });
        expect(proposals).not.toBeNull();
        expect(proposals!.items).toHaveLength(1);
        expect(proposals!.items[0]).toMatchObject(
            {
                label: 'bar',
                kind: 2,
            },
        );
    });
});

describe('fileOperations', () => {
    it('willRenameFiles', async () => {
        const edit = await server.willRenameFiles({
            files: [{ oldUri: uri('module1.ts'), newUri: uri('new_module1_name.ts') }],
        });
        expect(edit.changes).toBeDefined();
        expect(Object.keys(edit.changes!)).toHaveLength(1);
        expect(edit.changes![uri('module2.ts')]).toEqual([
            {
                range: {
                    start:{ line: 0, character: 25 },
                    end: { line: 0, character: 34 },
                },
                newText:'./new_module1_name',
            },
        ]);
    });
});
