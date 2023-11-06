/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as path from 'node:path';
import fs from 'fs-extra';
import { URI } from 'vscode-uri';
import * as lsp from 'vscode-languageserver';
import { getDignosticsKind, TsClient } from './ts-client.js';
import { DiagnosticEventQueue } from './diagnostic-queue.js';
import { toDocumentHighlight, toSymbolKind, toLocation, toSelectionRange, toTextEdit } from './protocol-translation.js';
import { LspDocument } from './document.js';
import { asCompletionItems, asResolvedCompletionItem, CompletionContext, CompletionDataCache, getCompletionTriggerCharacter } from './completion.js';
import { asSignatureHelp, toTsTriggerReason } from './hover.js';
import { Commands, TypescriptVersionNotification } from './commands.js';
import { provideQuickFix } from './quickfix.js';
import { provideRefactors } from './refactor.js';
import { organizeImportsCommands, provideOrganizeImports } from './organize-imports.js';
import { CommandTypes, EventName, OrganizeImportsMode, TypeScriptInitializeParams, TypeScriptInitializationOptions, SupportedFeatures } from './ts-protocol.js';
import type { ts } from './ts-protocol.js';
import { collectDocumentSymbols, collectSymbolInformation } from './document-symbol.js';
import { fromProtocolCallHierarchyItem, fromProtocolCallHierarchyIncomingCall, fromProtocolCallHierarchyOutgoingCall } from './features/call-hierarchy.js';
import FileConfigurationManager from './features/fileConfigurationManager.js';
import { TypeScriptAutoFixProvider } from './features/fix-all.js';
import { CodeLensType, type ReferencesCodeLens } from './features/code-lens/baseCodeLensProvider.js';
import TypeScriptImplementationsCodeLensProvider from './features/code-lens/implementationsCodeLens.js';
import { TypeScriptReferencesCodeLensProvider } from './features/code-lens/referencesCodeLens.js';
import { TypeScriptInlayHintsProvider } from './features/inlay-hints.js';
import * as SemanticTokens from './features/semantic-tokens.js';
import { SourceDefinitionCommand } from './features/source-definition.js';
import { CachedResponse } from './tsServer/cachedResponse.js';
import { LogDirectoryProvider } from './tsServer/logDirectoryProvider.js';
import { Trace } from './tsServer/tracer.js';
import { TypeScriptVersion, TypeScriptVersionProvider } from './tsServer/versionProvider.js';
import API from './utils/api.js';
import { toSyntaxServerConfiguration, TsServerLogLevel, LspServerConfiguration } from './utils/configuration.js';
import { onCaseInsensitiveFileSystem } from './utils/fs.js';
import { Logger, LogLevel, PrefixingLogger } from './utils/logger.js';
import { MarkdownString } from './utils/MarkdownString.js';
import * as Previewer from './utils/previewer.js';
import { Position, Range } from './utils/typeConverters.js';
import { CodeActionKind } from './utils/types.js';

export class LspServer {
    private tsClient: TsClient;
    private fileConfigurationManager: FileConfigurationManager;
    private initializeParams: TypeScriptInitializeParams | null = null;
    private diagnosticQueue: DiagnosticEventQueue;
    private completionDataCache = new CompletionDataCache();
    private logger: Logger;
    private workspaceRoot: string | undefined;
    private typeScriptAutoFixProvider: TypeScriptAutoFixProvider | null = null;
    private features: SupportedFeatures = {};
    // Caching for navTree response shared by multiple requests.
    private cachedNavTreeResponse = new CachedResponse<ts.server.protocol.NavTreeResponse>();
    private implementationsCodeLensProvider: TypeScriptImplementationsCodeLensProvider | null = null;
    private referencesCodeLensProvider: TypeScriptReferencesCodeLensProvider | null = null;

    constructor(private options: LspServerConfiguration) {
        this.logger = new PrefixingLogger(options.logger, '[lspserver]');
        this.tsClient = new TsClient(onCaseInsensitiveFileSystem(), this.logger, options.lspClient);
        this.fileConfigurationManager = new FileConfigurationManager(this.tsClient, onCaseInsensitiveFileSystem());
        this.diagnosticQueue = new DiagnosticEventQueue(
            diagnostics => this.options.lspClient.publishDiagnostics(diagnostics),
            this.tsClient,
            this.features,
            this.logger,
        );
    }

    closeAllForTesting(): void {
        for (const document of this.tsClient.documentsForTesting.values()) {
            this.closeDocument(document.uri.toString());
        }
    }

    async waitForDiagnosticsForFile(uri: lsp.DocumentUri): Promise<void> {
        const document = this.tsClient.toOpenDocument(uri);
        if (!document) {
            throw new Error(`Document not open: ${uri}`);
        }
        await this.diagnosticQueue.waitForDiagnosticsForTesting(document.filepath);
    }

    shutdown(): void {
        this.tsClient.shutdown();
    }

