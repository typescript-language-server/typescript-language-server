/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as path from 'path';
import tempy from 'tempy';
import * as lsp from 'vscode-languageserver/node';
import * as lspcalls from './lsp-protocol.calls.proposed';
import * as lspinlayHints from './lsp-protocol.inlayHints.proposed';
import * as lspsemanticTokens from './semantic-tokens';
import tsp from 'typescript/lib/protocol';
import * as fs from 'fs-extra';
import debounce from 'p-debounce';

import { CommandTypes, EventTypes } from './tsp-command-types';
import { Logger, PrefixingLogger } from './logger';
import { TspClient } from './tsp-client';
import { DiagnosticEventQueue } from './diagnostic-queue';
import {
    toDocumentHighlight, asRange, asTagsDocumentation,
    uriToPath, toSymbolKind, toLocation, toPosition,
    pathToUri, toTextEdit, toFileRangeRequestArgs, asPlainText, normalizePath
} from './protocol-translation';
import { LspDocuments, LspDocument } from './document';
import { asCompletionItem, asResolvedCompletionItem } from './completion';
import { asSignatureHelp } from './hover';
import { Commands } from './commands';
import { provideQuickFix } from './quickfix';
import { provideRefactors } from './refactor';
import { provideOrganizeImports } from './organize-imports';
import { TypeScriptInitializeParams, TypeScriptInitializationOptions, TypeScriptInitializeResult, TypeScriptWorkspaceSettings, TypeScriptWorkspaceSettingsLanguageSettings } from './ts-protocol';
import { collectDocumentSymbols, collectSymbolInformation } from './document-symbol';
import { computeCallers, computeCallees } from './calls';
import { IServerOptions } from './utils/configuration';
import { TypeScriptVersion, TypeScriptVersionProvider } from './utils/versionProvider';
import { TypeScriptAutoFixProvider } from './features/fix-all';
import { LspClient, ProgressReporter } from './lsp-client';
import { CodeActionKind } from './utils/types';

class ServerInitializingIndicator {
    private _loadingProjectName?: string;
    private _progressReporter?: ProgressReporter;

    constructor(private lspClient: LspClient) {}

    public reset(): void {
        if (this._loadingProjectName) {
            this._loadingProjectName = undefined;
            if (this._progressReporter) {
                this._progressReporter.end();
                this._progressReporter = undefined;
            }
        }
    }

    public startedLoadingProject(projectName: string): void {
        // TS projects are loaded sequentially. Cancel existing task because it should always be resolved before
        // the incoming project loading task is.
        this.reset();

        this._loadingProjectName = projectName;
        this._progressReporter = this.lspClient.createProgressReporter();
        this._progressReporter.begin('Initializing JS/TS language features…');
    }

    public finishedLoadingProject(projectName: string): void {
        if (this._loadingProjectName === projectName) {
            this._loadingProjectName = undefined;
            if (this._progressReporter) {
                this._progressReporter.end();
                this._progressReporter = undefined;
            }
        }
    }
}

export class LspServer {
    private initializeParams: TypeScriptInitializeParams;
    private initializeResult: TypeScriptInitializeResult;
    private tspClient: TspClient;
    private diagnosticQueue?: DiagnosticEventQueue;
    private logger: Logger;
    private workspaceConfiguration: TypeScriptWorkspaceSettings;
    private workspaceRoot: string | undefined;
    private typeScriptAutoFixProvider: TypeScriptAutoFixProvider;
    private loadingIndicator: ServerInitializingIndicator;

    private readonly documents = new LspDocuments();

    constructor(private options: IServerOptions) {
        this.logger = new PrefixingLogger(options.logger, '[lspserver]');
        this.workspaceConfiguration = {};
    }

    closeAll(): void {
        for (const file of [...this.documents.files]) {
            this.closeDocument(file);
        }
    }

