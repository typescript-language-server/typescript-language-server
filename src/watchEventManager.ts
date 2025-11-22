import path from 'node:path';
import * as lsp from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import type { ts } from './ts-protocol.js';
import type { LspClient } from './lsp-client.js';
import type { Logger } from './utils/logger.js';

type TsserverWatcher = {
    readonly id: number;
    readonly path: string;
    readonly normalizedPath: string;
    readonly kind: 'file' | 'directory';
    readonly recursive: boolean;
    readonly ignoreUpdate: boolean;
    coverageKey?: string;
};

type CoverageEntry = {
    readonly key: string;
    readonly normalizedBase: string;
    readonly watcher: lsp.FileSystemWatcher;
    watchKind: lsp.WatchKind;
    readonly permanent: boolean;
};

export interface WatchEventManagerOptions {
    readonly lspClient: LspClient;
    readonly logger: Logger;
    readonly workspaceFolders: readonly URI[];
    readonly sendWatchChanges: (args: ts.server.protocol.WatchChangeRequestArgs | readonly ts.server.protocol.WatchChangeRequestArgs[]) => void;
    readonly caseInsensitive: boolean;
}

export class WatchEventManager {
    private readonly watchers = new Map<number, TsserverWatcher>();
    private readonly coverage = new Map<string, CoverageEntry>();
    private readonly coverageUsage = new Map<string, number>();
    private readonly workspacePaths: readonly string[];
    private registration: lsp.Disposable | undefined;
    private registrationSignature: string | undefined;
    private readyForRegistration = false;

    constructor(private readonly options: WatchEventManagerOptions) {
        this.workspacePaths = options.workspaceFolders.map(folder => this.normalizePath(folder.fsPath));
        for (const folder of options.workspaceFolders) {
            const key = this.coverageKey(folder.fsPath, '**/*');
            const entry: CoverageEntry = {
                key,
                normalizedBase: this.normalizePath(folder.fsPath),
                watcher: {
                    globPattern: {
                        baseUri: folder.toString(),
                        pattern: '**/*',
                    },
                    kind: lsp.WatchKind.Create | lsp.WatchKind.Change | lsp.WatchKind.Delete,
                },
                watchKind: lsp.WatchKind.Create | lsp.WatchKind.Change | lsp.WatchKind.Delete,
                permanent: true,
            };
            this.coverage.set(key, entry);
        }
    }

    public onInitialized(): void {
        this.readyForRegistration = true;
        void this.updateRegistration();
    }

    public dispose(): void {
        void this.registration?.dispose?.();
        this.watchers.clear();
        this.coverage.clear();
        this.coverageUsage.clear();
    }

    public handleTsserverEvent(event: ts.server.protocol.Event): boolean {
        switch (event.event) {
            case 'createFileWatcher':
                this.addFileWatcher((event as ts.server.protocol.CreateFileWatcherEvent).body);
                return true;
            case 'createDirectoryWatcher':
                this.addDirectoryWatcher((event as ts.server.protocol.CreateDirectoryWatcherEvent).body);
                return true;
            case 'closeFileWatcher':
                this.closeWatcher((event as ts.server.protocol.CloseFileWatcherEvent).body);
                return true;
            default:
                return false;
        }
    }