    async initialize(params: TypeScriptInitializeParams): Promise<lsp.InitializeResult> {
        this.initializeParams = params;
        const clientCapabilities = this.initializeParams.capabilities;
        this.workspaceRoot = this.initializeParams.rootUri ? URI.parse(this.initializeParams.rootUri).fsPath : this.initializeParams.rootPath || undefined;

        const userInitializationOptions: TypeScriptInitializationOptions = this.initializeParams.initializationOptions || {};
        const { disableAutomaticTypingAcquisition, hostInfo, maxTsServerMemory, npmLocation, locale, tsserver } = userInitializationOptions;
        const { plugins }: TypeScriptInitializationOptions = {
            plugins: userInitializationOptions.plugins || [],
        };

        const globalPlugins: string[] = [];
        const pluginProbeLocations: string[] = [];
        for (const plugin of plugins) {
            globalPlugins.push(plugin.name);
            pluginProbeLocations.push(plugin.location);
        }

        const typescriptVersion = this.findTypescriptVersion(tsserver?.path);
        if (typescriptVersion) {
            this.options.lspClient.logMessage({ type: lsp.MessageType.Info, message: `Using Typescript version (${typescriptVersion.source}) ${typescriptVersion.versionString} from path "${typescriptVersion.tsServerPath}"` });
        } else {
            throw Error('Could not find a valid TypeScript installation. Please ensure that the "typescript" dependency is installed in the workspace or that a valid `tsserver.path` is specified. Exiting.');
        }

        this.fileConfigurationManager.mergeTsPreferences(userInitializationOptions.preferences || {});

        // Setup supported features.
        this.features.completionDisableFilterText = userInitializationOptions.completionDisableFilterText ?? false;
        const { textDocument } = clientCapabilities;
        if (textDocument) {
            const { codeAction, completion, definition, publishDiagnostics } = textDocument;
            if (codeAction) {
                this.features.codeActionDisabledSupport = codeAction.disabledSupport;
            }
            if (completion) {
                const { completionItem } = completion;
                if (completionItem) {
                    const { commitCharactersSupport, insertReplaceSupport, labelDetailsSupport, snippetSupport } = completionItem;
                    this.features.completionCommitCharactersSupport = commitCharactersSupport;
                    this.features.completionInsertReplaceSupport = insertReplaceSupport;
                    this.features.completionSnippets = snippetSupport;
                    this.features.completionLabelDetails = this.fileConfigurationManager.tsPreferences.useLabelDetailsInCompletionEntries
                        && labelDetailsSupport && typescriptVersion.version?.gte(API.v470);
                }
            }
            if (definition) {
                this.features.definitionLinkSupport = definition.linkSupport;
            }
            this.features.diagnosticsSupport = Boolean(publishDiagnostics);
            this.features.diagnosticsTagSupport = Boolean(publishDiagnostics?.tagSupport);
        }

        this.fileConfigurationManager.mergeTsPreferences({
            useLabelDetailsInCompletionEntries: this.features.completionLabelDetails,
        });

        const tsserverLogVerbosity = tsserver?.logVerbosity && TsServerLogLevel.fromString(tsserver?.logVerbosity);
        const started = this.tsClient.start(
            this.workspaceRoot,
            {
                trace: Trace.fromString(tsserver?.trace || 'off'),
                typescriptVersion,
                logDirectoryProvider: new LogDirectoryProvider(this.getLogDirectoryPath(userInitializationOptions)),
                logVerbosity: tsserverLogVerbosity ?? TsServerLogLevel.Off,
                disableAutomaticTypingAcquisition,
                maxTsServerMemory,
                npmLocation,
                locale,
                globalPlugins,
                pluginProbeLocations,
                onEvent: this.onTsEvent.bind(this),
                onExit: (exitCode, signal) => {
                    this.shutdown();
                    if (exitCode) {
                        throw new Error(`tsserver process has exited (exit code: ${exitCode}, signal: ${signal}). Stopping the server.`);
                    }
                },
                useSyntaxServer: toSyntaxServerConfiguration(userInitializationOptions.tsserver?.useSyntaxServer),
            });
        if (!started) {
            throw new Error('tsserver process has failed to start.');
        }
        process.on('exit', () => {
            this.shutdown();
        });
        process.on('SIGINT', () => {
            process.exit();
        });

        this.typeScriptAutoFixProvider = new TypeScriptAutoFixProvider(this.tsClient);
        this.fileConfigurationManager.setGlobalConfiguration(this.workspaceRoot, hostInfo);
        this.registerHandlers();

        const prepareSupport = textDocument?.rename?.prepareSupport && this.tsClient.apiVersion.gte(API.v310);
        const initializeResult: lsp.InitializeResult = {
            capabilities: {
                textDocumentSync: lsp.TextDocumentSyncKind.Incremental,
                completionProvider: {
                    triggerCharacters: ['.', '"', '\'', '/', '@', '<'],
                    resolveProvider: true,
                },
                codeActionProvider: clientCapabilities.textDocument?.codeAction?.codeActionLiteralSupport
                    ? {
                        codeActionKinds: [
                            ...TypeScriptAutoFixProvider.kinds.map(kind => kind.value),
                            CodeActionKind.SourceOrganizeImportsTs.value,
                            CodeActionKind.SourceRemoveUnusedImportsTs.value,
                            CodeActionKind.SourceSortImportsTs.value,
                            CodeActionKind.QuickFix.value,
                            CodeActionKind.Refactor.value,
                        ],
                    } : true,
                codeLensProvider: {
                    resolveProvider: true,
                },
                definitionProvider: true,
                documentFormattingProvider: true,
                documentRangeFormattingProvider: true,
                documentHighlightProvider: true,
                documentSymbolProvider: true,
                executeCommandProvider: {
                    commands: [
                        Commands.APPLY_WORKSPACE_EDIT,
                        Commands.APPLY_CODE_ACTION,
                        Commands.APPLY_REFACTORING,
                        Commands.CONFIGURE_PLUGIN,
                        Commands.ORGANIZE_IMPORTS,
                        Commands.APPLY_RENAME_FILE,
                        Commands.SOURCE_DEFINITION,
                    ],
                },
                hoverProvider: true,
                inlayHintProvider: true,
                linkedEditingRangeProvider: false,
                renameProvider: prepareSupport ? { prepareProvider: true } : true,
                referencesProvider: true,
                selectionRangeProvider: true,
                signatureHelpProvider: {
                    triggerCharacters: ['(', ',', '<'],
                    retriggerCharacters: [')'],
                },
                workspaceSymbolProvider: true,
                implementationProvider: true,
                typeDefinitionProvider: true,
                foldingRangeProvider: true,
                semanticTokensProvider: {
                    documentSelector: null,
                    legend: {
                        // list taken from: https://github.com/microsoft/TypeScript/blob/main/src/services/classifier2020.ts#L10
                        tokenTypes: [
                            'class',
                            'enum',
                            'interface',
                            'namespace',
                            'typeParameter',
                            'type',
                            'parameter',
                            'variable',
                            'enumMember',
                            'property',
                            'function',
                            'member',
                        ],
                        // token from: https://github.com/microsoft/TypeScript/blob/main/src/services/classifier2020.ts#L14
                        tokenModifiers: [
                            'declaration',
                            'static',
                            'async',
                            'readonly',
                            'defaultLibrary',
                            'local',
                        ],
                    },
                    full: true,
                    range: true,
                },
                workspace: {
                    fileOperations: {
                        willRename: {
                            filters: [{
                                scheme: 'file',
                                pattern: { glob: '**/*.{ts,js,jsx,tsx,mjs,mts,cjs,cts}', matches: 'file' },
                            }],
                        },
                    },
                },
            },
        };
        if (textDocument?.callHierarchy && typescriptVersion.version?.gte(API.v380)) {
            initializeResult.capabilities.callHierarchyProvider = true;
        }
        if (textDocument?.linkedEditingRange && typescriptVersion.version?.gte(API.v510)) {
            initializeResult.capabilities.linkedEditingRangeProvider = true;
        }
        this.logger.log('onInitialize result', initializeResult);
        return initializeResult;
    }

