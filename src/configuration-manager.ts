import deepmerge from 'deepmerge';
import path from 'node:path';
import type * as lsp from 'vscode-languageserver';
import { LspDocuments } from './document.js';
import { CommandTypes, ModuleKind, ScriptTarget, TypeScriptInitializationOptions } from './ts-protocol.js';
import type { ts } from './ts-protocol.js';
import type { TspClient } from './tsp-client.js';
import API from './utils/api.js';

const DEFAULT_TSSERVER_PREFERENCES: Required<ts.server.protocol.UserPreferences> = {
    allowIncompleteCompletions: true,
    allowRenameOfImportPath: true,
    allowTextChangesInNewFiles: true,
    autoImportFileExcludePatterns: [],
    disableLineTextInReferences: true,
    disableSuggestions: false,
    displayPartsForJSDoc: true,
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
    jsxAttributeCompletionStyle: 'auto',
    lazyConfiguredProjectsFromExternalProject: false,
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
}

export interface WorkspaceConfigurationImplicitProjectConfigurationOptions {
    checkJs?: boolean;
    experimentalDecorators?: boolean;
    module?: string;
    strictFunctionTypes?: boolean;
    strictNullChecks?: boolean;
    target?: string;
}

/* eslint-disable @typescript-eslint/indent */
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
/* eslint-enable @typescript-eslint/indent */

interface WorkspaceConfigurationDiagnosticsOptions {
    ignoredCodes?: number[];
}

export interface WorkspaceConfigurationCompletionOptions {
    completeFunctionCalls?: boolean;
}

export class ConfigurationManager {
    public tsPreferences: Required<ts.server.protocol.UserPreferences> = deepmerge({}, DEFAULT_TSSERVER_PREFERENCES);
    public workspaceConfiguration: WorkspaceConfiguration = deepmerge({}, DEFAULT_WORKSPACE_CONFIGURATION);
    private tspClient: TspClient | null = null;

    constructor(private readonly documents: LspDocuments) {}

    public mergeTsPreferences(preferences: ts.server.protocol.UserPreferences): void {
        this.tsPreferences = deepmerge(this.tsPreferences, preferences);
    }

    public setWorkspaceConfiguration(configuration: WorkspaceConfiguration): void {
        this.workspaceConfiguration = deepmerge(DEFAULT_WORKSPACE_CONFIGURATION, configuration);
    }

    public setAndConfigureTspClient(workspaceFolder: string | undefined, client: TspClient, hostInfo?: TypeScriptInitializationOptions['hostInfo']): void {
        this.tspClient = client;
        const formatOptions: ts.server.protocol.FormatCodeSettings = {
            // We can use \n here since the editor should normalize later on to its line endings.
            newLineCharacter: '\n',
        };
        const args: ts.server.protocol.ConfigureRequestArguments = {
            ...hostInfo ? { hostInfo } : {},
            formatOptions,
            preferences: {
                ...this.tsPreferences,
                autoImportFileExcludePatterns: this.getAutoImportFileExcludePatternsPreference(workspaceFolder),
            },
        };
        client.request(CommandTypes.Configure, args);
    }

    public async configureGloballyFromDocument(filename: string, formattingOptions?: lsp.FormattingOptions): Promise<void> {
        const args: ts.server.protocol.ConfigureRequestArguments = {
            formatOptions: this.getFormattingOptions(filename, formattingOptions),
            preferences: this.getPreferences(filename),
        };
        await this.tspClient?.request(CommandTypes.Configure, args);
    }

    public getPreferences(filename: string): ts.server.protocol.UserPreferences {
        if (this.tspClient?.apiVersion.lt(API.v290)) {
            return {};
        }

        const workspacePreferences = this.getWorkspacePreferencesForFile(filename);
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

    private getFormattingOptions(filename: string, formattingOptions?: lsp.FormattingOptions): ts.server.protocol.FormatCodeSettings {
        const workspacePreferences = this.getWorkspacePreferencesForFile(filename);

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

        return opts;
    }

    private getQuoteStylePreference(preferences: ts.server.protocol.UserPreferences) {
        switch (preferences.quotePreference) {
            case 'single': return 'single';
            case 'double': return 'double';
            default: return this.tspClient?.apiVersion.gte(API.v333) ? 'auto' : undefined;
        }
    }

    private getWorkspacePreferencesForFile(filename: string): WorkspaceConfigurationLanguageOptions {
        const document = this.documents.get(filename);
        const languageId = document?.languageId.startsWith('typescript') ? 'typescript' : 'javascript';
        return this.workspaceConfiguration[languageId] || {};
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
