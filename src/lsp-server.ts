/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as path from 'node:path';
import fs from 'fs-extra';
import debounce from 'p-debounce';
import * as lsp from 'vscode-languageserver';
import API from './utils/api.js';
import { Logger, LogLevel, PrefixingLogger } from './utils/logger.js';
import { TspClient } from './tsp-client.js';
import { DiagnosticEventQueue } from './diagnostic-queue.js';
import { toDocumentHighlight, uriToPath, toSymbolKind, toLocation, toSelectionRange, pathToUri, toTextEdit, normalizePath } from './protocol-translation.js';
import { LspDocuments, LspDocument } from './document.js';
import { asCompletionItem, asResolvedCompletionItem, getCompletionTriggerCharacter } from './completion.js';
import { asSignatureHelp, toTsTriggerReason } from './hover.js';
import { Commands, TypescriptVersionNotification } from './commands.js';
import { provideQuickFix } from './quickfix.js';
import { provideRefactors } from './refactor.js';
import { provideOrganizeImports } from './organize-imports.js';
import { CommandTypes, EventTypes, TypeScriptInitializeParams, TypeScriptInitializationOptions, SupportedFeatures } from './ts-protocol.js';
import type { ts } from './ts-protocol.js';
import { collectDocumentSymbols, collectSymbolInformation } from './document-symbol.js';
import { TsServerLogLevel, TypeScriptServiceConfiguration } from './utils/configuration.js';
import { fromProtocolCallHierarchyItem, fromProtocolCallHierarchyIncomingCall, fromProtocolCallHierarchyOutgoingCall } from './features/call-hierarchy.js';
import { TypeScriptAutoFixProvider } from './features/fix-all.js';
import { TypeScriptInlayHintsProvider } from './features/inlay-hints.js';
import * as SemanticTokens from './features/semantic-tokens.js';
import { SourceDefinitionCommand } from './features/source-definition.js';
import { LogDirectoryProvider } from './tsServer/logDirectoryProvider.js';
import { Trace } from './tsServer/tracer.js';
import { TypeScriptVersion, TypeScriptVersionProvider } from './tsServer/versionProvider.js';
import { MarkdownString } from './utils/MarkdownString.js';
import * as Previewer from './utils/previewer.js';
import { getInferredProjectCompilerOptions } from './utils/tsconfig.js';
import { Position, Range } from './utils/typeConverters.js';
import { CodeActionKind } from './utils/types.js';
import { ConfigurationManager } from './configuration-manager.js';

export class LspServer {
    private _tspClient: TspClient | null = null;
    private hasShutDown = false;
    private initializeParams: TypeScriptInitializeParams | null = null;
    private diagnosticQueue?: DiagnosticEventQueue;
    private configurationManager: ConfigurationManager;
    private logger: Logger;
    private workspaceRoot: string | undefined;
    private typeScriptAutoFixProvider: TypeScriptAutoFixProvider | null = null;
    private features: SupportedFeatures = {};

    private readonly documents = new LspDocuments();

    constructor(private options: TypeScriptServiceConfiguration) {
        this.configurationManager = new ConfigurationManager(this.documents);
        this.logger = new PrefixingLogger(options.logger, '[lspserver]');
    }

    closeAll(): void {
        for (const file of [...this.documents.files]) {
            this.closeDocument(file);
        }
    }

    shutdown(): void {
        if (this._tspClient) {
            this._tspClient.shutdown();
            this._tspClient = null;
            this.hasShutDown = true;
        }
    }

    private get tspClient(): TspClient {
        if (!this._tspClient) {
            throw new Error('TS client not created. Did you forget to send the "initialize" request?');
        }
        return this._tspClient;
    }

    async initialize(params: TypeScriptInitializeParams): Promise<lsp.InitializeResult> {
        this.logger.log('initialize', params);
        if (this._tspClient) {
            throw new Error('The "initialize" request has already called before.');
        }
        this.initializeParams = params;
        const clientCapabilities = this.initializeParams.capabilities;
        this.workspaceRoot = this.initializeParams.rootUri ? uriToPath(this.initializeParams.rootUri) : this.initializeParams.rootPath || undefined;

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
            this.options.lspClient.logMessage({ type: LogLevel.Info, message: `Using Typescript version (${typescriptVersion.source}) ${typescriptVersion.versionString} from path "${typescriptVersion.tsServerPath}"` });
        } else {
            throw Error('Could not find a valid TypeScript installation. Please ensure that the "typescript" dependency is installed in the workspace or that a valid `tsserver.path` is specified. Exiting.');
        }

        this.configurationManager.mergeTsPreferences(userInitializationOptions.preferences || {});

        // Setup supported features.
        const { textDocument } = clientCapabilities;
        if (textDocument) {
            const completionCapabilities = textDocument.completion;
            this.features.codeActionDisabledSupport = textDocument.codeAction?.disabledSupport;
            this.features.definitionLinkSupport = textDocument.definition?.linkSupport && typescriptVersion.version?.gte(API.v270);
            this.features.completionInsertReplaceSupport = completionCapabilities?.completionItem?.insertReplaceSupport;
            if (completionCapabilities?.completionItem) {
                if (this.configurationManager.tsPreferences.useLabelDetailsInCompletionEntries
                && completionCapabilities.completionItem.labelDetailsSupport
                && typescriptVersion.version?.gte(API.v470)) {
                    this.features.completionLabelDetails = true;
                }
                if (completionCapabilities.completionItem.snippetSupport) {
                    this.features.completionSnippets = true;
                }
                if (textDocument.publishDiagnostics?.tagSupport) {
                    this.features.diagnosticsTagSupport = true;
                }
            }
        }