    private findTypescriptVersion(): TypeScriptVersion | null {
        const typescriptVersionProvider = new TypeScriptVersionProvider(this.options);
        // User-provided tsserver path.
        const userSettingVersion = typescriptVersionProvider.getUserSettingVersion();
        if (userSettingVersion) {
            if (userSettingVersion.isValid) {
                return userSettingVersion;
            }
            this.logger.warn(`Typescript specified through --tsserver-path ignored due to invalid path "${userSettingVersion.path}"`);
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
        if (bundledVersion && bundledVersion.isValid) {
            return bundledVersion;
        }
        return null;
    }

    async initialize(params: TypeScriptInitializeParams): Promise<TypeScriptInitializeResult> {
        this.logger.log('initialize', params);
        this.initializeParams = params;
        const clientCapabilities = this.initializeParams.capabilities;
        this.options.lspClient.setClientCapabilites(clientCapabilities);
        this.loadingIndicator = new ServerInitializingIndicator(this.options.lspClient);
        this.workspaceRoot = this.initializeParams.rootUri ? uriToPath(this.initializeParams.rootUri) : this.initializeParams.rootPath || undefined;
        this.diagnosticQueue = new DiagnosticEventQueue(
            diagnostics => this.options.lspClient.publishDiagnostics(diagnostics),
            this.documents,
            clientCapabilities.textDocument?.publishDiagnostics,
            this.logger
        );

        const userInitializationOptions: TypeScriptInitializationOptions = this.initializeParams.initializationOptions || {};
        const { disableAutomaticTypingAcquisition, hostInfo, maxTsServerMemory, npmLocation } = userInitializationOptions;
        const { logVerbosity, plugins, preferences }: TypeScriptInitializationOptions = {
            logVerbosity: userInitializationOptions.logVerbosity || this.options.tsserverLogVerbosity,
            plugins: userInitializationOptions.plugins || [],
            preferences: {
                allowIncompleteCompletions: true,
                allowRenameOfImportPath: true,
                allowTextChangesInNewFiles: true,
                displayPartsForJSDoc: true,
                generateReturnInDocTemplate: true,
                includeAutomaticOptionalChainCompletions: true,
                includeCompletionsForImportStatements: true,
                includeCompletionsForModuleExports: true,
                includeCompletionsWithClassMemberSnippets: true,
                includeCompletionsWithInsertText: true,
                includeCompletionsWithSnippetText: true,
                jsxAttributeCompletionStyle: 'auto',
                ...userInitializationOptions.preferences
            }
        };

        const logFile = this.getLogFile(logVerbosity);
        const globalPlugins: string[] = [];
        const pluginProbeLocations: string[] = [];
        for (const plugin of plugins) {
            globalPlugins.push(plugin.name);
            pluginProbeLocations.push(plugin.location);
        }

        const typescriptVersion = this.findTypescriptVersion();
        if (typescriptVersion) {
            this.logger.info(`Using Typescript version (${typescriptVersion.source}) ${typescriptVersion.versionString} from path "${typescriptVersion.tsServerPath}"`);
        } else {
            throw Error('Could not find a valid tsserver version. Exiting.');
        }

        this.tspClient = new TspClient({
            tsserverPath: typescriptVersion.tsServerPath,
            logFile,
            logVerbosity,
            disableAutomaticTypingAcquisition,
            maxTsServerMemory,
            npmLocation,
            globalPlugins,
            pluginProbeLocations,
            logger: this.options.logger,
            onEvent: this.onTsEvent.bind(this),
            onExit: (exitCode, signal) => {
                this.logger.error(`tsserver process has exited (exit code: ${exitCode}, signal: ${signal}). Stopping the server.`);
                // Allow the log to be dispatched to the client.
                setTimeout(() => process.exit(1));
            }
        });

        const started = this.tspClient.start();
        if (!started) {
            throw new Error('tsserver process has failed to start.');
        }
        process.on('exit', () => {
            this.tspClient.shutdown();
            if (this.loadingIndicator) {
                this.loadingIndicator.reset();
            }
        });
        process.on('SIGINT', () => {
            process.exit();
        });

        this.typeScriptAutoFixProvider = new TypeScriptAutoFixProvider(this.tspClient);

        this.tspClient.request(CommandTypes.Configure, {
            ...hostInfo ? { hostInfo } : {},
            formatOptions: {
                // We can use \n here since the editor should normalize later on to its line endings.
                newLineCharacter: '\n'
            },
            preferences
        });

        this.tspClient.request(CommandTypes.CompilerOptionsForInferredProjects, {
            options: {
                module: tsp.ModuleKind.CommonJS,
                target: tsp.ScriptTarget.ES2016,
                jsx: tsp.JsxEmit.Preserve,
                allowJs: true,
                allowSyntheticDefaultImports: true,
                allowNonTsExtensions: true
            }
        });

        const logFileUri = logFile && pathToUri(logFile, undefined);
        this.initializeResult = {
            capabilities: {
                textDocumentSync: lsp.TextDocumentSyncKind.Incremental,
                completionProvider: {
                    triggerCharacters: ['.', '"', '\'', '/', '@', '<'],
                    resolveProvider: true
                },
                codeActionProvider: clientCapabilities.textDocument?.codeAction?.codeActionLiteralSupport
                    ? { codeActionKinds: [...TypeScriptAutoFixProvider.kinds.map(kind => kind.value), CodeActionKind.SourceOrganizeImportsTs.value] } : true,
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
                        Commands.ORGANIZE_IMPORTS,
                        Commands.APPLY_RENAME_FILE
                    ]
                },
                hoverProvider: true,
                renameProvider: true,
                referencesProvider: true,
                signatureHelpProvider: {
                    triggerCharacters: ['(', ',', '<']
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
                            'member'
                        ],
                        // token from: https://github.com/microsoft/TypeScript/blob/main/src/services/classifier2020.ts#L14
                        tokenModifiers: [
                            'declaration',
                            'static',
                            'async',
                            'readonly',
                            'defaultLibrary',
                            'local'
                        ]
                    },
                    full: true,
                    range: true
                }
            },
            logFileUri
        };
        (this.initializeResult.capabilities as lspcalls.CallsServerCapabilities).callsProvider = true;
        this.logger.log('onInitialize result', this.initializeResult);
        return this.initializeResult;
    }
    protected getLogFile(logVerbosity: string | undefined): string | undefined {
        if (logVerbosity === undefined || logVerbosity === 'off') {
            return undefined;
        }
        const logFile = this.doGetLogFile();
        if (logFile) {
            fs.ensureFileSync(logFile);
            return logFile;
        }
        return tempy.file(<any>{ name: 'tsserver.log' });
    }
    protected doGetLogFile(): string | undefined {
        if (process.env.TSSERVER_LOG_FILE) {
            return process.env.TSSERVER_LOG_FILE;
        }
        if (this.options.tsserverLogFile) {
            return this.options.tsserverLogFile;
        }
        if (this.workspaceRoot) {
            return path.join(this.workspaceRoot, '.log/tsserver.log');
        }
        return undefined;
    }

    didChangeConfiguration(params: lsp.DidChangeConfigurationParams): void {
        this.workspaceConfiguration = params.settings || {};
        const ignoredDiagnosticCodes = this.workspaceConfiguration.diagnostics?.ignoredCodes || [];
        this.diagnosticQueue?.updateIgnoredDiagnosticCodes(ignoredDiagnosticCodes);
    }

    getWorkspacePreferencesForDocument(file: string): TypeScriptWorkspaceSettingsLanguageSettings {
        const doc = this.documents.get(file);
        if (!doc) {
            return {};
        }
        const preferencesKey = doc.languageId.startsWith('typescript') ? 'typescript' : 'javascript';
        return this.workspaceConfiguration[preferencesKey] ?? {};
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
    protected async doRequestDiagnostics(): Promise<tsp.RequestCompletedEvent> {
        this.cancelDiagnostics();
        const geterrTokenSource = new lsp.CancellationTokenSource();
        this.diagnosticsTokenSource = geterrTokenSource;

        const { files } = this.documents;
        try {
            return await this.tspClient.request(CommandTypes.Geterr, { delay: 0, files }, this.diagnosticsTokenSource.token);
        } finally {
            if (this.diagnosticsTokenSource === geterrTokenSource) {
                this.diagnosticsTokenSource = undefined;
                this.pendingDebouncedRequest = false;
            }
        }
    }
    protected cancelDiagnostics(): void {
        if (this.diagnosticsTokenSource) {
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
                projectRootPath: this.workspaceRoot
            });
            this.requestDiagnostics();
        } else {
            this.logger.log(`Cannot open already opened doc '${params.textDocument.uri}'.`);
            this.didChangeTextDocument({
                textDocument: params.textDocument,
                contentChanges: [
                    {
                        text: params.textDocument.text
                    }
                ]
            });
        }
    }

    protected getScriptKindName(languageId: string): tsp.ScriptKindName | undefined {
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
            diagnostics: []
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
            this.logger.error('Received change on non-opened document ' + textDocument.uri);
            throw new Error('Received change on non-opened document ' + textDocument.uri);
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
                insertString: change.text
            });
            document.applyEdit(textDocument.version, change);
        }
        this.requestDiagnostics();
    }

    didSaveTextDocument(_params: lsp.DidChangeTextDocumentParams): void {
        // do nothing
    }

    async definition(params: lsp.TextDocumentPositionParams): Promise<lsp.Definition> {
        // TODO: implement version checking and if semver.gte(version, 270) use `definitionAndBoundSpan` instead
        return this.getDefinition({
            type: 'definition',
            params
        });
    }

    async implementation(params: lsp.TextDocumentPositionParams): Promise<lsp.Definition> {
        return this.getDefinition({
            type: 'implementation',
            params
        });
    }

    async typeDefinition(params: lsp.TextDocumentPositionParams): Promise<lsp.Definition> {
        return this.getDefinition({
            type: 'typeDefinition',
            params
        });
    }

    protected async getDefinition({ type, params }: {
        type: 'definition' | 'implementation' | 'typeDefinition';
        params: lsp.TextDocumentPositionParams;
    }): Promise<lsp.Definition> {
        const file = uriToPath(params.textDocument.uri);
        this.logger.log(type, params, file);
        if (!file) {
            return [];
        }

        const result = await this.tspClient.request(type as CommandTypes.Definition, {
            file,
            line: params.position.line + 1,
            offset: params.position.character + 1
        });
        return result.body ? result.body.map(fileSpan => toLocation(fileSpan, this.documents)) : [];
    }

    async documentSymbol(params: lsp.TextDocumentPositionParams): Promise<lsp.DocumentSymbol[] | lsp.SymbolInformation[]> {
        const file = uriToPath(params.textDocument.uri);
        this.logger.log('symbol', params, file);
        if (!file) {
            return [];
        }

        const response = await this.tspClient.request(CommandTypes.NavTree, {
            file
        });
        const tree = response.body;
        if (!tree || !tree.childItems) {
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
        const textDocument = this.initializeParams.capabilities.textDocument;
        const documentSymbol = textDocument && textDocument.documentSymbol;
        return !!documentSymbol && !!documentSymbol.hierarchicalDocumentSymbolSupport;
    }

    /*
     * implemented based on
     * https://github.com/Microsoft/vscode/blob/master/extensions/typescript-language-features/src/features/completions.ts
     */
    async completion(params: lsp.CompletionParams): Promise<lsp.CompletionList | null> {
        const file = uriToPath(params.textDocument.uri);
        this.logger.log('completion', params, file);
        if (!file) {
            return lsp.CompletionList.create([]);
        }

        const document = this.documents.get(file);
        if (!document) {
            throw new Error('The document should be opened for completion, file: ' + file);
        }

        try {
            const result = await this.interuptDiagnostics(() => this.tspClient.request(CommandTypes.CompletionInfo, {
                file,
                line: params.position.line + 1,
                offset: params.position.character + 1
            }));
            const { body } = result;
            const completions = (body ? body.entries : [])
                .filter(entry => entry.kind !== 'warning')
                .map(entry => asCompletionItem(entry, file, params.position, document));
            return lsp.CompletionList.create(completions, body?.isIncomplete);
        } catch (error) {
            if (error.message === 'No content available.') {
                this.logger.info('No content was available for completion request');
                return null;
            } else {
                throw error;
            }
        }
    }

    async completionResolve(item: lsp.CompletionItem): Promise<lsp.CompletionItem> {
        this.logger.log('completion/resolve', item);
        const { body } = await this.interuptDiagnostics(() => this.tspClient.request(CommandTypes.CompletionDetails, item.data));
        const details = body && body.length && body[0];
        if (!details) {
            return item;
        }
        return asResolvedCompletionItem(item, details, this.tspClient, this.workspaceConfiguration.completions || {});
    }

    async hover(params: lsp.TextDocumentPositionParams): Promise<lsp.Hover> {
        const file = uriToPath(params.textDocument.uri);
        this.logger.log('hover', params, file);
        if (!file) {
            return { contents: [] };
        }

        const result = await this.interuptDiagnostics(() => this.getQuickInfo(file, params.position));
        if (!result || !result.body) {
            return { contents: [] };
        }
        const range = asRange(result.body);
        const contents: lsp.MarkedString[] = [];
        if (result.body.displayString) {
            contents.push({ language: 'typescript', value: result.body.displayString });
        }
        const tags = asTagsDocumentation(result.body.tags);
        const documentation = asPlainText(result.body.documentation);
        contents.push(documentation + (tags ? '\n\n' + tags : ''));
        return {
            contents,
            range
        };
    }
    protected async getQuickInfo(file: string, position: lsp.Position): Promise<tsp.QuickInfoResponse | undefined> {
        try {
            return await this.tspClient.request(CommandTypes.Quickinfo, {
                file,
                line: position.line + 1,
                offset: position.character + 1
            });
        } catch (err) {
            return undefined;
        }
    }

    async rename(params: lsp.RenameParams): Promise<lsp.WorkspaceEdit | undefined> {
        const file = uriToPath(params.textDocument.uri);
        this.logger.log('onRename', params, file);
        if (!file) {
            return undefined;
        }

        const result = await this.tspClient.request(CommandTypes.Rename, {
            file,
            line: params.position.line + 1,
            offset: params.position.character + 1
        });

        if (!result.body || !result.body.info.canRename || result.body.locs.length === 0) {
            return undefined;
        }
        const workspaceEdit = {
            changes: {}
        };
        result.body.locs
            .forEach((spanGroup) => {
                const uri = pathToUri(spanGroup.file, this.documents),
                    textEdits = workspaceEdit.changes[uri] || (workspaceEdit.changes[uri] = []);

                spanGroup.locs.forEach((textSpan) => {
                    textEdits.push({
                        newText: params.newName,
                        range: {
                            start: toPosition(textSpan.start),
                            end: toPosition(textSpan.end)
                        }
                    });
                });
            });

        return workspaceEdit;
    }

    async references(params: lsp.ReferenceParams): Promise<lsp.Location[]> {
        const file = uriToPath(params.textDocument.uri);
        this.logger.log('onReferences', params, file);
        if (!file) {
            return [];
        }

        const result = await this.tspClient.request(CommandTypes.References, {
            file,
            line: params.position.line + 1,
            offset: params.position.character + 1
        });
        if (!result.body) {
            return [];
        }
        return result.body.refs
            .filter(fileSpan => params.context.includeDeclaration || !fileSpan.isDefinition)
            .map(fileSpan => toLocation(fileSpan, this.documents));
    }

    async documentFormatting(params: lsp.DocumentFormattingParams): Promise<lsp.TextEdit[]> {
        const file = uriToPath(params.textDocument.uri);
        this.logger.log('documentFormatting', params, file);
        if (!file) {
            return [];
        }

        const formatOptions = this.getFormattingOptions(file, params.options);

        // options are not yet supported in tsserver, but we can send a configure request first
        await this.tspClient.request(CommandTypes.Configure, {
            formatOptions
        });

        const response = await this.tspClient.request(CommandTypes.Format, {
            file,
            line: 1,
            offset: 1,
            endLine: Number.MAX_SAFE_INTEGER,
            endOffset: Number.MAX_SAFE_INTEGER,
            options: formatOptions
        });
        if (response.body) {
            return response.body.map(e => toTextEdit(e));
        }
        return [];
    }

    async documentRangeFormatting(params: lsp.DocumentRangeFormattingParams): Promise<lsp.TextEdit[]> {
        const file = uriToPath(params.textDocument.uri);
        this.logger.log('documentRangeFormatting', params, file);
        if (!file) {
            return [];
        }

        const formatOptions = this.getFormattingOptions(file, params.options);

        // options are not yet supported in tsserver, but we can send a configure request first
        await this.tspClient.request(CommandTypes.Configure, {
            formatOptions
        });

        const response = await this.tspClient.request(CommandTypes.Format, {
            file,
            line: params.range.start.line + 1,
            offset: params.range.start.character + 1,
            endLine: params.range.end.line + 1,
            endOffset: params.range.end.character + 1,
            options: formatOptions
        });
        if (response.body) {
            return response.body.map(e => toTextEdit(e));
        }
        return [];
    }

    private getFormattingOptions(file: string, requestOptions: lsp.FormattingOptions): tsp.FormatCodeSettings {
        const workspacePreference = this.getWorkspacePreferencesForDocument(file);

        let opts = <tsp.FormatCodeSettings>{
            ...workspacePreference?.format || {},
            ...requestOptions
        };

        // translate
        if (opts.convertTabsToSpaces === undefined) {
            opts.convertTabsToSpaces = requestOptions.insertSpaces;
        }
        if (opts.indentSize === undefined) {
            opts.indentSize = requestOptions.tabSize;
        }

        if (this.workspaceRoot) {
            try {
                opts = JSON.parse(fs.readFileSync(this.workspaceRoot + '/tsfmt.json', 'utf-8'));
            } catch (err) {
                this.logger.log(`No formatting options found ${err}`);
            }
        }

        return opts;
    }

    async signatureHelp(params: lsp.TextDocumentPositionParams): Promise<lsp.SignatureHelp | undefined> {
        const file = uriToPath(params.textDocument.uri);
        this.logger.log('signatureHelp', params, file);
        if (!file) {
            return undefined;
        }

        const response = await this.interuptDiagnostics(() => this.getSignatureHelp(file, params.position));
        if (!response || !response.body) {
            return undefined;
        }
        return asSignatureHelp(response.body);
    }
    protected async getSignatureHelp(file: string, position: lsp.Position): Promise<tsp.SignatureHelpResponse | undefined> {
        try {
            return await this.tspClient.request(CommandTypes.SignatureHelp, {
                file,
                line: position.line + 1,
                offset: position.character + 1
            });
        } catch (err) {
            return undefined;
        }
    }

    async codeAction(params: lsp.CodeActionParams): Promise<lsp.CodeAction[]> {
        const file = uriToPath(params.textDocument.uri);
        this.logger.log('codeAction', params, file);
        if (!file) {
            return [];
        }
        const args = toFileRangeRequestArgs(file, params.range);
        const actions: lsp.CodeAction[] = [];
        const kinds = params.context.only?.map(kind => new CodeActionKind(kind));
        if (!kinds || kinds.some(kind => kind.contains(CodeActionKind.QuickFix))) {
            const errorCodes = params.context.diagnostics.map(diagnostic => Number(diagnostic.code));
            actions.push(...provideQuickFix(await this.getCodeFixes({ ...args, errorCodes }), this.documents));
        }
        if (!kinds || kinds.some(kind => kind.contains(CodeActionKind.Refactor))) {
            actions.push(...provideRefactors(await this.getRefactors(args), args));
        }

        // organize import is provided by tsserver for any line, so we only get it if explicitly requested
        if (kinds?.some(kind => kind.contains(CodeActionKind.SourceOrganizeImportsTs))) {
            // see this issue for more context about how this argument is used
            // https://github.com/microsoft/TypeScript/issues/43051
            const skipDestructiveCodeActions = params.context.diagnostics.some(
                // assume no severity is an error
                d => (d.severity ?? 0) <= 2
            );
            const response = await this.getOrganizeImports({
                scope: { type: 'file', args },
                skipDestructiveCodeActions
            });
            actions.push(...provideOrganizeImports(response, this.documents));
        }

        // TODO: Since we rely on diagnostics pointing at errors in the correct places, we can't proceed if we are not
        // sure that diagnostics are up-to-date. Thus we check `pendingDebouncedRequest` to see if there are *any*
        // pending diagnostic requests (regardless of for which file).
        // In general would be better to replace the whole diagnostics handling logic with the one from
        // bufferSyncSupport.ts in VSCode's typescript language features.
        if (!this.pendingDebouncedRequest && kinds?.some(kind => TypeScriptAutoFixProvider.kinds.some(k => k.contains(kind)))) {
            const diagnostics = this.diagnosticQueue?.getDiagnosticsForFile(file) || [];
            if (diagnostics.length) {
                actions.push(...await this.typeScriptAutoFixProvider.provideCodeActions(file, diagnostics, this.documents));
            }
        }

        return actions;
    }
    protected async getCodeFixes(args: tsp.CodeFixRequestArgs): Promise<tsp.GetCodeFixesResponse | undefined> {
        try {
            return await this.tspClient.request(CommandTypes.GetCodeFixes, args);
        } catch (err) {
            return undefined;
        }
    }
    protected async getRefactors(args: tsp.GetApplicableRefactorsRequestArgs): Promise<tsp.GetApplicableRefactorsResponse | undefined> {
        try {
            return await this.tspClient.request(CommandTypes.GetApplicableRefactors, args);
        } catch (err) {
            return undefined;
        }
    }
    protected async getOrganizeImports(args: tsp.OrganizeImportsRequestArgs): Promise<tsp.OrganizeImportsResponse | undefined> {
        try {
            return await this.tspClient.request(CommandTypes.OrganizeImports, args);
        } catch (err) {
            return undefined;
        }
    }

    async executeCommand(arg: lsp.ExecuteCommandParams): Promise<void> {
        this.logger.log('executeCommand', arg);
        if (arg.command === Commands.APPLY_WORKSPACE_EDIT && arg.arguments) {
            const edit = arg.arguments[0] as lsp.WorkspaceEdit;
            await this.options.lspClient.applyWorkspaceEdit({
                edit
            });
        } else if (arg.command === Commands.APPLY_CODE_ACTION && arg.arguments) {
            const codeAction = arg.arguments[0] as tsp.CodeAction;
            if (!await this.applyFileCodeEdits(codeAction.changes)) {
                return;
            }
            if (codeAction.commands && codeAction.commands.length) {
                for (const command of codeAction.commands) {
                    await this.tspClient.request(CommandTypes.ApplyCodeActionCommand, { command });
                }
            }
        } else if (arg.command === Commands.APPLY_REFACTORING && arg.arguments) {
            const args = arg.arguments[0] as tsp.GetEditsForRefactorRequestArgs;
            const { body } = await this.tspClient.request(CommandTypes.GetEditsForRefactor, args);
            if (!body || !body.edits.length) {
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
                        uri: pathToUri(args.file, this.documents)
                    },
                    position: toPosition(renameLocation)
                });
            }
        } else if (arg.command === Commands.ORGANIZE_IMPORTS && arg.arguments) {
            const file = arg.arguments[0] as string;
            const additionalArguments: { skipDestructiveCodeActions?: boolean; } = arg.arguments[1] || {};
            const { body } = await this.tspClient.request(CommandTypes.OrganizeImports, {
                scope: {
                    type: 'file',
                    args: { file }
                },
                skipDestructiveCodeActions: additionalArguments.skipDestructiveCodeActions
            });
            await this.applyFileCodeEdits(body);
        } else if (arg.command === Commands.APPLY_RENAME_FILE && arg.arguments) {
            const { sourceUri, targetUri } = arg.arguments[0] as {
                sourceUri: string;
                targetUri: string;
            };
            this.applyRenameFile(sourceUri, targetUri);
        } else if (arg.command === Commands.APPLY_COMPLETION_CODE_ACTION && arg.arguments) {
            const [_, codeActions] = arg.arguments as [string, tsp.CodeAction[]];
            for (const codeAction of codeActions) {
                await this.applyFileCodeEdits(codeAction.changes);
                if (codeAction.commands && codeAction.commands.length) {
                    for (const command of codeAction.commands) {
                        await this.tspClient.request(CommandTypes.ApplyCodeActionCommand, { command });
                    }
                }
                // Execute only the first code action.
                break;
            }
        } else {
            this.logger.error(`Unknown command ${arg.command}.`);
        }
    }
    protected async applyFileCodeEdits(edits: ReadonlyArray<tsp.FileCodeEdits>): Promise<boolean> {
        if (!edits.length) {
            return false;
        }
        const changes: { [uri: string]: lsp.TextEdit[]; } = {};
        for (const edit of edits) {
            changes[pathToUri(edit.fileName, this.documents)] = edit.textChanges.map(toTextEdit);
        }
        const { applied } = await this.options.lspClient.applyWorkspaceEdit({
            edit: { changes }
        });
        return applied;
    }

    protected async applyRenameFile(sourceUri: string, targetUri: string): Promise<void> {
        const edits = await this.getEditsForFileRename(sourceUri, targetUri);
        this.applyFileCodeEdits(edits);
    }
    protected async getEditsForFileRename(sourceUri: string, targetUri: string): Promise<ReadonlyArray<tsp.FileCodeEdits>> {
        const newFilePath = uriToPath(targetUri);
        const oldFilePath = uriToPath(sourceUri);
        if (!newFilePath || !oldFilePath) {
            return [];
        }
        try {
            const { body } = await this.tspClient.request(CommandTypes.GetEditsForFileRename, {
                oldFilePath,
                newFilePath
            });
            return body;
        } catch (err) {
            return [];
        }
    }

    async documentHighlight(arg: lsp.TextDocumentPositionParams): Promise<lsp.DocumentHighlight[]> {
        const file = uriToPath(arg.textDocument.uri);
        this.logger.log('documentHighlight', arg, file);
        if (!file) {
            return [];
        }
        let response: tsp.DocumentHighlightsResponse;
        try {
            response = await this.tspClient.request(CommandTypes.DocumentHighlights, {
                file,
                line: arg.position.line + 1,
                offset: arg.position.character + 1,
                filesToSearch: [file]
            });
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

    async workspaceSymbol(params: lsp.WorkspaceSymbolParams): Promise<lsp.SymbolInformation[]> {
        const result = await this.tspClient.request(CommandTypes.Navto, {
            file: this.lastFileOrDummy(),
            searchValue: params.query
        });
        if (!result.body) {
            return [];
        }
        return result.body.map(item => {
            return <lsp.SymbolInformation>{
                location: {
                    uri: pathToUri(item.file, this.documents),
                    range: {
                        start: toPosition(item.start),
                        end: toPosition(item.end)
                    }
                },
                kind: toSymbolKind(item.kind),
                name: item.name
            };
        });
    }

    /**
     * implemented based on https://github.com/Microsoft/vscode/blob/master/extensions/typescript-language-features/src/features/folding.ts
     */
    async foldingRanges(params: lsp.FoldingRangeParams): Promise<lsp.FoldingRange[] | undefined> {
        const file = uriToPath(params.textDocument.uri);
        this.logger.log('foldingRanges', params, file);
        if (!file) {
            return undefined;
        }

        const document = this.documents.get(file);
        if (!document) {
            throw new Error("The document should be opened for foldingRanges', file: " + file);
        }
        const { body } = await this.tspClient.request(CommandTypes.GetOutliningSpans, { file });
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
    protected asFoldingRange(span: tsp.OutliningSpan, document: LspDocument): lsp.FoldingRange | undefined {
        const range = asRange(span.textSpan);
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
            range.end
        )) === '}' ? Math.max(range.end.line - 1, range.start.line) : range.end.line;

        return {
            startLine,
            endLine,
            kind
        };
    }
    protected asFoldingRangeKind(span: tsp.OutliningSpan): lsp.FoldingRangeKind | undefined {
        switch (span.kind) {
            case 'comment': return lsp.FoldingRangeKind.Comment;
            case 'region': return lsp.FoldingRangeKind.Region;
            case 'imports': return lsp.FoldingRangeKind.Imports;
            case 'code':
            default: return undefined;
        }
    }

    protected onTsEvent(event: protocol.Event): void {
        if (event.event === EventTypes.SementicDiag ||
            event.event === EventTypes.SyntaxDiag ||
            event.event === EventTypes.SuggestionDiag) {
            this.diagnosticQueue?.updateDiagnostics(event.event, event as tsp.DiagnosticEvent);
        } else if (event.event === EventTypes.ProjectLoadingStart) {
            this.loadingIndicator.startedLoadingProject((event as tsp.ProjectLoadingStartEvent).body.projectName);
        } else if (event.event === EventTypes.ProjectLoadingFinish) {
            this.loadingIndicator.finishedLoadingProject((event as tsp.ProjectLoadingFinishEvent).body.projectName);
        } else {
            this.logger.log('Ignored event', {
                event: event.event
            });
        }
    }

    async calls(params: lspcalls.CallsParams): Promise<lspcalls.CallsResult> {
        let callsResult = <lspcalls.CallsResult>{ calls: [] };
        const file = uriToPath(params.textDocument.uri);
        this.logger.log('calls', params, file);
        if (!file) {
            return callsResult;
        }
        if (params.direction === lspcalls.CallDirection.Outgoing) {
            const documentProvider = (file: string) => this.documents.get(file);
            callsResult = await computeCallees(this.tspClient, params, documentProvider);
        } else {
            callsResult = await computeCallers(this.tspClient, params);
        }
        return callsResult;
    }

    async inlayHints(params: lspinlayHints.InlayHintsParams): Promise<lspinlayHints.InlayHintsResult> {
        const file = uriToPath(params.textDocument.uri);
        this.logger.log('inlayHints', params, file);
        if (!file) {
            return { inlayHints: [] };
        }

        const inlayHintsOptions = this.getInlayHintsOptions(file);
        this.tspClient.request(CommandTypes.Configure, {
            preferences: inlayHintsOptions
        });

        const doc = this.documents.get(file);
        if (!doc) {
            return { inlayHints: [] };
        }

        const start = doc.offsetAt(params.range?.start ?? {
            line: 0,
            character: 0
        });
        const end = doc.offsetAt(params.range?.end ?? {
            line: doc.lineCount + 1,
            character: 0
        });

        try {
            const result = await this.tspClient.request(
                CommandTypes.ProvideInlayHints,
                {
                    file,
                    start: start,
                    length: end - start
                }
            );

            return {
                inlayHints:
                    result.body?.map((item) => ({
                        text: item.text,
                        position: toPosition(item.position),
                        whitespaceAfter: item.whitespaceAfter,
                        whitespaceBefore: item.whitespaceBefore,
                        kind: item.kind
                    })) ?? []
            };
        } catch {
            return {
                inlayHints: []
            };
        }
    }

    private getInlayHintsOptions(file: string): lspinlayHints.InlayHintsOptions & tsp.UserPreferences {
        const workspacePreference = this.getWorkspacePreferencesForDocument(file);
        const userPreferences = this.initializeParams.initializationOptions?.preferences || {};
        return {
            ...userPreferences,
            ...workspacePreference.inlayHints ?? {}
        };
    }

    async semanticTokensFull(params: lsp.SemanticTokensParams): Promise<lsp.SemanticTokens> {
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
            character: 0
        });
        const end = doc.offsetAt({
            line: doc.lineCount,
            character: 0
        });

        return this.getSemanticTokens(doc, file, start, end);
    }

    async semanticTokensRange(params: lsp.SemanticTokensRangeParams): Promise<lsp.SemanticTokens> {
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

        return this.getSemanticTokens(doc, file, start, end);
    }

    async getSemanticTokens(doc: LspDocument, file: string, startOffset: number, endOffset: number) : Promise<lsp.SemanticTokens> {
        try {
            const result = await this.tspClient.request(
                CommandTypes.EncodedSemanticClassificationsFull,
                {
                    file,
                    start: startOffset,
                    length: endOffset - startOffset,
                    format: '2020'
                }
            );

            const spans = result.body?.spans ?? [];
            return { data: lspsemanticTokens.transformSpans(doc, spans) };
        } catch {
            return { data: [] };
        }
    }
}