    private registerHandlers(): void {
        if (this.initializeParams?.capabilities.textDocument?.codeLens) {
            this.implementationsCodeLensProvider = new TypeScriptImplementationsCodeLensProvider(this.tsClient, this.cachedNavTreeResponse, this.fileConfigurationManager);
            this.referencesCodeLensProvider = new TypeScriptReferencesCodeLensProvider(this.tsClient, this.cachedNavTreeResponse, this.fileConfigurationManager);
        }
    }

    public initialized(_: lsp.InitializedParams): void {
        const { apiVersion, typescriptVersionSource } = this.tsClient;
        this.options.lspClient.sendNotification(TypescriptVersionNotification, {
            version: apiVersion.displayName,
            source: typescriptVersionSource,
        });
    }

    private findTypescriptVersion(userTsserverPath: string | undefined): TypeScriptVersion | null {
        const typescriptVersionProvider = new TypeScriptVersionProvider(userTsserverPath, this.logger);
        // User-provided tsserver path.
        const userSettingVersion = typescriptVersionProvider.getUserSettingVersion();
        if (userSettingVersion) {
            if (userSettingVersion.isValid) {
                return userSettingVersion;
            }
            this.logger.logIgnoringVerbosity(LogLevel.Warning, `Typescript specified through user setting ignored due to invalid path "${userSettingVersion.path}"`);
        }
        // Workspace version.
        if (this.workspaceRoot) {
            const workspaceVersion = typescriptVersionProvider.getWorkspaceVersion([this.workspaceRoot]);
            if (workspaceVersion) {
                return workspaceVersion;
            }
        }
        // Bundled version
        const bundledVersion = typescriptVersionProvider.bundledVersion();
        if (bundledVersion?.isValid) {
            return bundledVersion;
        }
        return null;
    }

    private getLogDirectoryPath(initializationOptions: TypeScriptInitializationOptions): string | undefined {
        if (initializationOptions.tsserver?.logDirectory) {
            return initializationOptions.tsserver.logDirectory;
        }
        if (this.workspaceRoot) {
            return path.join(this.workspaceRoot, '.log');
        }
        return undefined;
    }

    didChangeConfiguration(params: lsp.DidChangeConfigurationParams): void {
        this.fileConfigurationManager.setWorkspaceConfiguration(params.settings || {});
        const ignoredDiagnosticCodes = this.fileConfigurationManager.workspaceConfiguration.diagnostics?.ignoredCodes || [];
        this.tsClient.interruptGetErr(() => this.diagnosticQueue.updateIgnoredDiagnosticCodes(ignoredDiagnosticCodes));
    }

    didOpenTextDocument(params: lsp.DidOpenTextDocumentParams): void {
        if (this.tsClient.toOpenDocument(params.textDocument.uri, { suppressAlertOnFailure: true })) {
            throw new Error(`Can't open already open document: ${params.textDocument.uri}`);
        }

        if (!this.tsClient.openTextDocument(params.textDocument)) {
            throw new Error(`Cannot open document '${params.textDocument.uri}'.`);
        }
    }

    didCloseTextDocument(params: lsp.DidCloseTextDocumentParams): void {
        this.closeDocument(params.textDocument.uri);
    }

    private closeDocument(uri: lsp.DocumentUri): void {
        const document = this.tsClient.toOpenDocument(uri);
        if (!document) {
            throw new Error(`Trying to close not opened document: ${uri}`);
        }
        this.cachedNavTreeResponse.onDocumentClose(document);
        this.tsClient.onDidCloseTextDocument(uri);
        this.diagnosticQueue.onDidCloseFile(document.filepath);
        this.fileConfigurationManager.onDidCloseTextDocument(document.uri);
    }

    didChangeTextDocument(params: lsp.DidChangeTextDocumentParams): void {
        this.tsClient.onDidChangeTextDocument(params);
    }

    didSaveTextDocument(_params: lsp.DidSaveTextDocumentParams): void {
        // do nothing
    }

    async definition(params: lsp.DefinitionParams, token?: lsp.CancellationToken): Promise<lsp.Definition | lsp.DefinitionLink[] | undefined> {
        return this.getDefinition({
            type: this.features.definitionLinkSupport ? CommandTypes.DefinitionAndBoundSpan : CommandTypes.Definition,
            params,
        }, token);
    }

    async implementation(params: lsp.TextDocumentPositionParams, token?: lsp.CancellationToken): Promise<lsp.Definition | undefined> {
        return this.getSymbolLocations({
            type: CommandTypes.Implementation,
            params,
        }, token);
    }

    async typeDefinition(params: lsp.TextDocumentPositionParams, token?: lsp.CancellationToken): Promise<lsp.Definition | undefined> {
        return this.getSymbolLocations({
            type: CommandTypes.TypeDefinition,
            params,
        }, token);
    }

    private async getDefinition({ type, params }: {
        type: CommandTypes.Definition | CommandTypes.DefinitionAndBoundSpan;
        params: lsp.TextDocumentPositionParams;
    }, token?: lsp.CancellationToken): Promise<lsp.Definition | lsp.DefinitionLink[] | undefined> {
        const document = this.tsClient.toOpenDocument(params.textDocument.uri);
        if (!document) {
            return;
        }

        if (type === CommandTypes.DefinitionAndBoundSpan) {
            const args = Position.toFileLocationRequestArgs(document.filepath, params.position);
            const response = await this.tsClient.execute(type, args, token);
            if (response.type !== 'response' || !response.body) {
                return undefined;
            }
            // `textSpan` can be undefined in older TypeScript versions, despite type saying otherwise.
            const span = response.body.textSpan ? Range.fromTextSpan(response.body.textSpan) : undefined;
            return response.body.definitions
                .map((location): lsp.DefinitionLink => {
                    const target = toLocation(location, this.tsClient);
                    const targetRange = location.contextStart && location.contextEnd
                        ? Range.fromLocations(location.contextStart, location.contextEnd)
                        : target.range;
                    return {
                        originSelectionRange: span,
                        targetRange,
                        targetUri: target.uri,
                        targetSelectionRange: target.range,
                    };
                });
        }

        return this.getSymbolLocations({ type: CommandTypes.Definition, params });
    }

    private async getSymbolLocations({ type, params }: {
        type: CommandTypes.Definition | CommandTypes.Implementation | CommandTypes.TypeDefinition;
        params: lsp.TextDocumentPositionParams;
    }, token?: lsp.CancellationToken): Promise<lsp.Definition | undefined> {
        const document = this.tsClient.toOpenDocument(params.textDocument.uri);
        if (!document) {
            return [];
        }

        const args = Position.toFileLocationRequestArgs(document.filepath, params.position);
        const response = await this.tsClient.execute(type, args, token);
        if (response.type !== 'response' || !response.body) {
            return undefined;
        }
        return response.body.map(fileSpan => toLocation(fileSpan, this.tsClient));
    }

