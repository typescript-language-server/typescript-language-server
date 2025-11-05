/**
 * Copyright (C) 2023 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import path from 'node:path';
import deepmerge from 'deepmerge';
import type lsp from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { CommandTypes, ModuleKind, ScriptTarget, type ts, type TypeScriptInitializationOptions } from '../ts-protocol.js';
import { ITypeScriptServiceClient } from '../typescriptService.js';
import { isTypeScriptDocument } from '../configuration/languageIds.js';
import { LspDocument } from '../document.js';
import type { LspClient } from '../lsp-client.js';
import API from '../utils/api.js';
import { equals } from '../utils/objects.js';
import { ResourceMap } from '../utils/resourceMap.js';
import { getInferredProjectCompilerOptions } from '../utils/tsconfig.js';

const DEFAULT_TSSERVER_PREFERENCES: Required<ts.server.protocol.UserPreferences> = {
    allowIncompleteCompletions: true,
    allowRenameOfImportPath: true,
    allowTextChangesInNewFiles: true,
    autoImportFileExcludePatterns: [],
    autoImportSpecifierExcludeRegexes: [],
    disableLineTextInReferences: true,
    disableSuggestions: false,
    displayPartsForJSDoc: true,
    excludeLibrarySymbolsInNavTo: true,
    generateReturnInDocTemplate: true,
    importModuleSpecifierEnding: 'auto',
    importModuleSpecifierPreference: 'shortest',
    includeAutomaticOptionalChainCompletions: true,
    includeCompletionsForImportStatements: true,
    includeCompletionsForModuleExports: true,
    includeCompletionsWithClassMemberSnippets: true,
    includeCompletionsWithInsertText: true,
    includeCompletionsWithObjectLiteralMethodSnippets: true,
    includeCompletionsWithSnippetText: true,
    includeInlayEnumMemberValueHints: false,
    includeInlayFunctionLikeReturnTypeHints: false,
    includeInlayFunctionParameterTypeHints: false,
    includeInlayParameterNameHints: 'none',
    includeInlayParameterNameHintsWhenArgumentMatchesName: false,
    includeInlayPropertyDeclarationTypeHints: false,
    includeInlayVariableTypeHints: false,
    includeInlayVariableTypeHintsWhenTypeMatchesName: false,
    includePackageJsonAutoImports: 'auto',
    interactiveInlayHints: true,
    jsxAttributeCompletionStyle: 'auto',
    lazyConfiguredProjectsFromExternalProject: false,
    maximumHoverLength: 500,
    organizeImportsAccentCollation: true,
    organizeImportsCaseFirst: false,
    organizeImportsCollation: 'ordinal',
    organizeImportsLocale: 'en',
    organizeImportsIgnoreCase: 'auto',
    organizeImportsNumericCollation: false,
    organizeImportsTypeOrder: 'last',
    preferTypeOnlyAutoImports: false,
    providePrefixAndSuffixTextForRename: true,
    provideRefactorNotApplicableReason: true,
    quotePreference: 'auto',
    useLabelDetailsInCompletionEntries: true,
};

const DEFAULT_IMPLICIT_PROJECT_CONFIGURATION: Required<WorkspaceConfigurationImplicitProjectConfigurationOptions> = {
    checkJs: false,
    experimentalDecorators: false,
    module: ModuleKind.ESNext,
    strictFunctionTypes: true,
    strictNullChecks: true,
    target: ScriptTarget.ES2020,
};

const DEFAULT_WORKSPACE_CONFIGURATION: WorkspaceConfiguration = {
    implicitProjectConfiguration: DEFAULT_IMPLICIT_PROJECT_CONFIGURATION,
};

export interface WorkspaceConfiguration {
    javascript?: WorkspaceConfigurationLanguageOptions;
    typescript?: WorkspaceConfigurationLanguageOptions;
    completions?: WorkspaceConfigurationCompletionOptions;
    diagnostics?: WorkspaceConfigurationDiagnosticsOptions;
    implicitProjectConfiguration?: WorkspaceConfigurationImplicitProjectConfigurationOptions;
}

export interface WorkspaceConfigurationLanguageOptions {
    format?: ts.server.protocol.FormatCodeSettings;
    inlayHints?: TypeScriptInlayHintsPreferences;
    implementationsCodeLens?: {
        enabled?: boolean;
    };
    referencesCodeLens?: {
        enabled?: boolean;
        showOnAllFunctions?: boolean;
    };
}

export interface WorkspaceConfigurationImplicitProjectConfigurationOptions {
    checkJs?: boolean;
    experimentalDecorators?: boolean;
    module?: string;
    strictFunctionTypes?: boolean;
    strictNullChecks?: boolean;
    target?: string;
}

export type TypeScriptInlayHintsPreferences = Pick<
    ts.server.protocol.UserPreferences,
    'includeInlayParameterNameHints' |
    'includeInlayParameterNameHintsWhenArgumentMatchesName' |
    'includeInlayFunctionParameterTypeHints' |
    'includeInlayVariableTypeHints' |
    'includeInlayVariableTypeHintsWhenTypeMatchesName' |
    'includeInlayPropertyDeclarationTypeHints' |
    'includeInlayFunctionLikeReturnTypeHints' |
    'includeInlayEnumMemberValueHints'
>;

interface WorkspaceConfigurationDiagnosticsOptions {
    ignoredCodes?: number[];
}

export interface WorkspaceConfigurationCompletionOptions {
    completeFunctionCalls?: boolean;
}

interface FileConfiguration {
    readonly formatOptions: ts.server.protocol.FormatCodeSettings;
    readonly preferences: ts.server.protocol.UserPreferences;
}

function areFileConfigurationsEqual(a: FileConfiguration, b: FileConfiguration): boolean {
    return equals(a, b);
}

export default class FileConfigurationManager {
    public tsPreferences: Required<ts.server.protocol.UserPreferences> = deepmerge({}, DEFAULT_TSSERVER_PREFERENCES);
    public workspaceConfiguration: WorkspaceConfiguration = deepmerge({}, DEFAULT_WORKSPACE_CONFIGURATION);
    private readonly formatOptions: ResourceMap<Promise<FileConfiguration | undefined>>;

    public constructor(
        private readonly client: ITypeScriptServiceClient,
        private readonly lspClient: LspClient,
        onCaseInsensitiveFileSystem: boolean,
    ) {
        this.formatOptions = new ResourceMap(undefined, { onCaseInsensitiveFileSystem });
    }

    public onDidCloseTextDocument(documentUri: URI): void {
        // When a document gets closed delete the cached formatting options.
        // This is necessary since the tsserver now closed a project when its
        // last file in it closes which drops the stored formatting options
        // as well.
        this.formatOptions.delete(documentUri);
    }

    public mergeTsPreferences(preferences: ts.server.protocol.UserPreferences): void {
        this.tsPreferences = deepmerge(this.tsPreferences, preferences);
    }

    public setWorkspaceConfiguration(configuration: WorkspaceConfiguration): void {
        this.workspaceConfiguration = deepmerge(DEFAULT_WORKSPACE_CONFIGURATION, configuration);
        this.setCompilerOptionsForInferredProjects();
    }

    public setGlobalConfiguration(workspaceFolder: string | undefined, hostInfo?: TypeScriptInitializationOptions['hostInfo']): void {
        const formatOptions: ts.server.protocol.FormatCodeSettings = {
            // We can use \n here since the editor should normalize later on to its line endings.
            newLineCharacter: '\n',
        };

        this.client.executeWithoutWaitingForResponse(
            CommandTypes.Configure,
            {
                ...hostInfo ? { hostInfo } : {},
                formatOptions,
                preferences: {
                    ...this.tsPreferences,
                    autoImportFileExcludePatterns: this.getAutoImportFileExcludePatternsPreference(workspaceFolder),
                },
            },
        );
        this.setCompilerOptionsForInferredProjects();
    }

    private setCompilerOptionsForInferredProjects(): void {
        this.client.executeWithoutWaitingForResponse(
            CommandTypes.CompilerOptionsForInferredProjects,
            {
                options: {
                    ...getInferredProjectCompilerOptions(this.client.apiVersion, this.workspaceConfiguration.implicitProjectConfiguration!),
                    allowJs: true,
                    allowNonTsExtensions: true,
                    allowSyntheticDefaultImports: true,
                    resolveJsonModule: true,
                },
            },
        );
    }

    public async ensureConfigurationForDocument(
        document: LspDocument,
        token?: lsp.CancellationToken,
    ): Promise<void> {
        const formattingOptions = await this.getFormattingOptions(document);
        return this.ensureConfigurationOptions(document, formattingOptions, token);
    }

    private async getFormattingOptions(document: LspDocument): Promise<Partial<lsp.FormattingOptions>> {
        const formatConfiguration = await this.lspClient.getWorkspaceConfiguration<Partial<lsp.FormattingOptions> | undefined>(document.uri.toString(), 'formattingOptions') || {};
        const options: Partial<lsp.FormattingOptions> = {};

        if (typeof formatConfiguration.tabSize === 'number') {
            options.tabSize = formatConfiguration.tabSize;
        }
        if (typeof formatConfiguration.insertSpaces === 'boolean') {
            options.insertSpaces = formatConfiguration.insertSpaces;
        }

        return options;
    }

    public async ensureConfigurationOptions(
        document: LspDocument,
        options?: Partial<lsp.FormattingOptions>,
        token?: lsp.CancellationToken,
    ): Promise<void> {
        const currentOptions = this.getFileOptions(document, options);
        const cachedOptions = this.formatOptions.get(document.uri);
        if (cachedOptions) {
            const cachedOptionsValue = await cachedOptions;
            if (token?.isCancellationRequested) {
                return;
            }

            if (cachedOptionsValue && areFileConfigurationsEqual(cachedOptionsValue, currentOptions)) {
                return;
            }
        }

        const task = (async () => {
            try {
                const response = await this.client.execute(CommandTypes.Configure, { file: document.filepath, ...currentOptions }, token);
                return response.type === 'response' ? currentOptions : undefined;
            } catch {
                return undefined;
            }
        })();

        this.formatOptions.set(document.uri, task);

        await task;
    }

    public async setGlobalConfigurationFromDocument(
        document: LspDocument,
        token: lsp.CancellationToken,
    ): Promise<void> {
        const args: ts.server.protocol.ConfigureRequestArguments = {
            file: undefined /*global*/,
            ...this.getFileOptions(document),
        };
        await this.client.execute(CommandTypes.Configure, args, token);
    }

    public reset(): void {
        this.formatOptions.clear();
    }

    private getFileOptions(
        document: LspDocument,
        options?: Partial<lsp.FormattingOptions>,
    ): FileConfiguration {
        return {
            formatOptions: this.getFormatOptions(document, options),
            preferences: this.getPreferences(document),
        };
    }

    private getFormatOptions(
        document: LspDocument,
        formattingOptions?: Partial<lsp.FormattingOptions>,
    ): ts.server.protocol.FormatCodeSettings {
        const workspacePreferences = this.getWorkspacePreferencesForFile(document);

        const opts: ts.server.protocol.FormatCodeSettings = {
            ...workspacePreferences?.format,
            ...formattingOptions,
        };

        if (opts.convertTabsToSpaces === undefined) {
            opts.convertTabsToSpaces = formattingOptions?.insertSpaces;
        }
        if (opts.indentSize === undefined) {
            opts.indentSize = formattingOptions?.tabSize;
        }
        if (opts.newLineCharacter === undefined) {
            opts.newLineCharacter = '\n';
        }

        return opts;
    }

    public getWorkspacePreferencesForFile(document: LspDocument): WorkspaceConfigurationLanguageOptions {
        return this.workspaceConfiguration[isTypeScriptDocument(document) ? 'typescript' : 'javascript'] || {};
    }

    public getPreferences(document: LspDocument): ts.server.protocol.UserPreferences {
        const workspacePreferences = this.getWorkspacePreferencesForFile(document);
        const preferences = Object.assign<ts.server.protocol.UserPreferences, ts.server.protocol.UserPreferences, ts.server.protocol.UserPreferences>(
            {},
            this.tsPreferences,
            workspacePreferences?.inlayHints || {},
        );

        return {
            ...preferences,
            quotePreference: this.getQuoteStylePreference(preferences),
        };
    }

    private getQuoteStylePreference(preferences: ts.server.protocol.UserPreferences) {
        switch (preferences.quotePreference) {
            case 'single': return 'single';
            case 'double': return 'double';
            default: return this.client.apiVersion.gte(API.v333) ? 'auto' : undefined;
        }
    }

    private getAutoImportFileExcludePatternsPreference(workspaceFolder: string | undefined): string[] | undefined {
        if (!workspaceFolder || this.tsPreferences.autoImportFileExcludePatterns.length === 0) {
            return;
        }
        return this.tsPreferences.autoImportFileExcludePatterns.map(p => {
            // Normalization rules: https://github.com/microsoft/TypeScript/pull/49578
            const slashNormalized = p.replace(/\\/g, '/');
            const isRelative = /^\.\.?($|\/)/.test(slashNormalized);
            return path.posix.isAbsolute(p) ? p :
                p.startsWith('*') ? `/${slashNormalized}` :
                    isRelative ? path.posix.join(workspaceFolder, p) :
                        `/**/${slashNormalized}`;
        });
    }
}
