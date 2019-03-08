/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as chai from 'chai';
import * as lsp from 'vscode-languageserver';
import * as lspTypeHierarchy from './type-hierarchy.lsp.proposal';
import { LspServer } from './lsp-server';
import { uri, createServer, position, lastPosition } from './test-utils';

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

describe('typeHierarchy', () => {
    function asString(item: lspTypeHierarchy.TypeHierarchyItem | null) {
        if (!item) {
            return '<not found>';
        }
        const symbolToString = (item: lspTypeHierarchy.TypeHierarchyItem) =>
            `${item.name} (location: ${item.uri.split('/').pop()}#${item.selectionRange.start.line})`;
        const out: string[] = [];
        out.push(symbolToString(item));
        if (item.parents) {
            out.push(`[supertypes]`);
            for (const parent of item.parents) {
                out.push('--|> ' + symbolToString(parent));
            }
        }
        if (item.children) {
            out.push(`[subtypes]`);
            for (const child of item.children) {
                out.push('<|-- ' + symbolToString(child));
            }
        }
        if (item.parents) {

        }
        return out.join('\n').trim();
    }
    const docModule1 = {
        uri: uri('type-hierarchy-test-module1.ts'),
        languageId: 'typescript',
        version: 1,
        text: `// comment on line 0
export interface SuperInterface {}
export interface SomeInterface {}
export interface Comparable extends SuperInterface {}
export class Bar implements Comparable {}
export class Foo extends Bar implements SomeInterface {}
export class Zoo extends Foo implements SuperInterface { /*
    ...
*/}`
    };

    const docModule2 = {
        uri: uri('type-hierarchy-test-module2.ts'),
        languageId: 'typescript',
        version: 1,
        text: `// comment on line 0
export class Class1 {}
// const named equally
export const Interface1 = Symbol('Interface1');
export interface Interface1 { }
export abstract class AbstractClass implements Interface1 { }
`
    };

    const docModule3 = {
        uri: uri('type-hierarchy-test-module3.ts'),
        languageId: 'typescript',
        version: 1,
        text: `// comment on line 0
import { Class1, Interface1, AbstractClass } from './type-hierarchy-test-module2';
export class Class2 extends Class1 {}
export class Class3 implements Interface1 {}
export class Class4 extends AbstractClass {}
`
    };

    function openDocuments() {
        const docs = [docModule1, docModule2, docModule3];
        for (const textDocument of docs) {
            server.didOpenTextDocument({ textDocument });
        }
    }

    it('find target symbol', async () => {
        openDocuments();
        const item = await server.typeHierarchy(<lspTypeHierarchy.TypeHierarchyParams>{
            textDocument: docModule1,
            position: lsp.Position.create(6, 15),
            direction: lspTypeHierarchy.TypeHierarchyDirection.Parents,
            resolve: 0
        });
        assert.equal(asString(item), `
Zoo (location: type-hierarchy-test-module1.ts#6)`.trim());
    }).timeout(10000);

    it('supertypes: first level', async () => {
        openDocuments();
        const item = await server.typeHierarchy(<lspTypeHierarchy.TypeHierarchyParams>{
            textDocument: docModule1,
            position: lsp.Position.create(6, 15),
            direction: lspTypeHierarchy.TypeHierarchyDirection.Parents,
            resolve: 0
        });
        assert.isTrue(item !== null, "precondition failed: first level");
        assert.isTrue(item!.parents === undefined, "precondition failed: unresolved item");

        const resolvedItem = await server.typeHierarchyResolve({
            item: item!,
            direction: lspTypeHierarchy.TypeHierarchyDirection.Parents,
            resolve: 1
        })
        assert.equal(asString(resolvedItem), `
Zoo (location: type-hierarchy-test-module1.ts#6)
[supertypes]
--|> Foo (location: type-hierarchy-test-module1.ts#5)
--|> SuperInterface (location: type-hierarchy-test-module1.ts#1)`.trim());
    }).timeout(10000);

    it('supertypes: second level', async () => {
        openDocuments();
        const item = await server.typeHierarchy(<lspTypeHierarchy.TypeHierarchyParams>{
            textDocument: docModule1,
            position: lsp.Position.create(6, 15),
            direction: lspTypeHierarchy.TypeHierarchyDirection.Parents,
            resolve: 1
        });
        assert.isTrue(item !== null, "precondition failed: first level");
        assert.isTrue(item!.parents !== undefined, "precondition failed: resolved item");

        const toBeResolved = item!.parents![0];
        const resolvedItem = await server.typeHierarchyResolve({
            item: toBeResolved,
            direction: lspTypeHierarchy.TypeHierarchyDirection.Parents,
            resolve: 1
        })
        assert.equal(asString(resolvedItem), `
Foo (location: type-hierarchy-test-module1.ts#5)
[supertypes]
--|> Bar (location: type-hierarchy-test-module1.ts#4)
--|> SomeInterface (location: type-hierarchy-test-module1.ts#2)`.trim());
    }).timeout(10000);

    it('subtype: first level', async () => {
        openDocuments();
        const item = await server.typeHierarchy(<lspTypeHierarchy.TypeHierarchyParams>{
            textDocument: docModule1,
            position: lsp.Position.create(1, 20),
            direction: lspTypeHierarchy.TypeHierarchyDirection.Children,
            resolve: 0
        });
        assert.isTrue(item !== null, "precondition failed: first level");
        assert.isTrue(item!.parents === undefined, "precondition failed: unresolved item");

        const resolvedItem = await server.typeHierarchyResolve({
            item: item!,
            direction: lspTypeHierarchy.TypeHierarchyDirection.Children,
            resolve: 1
        })
        assert.equal(asString(resolvedItem), `
SuperInterface (location: type-hierarchy-test-module1.ts#1)
[subtypes]
<|-- Comparable (location: type-hierarchy-test-module1.ts#3)
<|-- Zoo (location: type-hierarchy-test-module1.ts#6)`.trim());
    }).timeout(10000);

    it('subtype: second level', async () => {
        openDocuments();
        const item = await server.typeHierarchy(<lspTypeHierarchy.TypeHierarchyParams>{
            textDocument: docModule1,
            position: lsp.Position.create(1, 20),
            direction: lspTypeHierarchy.TypeHierarchyDirection.Children,
            resolve: 1
        });
        assert.isTrue(item !== null, "precondition failed: first level");
        assert.isTrue(item!.children !== undefined, "precondition failed: resolved item");

        const toBeResolved = item!.children![0];
        const resolvedItem = await server.typeHierarchyResolve({
            item: toBeResolved,
            direction: lspTypeHierarchy.TypeHierarchyDirection.Children,
            resolve: 1
        })
        assert.equal(asString(resolvedItem), `
Comparable (location: type-hierarchy-test-module1.ts#3)
[subtypes]
<|-- Bar (location: type-hierarchy-test-module1.ts#4)`.trim());
    }).timeout(10000);

    it('supertypes and subtypes combined', async () => {
        openDocuments();
        const item = await server.typeHierarchy(<lspTypeHierarchy.TypeHierarchyParams>{
            textDocument: docModule1,
            position: lsp.Position.create(5, 16),
            direction: lspTypeHierarchy.TypeHierarchyDirection.Both,
            resolve: 1
        });
        assert.isTrue(item !== null, "precondition failed: first level");

        assert.equal(asString(item), `
Foo (location: type-hierarchy-test-module1.ts#5)
[supertypes]
--|> Bar (location: type-hierarchy-test-module1.ts#4)
--|> SomeInterface (location: type-hierarchy-test-module1.ts#2)
[subtypes]
<|-- Zoo (location: type-hierarchy-test-module1.ts#6)`.trim());
    }).timeout(10000);

    it('supertype in imported module', async () => {
        openDocuments();
        const item = await server.typeHierarchy(<lspTypeHierarchy.TypeHierarchyParams>{
            textDocument: docModule3,
            position: lsp.Position.create(2, 16),
            direction: lspTypeHierarchy.TypeHierarchyDirection.Parents,
            resolve: 1
        });
        assert.isTrue(item !== null, "precondition failed: first level");

        assert.equal(asString(item), `
Class2 (location: type-hierarchy-test-module3.ts#2)
[supertypes]
--|> Class1 (location: type-hierarchy-test-module2.ts#1)`.trim());
    }).timeout(10000);

    it('subtype in imported module', async () => {
        openDocuments();
        const item = await server.typeHierarchy(<lspTypeHierarchy.TypeHierarchyParams>{
            textDocument: docModule2,
            position: lsp.Position.create(1, 16),
            direction: lspTypeHierarchy.TypeHierarchyDirection.Children,
            resolve: 1
        });
        assert.isTrue(item !== null, "precondition failed: first level");

        assert.equal(asString(item), `
Class1 (location: type-hierarchy-test-module2.ts#1)
[subtypes]
<|-- Class2 (location: type-hierarchy-test-module3.ts#2)`.trim());
    }).timeout(10000);

    it('subtypes of interfaces', async () => {
        openDocuments();
        const item = await server.typeHierarchy(<lspTypeHierarchy.TypeHierarchyParams>{
            textDocument: docModule2,
            position: lsp.Position.create(4, 20),
            direction: lspTypeHierarchy.TypeHierarchyDirection.Children,
            resolve: 1
        });
        assert.isTrue(item !== null, "precondition failed: first level");

        assert.equal(asString(item), `
Interface1 (location: type-hierarchy-test-module2.ts#4)
[subtypes]
<|-- AbstractClass (location: type-hierarchy-test-module2.ts#5)
<|-- Class3 (location: type-hierarchy-test-module3.ts#3)`.trim());
    }).timeout(10000);

    it('subtypes of abstract class', async () => {
        openDocuments();
        const item = await server.typeHierarchy(<lspTypeHierarchy.TypeHierarchyParams>{
            textDocument: docModule2,
            position: lsp.Position.create(5, 25),
            direction: lspTypeHierarchy.TypeHierarchyDirection.Children,
            resolve: 1
        });
        assert.isTrue(item !== null, "precondition failed: first level");

        assert.equal(asString(item), `
AbstractClass (location: type-hierarchy-test-module2.ts#5)
[subtypes]
<|-- Class4 (location: type-hierarchy-test-module3.ts#4)`.trim());
    }).timeout(10000);
});