    async documentSymbol(params: lsp.DocumentSymbolParams, token?: lsp.CancellationToken): Promise<lsp.DocumentSymbol[] | lsp.SymbolInformation[]> {
        const document = this.tsClient.toOpenDocument(params.textDocument.uri);
        if (!document) {
            return [];
        }

        const response = await this.cachedNavTreeResponse.execute(document, () => this.tsClient.execute(CommandTypes.NavTree, { file: document.filepath }, token));
        if (response.type !== 'response' || !response.body?.childItems) {
            return [];
        }
        if (this.supportHierarchicalDocumentSymbol) {
            const symbols: lsp.DocumentSymbol[] = [];
            for (const item of response.body.childItems) {
                collectDocumentSymbols(item, symbols);
            }
            return symbols;
        }
        const symbols: lsp.SymbolInformation[] = [];
        for (const item of response.body.childItems) {
            collectSymbolInformation(params.textDocument.uri, item, symbols);
        }
        return symbols;
    }
    protected get supportHierarchicalDocumentSymbol(): boolean {
        const textDocument = this.initializeParams?.capabilities.textDocument;
        const documentSymbol = textDocument?.documentSymbol;
        return !!documentSymbol && !!documentSymbol.hierarchicalDocumentSymbolSupport;
    }

    async completion(params: lsp.CompletionParams, token?: lsp.CancellationToken): Promise<lsp.CompletionList | null> {
        const document = this.tsClient.toOpenDocument(params.textDocument.uri);
        if (!document) {
            return lsp.CompletionList.create([]);
        }

        const { filepath } = document;

        this.completionDataCache.reset();
        const completionOptions = this.fileConfigurationManager.workspaceConfiguration.completions || {};

        const result = await this.tsClient.interruptGetErr(async () => {
            await this.fileConfigurationManager.ensureConfigurationForDocument(document, token);

            const response = await this.tsClient.execute(
                CommandTypes.CompletionInfo,
                {
                    file: filepath,
                    line: params.position.line + 1,
                    offset: params.position.character + 1,
                    triggerCharacter: getCompletionTriggerCharacter(params.context?.triggerCharacter),
                    triggerKind: params.context?.triggerKind,
                },
                token);

            if (response.type !== 'response') {
                return undefined;
            }

            return response.body;
        });

        if (!result) {
            return lsp.CompletionList.create();
        }

        const { entries, isIncomplete, optionalReplacementSpan, isMemberCompletion } = result;
        const line = document.getLine(params.position.line);
        let dotAccessorContext: CompletionContext['dotAccessorContext'];
        if (isMemberCompletion) {
            const dotMatch = line.slice(0, params.position.character).match(/\??\.\s*$/) || undefined;
            if (dotMatch) {
                const startPosition = lsp.Position.create(params.position.line, params.position.character - dotMatch[0].length);
                const range = lsp.Range.create(startPosition, params.position);
                const text = document.getText(range);
                dotAccessorContext = { range, text };
            }
        }
        const completionContext: CompletionContext = {
            isMemberCompletion,
            dotAccessorContext,
            line,
            optionalReplacementRange: optionalReplacementSpan ? Range.fromTextSpan(optionalReplacementSpan) : undefined,
        };
        const completions = asCompletionItems(entries, this.completionDataCache, filepath, params.position, document, this.tsClient, completionOptions, this.features, completionContext);
        return lsp.CompletionList.create(completions, isIncomplete);
    }

    async completionResolve(item: lsp.CompletionItem, token?: lsp.CancellationToken): Promise<lsp.CompletionItem> {
        item.data = item.data?.cacheId !== undefined ? this.completionDataCache.get(item.data.cacheId) : item.data;
        const uri = this.tsClient.toResource(item.data.file).toString();
        const document = item.data?.file ? this.tsClient.toOpenDocument(uri) : undefined;
        if (!document) {
            return item;
        }

        await this.fileConfigurationManager.ensureConfigurationForDocument(document, token);
        const response = await this.tsClient.interruptGetErr(() => this.tsClient.execute(CommandTypes.CompletionDetails, item.data, token));
        if (response.type !== 'response' || !response.body?.length) {
            return item;
        }
        return asResolvedCompletionItem(item, response.body[0], document, this.tsClient, this.fileConfigurationManager.workspaceConfiguration.completions || {}, this.features);
    }

    async hover(params: lsp.TextDocumentPositionParams, token?: lsp.CancellationToken): Promise<lsp.Hover | null> {
        const document = this.tsClient.toOpenDocument(params.textDocument.uri);
        if (!document) {
            return { contents: [] };
        }

        const result = await this.tsClient.interruptGetErr(async () => {
            await this.fileConfigurationManager.ensureConfigurationForDocument(document, token);

            const response = await this.tsClient.execute(
                CommandTypes.Quickinfo,
                Position.toFileLocationRequestArgs(document.filepath, params.position),
                token,
            );

            if (response.type === 'response' && response.body) {
                return response.body;
            }
        });

        if (!result) {
            return null;
        }
        const contents = new MarkdownString();
        const { displayString, documentation, tags } = result;
        if (displayString) {
            contents.appendCodeblock('typescript', displayString);
        }
        Previewer.addMarkdownDocumentation(contents, documentation, tags, this.tsClient);
        return {
            contents: contents.toMarkupContent(),
            range: Range.fromTextSpan(result),
        };
    }

    async prepareRename(params: lsp.PrepareRenameParams, token?: lsp.CancellationToken): Promise<lsp.Range | { range: lsp.Range; placeholder: string; } | undefined | null> {
        const document = this.tsClient.toOpenDocument(params.textDocument.uri);
        if (!document) {
            return null;
        }
        const response = await this.tsClient.execute(CommandTypes.Rename, Position.toFileLocationRequestArgs(document.filepath, params.position), token);
        if (response.type !== 'response' || !response.body?.info) {
            return null;
        }
        const renameInfo = response.body.info;
        if (!renameInfo.canRename) {
            throw new Error(renameInfo.localizedErrorMessage);
        }
        return Range.fromTextSpan(renameInfo.triggerSpan);
    }