        this.configurationManager.mergeTsPreferences({
            useLabelDetailsInCompletionEntries: this.features.completionLabelDetails,
        });

        this.diagnosticQueue = new DiagnosticEventQueue(
            diagnostics => this.options.lspClient.publishDiagnostics(diagnostics),
            this.documents,
            this.features,
            this.logger,
        );
        const tsserverLogVerbosity = tsserver?.logVerbosity && TsServerLogLevel.fromString(tsserver?.logVerbosity);
        this._tspClient = new TspClient({
            lspClient: this.options.lspClient,
            trace: Trace.fromString(tsserver?.trace || 'off'),
            typescriptVersion,
            logDirectoryProvider: new LogDirectoryProvider(this.getLogDirectoryPath(userInitializationOptions)),
            logVerbosity: tsserverLogVerbosity ?? this.options.tsserverLogVerbosity,
            disableAutomaticTypingAcquisition,
            maxTsServerMemory,
            npmLocation,
            locale,
            globalPlugins,
            pluginProbeLocations,
            logger: this.options.logger,
            onEvent: this.onTsEvent.bind(this),
            onExit: (exitCode, signal) => {
                this.shutdown();
                if (exitCode) {
                    throw new Error(`tsserver process has exited (exit code: ${exitCode}, signal: ${signal}). Stopping the server.`);
                }
            },
        });

        const started = this.tspClient.start();
        if (!started) {
            throw new Error('tsserver process has failed to start.');
        }
        process.on('exit', () => {
            this.shutdown();
        });
        process.on('SIGINT', () => {
            process.exit();
        });

        this.typeScriptAutoFixProvider = new TypeScriptAutoFixProvider(this.tspClient);

        this.configurationManager.setAndConfigureTspClient(this.workspaceRoot, this._tspClient, hostInfo);
        this.setCompilerOptionsForInferredProjects();