    public handleFileChanges(params: lsp.DidChangeWatchedFilesParams): void {
        if (!this.watchers.size || !params.changes.length) {
            return;
        }

        type ChangeBucket = { created: string[]; deleted: string[]; updated: string[]; };
        const collected = new Map<number, ChangeBucket>();
        for (const change of params.changes) {
            const uri = URI.parse(change.uri);
            const fsPath = uri.fsPath;
            const normalizedFsPath = this.normalizePath(fsPath);
            const tsserverPath = this.toTsserverPath(fsPath);

            for (const watcher of this.watchers.values()) {
                if (!this.watcherMatchesPath(watcher, normalizedFsPath)) {
                    continue;
                }

                if (change.type === lsp.FileChangeType.Changed && watcher.ignoreUpdate) {
                    continue;
                }

                const changes = this.ensureChangeBucket(collected, watcher.id);
                switch (change.type) {
                    case lsp.FileChangeType.Created:
                        changes.created.push(tsserverPath);
                        break;
                    case lsp.FileChangeType.Deleted:
                        changes.deleted.push(tsserverPath);
                        break;
                    case lsp.FileChangeType.Changed:
                        changes.updated.push(tsserverPath);
                        break;
                }
            }
        }

        if (!collected.size) {
            return;
        }

        const payload: ts.server.protocol.WatchChangeRequestArgs[] = [];
        for (const [id, changes] of collected.entries()) {
            payload.push({
                id,
                created: changes.created.length ? changes.created : undefined,
                deleted: changes.deleted.length ? changes.deleted : undefined,
                updated: changes.updated.length ? changes.updated : undefined,
            });
        }
        this.options.sendWatchChanges(payload.length === 1 ? payload[0] : payload);
    }

    private ensureChangeBucket(collected: Map<number, { created: string[]; deleted: string[]; updated: string[]; }>, id: number) {
        let bucket = collected.get(id);
        if (!bucket) {
            bucket = { created: [], deleted: [], updated: [] };
            collected.set(id, bucket);
        }
        return bucket;
    }

    private addFileWatcher(body: ts.server.protocol.CreateFileWatcherEventBody): void {
        const normalizedPath = this.normalizePath(body.path);
        const watcher: TsserverWatcher = {
            id: body.id,
            path: body.path,
            normalizedPath,
            kind: 'file',
            recursive: false,
            ignoreUpdate: false,
        };

        watcher.coverageKey = this.ensureCoverageForWatcher(watcher);
        this.watchers.set(body.id, watcher);
    }

    private addDirectoryWatcher(body: ts.server.protocol.CreateDirectoryWatcherEventBody): void {
        const normalizedPath = this.normalizePath(body.path);
        const watcher: TsserverWatcher = {
            id: body.id,
            path: body.path,
            normalizedPath,
            kind: 'directory',
            recursive: !!body.recursive,
            ignoreUpdate: !!body.ignoreUpdate,
        };

        watcher.coverageKey = this.ensureCoverageForWatcher(watcher);
        this.watchers.set(body.id, watcher);
    }

    private closeWatcher(body: ts.server.protocol.CloseFileWatcherEventBody): void {
        const watcher = this.watchers.get(body.id);
        if (!watcher) {
            return;
        }
        this.watchers.delete(body.id);
        if (!watcher.coverageKey) {
            return;
        }
        const usage = (this.coverageUsage.get(watcher.coverageKey) ?? 1) - 1;
        if (usage <= 0) {
            this.coverageUsage.delete(watcher.coverageKey);
            const coverage = this.coverage.get(watcher.coverageKey);
            if (coverage && !coverage.permanent) {
                this.coverage.delete(watcher.coverageKey);
                this.registrationSignature = undefined;
                void this.updateRegistration();
            }
        } else {
            this.coverageUsage.set(watcher.coverageKey, usage);
        }
    }

    private ensureCoverageForWatcher(watcher: TsserverWatcher): string | undefined {
        if (this.isCoveredByWorkspace(watcher.normalizedPath)) {
            return undefined;
        }

        const basePath = watcher.kind === 'file' ? path.dirname(watcher.path) : watcher.path;
        const pattern = watcher.kind === 'file'
            ? path.basename(watcher.path)
            : watcher.recursive ? '**/*' : '*';
        const coverageKey = this.coverageKey(basePath, pattern);
        const desiredWatchKind = watcher.ignoreUpdate
            ? lsp.WatchKind.Create | lsp.WatchKind.Delete
            : lsp.WatchKind.Create | lsp.WatchKind.Change | lsp.WatchKind.Delete;

        const existing = this.coverage.get(coverageKey);
        let coverageChanged = false;
        if (existing) {
            const addedChangeWatch = desiredWatchKind !== existing.watchKind
                && (existing.watchKind & lsp.WatchKind.Change) === 0
                && (desiredWatchKind & lsp.WatchKind.Change) !== 0;
            if (addedChangeWatch) {
                const updated = this.createCoverageEntry(basePath, pattern, desiredWatchKind, coverageKey, false);
                this.coverage.set(coverageKey, updated);
                coverageChanged = true;
            }
        } else {
            const entry = this.createCoverageEntry(basePath, pattern, desiredWatchKind, coverageKey, false);
            this.coverage.set(coverageKey, entry);
            coverageChanged = true;
        }

        this.coverageUsage.set(coverageKey, (this.coverageUsage.get(coverageKey) ?? 0) + 1);
        if (coverageChanged) {
            this.registrationSignature = undefined;
            void this.updateRegistration();
        }
        return coverageKey;
    }