    async rename(params: lsp.RenameParams, token?: lsp.CancellationToken): Promise<lsp.WorkspaceEdit | undefined | null> {
        const document = this.tsClient.toOpenDocument(params.textDocument.uri);
        if (!document) {
            return null;
        }
        const result = await this.tsClient.interruptGetErr(async () => {
            await this.fileConfigurationManager.ensureConfigurationForDocument(document);
            const response = await this.tsClient.execute(CommandTypes.Rename, Position.toFileLocationRequestArgs(document.filepath, params.position), token);
            if (response.type !== 'response' || !response.body?.info.canRename || !response.body?.locs.length) {
                return null;
            }
            return response.body;
        });

        if (!result) {
            return null;
        }

        const changes: lsp.WorkspaceEdit['changes'] = {};
        result.locs
            .forEach((spanGroup) => {
                const uri = this.tsClient.toResource(spanGroup.file).toString();
                const textEdits = changes[uri] || (changes[uri] = []);

                spanGroup.locs.forEach((textSpan) => {
                    textEdits.push({
                        newText: `${textSpan.prefixText || ''}${params.newName}${textSpan.suffixText || ''}`,
                        range: {
                            start: Position.fromLocation(textSpan.start),
                            end: Position.fromLocation(textSpan.end),
                        },
                    });
                });
            });

        return { changes };
    }

    async references(params: lsp.ReferenceParams, token?: lsp.CancellationToken): Promise<lsp.Location[]> {
        const document = this.tsClient.toOpenDocument(params.textDocument.uri);
        if (!document) {
            return [];
        }

        const response = await this.tsClient.execute(CommandTypes.References, Position.toFileLocationRequestArgs(document.filepath, params.position), token);
        if (response.type !== 'response' || !response.body) {
            return [];
        }
        return response.body.refs
            .filter(fileSpan => params.context.includeDeclaration || !fileSpan.isDefinition)
            .map(fileSpan => toLocation(fileSpan, this.tsClient));
    }

    async documentFormatting(params: lsp.DocumentFormattingParams, token?: lsp.CancellationToken): Promise<lsp.TextEdit[]> {
        const document = this.tsClient.toOpenDocument(params.textDocument.uri);
        if (!document) {
            throw new Error(`The document should be opened for formatting', file: ${params.textDocument.uri}`);
        }

        const formatOptions = params.options;
        await this.fileConfigurationManager.ensureConfigurationOptions(document, formatOptions);

        const response = await this.tsClient.execute(
            CommandTypes.Format,
            {
                ...Range.toFormattingRequestArgs(document.filepath, document.getFullRange()),
                options: formatOptions,
            },
            token,
        );
        if (response.type !== 'response' || !response.body) {
            return [];
        }
        return response.body.map(e => toTextEdit(e));
    }

    async documentRangeFormatting(params: lsp.DocumentRangeFormattingParams, token?: lsp.CancellationToken): Promise<lsp.TextEdit[]> {
        const document = this.tsClient.toOpenDocument(params.textDocument.uri);
        if (!document) {
            return [];
        }

        const formatOptions = params.options;
        await this.fileConfigurationManager.ensureConfigurationOptions(document, formatOptions);

        const response = await this.tsClient.execute(
            CommandTypes.Format,
            {
                ...Range.toFormattingRequestArgs(document.filepath, params.range),
                options: formatOptions,
            },
            token,
        );
        if (response.type !== 'response' || !response.body) {
            return [];
        }
        return response.body.map(e => toTextEdit(e));
    }

    async selectionRanges(params: lsp.SelectionRangeParams, token?: lsp.CancellationToken): Promise<lsp.SelectionRange[] | null> {
        const document = this.tsClient.toOpenDocument(params.textDocument.uri);
        if (!document) {
            return null;
        }

        const response = await this.tsClient.execute(
            CommandTypes.SelectionRange,
            {
                file: document.filepath,
                locations: params.positions.map(Position.toLocation),
            },
            token,
        );
        if (response.type !== 'response' || !response.body) {
            return null;
        }
        return response.body.map(toSelectionRange);
    }

    async signatureHelp(params: lsp.SignatureHelpParams, token?: lsp.CancellationToken): Promise<lsp.SignatureHelp | undefined> {
        const document = this.tsClient.toOpenDocument(params.textDocument.uri);
        if (!document) {
            return undefined;
        }

        const { position, context } = params;
        const args = {
            file: document.filepath,
            line: position.line + 1,
            offset: position.character + 1,
            triggerReason: context ? toTsTriggerReason(context) : undefined,
        };
        const response = await this.tsClient.interruptGetErr(() => this.tsClient.execute(CommandTypes.SignatureHelp, args, token));
        if (response.type !== 'response' || !response.body) {
            return undefined;
        }

        return asSignatureHelp(response.body, params.context, this.tsClient);
    }