        const prepareSupport = textDocument?.rename?.prepareSupport && this.tspClient.apiVersion.gte(API.v310);
        const initializeResult: lsp.InitializeResult = {
            capabilities: {
                textDocumentSync: lsp.TextDocumentSyncKind.Incremental,
                completionProvider: {
                    triggerCharacters: ['.', '"', '\'', '/', '@', '<'],
                    resolveProvider: true,
                },
                codeActionProvider: clientCapabilities.textDocument?.codeAction?.codeActionLiteralSupport
                    ? { codeActionKinds: [
                        ...TypeScriptAutoFixProvider.kinds.map(kind => kind.value),
                        CodeActionKind.SourceOrganizeImportsTs.value,
                        CodeActionKind.QuickFix.value,
                        CodeActionKind.Refactor.value,
                    ] } : true,
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
            },
        };
        if (textDocument?.callHierarchy && typescriptVersion.version?.gte(API.v380)) {
            initializeResult.capabilities.callHierarchyProvider = true;
        }
        this.logger.log('onInitialize result', initializeResult);
        return initializeResult;
    }

    public initialized(_: lsp.InitializedParams): void {
        const { apiVersion, typescriptVersionSource } = this.tspClient;
        this.options.lspClient.sendNotification(TypescriptVersionNotification, {
            version: apiVersion.displayName,
            source: typescriptVersionSource,
        });
    }

    private findTypescriptVersion(userTsserverPath: string | undefined): TypeScriptVersion | null {
        const typescriptVersionProvider = new TypeScriptVersionProvider(userTsserverPath || this.options.tsserverPath, this.logger);
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

    private setCompilerOptionsForInferredProjects(): void {
        const args: ts.server.protocol.SetCompilerOptionsForInferredProjectsArgs = {
            options: {
                ...getInferredProjectCompilerOptions(this.configurationManager.workspaceConfiguration.implicitProjectConfiguration!),
                allowJs: true,
                allowNonTsExtensions: true,
                allowSyntheticDefaultImports: true,
                resolveJsonModule: true,
            },
        };
        this.tspClient.executeWithoutWaitingForResponse(CommandTypes.CompilerOptionsForInferredProjects, args);
    }

    didChangeConfiguration(params: lsp.DidChangeConfigurationParams): void {
        this.configurationManager.setWorkspaceConfiguration(params.settings || {});
        this.setCompilerOptionsForInferredProjects();
        const ignoredDiagnosticCodes = this.configurationManager.workspaceConfiguration.diagnostics?.ignoredCodes || [];
        this.diagnosticQueue?.updateIgnoredDiagnosticCodes(ignoredDiagnosticCodes);
        this.cancelDiagnostics();
        this.requestDiagnostics();
    }

    protected diagnosticsTokenSource: lsp.CancellationTokenSource | undefined;
    protected interuptDiagnostics<R>(f: () => R): R {
        if (!this.diagnosticsTokenSource) {
            return f();
        }
        this.cancelDiagnostics();
        const result = f();
        this.requestDiagnostics();
        return result;
    }
    // True if diagnostic request is currently debouncing or the request is in progress. False only if there are
    // no pending requests.
    pendingDebouncedRequest = false;
    async requestDiagnostics(): Promise<void> {
        this.pendingDebouncedRequest = true;
        await this.doRequestDiagnosticsDebounced();
    }
    readonly doRequestDiagnosticsDebounced = debounce(() => this.doRequestDiagnostics(), 200);
    protected async doRequestDiagnostics(): Promise<void> {
        this.cancelDiagnostics();
        if (this.hasShutDown) {
            return;
        }
        const geterrTokenSource = new lsp.CancellationTokenSource();
        this.diagnosticsTokenSource = geterrTokenSource;

        const { files } = this.documents;
        try {
            return await this.tspClient.requestGeterr({ delay: 0, files }, this.diagnosticsTokenSource.token);
        } finally {
            if (this.diagnosticsTokenSource === geterrTokenSource) {
                this.diagnosticsTokenSource = undefined;
                this.pendingDebouncedRequest = false;
            }
        }
    }
    protected cancelDiagnostics(): void {
        if (this.diagnosticsTokenSource) {
            this.diagnosticsTokenSource.cancel();
            this.diagnosticsTokenSource = undefined;
        }
    }

    didOpenTextDocument(params: lsp.DidOpenTextDocumentParams): void {
        const file = uriToPath(params.textDocument.uri);
        this.logger.log('onDidOpenTextDocument', params, file);
        if (!file) {
            return;
        }
        if (this.documents.open(file, params.textDocument)) {
            this.tspClient.notify(CommandTypes.Open, {
                file,
                fileContent: params.textDocument.text,
                scriptKindName: this.getScriptKindName(params.textDocument.languageId),
                projectRootPath: this.workspaceRoot,
            });
            this.cancelDiagnostics();
            this.requestDiagnostics();
        } else {
            this.logger.log(`Cannot open already opened doc '${params.textDocument.uri}'.`);
            this.didChangeTextDocument({
                textDocument: params.textDocument,
                contentChanges: [
                    {
                        text: params.textDocument.text,
                    },
                ],
            });
        }
    }

    protected getScriptKindName(languageId: string): ts.server.protocol.ScriptKindName | undefined {
        switch (languageId) {
            case 'typescript': return 'TS';
            case 'typescriptreact': return 'TSX';
            case 'javascript': return 'JS';
            case 'javascriptreact': return 'JSX';
        }
        return undefined;
    }

    didCloseTextDocument(params: lsp.DidCloseTextDocumentParams): void {
        const file = uriToPath(params.textDocument.uri);
        this.logger.log('onDidCloseTextDocument', params, file);
        if (!file) {
            return;
        }
        this.closeDocument(file);
    }
    protected closeDocument(file: string): void {
        const document = this.documents.close(file);
        if (!document) {
            return;
        }
        this.tspClient.notify(CommandTypes.Close, { file });

        // We won't be updating diagnostics anymore for that file, so clear them
        // so we don't leave stale ones.
        this.options.lspClient.publishDiagnostics({
            uri: document.uri,
            diagnostics: [],
        });
    }

    didChangeTextDocument(params: lsp.DidChangeTextDocumentParams): void {
        const { textDocument } = params;
        const file = uriToPath(textDocument.uri);
        this.logger.log('onDidChangeTextDocument', params, file);
        if (!file) {
            return;
        }

        const document = this.documents.get(file);
        if (!document) {
            this.logger.error(`Received change on non-opened document ${textDocument.uri}`);
            throw new Error(`Received change on non-opened document ${textDocument.uri}`);
        }
        if (textDocument.version === null) {
            throw new Error(`Received document change event for ${textDocument.uri} without valid version identifier`);
        }

        for (const change of params.contentChanges) {
            let line = 0;
            let offset = 0;
            let endLine = 0;
            let endOffset = 0;
            if (lsp.TextDocumentContentChangeEvent.isIncremental(change)) {
                line = change.range.start.line + 1;
                offset = change.range.start.character + 1;
                endLine = change.range.end.line + 1;
                endOffset = change.range.end.character + 1;
            } else {
                line = 1;
                offset = 1;
                const endPos = document.positionAt(document.getText().length);
                endLine = endPos.line + 1;
                endOffset = endPos.character + 1;
            }
            this.tspClient.notify(CommandTypes.Change, {
                file,
                line,
                offset,
                endLine,
                endOffset,
                insertString: change.text,
            });
            document.applyEdit(textDocument.version, change);
        }
        this.cancelDiagnostics();
        this.requestDiagnostics();
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
        const file = uriToPath(params.textDocument.uri);
        this.logger.log(type, params, file);
        if (!file) {
            return undefined;
        }

        if (type === CommandTypes.DefinitionAndBoundSpan) {
            const args = Position.toFileLocationRequestArgs(file, params.position);
            const response = await this.tspClient.request(type, args, token);
            if (response.type !== 'response' || !response.body) {
                return undefined;
            }
            // `textSpan` can be undefined in older TypeScript versions, despite type saying otherwise.
            const span = response.body.textSpan ? Range.fromTextSpan(response.body.textSpan) : undefined;
            return response.body.definitions
                .map((location): lsp.DefinitionLink => {
                    const target = toLocation(location, this.documents);
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
        const file = uriToPath(params.textDocument.uri);
        this.logger.log(type, params, file);
        if (!file) {
            return [];
        }

        const args = Position.toFileLocationRequestArgs(file, params.position);
        const response = await this.tspClient.request(type, args, token);
        if (response.type !== 'response' || !response.body) {
            return undefined;
        }
        return response.body.map(fileSpan => toLocation(fileSpan, this.documents));
    }

    async documentSymbol(params: lsp.DocumentSymbolParams, token?: lsp.CancellationToken): Promise<lsp.DocumentSymbol[] | lsp.SymbolInformation[]> {
        const file = uriToPath(params.textDocument.uri);
        this.logger.log('symbol', params, file);
        if (!file) {
            return [];
        }

        const response = await this.tspClient.request(CommandTypes.NavTree, { file }, token);
        const tree = response.body;
        if (!tree?.childItems) {
            return [];
        }
        if (this.supportHierarchicalDocumentSymbol) {
            const symbols: lsp.DocumentSymbol[] = [];
            for (const item of tree.childItems) {
                collectDocumentSymbols(item, symbols);
            }
            return symbols;
        }
        const symbols: lsp.SymbolInformation[] = [];
        for (const item of tree.childItems) {
            collectSymbolInformation(params.textDocument.uri, item, symbols);
        }
        return symbols;
    }
    protected get supportHierarchicalDocumentSymbol(): boolean {
        const textDocument = this.initializeParams?.capabilities.textDocument;
        const documentSymbol = textDocument?.documentSymbol;
        return !!documentSymbol && !!documentSymbol.hierarchicalDocumentSymbolSupport;
    }

    /*
     * implemented based on
     * https://github.com/Microsoft/vscode/blob/master/extensions/typescript-language-features/src/features/completions.ts
     */
    async completion(params: lsp.CompletionParams, token?: lsp.CancellationToken): Promise<lsp.CompletionList | null> {
        const file = uriToPath(params.textDocument.uri);
        this.logger.log('completion', params, file);
        if (!file) {
            return lsp.CompletionList.create([]);
        }

        const document = this.documents.get(file);
        if (!document) {
            throw new Error(`The document should be opened for completion, file: ${file}`);
        }

        const completionOptions = this.configurationManager.workspaceConfiguration.completions || {};

        try {
            const result = await this.interuptDiagnostics(() => this.tspClient.request(
                CommandTypes.CompletionInfo,
                {
                    file,
                    line: params.position.line + 1,
                    offset: params.position.character + 1,
                    triggerCharacter: getCompletionTriggerCharacter(params.context?.triggerCharacter),
                    triggerKind: params.context?.triggerKind,
                },
                token));
            const { body } = result;
            if (!body) {
                return lsp.CompletionList.create();
            }
            const { entries, isIncomplete, optionalReplacementSpan, isMemberCompletion } = body;
            let dotAccessorContext: { range: lsp.Range; text: string; } | undefined;
            if (isMemberCompletion) {
                const line = document.getLine(params.position.line);
                const dotMatch = line.slice(0, params.position.character).match(/\??\.\s*$/) || undefined;
                if (dotMatch) {
                    const startPosition = lsp.Position.create(params.position.line, params.position.character - dotMatch[0].length);
                    const range = lsp.Range.create(startPosition, params.position);
                    const text = document.getText(range);
                    dotAccessorContext = {
                        range,
                        text,
                    };
                }
            }
            const completions: lsp.CompletionItem[] = [];
            for (const entry of entries || []) {
                if (entry.kind === 'warning') {
                    continue;
                }
                const completion = asCompletionItem(entry, file, params.position, document, this.documents, completionOptions, this.features, {
                    isMemberCompletion,
                    dotAccessorContext,
                    optionalReplacementSpan,
                });
                if (!completion) {
                    continue;
                }
                completions.push(completion);
            }
            return lsp.CompletionList.create(completions, isIncomplete);
        } catch (error) {
            if ((error as Error).message === 'No content available.') {
                this.logger.info('No content was available for completion request');
                return null;
            } else {
                throw error;
            }
        }
    }

    async completionResolve(item: lsp.CompletionItem, token?: lsp.CancellationToken): Promise<lsp.CompletionItem> {
        this.logger.log('completion/resolve', item);
        const document = item.data?.file ? this.documents.get(item.data.file) : undefined;
        await this.configurationManager.configureGloballyFromDocument(item.data.file);
        const { body } = await this.interuptDiagnostics(() => this.tspClient.request(CommandTypes.CompletionDetails, item.data, token));
        const details = body?.length && body[0];
        if (!details) {
            return item;
        }
        return asResolvedCompletionItem(item, details, document, this.tspClient, this.documents, this.configurationManager.workspaceConfiguration.completions || {}, this.features);
    }

    async hover(params: lsp.TextDocumentPositionParams, token?: lsp.CancellationToken): Promise<lsp.Hover> {
        const file = uriToPath(params.textDocument.uri);
        this.logger.log('hover', params, file);
        if (!file) {
            return { contents: [] };
        }

        const result = await this.interuptDiagnostics(() => this.getQuickInfo(file, params.position, token));
        if (!result?.body) {
            return { contents: [] };
        }
        const contents = new MarkdownString();
        const { displayString, documentation, tags } = result.body;
        if (displayString) {
            contents.appendCodeblock('typescript', displayString);
        }
        Previewer.addMarkdownDocumentation(contents, documentation, tags, this.documents);
        return {
            contents: contents.toMarkupContent(),
            range: Range.fromTextSpan(result.body),
        };
    }
    protected async getQuickInfo(file: string, position: lsp.Position, token?: lsp.CancellationToken): Promise<ts.server.protocol.QuickInfoResponse | undefined> {
        try {
            return await this.tspClient.request(
                CommandTypes.Quickinfo,
                {
                    file,
                    line: position.line + 1,
                    offset: position.character + 1,
                },
                token,
            );
        } catch (err) {
            return undefined;
        }
    }

    async prepareRename(params: lsp.PrepareRenameParams, token?: lsp.CancellationToken): Promise<lsp.Range | { range: lsp.Range; placeholder: string; } | undefined | null> {
        const file = uriToPath(params.textDocument.uri);
        if (!file) {
            return null;
        }
        const result = await this.tspClient.request(CommandTypes.Rename, Position.toFileLocationRequestArgs(file, params.position), token);
        const renameInfo = result.body?.info;
        if (!renameInfo) {
            return null;
        }
        if (!renameInfo.canRename) {
            throw new Error(renameInfo.localizedErrorMessage);
        }
        return Range.fromTextSpan(renameInfo.triggerSpan);
    }

    async rename(params: lsp.RenameParams, token?: lsp.CancellationToken): Promise<lsp.WorkspaceEdit | undefined | null> {
        const file = uriToPath(params.textDocument.uri);
        this.logger.log('onRename', params, file);
        if (!file) {
            return null;
        }
        const result = await this.tspClient.request(CommandTypes.Rename, Position.toFileLocationRequestArgs(file, params.position), token);
        if (!result.body?.info.canRename || result.body.locs.length === 0) {
            return null;
        }
        const workspaceEdit: lsp.WorkspaceEdit = {};
        result.body.locs
            .forEach((spanGroup) => {
                const uri = pathToUri(spanGroup.file, this.documents);
                if (!workspaceEdit.changes) {
                    workspaceEdit.changes = {};
                }
                const textEdits = workspaceEdit.changes[uri] || (workspaceEdit.changes[uri] = []);

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

        return workspaceEdit;
    }

    async references(params: lsp.ReferenceParams, token?: lsp.CancellationToken): Promise<lsp.Location[]> {
        const file = uriToPath(params.textDocument.uri);
        this.logger.log('onReferences', params, file);
        if (!file) {
            return [];
        }

        const result = await this.tspClient.request(
            CommandTypes.References,
            {
                file,
                line: params.position.line + 1,
                offset: params.position.character + 1,
            },
            token,
        );
        if (!result.body) {
            return [];
        }
        return result.body.refs
            .filter(fileSpan => params.context.includeDeclaration || !fileSpan.isDefinition)
            .map(fileSpan => toLocation(fileSpan, this.documents));
    }

    async documentFormatting(params: lsp.DocumentFormattingParams, token?: lsp.CancellationToken): Promise<lsp.TextEdit[]> {
        const file = uriToPath(params.textDocument.uri);
        this.logger.log('documentFormatting', params, file);
        if (!file) {
            return [];
        }

        const formatOptions = params.options;
        await this.configurationManager.configureGloballyFromDocument(file, formatOptions);

        const response = await this.tspClient.request(
            CommandTypes.Format,
            {
                file,
                line: 1,
                offset: 1,
                endLine: Number.MAX_SAFE_INTEGER,
                endOffset: Number.MAX_SAFE_INTEGER,
                options: formatOptions,
            },
            token,
        );
        if (response.body) {
            return response.body.map(e => toTextEdit(e));
        }
        return [];
    }

    async documentRangeFormatting(params: lsp.DocumentRangeFormattingParams, token?: lsp.CancellationToken): Promise<lsp.TextEdit[]> {
        const file = uriToPath(params.textDocument.uri);
        this.logger.log('documentRangeFormatting', params, file);
        if (!file) {
            return [];
        }

        const formatOptions = params.options;
        await this.configurationManager.configureGloballyFromDocument(file, formatOptions);

        const response = await this.tspClient.request(
            CommandTypes.Format,
            {
                file,
                line: params.range.start.line + 1,
                offset: params.range.start.character + 1,
                endLine: params.range.end.line + 1,
                endOffset: params.range.end.character + 1,
                options: formatOptions,
            },
            token,
        );
        if (response.body) {
            return response.body.map(e => toTextEdit(e));
        }
        return [];
    }

    async selectionRanges(params: lsp.SelectionRangeParams, token?: lsp.CancellationToken): Promise<lsp.SelectionRange[] | null> {
        const file = uriToPath(params.textDocument.uri);
        if (!file) {
            return null;
        }
        const response = await this.tspClient.request(
            CommandTypes.SelectionRange,
            {
                file,
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
        const file = uriToPath(params.textDocument.uri);
        this.logger.log('signatureHelp', params, file);
        if (!file) {
            return undefined;
        }

        const response = await this.interuptDiagnostics(() => this.getSignatureHelp(file, params, token));
        if (!response?.body) {
            return undefined;
        }
        return asSignatureHelp(response.body, params.context, this.documents);
    }
    protected async getSignatureHelp(file: string, params: lsp.SignatureHelpParams, token?: lsp.CancellationToken): Promise<ts.server.protocol.SignatureHelpResponse | undefined> {
        try {
            const { position, context } = params;
            return await this.tspClient.request(
                CommandTypes.SignatureHelp,
                {
                    file,
                    line: position.line + 1,
                    offset: position.character + 1,
                    triggerReason: context ? toTsTriggerReason(context) : undefined,
                },
                token,
            );
        } catch (err) {
            return undefined;
        }
    }

    async codeAction(params: lsp.CodeActionParams, token?: lsp.CancellationToken): Promise<lsp.CodeAction[]> {
        const file = uriToPath(params.textDocument.uri);
        this.logger.log('codeAction', params, file);
        if (!file) {
            return [];
        }
        const fileRangeArgs = Range.toFileRangeRequestArgs(file, params.range);
        const actions: lsp.CodeAction[] = [];
        const kinds = params.context.only?.map(kind => new CodeActionKind(kind));
        if (!kinds || kinds.some(kind => kind.contains(CodeActionKind.QuickFix))) {
            actions.push(...provideQuickFix(await this.getCodeFixes(fileRangeArgs, params.context, token), this.documents));
        }
        if (!kinds || kinds.some(kind => kind.contains(CodeActionKind.Refactor))) {
            actions.push(...provideRefactors(await this.getRefactors(fileRangeArgs, params.context, token), fileRangeArgs, this.features));
        }

        // organize import is provided by tsserver for any line, so we only get it if explicitly requested
        if (kinds?.some(kind => kind.contains(CodeActionKind.SourceOrganizeImportsTs))) {
            // see this issue for more context about how this argument is used
            // https://github.com/microsoft/TypeScript/issues/43051
            const skipDestructiveCodeActions = params.context.diagnostics.some(
                // assume no severity is an error
                d => (d.severity ?? 0) <= 2,
            );
            const response = await this.getOrganizeImports({
                scope: { type: 'file', args: fileRangeArgs },
                skipDestructiveCodeActions,
            }, token);
            actions.push(...provideOrganizeImports(response, this.documents));
        }

        // TODO: Since we rely on diagnostics pointing at errors in the correct places, we can't proceed if we are not
        // sure that diagnostics are up-to-date. Thus we check `pendingDebouncedRequest` to see if there are *any*
        // pending diagnostic requests (regardless of for which file).
        // In general would be better to replace the whole diagnostics handling logic with the one from
        // bufferSyncSupport.ts in VSCode's typescript language features.
        if (kinds && !this.pendingDebouncedRequest) {
            const diagnostics = this.diagnosticQueue?.getDiagnosticsForFile(file) || [];
            if (diagnostics.length) {
                actions.push(...await this.typeScriptAutoFixProvider!.provideCodeActions(kinds, file, diagnostics, this.documents));
            }
        }

        return actions;
    }
    protected async getCodeFixes(fileRangeArgs: ts.server.protocol.FileRangeRequestArgs, context: lsp.CodeActionContext, token?: lsp.CancellationToken): Promise<ts.server.protocol.GetCodeFixesResponse | undefined> {
        const errorCodes = context.diagnostics.map(diagnostic => Number(diagnostic.code));
        const args: ts.server.protocol.CodeFixRequestArgs = {
            ...fileRangeArgs,
            errorCodes,
        };
        try {
            return await this.tspClient.request(CommandTypes.GetCodeFixes, args, token);
        } catch (err) {
            return undefined;
        }
    }
    protected async getRefactors(fileRangeArgs: ts.server.protocol.FileRangeRequestArgs, context: lsp.CodeActionContext, token?: lsp.CancellationToken): Promise<ts.server.protocol.GetApplicableRefactorsResponse | undefined> {
        const args: ts.server.protocol.GetApplicableRefactorsRequestArgs = {
            ...fileRangeArgs,
            triggerReason: context.triggerKind === lsp.CodeActionTriggerKind.Invoked ? 'invoked' : undefined,
            kind: context.only?.length === 1 ? context.only[0] : undefined,
        };
        try {
            return await this.tspClient.request(CommandTypes.GetApplicableRefactors, args, token);
        } catch (err) {
            return undefined;
        }
    }
    protected async getOrganizeImports(args: ts.server.protocol.OrganizeImportsRequestArgs, token?: lsp.CancellationToken): Promise<ts.server.protocol.OrganizeImportsResponse | undefined> {
        try {
            await this.configurationManager.configureGloballyFromDocument(args.scope.args.file);
            return await this.tspClient.request(CommandTypes.OrganizeImports, args, token);
        } catch (err) {
            return undefined;
        }
    }

    async executeCommand(arg: lsp.ExecuteCommandParams, token?: lsp.CancellationToken, workDoneProgress?: lsp.WorkDoneProgressReporter): Promise<any> {
        this.logger.log('executeCommand', arg);
        if (arg.command === Commands.APPLY_WORKSPACE_EDIT && arg.arguments) {
            const edit = arg.arguments[0] as lsp.WorkspaceEdit;
            await this.options.lspClient.applyWorkspaceEdit({ edit });
        } else if (arg.command === Commands.APPLY_CODE_ACTION && arg.arguments) {
            const codeAction = arg.arguments[0] as ts.server.protocol.CodeAction;
            if (!await this.applyFileCodeEdits(codeAction.changes)) {
                return;
            }
            if (codeAction.commands?.length) {
                for (const command of codeAction.commands) {
                    await this.tspClient.request(CommandTypes.ApplyCodeActionCommand, { command }, token);
                }
            }
        } else if (arg.command === Commands.APPLY_REFACTORING && arg.arguments) {
            const args = arg.arguments[0] as ts.server.protocol.GetEditsForRefactorRequestArgs;
            const { body } = await this.tspClient.request(CommandTypes.GetEditsForRefactor, args, token);
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
                        uri: pathToUri(args.file, this.documents),
                    },
                    position: Position.fromLocation(renameLocation),
                });
            }
        } else if (arg.command === Commands.CONFIGURE_PLUGIN && arg.arguments) {
            const [pluginName, configuration] = arg.arguments as [string, unknown];

            if (this.tspClient?.apiVersion.gte(API.v314)) {
                this.tspClient.executeWithoutWaitingForResponse(
                    CommandTypes.ConfigurePlugin,
                    {
                        configuration,
                        pluginName,
                    },
                );
            }
        } else if (arg.command === Commands.ORGANIZE_IMPORTS && arg.arguments) {
            const file = arg.arguments[0] as string;
            const additionalArguments: { skipDestructiveCodeActions?: boolean; } = arg.arguments[1] || {};
            await this.configurationManager.configureGloballyFromDocument(file);
            const { body } = await this.tspClient.request(
                CommandTypes.OrganizeImports,
                {
                    scope: {
                        type: 'file',
                        args: { file },
                    },
                    skipDestructiveCodeActions: additionalArguments.skipDestructiveCodeActions,
                },
                token,
            );
            await this.applyFileCodeEdits(body);
        } else if (arg.command === Commands.APPLY_RENAME_FILE && arg.arguments) {
            const { sourceUri, targetUri } = arg.arguments[0] as {
                sourceUri: string;
                targetUri: string;
            };
            this.applyRenameFile(sourceUri, targetUri, token);
        } else if (arg.command === Commands.APPLY_COMPLETION_CODE_ACTION && arg.arguments) {
            const [_, codeActions] = arg.arguments as [string, ts.server.protocol.CodeAction[]];
            for (const codeAction of codeActions) {
                await this.applyFileCodeEdits(codeAction.changes);
                if (codeAction.commands?.length) {
                    for (const command of codeAction.commands) {
                        await this.tspClient.request(CommandTypes.ApplyCodeActionCommand, { command }, token);
                    }
                }
                // Execute only the first code action.
                break;
            }
        } else if (arg.command === Commands.SOURCE_DEFINITION) {
            const [uri, position] = (arg.arguments || []) as [lsp.DocumentUri?, lsp.Position?];
            const reporter = await this.options.lspClient.createProgressReporter(token, workDoneProgress);
            return SourceDefinitionCommand.execute(uri, position, this.documents, this.tspClient, this.options.lspClient, reporter, token);
        } else {
            this.logger.error(`Unknown command ${arg.command}.`);
        }
    }

    protected async applyFileCodeEdits(edits: ReadonlyArray<ts.server.protocol.FileCodeEdits>): Promise<boolean> {
        if (!edits.length) {
            return false;
        }
        const changes: { [uri: string]: lsp.TextEdit[]; } = {};
        for (const edit of edits) {
            changes[pathToUri(edit.fileName, this.documents)] = edit.textChanges.map(toTextEdit);
        }
        const { applied } = await this.options.lspClient.applyWorkspaceEdit({
            edit: { changes },
        });
        return applied;
    }

    protected async applyRenameFile(sourceUri: string, targetUri: string, token?: lsp.CancellationToken): Promise<void> {
        const edits = await this.getEditsForFileRename(sourceUri, targetUri, token);
        this.applyFileCodeEdits(edits);
    }
    protected async getEditsForFileRename(sourceUri: string, targetUri: string, token?: lsp.CancellationToken): Promise<ReadonlyArray<ts.server.protocol.FileCodeEdits>> {
        const newFilePath = uriToPath(targetUri);
        const oldFilePath = uriToPath(sourceUri);
        if (!newFilePath || !oldFilePath) {
            return [];
        }
        try {
            const { body } = await this.tspClient.request(
                CommandTypes.GetEditsForFileRename,
                {
                    oldFilePath,
                    newFilePath,
                },
                token,
            );
            return body;
        } catch (err) {
            return [];
        }
    }

    async documentHighlight(arg: lsp.TextDocumentPositionParams, token?: lsp.CancellationToken): Promise<lsp.DocumentHighlight[]> {
        const file = uriToPath(arg.textDocument.uri);
        this.logger.log('documentHighlight', arg, file);
        if (!file) {
            return [];
        }
        let response: ts.server.protocol.DocumentHighlightsResponse;
        try {
            response = await this.tspClient.request(
                CommandTypes.DocumentHighlights,
                {
                    file,
                    line: arg.position.line + 1,
                    offset: arg.position.character + 1,
                    filesToSearch: [file],
                },
                token,
            );
        } catch (err) {
            return [];
        }
        if (!response.body) {
            return [];
        }
        const result: lsp.DocumentHighlight[] = [];
        for (const item of response.body) {
            // tsp returns item.file with POSIX path delimiters, whereas file is platform specific.
            // Converting to a URI and back to a path ensures consistency.
            if (normalizePath(item.file) === file) {
                const highlights = toDocumentHighlight(item);
                result.push(...highlights);
            }
        }
        return result;
    }

    private lastFileOrDummy(): string | undefined {
        return this.documents.files[0] || this.workspaceRoot;
    }

    async workspaceSymbol(params: lsp.WorkspaceSymbolParams, token?: lsp.CancellationToken): Promise<lsp.SymbolInformation[]> {
        const result = await this.tspClient.request(
            CommandTypes.Navto,
            {
                file: this.lastFileOrDummy(),
                searchValue: params.query,
            },
            token,
        );
        if (!result.body) {
            return [];
        }
        return result.body.map(item => {
            return <lsp.SymbolInformation>{
                location: {
                    uri: pathToUri(item.file, this.documents),
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
        const file = uriToPath(params.textDocument.uri);
        this.logger.log('foldingRanges', params, file);
        if (!file) {
            return undefined;
        }

        const document = this.documents.get(file);
        if (!document) {
            throw new Error(`The document should be opened for foldingRanges', file: ${file}`);
        }
        const { body } = await this.tspClient.request(CommandTypes.GetOutliningSpans, { file }, token);
        if (!body) {
            return undefined;
        }
        const foldingRanges: lsp.FoldingRange[] = [];
        for (const span of body) {
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
        if (event.event === EventTypes.SementicDiag || event.event === EventTypes.SyntaxDiag || event.event === EventTypes.SuggestionDiag) {
            this.diagnosticQueue?.updateDiagnostics(event.event, event as ts.server.protocol.DiagnosticEvent);
        }
    }

    async prepareCallHierarchy(params: lsp.CallHierarchyPrepareParams, token?: lsp.CancellationToken): Promise<lsp.CallHierarchyItem[] | null> {
        const file = uriToPath(params.textDocument.uri);
        if (!file) {
            return null;
        }
        const args = Position.toFileLocationRequestArgs(file, params.position);
        const response = await this.tspClient.request(CommandTypes.PrepareCallHierarchy, args, token);
        if (response.type !== 'response' || !response.body) {
            return null;
        }
        const items = Array.isArray(response.body) ? response.body : [response.body];
        return items.map(item => fromProtocolCallHierarchyItem(item, this.documents, this.workspaceRoot));
    }

    async callHierarchyIncomingCalls(params: lsp.CallHierarchyIncomingCallsParams, token?: lsp.CancellationToken): Promise<lsp.CallHierarchyIncomingCall[] | null> {
        const file = uriToPath(params.item.uri);
        if (!file) {
            return null;
        }
        const args = Position.toFileLocationRequestArgs(file, params.item.selectionRange.start);
        const response = await this.tspClient.request(CommandTypes.ProvideCallHierarchyIncomingCalls, args, token);
        if (response.type !== 'response' || !response.body) {
            return null;
        }
        return response.body.map(item => fromProtocolCallHierarchyIncomingCall(item, this.documents, this.workspaceRoot));
    }

    async callHierarchyOutgoingCalls(params: lsp.CallHierarchyOutgoingCallsParams, token?: lsp.CancellationToken): Promise<lsp.CallHierarchyOutgoingCall[] | null> {
        const file = uriToPath(params.item.uri);
        if (!file) {
            return null;
        }
        const args = Position.toFileLocationRequestArgs(file, params.item.selectionRange.start);
        const response = await this.tspClient.request(CommandTypes.ProvideCallHierarchyOutgoingCalls, args, token);
        if (response.type !== 'response' || !response.body) {
            return null;
        }
        return response.body.map(item => fromProtocolCallHierarchyOutgoingCall(item, this.documents, this.workspaceRoot));
    }

    async inlayHints(params: lsp.InlayHintParams, token?: lsp.CancellationToken): Promise<lsp.InlayHint[] | undefined> {
        return await TypeScriptInlayHintsProvider.provideInlayHints(
            params.textDocument.uri, params.range, this.documents, this.tspClient, this.options.lspClient, this.configurationManager, token);
    }

    async semanticTokensFull(params: lsp.SemanticTokensParams, token?: lsp.CancellationToken): Promise<lsp.SemanticTokens> {
        const file = uriToPath(params.textDocument.uri);
        this.logger.log('semanticTokensFull', params, file);
        if (!file) {
            return { data: [] };
        }

        const doc = this.documents.get(file);
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

        return this.getSemanticTokens(doc, file, start, end, token);
    }

    async semanticTokensRange(params: lsp.SemanticTokensRangeParams, token?: lsp.CancellationToken): Promise<lsp.SemanticTokens> {
        const file = uriToPath(params.textDocument.uri);
        this.logger.log('semanticTokensRange', params, file);
        if (!file) {
            return { data: [] };
        }

        const doc = this.documents.get(file);
        if (!doc) {
            return { data: [] };
        }

        const start = doc.offsetAt(params.range.start);
        const end = doc.offsetAt(params.range.end);

        return this.getSemanticTokens(doc, file, start, end, token);
    }

    async getSemanticTokens(doc: LspDocument, file: string, startOffset: number, endOffset: number, token?: lsp.CancellationToken) : Promise<lsp.SemanticTokens> {
        try {
            const result = await this.tspClient.request(
                CommandTypes.EncodedSemanticClassificationsFull,
                {
                    file,
                    start: startOffset,
                    length: endOffset - startOffset,
                    format: '2020',
                },
                token,
            );

            const spans = result.body?.spans ?? [];
            return { data: SemanticTokens.transformSpans(doc, spans) };
        } catch {
            return { data: [] };
        }
    }
}