    private createCoverageEntry(basePath: string, pattern: string, watchKind: lsp.WatchKind, key: string, permanent: boolean): CoverageEntry {
        return {
            key,
            watchKind,
            normalizedBase: this.normalizePath(basePath),
            watcher: {
                globPattern: {
                    baseUri: URI.file(basePath).toString(),
                    pattern,
                },
                kind: watchKind,
            },
            permanent,
        };
    }

    private async updateRegistration(): Promise<void> {
        if (!this.readyForRegistration) {
            return;
        }

        const watchers = Array.from(this.coverage.values(), entry => entry.watcher);
        if (!watchers.length) {
            this.registration?.dispose();
            this.registration = undefined;
            this.registrationSignature = undefined;
            return;
        }
        const signature = JSON.stringify(watchers.map(watcher => {
            const globPattern = watcher.globPattern;
            if (typeof globPattern === 'string') {
                return { pattern: globPattern, kind: watcher.kind };
            }

            if ('baseUri' in globPattern) {
                const baseUri = globPattern.baseUri;
                const baseUriString = typeof baseUri === 'string' ? baseUri : baseUri.uri;
                return { baseUri: baseUriString, pattern: globPattern.pattern, kind: watcher.kind };
            }

            // Fallback for unexpected shapes
            return { pattern: String(globPattern), kind: watcher.kind };
        }));
        if (signature === this.registrationSignature) {
            return;
        }
        this.registrationSignature = signature;

        try {
            this.registration?.dispose?.();
            this.registration = await this.options.lspClient.registerDidChangeWatchedFilesCapability(watchers);
        } catch (err) {
            this.options.logger.warn('Failed to register file watchers for tsserver watch events', err);
        }
    }

    private watcherMatchesPath(watcher: TsserverWatcher, normalizedFsPath: string): boolean {
        if (watcher.kind === 'file') {
            return watcher.normalizedPath === normalizedFsPath;
        }

        const base = watcher.normalizedPath;
        if (watcher.recursive) {
            return normalizedFsPath === base || normalizedFsPath.startsWith(base + '/');
        }
        return this.dirname(normalizedFsPath) === base;
    }

    private isCoveredByWorkspace(normalizedPath: string): boolean {
        return this.workspacePaths.some(base => normalizedPath === base || normalizedPath.startsWith(base + '/'));
    }

    private normalizePath(input: string): string {
        const normalized = path.normalize(input).replace(/\\/g, '/');
        const isDriveRoot = /^[a-zA-Z]:\/?$/.test(normalized);
        const isPosixRoot = normalized === '/';
        const trimmed = isDriveRoot || isPosixRoot ? normalized.replace(/\/+$/, '/') : normalized.replace(/\/+$/, '');
        return this.options.caseInsensitive ? trimmed.toLowerCase() : trimmed;
    }

    private dirname(normalizedPath: string): string {
        const dir = normalizedPath.substring(0, normalizedPath.lastIndexOf('/'));
        return dir || normalizedPath;
    }

    private coverageKey(basePath: string, pattern: string) {
        return `${this.normalizePath(basePath)}|${pattern}`;
    }

    private toTsserverPath(fsPath: string): string {
        return fsPath.replace(/\\/g, '/');
    }
}