    async codeAction(params: lsp.CodeActionParams, token?: lsp.CancellationToken): Promise<lsp.CodeAction[]> {
        const document = this.tsClient.toOpenDocument(params.textDocument.uri);
        if (!document) {
            return [];
        }

        await this.tsClient.interruptGetErr(() => this.fileConfigurationManager.ensureConfigurationForDocument(document));

        const fileRangeArgs = Range.toFileRangeRequestArgs(document.filepath, params.range);
        const actions: lsp.CodeAction[] = [];
        const kinds = params.context.only?.map(kind => new CodeActionKind(kind));
        if (!kinds || kinds.some(kind => kind.contains(CodeActionKind.QuickFix))) {
            actions.push(...provideQuickFix(await this.getCodeFixes(fileRangeArgs, params.context, token), this.tsClient));
        }
        if (!kinds || kinds.some(kind => kind.contains(CodeActionKind.Refactor))) {
            actions.push(...provideRefactors(await this.getRefactors(fileRangeArgs, params.context, token), fileRangeArgs, this.features));
        }

        for (const kind of kinds || []) {
            for (const command of organizeImportsCommands) {
                if (!kind.contains(command.kind) || command.minVersion && this.tsClient.apiVersion.lt(command.minVersion)) {
                    continue;
                }
                let skipDestructiveCodeActions = command.mode === OrganizeImportsMode.SortAndCombine;
                let mode = command.mode;
                const isOrganizeImports = command.kind.equals(CodeActionKind.SourceOrganizeImportsTs);
                if (isOrganizeImports) {
                    // see this issue for more context on why we override params when document has errors: https://github.com/microsoft/TypeScript/issues/43051
                    const documentHasErrors = params.context.diagnostics.some(d => (d.severity ?? 0) <= 2);  // Assume no severity is an error.
                    skipDestructiveCodeActions = documentHasErrors;
                    mode = OrganizeImportsMode.SortAndCombine;
                }
                const response = await this.tsClient.interruptGetErr(() => this.tsClient.execute(
                    CommandTypes.OrganizeImports,
                    {
                        scope: { type: 'file', args: fileRangeArgs },
                        // Deprecated in 4.9; `mode` takes priority.
                        skipDestructiveCodeActions,
                        mode,
                    },
                    token));
                if (response.type === 'response' && response.body) {
                    actions.push(...provideOrganizeImports(command, response, this.tsClient));
                }
            }
        }

        // TODO: Since we rely on diagnostics pointing at errors in the correct places, we can't proceed if we are not
        // sure that diagnostics are up-to-date. Thus we check if there are pending diagnostic requests for the file.
        // In general would be better to replace the whole diagnostics handling logic with the one from
        // bufferSyncSupport.ts in VSCode's typescript language features.
        if (kinds && !this.tsClient.hasPendingDiagnostics(document.uri)) {
            const diagnostics = this.diagnosticQueue.getDiagnosticsForFile(document.filepath) || [];
            if (diagnostics.length) {
                actions.push(...await this.typeScriptAutoFixProvider!.provideCodeActions(kinds, document.filepath, diagnostics));
            }
        }

        return actions;
    }
    protected async getCodeFixes(fileRangeArgs: ts.server.protocol.FileRangeRequestArgs, context: lsp.CodeActionContext, token?: lsp.CancellationToken): Promise<ts.server.protocol.CodeFixResponse | undefined> {
        const errorCodes = context.diagnostics.map(diagnostic => Number(diagnostic.code));
        const args: ts.server.protocol.CodeFixRequestArgs = {
            ...fileRangeArgs,
            errorCodes,
        };
        const response = await this.tsClient.execute(CommandTypes.GetCodeFixes, args, token);
        return response.type === 'response' ? response : undefined;
    }
    protected async getRefactors(fileRangeArgs: ts.server.protocol.FileRangeRequestArgs, context: lsp.CodeActionContext, token?: lsp.CancellationToken): Promise<ts.server.protocol.GetApplicableRefactorsResponse | undefined> {
        const args: ts.server.protocol.GetApplicableRefactorsRequestArgs = {
            ...fileRangeArgs,
            triggerReason: context.triggerKind === lsp.CodeActionTriggerKind.Invoked ? 'invoked' : undefined,
            kind: context.only?.length === 1 ? context.only[0] : undefined,
        };
        const response = await this.tsClient.execute(CommandTypes.GetApplicableRefactors, args, token);
        return response.type === 'response' ? response : undefined;
    }

    async executeCommand(params: lsp.ExecuteCommandParams, token?: lsp.CancellationToken, workDoneProgress?: lsp.WorkDoneProgressReporter): Promise<any> {
        if (params.command === Commands.APPLY_WORKSPACE_EDIT && params.arguments) {
            const edit = params.arguments[0] as lsp.WorkspaceEdit;
            await this.options.lspClient.applyWorkspaceEdit({ edit });
        } else if (params.command === Commands.APPLY_CODE_ACTION && params.arguments) {
            const codeAction = params.arguments[0] as ts.server.protocol.CodeAction;
            if (!await this.applyFileCodeEdits(codeAction.changes)) {
                return;
            }
            if (codeAction.commands?.length) {
                for (const command of codeAction.commands) {
                    await this.tsClient.execute(CommandTypes.ApplyCodeActionCommand, { command }, token);
                }
            }
        } else if (params.command === Commands.APPLY_REFACTORING && params.arguments) {
            const args = params.arguments[0] as ts.server.protocol.GetEditsForRefactorRequestArgs;
            const response = await this.tsClient.execute(CommandTypes.GetEditsForRefactor, args, token);
            if (response.type !== 'response' || !response.body) {
                return;
            }
            const { body } = response;
            if (!body?.edits.length) {
                return;
            }
            for (const edit of body.edits) {
                await fs.ensureFile(edit.fileName);
            }
            if (!await this.applyFileCodeEdits(body.edits)) {
                return;
            }
            const renameLocation = body.renameLocation;
            if (renameLocation) {
                await this.options.lspClient.rename({
                    textDocument: {
                        uri: this.tsClient.toResource(args.file).toString(),
                    },
                    position: Position.fromLocation(renameLocation),
                });
            }
        } else if (params.command === Commands.CONFIGURE_PLUGIN && params.arguments) {
            const [pluginName, configuration] = params.arguments as [string, unknown];

            if (this.tsClient.apiVersion.gte(API.v314)) {
                this.tsClient.executeWithoutWaitingForResponse(
                    CommandTypes.ConfigurePlugin,
                    {
                        configuration,
                        pluginName,
                    },
                );
            }
        } else if (params.command === Commands.ORGANIZE_IMPORTS && params.arguments) {
            const file = params.arguments[0] as string;
            const uri = this.tsClient.toResource(file).toString();
            const document = this.tsClient.toOpenDocument(uri);
            if (!document) {
                return;
            }

            const additionalArguments: { skipDestructiveCodeActions?: boolean; } = params.arguments[1] || {};
            const body = await this.tsClient.interruptGetErr(async () => {
                await this.fileConfigurationManager.ensureConfigurationForDocument(document);
                const response = await this.tsClient.execute(
                    CommandTypes.OrganizeImports,
                    {
                        scope: {
                            type: 'file',
                            args: { file },
                        },
                        // Deprecated in 4.9; `mode` takes priority
                        skipDestructiveCodeActions: additionalArguments.skipDestructiveCodeActions,
                        mode: additionalArguments.skipDestructiveCodeActions ? OrganizeImportsMode.SortAndCombine : OrganizeImportsMode.All,
                    },
                    token,
                );
                if (response.type !== 'response') {
                    return;
                }
                return response.body;
            });

            if (!body) {
                return;
            }

            await this.applyFileCodeEdits(body);
        } else if (params.command === Commands.APPLY_RENAME_FILE && params.arguments) {
            const { sourceUri, targetUri } = params.arguments[0] as {
                sourceUri: string;
                targetUri: string;
            };
            this.applyRenameFile(sourceUri, targetUri, token);
        } else if (params.command === Commands.APPLY_COMPLETION_CODE_ACTION && params.arguments) {
            const [_, codeActions] = params.arguments as [string, ts.server.protocol.CodeAction[]];
            for (const codeAction of codeActions) {
                await this.applyFileCodeEdits(codeAction.changes);
                if (codeAction.commands?.length) {
                    for (const command of codeAction.commands) {
                        await this.tsClient.execute(CommandTypes.ApplyCodeActionCommand, { command }, token);
                    }
                }
                // Execute only the first code action.
                break;
            }
        } else if (params.command === Commands.SOURCE_DEFINITION) {
            const [uri, position] = (params.arguments || []) as [lsp.DocumentUri?, lsp.Position?];
            const reporter = await this.options.lspClient.createProgressReporter(token, workDoneProgress);
            return SourceDefinitionCommand.execute(uri, position, this.tsClient, this.options.lspClient, reporter, token);
        } else {
            this.logger.error(`Unknown command ${params.command}.`);
        }
    }

