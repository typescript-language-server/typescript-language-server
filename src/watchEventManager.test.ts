/*
 * Copyright (C) 2026 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as lsp from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { WatchEventManager, WatchEventManagerOptions } from './watchEventManager.js';
import { EventName, type ts } from './ts-protocol.js';
import type { LspClient } from './lsp-client.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

const flushPromises = () => new Promise<void>(resolve => setTimeout(resolve, 0));

function makeLogger() {
    return {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        log: vi.fn(),
        logIgnoringVerbosity: vi.fn(),
        trace: vi.fn(),

    };
}

type TestDisposable = lsp.Disposable & { disposed: boolean; };

function makeDisposable(): TestDisposable {
    const d = {
        disposed: false,
        dispose: vi.fn(() => {
            d.disposed = true;
        }),
    };
    return d;
}

interface ManagerSetup {
    manager: WatchEventManager;
    registerSpy: ReturnType<typeof vi.fn<(_watchers: lsp.FileSystemWatcher[]) => TestDisposable>>;
    sendWatchChanges: ReturnType<typeof vi.fn<WatchEventManagerOptions['sendWatchChanges']>>;
    registrations: TestDisposable[];
}

async function createManager(opts: Partial<WatchEventManagerOptions> & { workspacePaths?: string[]; caseInsensitive?: boolean; initialize?: boolean; } = {}): Promise<ManagerSetup> {
    const registrations: TestDisposable[] = [];
    const registerSpy = vi.fn((_watchers) => {
        const d = makeDisposable();
        registrations.push(d);
        return d;
    });
    const sendWatchChanges = vi.fn();

    const workspaceFolders = (opts.workspacePaths ?? ['/workspace']).map(p => URI.file(p));

    const manager = new WatchEventManager({
        lspClient: { registerDidChangeWatchedFilesCapability: registerSpy } as unknown as LspClient,
        logger: makeLogger(),
        workspaceFolders,
        sendWatchChanges,
        caseInsensitive: opts.caseInsensitive ?? false,
        ...opts,
    });

    const initialize = opts.initialize ?? true;
    if (initialize) {
        manager.onInitialized();
        await flushPromises();
    }

    return { manager, registerSpy, sendWatchChanges, registrations };
}

// Convenience event factories
function createFileWatcherEvent(id: number, filePath: string): ts.server.protocol.CreateFileWatcherEvent {
    return { event: EventName.createFileWatcher, seq: 0, type: 'event', body: { id, path: filePath } };
}

function createDirectoryWatcherEvent(id: number, dirPath: string, recursive = false, ignoreUpdate = false): ts.server.protocol.CreateDirectoryWatcherEvent {
    return { event: EventName.createDirectoryWatcher, seq: 0, type: 'event', body: { id, path: dirPath, recursive, ignoreUpdate } };
}

function closeWatcherEvent(id: number): ts.server.protocol.CloseFileWatcherEvent {
    return { event: EventName.closeFileWatcher, seq: 0, type: 'event', body: { id } };
}

function fileChange(uri: string, type: lsp.FileChangeType): lsp.FileEvent {
    return { uri, type };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('WatchEventManager', () => {
    describe('handleTsserverEvent routing', () => {
        it('returns true and processes createFileWatcher', async () => {
            const { manager, registerSpy } = await createManager();

            const result = manager.handleTsserverEvent(createFileWatcherEvent(1, '/outside/file.ts'));
            expect(result).toBe(true);
            await flushPromises();
            // registration should update since a new coverage entry was added
            expect(registerSpy).toHaveBeenCalledTimes(2); // once for workspace init, once for new file
        });

        it('returns true and processes createDirectoryWatcher', async () => {
            const { manager } = await createManager();
            const result = manager.handleTsserverEvent(createDirectoryWatcherEvent(1, '/outside/dir'));
            expect(result).toBe(true);
        });

        it('returns true and processes closeFileWatcher', async () => {
            const { manager } = await createManager();
            manager.handleTsserverEvent(createFileWatcherEvent(1, '/outside/file.ts'));
            const result = manager.handleTsserverEvent(closeWatcherEvent(1));
            expect(result).toBe(true);
        });

        it('returns false for unknown events', async () => {
            const { manager } = await createManager();
            const result = manager.handleTsserverEvent({ event: EventName.semanticDiag, seq: 0, type: 'event' });
            expect(result).toBe(false);
        });
    });

    describe('LSP capability registration', () => {
        it('does not register before onInitialized', async () => {
            const { manager, registerSpy } = await createManager({ initialize: false });
            manager.handleTsserverEvent(createFileWatcherEvent(1, '/outside/file.ts'));
            await flushPromises();
            expect(registerSpy).not.toHaveBeenCalled();
        });

        it('registers workspace watchers on onInitialized', async () => {
            const { registerSpy } = await createManager({ workspacePaths: ['/workspace'] });
            expect(registerSpy).toHaveBeenCalledOnce();
            const [watchers] = registerSpy.mock.calls[0];
            expect(watchers).toHaveLength(1);
            const glob = watchers[0].globPattern as lsp.RelativePattern;
            expect(glob.pattern).toBe('**/*');
        });

        it('registers watchers for multiple workspace folders', async () => {
            const { registerSpy } = await createManager({ workspacePaths: ['/ws1', '/ws2'] });
            const [watchers] = registerSpy.mock.calls[0];
            expect(watchers).toHaveLength(2);
        });

        it('re-registers when a new coverage entry is added after initialization', async () => {
            const { manager, registerSpy } = await createManager();
            expect(registerSpy).toHaveBeenCalledTimes(1);

            manager.handleTsserverEvent(createFileWatcherEvent(1, '/outside/file.ts'));
            await flushPromises();
            expect(registerSpy).toHaveBeenCalledTimes(2);
        });

        it('does not re-register when coverage is unchanged', async () => {
            const { manager, registerSpy } = await createManager();

            // Add a watcher, then add an identical one — same coverage key, no re-register
            manager.handleTsserverEvent(createDirectoryWatcherEvent(1, '/outside/dir', true));
            await flushPromises();
            const callsAfterFirst = registerSpy.mock.calls.length;

            manager.handleTsserverEvent(createDirectoryWatcherEvent(2, '/outside/dir', true));
            await flushPromises();
            expect(registerSpy.mock.calls.length).toBe(callsAfterFirst); // no extra call
        });

        it('disposes old registration before creating a new one', async () => {
            const { manager, registrations } = await createManager({ workspacePaths: ['/ws'] });
            const firstReg = registrations[0];

            manager.handleTsserverEvent(createFileWatcherEvent(1, '/outside/file.ts'));
            await flushPromises();
            expect(firstReg.disposed).toBe(true);
            expect(registrations).toHaveLength(2);
        });

        it('does not leak registrations when two slow updates are triggered before the first resolves', async () => {
            // Simulate slow async registration so both calls are in-flight simultaneously.
            let resolveFirst!: (d: TestDisposable) => void;
            const firstRegistration = makeDisposable();
            const secondRegistration = makeDisposable();
            let callCount = 0;
            const slowRegisterSpy = vi.fn(async (_watchers: lsp.FileSystemWatcher[]) => {
                callCount++;
                if (callCount === 1) {
                    return new Promise<TestDisposable>(resolve => {
                        resolveFirst = resolve;
                    });
                }
                return secondRegistration;
            });

            const manager = new WatchEventManager({
                lspClient: { registerDidChangeWatchedFilesCapability: slowRegisterSpy } as unknown as LspClient,
                logger: makeLogger(),
                workspaceFolders: [URI.file('/workspace')],
                sendWatchChanges: vi.fn(),
                caseInsensitive: false,
            });

            // Start update 1 (workspace), then yield so doUpdateRegistration runs up to
            // its first await — at that point slowRegisterSpy has been called and resolveFirst is set.
            manager.onInitialized();
            await Promise.resolve();

            // Queue update 2 while update 1 is still awaiting its registration promise.
            manager.handleTsserverEvent(createFileWatcherEvent(1, '/outside/a.ts'));

            // Resolve the first registration; with the serial queue, update 2 then runs,
            // disposes firstRegistration, and registers secondRegistration.
            resolveFirst(firstRegistration);
            await flushPromises();

            // With serial execution: update 1 completes (sets firstRegistration), then update 2
            // runs, disposes firstRegistration, and registers secondRegistration.
            expect(firstRegistration.disposed).toBe(true);
            expect(secondRegistration.disposed).toBe(false);
            expect(slowRegisterSpy).toHaveBeenCalledTimes(2);
        });

        it('does not leak registrations when two quick updates are triggered before the first resolves', async () => {
            const { manager, registerSpy } = await createManager();
            expect(registerSpy).toHaveBeenCalledTimes(1);
            manager.handleTsserverEvent(createFileWatcherEvent(1, '/outside/file.ts'));
            manager.handleTsserverEvent(createFileWatcherEvent(1, '/outside/file2.ts'));
            await flushPromises();
            // Two manual watchers were collapsed into one registration.
            expect(registerSpy).toHaveBeenCalledTimes(2);
            const firstRegistration = registerSpy.mock.results[0];
            expect(firstRegistration.type).toBe('return');
            if (firstRegistration.type === 'return') {
                expect(firstRegistration.value.disposed).toBe(true);
            }
            const secondRegistration = registerSpy.mock.results[1];
            expect(secondRegistration.type).toBe('return');
            if (secondRegistration.type === 'return') {
                expect(secondRegistration.value.disposed).toBe(false);
            }
        });

        it('disposes registration when manager goes away during registration', async () => {
            // Simulate slow async registration.
            let resolveFirst!: (d: TestDisposable) => void;
            const firstRegistration = makeDisposable();
            const slowRegisterSpy = vi.fn(async (_watchers: lsp.FileSystemWatcher[]) => {
                return new Promise<TestDisposable>(resolve => {
                    resolveFirst = resolve;
                });
            });

            const manager = new WatchEventManager({
                lspClient: { registerDidChangeWatchedFilesCapability: slowRegisterSpy } as unknown as LspClient,
                logger: makeLogger(),
                workspaceFolders: [URI.file('/workspace')],
                sendWatchChanges: vi.fn(),
                caseInsensitive: false,
            });

            // Start update 1 (workspace), then yield so doUpdateRegistration runs up to
            // its first await — at that point slowRegisterSpy has been called and resolveFirst is set.
            manager.onInitialized();
            await flushPromises();

            // Dispose the manager before resolving the first registration.
            manager.dispose();
            resolveFirst(firstRegistration);
            await flushPromises();
            expect(slowRegisterSpy).toHaveBeenCalledTimes(1);
            expect(firstRegistration.disposed).toBe(true);
        });

        it('unregisters all watchers when no workspace folders', async () => {
            const { manager, registerSpy, registrations } = await createManager({ workspacePaths: [] });
            manager.handleTsserverEvent(createFileWatcherEvent(1, '/outside/file.ts'));
            await flushPromises();
            expect(registerSpy).toHaveBeenCalledOnce();
            expect(registrations[0].disposed).toBe(false);
            manager.handleTsserverEvent(closeWatcherEvent(1));
            await flushPromises();
            expect(registerSpy).toHaveBeenCalledOnce();
            expect(registrations[0].disposed).toBe(true);
        });
    });

    describe('dispose', () => {
        it('disposes the active registration', async () => {
            const { manager, registrations } = await createManager();
            const reg = registrations[0];
            expect(reg.disposed).toBe(false);
            manager.dispose();
            expect(reg.disposed).toBe(true);
        });
    });

    describe('coverage tracking for out-of-workspace watchers', () => {
        it('creates coverage for a file watcher outside the workspace', async () => {
            const { manager, registerSpy } = await createManager();
            registerSpy.mockClear();

            manager.handleTsserverEvent(createFileWatcherEvent(1, '/outside/dir/file.ts'));
            await flushPromises();
            expect(registerSpy).toHaveBeenCalledOnce();
            const [watchers] = registerSpy.mock.calls[0];
            const extraWatcher = watchers.find(w => {
                const glob = w.globPattern as lsp.RelativePattern;
                return glob.pattern === 'file.ts';
            });
            expect(extraWatcher).toBeDefined();
        });

        it('creates coverage for a non-recursive directory watcher outside workspace', async () => {
            const { manager, registerSpy } = await createManager();
            registerSpy.mockClear();

            manager.handleTsserverEvent(createDirectoryWatcherEvent(1, '/outside/dir', false));
            await flushPromises();
            expect(registerSpy).toHaveBeenCalledOnce();
            const [watchers] = registerSpy.mock.calls[0];
            const dirWatcher = watchers.find(w => {
                const glob = w.globPattern as lsp.RelativePattern;
                return glob.pattern === '*';
            });
            expect(dirWatcher).toBeDefined();
        });

        it('creates coverage for a recursive directory watcher outside workspace', async () => {
            const { manager, registerSpy } = await createManager();
            registerSpy.mockClear();

            manager.handleTsserverEvent(createDirectoryWatcherEvent(1, '/outside/dir', true));
            await flushPromises();
            const [watchers] = registerSpy.mock.calls[0];
            const dirWatcher = watchers.find(w => {
                const glob = w.globPattern as lsp.RelativePattern;
                return glob.pattern === '**/*';
            });
            expect(dirWatcher).toBeDefined();
        });

        it('does not create coverage for files inside the workspace', async () => {
            const { manager, registerSpy } = await createManager({ workspacePaths: ['/workspace'] });
            const initialCallCount = registerSpy.mock.calls.length;

            manager.handleTsserverEvent(createFileWatcherEvent(1, '/workspace/src/index.ts'));
            await flushPromises();
            // No new registration because workspace coverage already handles this
            expect(registerSpy.mock.calls.length).toBe(initialCallCount);
        });

        it('upgrades watchKind from create|delete to create|change|delete when a second watcher needs updates', async () => {
            const { manager, registerSpy } = await createManager();
            registerSpy.mockClear();

            // First watcher ignores updates → create|delete only
            manager.handleTsserverEvent(createDirectoryWatcherEvent(1, '/outside/dir', false, true));
            await flushPromises();
            const [w1] = registerSpy.mock.calls[0];
            const firstKind = w1.find(w => (w.globPattern as lsp.RelativePattern).pattern === '*')?.kind;
            expect(firstKind).toBe(lsp.WatchKind.Create | lsp.WatchKind.Delete);

            registerSpy.mockClear();

            // Second watcher on same dir does NOT ignore updates → should upgrade to create|change|delete
            manager.handleTsserverEvent(createDirectoryWatcherEvent(2, '/outside/dir', false, false));
            await flushPromises();
            const [w2] = registerSpy.mock.calls[0];
            const upgradedKind = w2.find(w => (w.globPattern as lsp.RelativePattern).pattern === '*')?.kind;
            expect(upgradedKind).toBe(lsp.WatchKind.Create | lsp.WatchKind.Change | lsp.WatchKind.Delete);
        });

        it('removes non-permanent coverage when last watcher for that key is closed', async () => {
            const { manager, registerSpy } = await createManager();
            registerSpy.mockClear();

            manager.handleTsserverEvent(createFileWatcherEvent(1, '/outside/dir/file.ts'));
            await flushPromises();
            registerSpy.mockClear();

            manager.handleTsserverEvent(closeWatcherEvent(1));
            await flushPromises();
            // Re-registered without the out-of-workspace watcher
            expect(registerSpy).toHaveBeenCalledOnce();
            const [watchers] = registerSpy.mock.calls[0];
            const hasFileWatcher = watchers.some(w => {
                const glob = w.globPattern as lsp.RelativePattern;
                return glob.pattern === 'file.ts';
            });
            expect(hasFileWatcher).toBe(false);
        });

        it('keeps coverage when multiple watchers share a key and only one closes', async () => {
            const { manager, registerSpy } = await createManager();
            registerSpy.mockClear();

            manager.handleTsserverEvent(createDirectoryWatcherEvent(1, '/outside/dir', true));
            manager.handleTsserverEvent(createDirectoryWatcherEvent(2, '/outside/dir', true));
            await flushPromises();
            registerSpy.mockClear();

            manager.handleTsserverEvent(closeWatcherEvent(1));
            await flushPromises();
            // Coverage still needed for watcher 2 — no re-registration
            expect(registerSpy).not.toHaveBeenCalled();
        });

        it('never removes permanent workspace coverage entries', async () => {
            const { manager, registerSpy } = await createManager({ workspacePaths: ['/workspace'] });
            registerSpy.mockClear();

            // A watcher inside the workspace gets no coverageKey, so closing it can't remove workspace coverage
            manager.handleTsserverEvent(createFileWatcherEvent(1, '/workspace/src/index.ts'));
            manager.handleTsserverEvent(closeWatcherEvent(1));
            await flushPromises();
            expect(registerSpy).not.toHaveBeenCalled();
        });

        it('ignores closeWatcher for unknown id', async () => {
            const { manager } = await createManager();
            expect(() => manager.handleTsserverEvent(closeWatcherEvent(999))).not.toThrow();
        });
    });

    describe('handleFileChanges — dispatching to tsserver', () => {
        let setup: ManagerSetup;

        beforeEach(async () => {
            setup = await createManager({ workspacePaths: ['/workspace'] });
        });

        it('is a no-op when there are no watchers', () => {
            setup.manager.handleFileChanges({ changes: [fileChange('file:///workspace/a.ts', lsp.FileChangeType.Changed)] });
            expect(setup.sendWatchChanges).not.toHaveBeenCalled();
        });

        it('is a no-op when changes array is empty', () => {
            setup.manager.handleTsserverEvent(createFileWatcherEvent(1, '/workspace/a.ts'));
            setup.manager.handleFileChanges({ changes: [] });
            expect(setup.sendWatchChanges).not.toHaveBeenCalled();
        });

        it('dispatches Created change to a matching file watcher', () => {
            setup.manager.handleTsserverEvent(createFileWatcherEvent(1, '/workspace/src/a.ts'));
            setup.manager.handleFileChanges({
                changes: [fileChange(URI.file('/workspace/src/a.ts').toString(), lsp.FileChangeType.Created)],
            });
            expect(setup.sendWatchChanges).toHaveBeenCalledOnce();
            const args = setup.sendWatchChanges.mock.calls[0][0] as ts.server.protocol.WatchChangeRequestArgs;
            expect(args).not.toBeInstanceOf(Array);
            expect(args.id).toBe(1);
            expect(args.created).toEqual(['/workspace/src/a.ts']);
            expect(args.deleted).toBeUndefined();
            expect(args.updated).toBeUndefined();
        });

        it('dispatches Deleted change to a matching file watcher', () => {
            setup.manager.handleTsserverEvent(createFileWatcherEvent(1, '/workspace/src/a.ts'));
            setup.manager.handleFileChanges({
                changes: [fileChange(URI.file('/workspace/src/a.ts').toString(), lsp.FileChangeType.Deleted)],
            });
            const args = setup.sendWatchChanges.mock.calls[0][0] as ts.server.protocol.WatchChangeRequestArgs;
            expect(args).not.toBeInstanceOf(Array);
            expect(args.deleted).toEqual(['/workspace/src/a.ts']);
        });

        it('dispatches Changed change to a matching file watcher', () => {
            setup.manager.handleTsserverEvent(createFileWatcherEvent(1, '/workspace/src/a.ts'));
            setup.manager.handleFileChanges({
                changes: [fileChange(URI.file('/workspace/src/a.ts').toString(), lsp.FileChangeType.Changed)],
            });
            const args = setup.sendWatchChanges.mock.calls[0][0] as ts.server.protocol.WatchChangeRequestArgs;
            expect(args).not.toBeInstanceOf(Array);
            expect(args.updated).toEqual(['/workspace/src/a.ts']);
        });

        it('does not dispatch Changed to a watcher with ignoreUpdate=true', () => {
            setup.manager.handleTsserverEvent(createDirectoryWatcherEvent(1, '/workspace/src', false, true));
            setup.manager.handleFileChanges({
                changes: [fileChange(URI.file('/workspace/src/a.ts').toString(), lsp.FileChangeType.Changed)],
            });
            expect(setup.sendWatchChanges).not.toHaveBeenCalled();
        });

        it('dispatches Created/Deleted to a watcher with ignoreUpdate=true', () => {
            setup.manager.handleTsserverEvent(createDirectoryWatcherEvent(1, '/workspace/src', false, true));
            setup.manager.handleFileChanges({
                changes: [fileChange(URI.file('/workspace/src/a.ts').toString(), lsp.FileChangeType.Created)],
            });
            expect(setup.sendWatchChanges).toHaveBeenCalledOnce();
        });

        it('does not match a file watcher to a different path', () => {
            setup.manager.handleTsserverEvent(createFileWatcherEvent(1, '/workspace/src/a.ts'));
            setup.manager.handleFileChanges({
                changes: [fileChange(URI.file('/workspace/src/b.ts').toString(), lsp.FileChangeType.Changed)],
            });
            expect(setup.sendWatchChanges).not.toHaveBeenCalled();
        });

        describe('directory watcher — non-recursive', () => {
            it('matches direct children', () => {
                setup.manager.handleTsserverEvent(createDirectoryWatcherEvent(1, '/workspace/src', false));
                setup.manager.handleFileChanges({
                    changes: [fileChange(URI.file('/workspace/src/a.ts').toString(), lsp.FileChangeType.Created)],
                });
                expect(setup.sendWatchChanges).toHaveBeenCalledOnce();
                const args = setup.sendWatchChanges.mock.calls[0][0] as ts.server.protocol.WatchChangeRequestArgs;
                expect(args).not.toBeInstanceOf(Array);
                expect(args.id).toBe(1);
            });

            it('does not match nested children', () => {
                setup.manager.handleTsserverEvent(createDirectoryWatcherEvent(1, '/workspace/src', false));
                setup.manager.handleFileChanges({
                    changes: [fileChange(URI.file('/workspace/src/sub/a.ts').toString(), lsp.FileChangeType.Created)],
                });
                expect(setup.sendWatchChanges).not.toHaveBeenCalled();
            });
        });

        describe('directory watcher — recursive', () => {
            it('matches direct children', () => {
                setup.manager.handleTsserverEvent(createDirectoryWatcherEvent(1, '/workspace/src', true));
                setup.manager.handleFileChanges({
                    changes: [fileChange(URI.file('/workspace/src/a.ts').toString(), lsp.FileChangeType.Created)],
                });
                expect(setup.sendWatchChanges).toHaveBeenCalledOnce();
            });

            it('matches deeply nested children', () => {
                setup.manager.handleTsserverEvent(createDirectoryWatcherEvent(1, '/workspace/src', true));
                setup.manager.handleFileChanges({
                    changes: [fileChange(URI.file('/workspace/src/a/b/c.ts').toString(), lsp.FileChangeType.Created)],
                });
                expect(setup.sendWatchChanges).toHaveBeenCalledOnce();
            });

            it('does not match sibling directories', () => {
                setup.manager.handleTsserverEvent(createDirectoryWatcherEvent(1, '/workspace/src', true));
                setup.manager.handleFileChanges({
                    changes: [fileChange(URI.file('/workspace/other/a.ts').toString(), lsp.FileChangeType.Created)],
                });
                expect(setup.sendWatchChanges).not.toHaveBeenCalled();
            });
        });

        it('sends a single args object when only one watcher is affected', () => {
            setup.manager.handleTsserverEvent(createFileWatcherEvent(1, '/workspace/a.ts'));
            setup.manager.handleFileChanges({
                changes: [fileChange(URI.file('/workspace/a.ts').toString(), lsp.FileChangeType.Created)],
            });
            const arg = setup.sendWatchChanges.mock.calls[0][0];
            expect(arg).not.toBeInstanceOf(Array);
        });

        it('sends an array when multiple watchers are affected', () => {
            setup.manager.handleTsserverEvent(createFileWatcherEvent(1, '/workspace/a.ts'));
            setup.manager.handleTsserverEvent(createFileWatcherEvent(2, '/workspace/b.ts'));
            setup.manager.handleFileChanges({
                changes: [
                    fileChange(URI.file('/workspace/a.ts').toString(), lsp.FileChangeType.Created),
                    fileChange(URI.file('/workspace/b.ts').toString(), lsp.FileChangeType.Deleted),
                ],
            });
            const arg = setup.sendWatchChanges.mock.calls[0][0];
            expect(Array.isArray(arg)).toBe(true);
            expect((arg as ts.server.protocol.WatchChangeRequestArgs[]).map(a => a.id).sort()).toEqual([1, 2]);
        });

        it('batches multiple changes to the same watcher into one args entry', () => {
            setup.manager.handleTsserverEvent(createDirectoryWatcherEvent(1, '/workspace/src', true));
            setup.manager.handleFileChanges({
                changes: [
                    fileChange(URI.file('/workspace/src/a.ts').toString(), lsp.FileChangeType.Created),
                    fileChange(URI.file('/workspace/src/b.ts').toString(), lsp.FileChangeType.Deleted),
                ],
            });
            const arg = setup.sendWatchChanges.mock.calls[0][0] as ts.server.protocol.WatchChangeRequestArgs;
            expect(arg).not.toBeInstanceOf(Array);
            expect(arg.id).toBe(1);
            expect(arg.created).toEqual(['/workspace/src/a.ts']);
            expect(arg.deleted).toEqual(['/workspace/src/b.ts']);
        });

        it('does not dispatch when change path does not match any watcher', () => {
            setup.manager.handleTsserverEvent(createFileWatcherEvent(1, '/workspace/a.ts'));
            setup.manager.handleFileChanges({
                changes: [fileChange(URI.file('/workspace/unrelated.ts').toString(), lsp.FileChangeType.Created)],
            });
            expect(setup.sendWatchChanges).not.toHaveBeenCalled();
        });
    });

    describe('case-insensitive path matching', () => {
        it('matches file watchers case-insensitively', async () => {
            const { manager, sendWatchChanges } = await createManager({
                workspacePaths: ['/Workspace'],
                caseInsensitive: true,
            });
            manager.handleTsserverEvent(createFileWatcherEvent(1, '/Workspace/src/A.ts'));
            manager.handleFileChanges({
                changes: [fileChange(URI.file('/workspace/src/a.ts').toString(), lsp.FileChangeType.Changed)],
            });
            expect(sendWatchChanges).toHaveBeenCalledOnce();
        });

        it('treats workspace coverage as case-insensitive', async () => {
            const { manager, registerSpy } = await createManager({
                workspacePaths: ['/Workspace'],
                caseInsensitive: true,
            });
            const initialCalls = registerSpy.mock.calls.length;

            // This path is inside the workspace (different case) — should not create extra coverage
            manager.handleTsserverEvent(createFileWatcherEvent(1, '/WORKSPACE/src/index.ts'));
            expect(registerSpy.mock.calls.length).toBe(initialCalls);
        });
    });
});