    protected async applyFileCodeEdits(edits: ReadonlyArray<ts.server.protocol.FileCodeEdits>): Promise<boolean> {
        if (!edits.length) {
            return false;
        }
        const changes: { [uri: string]: lsp.TextEdit[]; } = {};
        for (const edit of edits) {
            changes[this.tsClient.toResource(edit.fileName).toString()] = edit.textChanges.map(toTextEdit);
        }
        const { applied } = await this.options.lspClient.applyWorkspaceEdit({
            edit: { changes },
        });
        return applied;
    }

    async willRenameFiles(params: lsp.RenameFilesParams, token?: lsp.CancellationToken): Promise<lsp.WorkspaceEdit> {
        const changes: lsp.WorkspaceEdit['changes'] = {};
        for (const rename of params.files) {
            const codeEdits = await this.getEditsForFileRename(rename.oldUri, rename.newUri, token);
            for (const codeEdit of codeEdits) {
                const uri = this.tsClient.toResource(codeEdit.fileName).toString();
                const textEdits = changes[uri] || (changes[uri] = []);
                textEdits.push(...codeEdit.textChanges.map(toTextEdit));
            }
        }
        return { changes };
    }

    protected async applyRenameFile(sourceUri: string, targetUri: string, token?: lsp.CancellationToken): Promise<void> {
        const edits = await this.getEditsForFileRename(sourceUri, targetUri, token);
        this.applyFileCodeEdits(edits);
    }
    protected async getEditsForFileRename(sourceUri: string, targetUri: string, token?: lsp.CancellationToken): Promise<ReadonlyArray<ts.server.protocol.FileCodeEdits>> {
        const newFilePath = this.tsClient.toTsFilePath(targetUri);
        const oldFilePath = this.tsClient.toTsFilePath(sourceUri);
        if (!newFilePath || !oldFilePath) {
            return [];
        }
        const response = await this.tsClient.interruptGetErr(() => {
            // TODO: We don't have a document here.
            // this.fileConfigurationManager.setGlobalConfigurationFromDocument(document, nulToken);
            return this.tsClient.execute(
                CommandTypes.GetEditsForFileRename,
                {
                    oldFilePath,
                    newFilePath,
                },
                token,
            );
        });
        if (response.type !== 'response' || !response.body) {
            return [];
        }
        return response.body;
    }

    async codeLens(params: lsp.CodeLensParams, token: lsp.CancellationToken): Promise<lsp.CodeLens[]> {
        if (!this.implementationsCodeLensProvider || !this.referencesCodeLensProvider) {
            return [];
        }

        const doc = this.tsClient.toOpenDocument(params.textDocument.uri);
        if (!doc) {
            return [];
        }

        return [
            ...await this.implementationsCodeLensProvider.provideCodeLenses(doc, token),
            ...await this.referencesCodeLensProvider.provideCodeLenses(doc, token),
        ];
    }

    async codeLensResolve(codeLens: ReferencesCodeLens, token: lsp.CancellationToken): Promise<lsp.CodeLens> {
        if (!this.implementationsCodeLensProvider || !this.referencesCodeLensProvider) {
            return codeLens;
        }

        if (codeLens.data?.type === CodeLensType.Implementation) {
            return await this.implementationsCodeLensProvider.resolveCodeLens(codeLens, token);
        }

        if (codeLens.data?.type === CodeLensType.Reference) {
            return await this.referencesCodeLensProvider.resolveCodeLens(codeLens, token);
        }

        throw new Error('Unexpected CodeLens!');
    }

    async documentHighlight(params: lsp.TextDocumentPositionParams, token?: lsp.CancellationToken): Promise<lsp.DocumentHighlight[]> {
        const doc = this.tsClient.toOpenDocument(params.textDocument.uri);
        if (!doc) {
            throw new Error(`The document should be opened first: ${params.textDocument.uri}`);
        }
        const response = await this.tsClient.execute(
            CommandTypes.DocumentHighlights,
            {
                file: doc.filepath,
                line: params.position.line + 1,
                offset: params.position.character + 1,
                filesToSearch: [doc.filepath],
            },
            token,
        );
        if (response.type !== 'response' || !response.body) {
            return [];
        }
        return response.body.flatMap(item => toDocumentHighlight(item));
    }

    async workspaceSymbol(params: lsp.WorkspaceSymbolParams, token?: lsp.CancellationToken): Promise<lsp.SymbolInformation[]> {
        const response = await this.tsClient.execute(
            CommandTypes.Navto,
            {
                file: this.tsClient.lastFileOrDummy(),
                searchValue: params.query,
            },
            token,
        );
        if (response.type !== 'response' || !response.body) {
            return [];
        }
        return response.body.map(item => {
            return <lsp.SymbolInformation>{
                location: {
                    uri: this.tsClient.toResource(item.file).toString(),
                    range: {
                        start: Position.fromLocation(item.start),
                        end: Position.fromLocation(item.end),
                    },
                },
                kind: toSymbolKind(item.kind),
                name: item.name,
            };
        });
    }

    /**
     * implemented based on https://github.com/Microsoft/vscode/blob/master/extensions/typescript-language-features/src/features/folding.ts
     */
    async foldingRanges(params: lsp.FoldingRangeParams, token?: lsp.CancellationToken): Promise<lsp.FoldingRange[] | undefined> {
        const document = this.tsClient.toOpenDocument(params.textDocument.uri);
        if (!document) {
            throw new Error(`The document should be opened for foldingRanges', file: ${params.textDocument.uri}`);
        }

        const response = await this.tsClient.execute(CommandTypes.GetOutliningSpans, { file: document.filepath }, token);
        if (response.type !== 'response' || !response.body) {
            return undefined;
        }
        const foldingRanges: lsp.FoldingRange[] = [];
        for (const span of response.body) {
            const foldingRange = this.asFoldingRange(span, document);
            if (foldingRange) {
                foldingRanges.push(foldingRange);
            }
        }
        return foldingRanges;
    }
    protected asFoldingRange(span: ts.server.protocol.OutliningSpan, document: LspDocument): lsp.FoldingRange | undefined {
        const range = Range.fromTextSpan(span.textSpan);
        const kind = this.asFoldingRangeKind(span);

        // workaround for https://github.com/Microsoft/vscode/issues/49904
        if (span.kind === 'comment') {
            const line = document.getLine(range.start.line);
            if (line.match(/\/\/\s*#endregion/gi)) {
                return undefined;
            }
        }

        const startLine = range.start.line;

        // workaround for https://github.com/Microsoft/vscode/issues/47240
        const endLine = range.end.character > 0 && document.getText(lsp.Range.create(
            lsp.Position.create(range.end.line, range.end.character - 1),
            range.end,
        )) === '}' ? Math.max(range.end.line - 1, range.start.line) : range.end.line;

        return {
            startLine,
            endLine,
            kind,
        };
    }
    protected asFoldingRangeKind(span: ts.server.protocol.OutliningSpan): lsp.FoldingRangeKind | undefined {
        switch (span.kind) {
            case 'comment': return lsp.FoldingRangeKind.Comment;
            case 'region': return lsp.FoldingRangeKind.Region;
            case 'imports': return lsp.FoldingRangeKind.Imports;
            case 'code':
            default: return undefined;
        }
    }

    protected async onTsEvent(event: ts.server.protocol.Event): Promise<void> {
        if (event.event === EventName.semanticDiag || event.event === EventName.syntaxDiag || event.event === EventName.suggestionDiag) {
            const diagnosticEvent = event as ts.server.protocol.DiagnosticEvent;
            if (diagnosticEvent.body?.diagnostics) {
                const { file, diagnostics } = diagnosticEvent.body;
                this.diagnosticQueue.updateDiagnostics(getDignosticsKind(event), file, diagnostics);
            }
        }
    }

    async prepareCallHierarchy(params: lsp.CallHierarchyPrepareParams, token?: lsp.CancellationToken): Promise<lsp.CallHierarchyItem[] | null> {
        const document = this.tsClient.toOpenDocument(params.textDocument.uri);
        if (!document) {
            return null;
        }
        const args = Position.toFileLocationRequestArgs(document.filepath, params.position);
        const response = await this.tsClient.execute(CommandTypes.PrepareCallHierarchy, args, token);
        if (response.type !== 'response' || !response.body) {
            return null;
        }
        const items = Array.isArray(response.body) ? response.body : [response.body];
        return items.map(item => fromProtocolCallHierarchyItem(item, this.tsClient, this.workspaceRoot));
    }

    async callHierarchyIncomingCalls(params: lsp.CallHierarchyIncomingCallsParams, token?: lsp.CancellationToken): Promise<lsp.CallHierarchyIncomingCall[] | null> {
        const file = this.tsClient.toTsFilePath(params.item.uri);
        if (!file) {
            return null;
        }
        const args = Position.toFileLocationRequestArgs(file, params.item.selectionRange.start);
        const response = await this.tsClient.execute(CommandTypes.ProvideCallHierarchyIncomingCalls, args, token);
        if (response.type !== 'response' || !response.body) {
            return null;
        }
        return response.body.map(item => fromProtocolCallHierarchyIncomingCall(item, this.tsClient, this.workspaceRoot));
    }

    async callHierarchyOutgoingCalls(params: lsp.CallHierarchyOutgoingCallsParams, token?: lsp.CancellationToken): Promise<lsp.CallHierarchyOutgoingCall[] | null> {
        const file = this.tsClient.toTsFilePath(params.item.uri);
        if (!file) {
            return null;
        }
        const args = Position.toFileLocationRequestArgs(file, params.item.selectionRange.start);
        const response = await this.tsClient.execute(CommandTypes.ProvideCallHierarchyOutgoingCalls, args, token);
        if (response.type !== 'response' || !response.body) {
            return null;
        }
        return response.body.map(item => fromProtocolCallHierarchyOutgoingCall(item, this.tsClient, this.workspaceRoot));
    }

    async inlayHints(params: lsp.InlayHintParams, token?: lsp.CancellationToken): Promise<lsp.InlayHint[] | undefined> {
        return await TypeScriptInlayHintsProvider.provideInlayHints(
            params.textDocument, params.range, this.tsClient, this.options.lspClient, this.fileConfigurationManager, token);
    }

    async linkedEditingRange(params: lsp.LinkedEditingRangeParams, token?: lsp.CancellationToken): Promise<lsp.LinkedEditingRanges | null> {
        const doc = this.tsClient.toOpenDocument(params.textDocument.uri);
        if (!doc) {
            return null;
        }
        const args = Position.toFileLocationRequestArgs(doc.filepath, params.position);
        const response = await this.tsClient.execute(CommandTypes.LinkedEditingRange, args, token);
        if (response.type !== 'response' || !response.body) {
            return null;
        }
        return {
            ranges: response.body.ranges.map(Range.fromTextSpan),
            wordPattern: response.body.wordPattern,
        };
    }

    async semanticTokensFull(params: lsp.SemanticTokensParams, token?: lsp.CancellationToken): Promise<lsp.SemanticTokens> {
        const doc = this.tsClient.toOpenDocument(params.textDocument.uri);
        if (!doc) {
            return { data: [] };
        }

        const start = doc.offsetAt({
            line: 0,
            character: 0,
        });
        const end = doc.offsetAt({
            line: doc.lineCount,
            character: 0,
        });

        return this.getSemanticTokens(doc, doc.filepath, start, end, token);
    }

    async semanticTokensRange(params: lsp.SemanticTokensRangeParams, token?: lsp.CancellationToken): Promise<lsp.SemanticTokens> {
        const doc = this.tsClient.toOpenDocument(params.textDocument.uri);
        if (!doc) {
            return { data: [] };
        }

        const start = doc.offsetAt(params.range.start);
        const end = doc.offsetAt(params.range.end);

        return this.getSemanticTokens(doc, doc.filepath, start, end, token);
    }

    async getSemanticTokens(doc: LspDocument, file: string, startOffset: number, endOffset: number, token?: lsp.CancellationToken): Promise<lsp.SemanticTokens> {
        const response = await this.tsClient.execute(
            CommandTypes.EncodedSemanticClassificationsFull,
            {
                file,
                start: startOffset,
                length: endOffset - startOffset,
                format: '2020',
            },
            token,
            {
                cancelOnResourceChange: doc.uri.toString(),
            },
        );

        if (response.type !== 'response' || !response.body?.spans) {
            return { data: [] };
        }
        return { data: SemanticTokens.transformSpans(doc, response.body.spans) };
    }
}
