/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * **IMPORTANT** this module should not depend on `vscode-languageserver` only protocol and types
 */
import lsp from 'vscode-languageserver-protocol';
import type ts from 'typescript/lib/tsserverlibrary.js';
import type { TraceValue } from './tsServer/tracer.js';

export type { ts };

export namespace TypeScriptRenameRequest {
    export const type = new lsp.RequestType<lsp.TextDocumentPositionParams, void, void>('_typescript.rename');
}

// START: Duplicated from typescript/lib/tsserverlibrary.js since we don't want to depend on typescript at runtime

export enum CommandTypes {
    JsxClosingTag = 'jsxClosingTag',
    Brace = 'brace',
    BraceCompletion = 'braceCompletion',
    GetSpanOfEnclosingComment = 'getSpanOfEnclosingComment',
    Change = 'change',
    Close = 'close',
    /** @deprecated Prefer CompletionInfo -- see comment on CompletionsResponse */
    Completions = 'completions',
    CompletionEntryDetails = 'completionEntryDetails',
    CompletionInfo = 'completionInfo',
    CompletionDetails = 'completionEntryDetails',
    CompileOnSaveAffectedFileList = 'compileOnSaveAffectedFileList',
    CompileOnSaveEmitFile = 'compileOnSaveEmitFile',
    Configure = 'configure',
    Definition = 'definition',
    DefinitionAndBoundSpan = 'definitionAndBoundSpan',
    // Not considered part of the public API - https://github.com/microsoft/TypeScript/issues/51410
    EncodedSemanticClassificationsFull = 'encodedSemanticClassifications-full',
    Implementation = 'implementation',
    Exit = 'exit',
    FileReferences = 'fileReferences',
    Format = 'format',
    Formatonkey = 'formatonkey',
    Geterr = 'geterr',
    GeterrForProject = 'geterrForProject',
    SemanticDiagnosticsSync = 'semanticDiagnosticsSync',
    SyntacticDiagnosticsSync = 'syntacticDiagnosticsSync',
    SuggestionDiagnosticsSync = 'suggestionDiagnosticsSync',
    NavBar = 'navbar',
    Navto = 'navto',
    NavTree = 'navtree',
    NavTreeFull = 'navtree-full',
    /** @deprecated */
    Occurrences = 'occurrences',
    DocumentHighlights = 'documentHighlights',
    Open = 'open',
    Quickinfo = 'quickinfo',
    References = 'references',
    Reload = 'reload',
    Rename = 'rename',
    Saveto = 'saveto',
    SignatureHelp = 'signatureHelp',
    FindSourceDefinition = 'findSourceDefinition',
    Status = 'status',
    TypeDefinition = 'typeDefinition',
    ProjectInfo = 'projectInfo',
    ReloadProjects = 'reloadProjects',
    Unknown = 'unknown',
    OpenExternalProject = 'openExternalProject',
    OpenExternalProjects = 'openExternalProjects',
    CloseExternalProject = 'closeExternalProject',
    UpdateOpen = 'updateOpen',
    GetOutliningSpans = 'getOutliningSpans',
    TodoComments = 'todoComments',
    Indentation = 'indentation',
    DocCommentTemplate = 'docCommentTemplate',
    CompilerOptionsForInferredProjects = 'compilerOptionsForInferredProjects',
    GetCodeFixes = 'getCodeFixes',
    GetCombinedCodeFix = 'getCombinedCodeFix',
    ApplyCodeActionCommand = 'applyCodeActionCommand',
    GetSupportedCodeFixes = 'getSupportedCodeFixes',
    GetApplicableRefactors = 'getApplicableRefactors',
    GetEditsForRefactor = 'getEditsForRefactor',
    OrganizeImports = 'organizeImports',
    GetEditsForFileRename = 'getEditsForFileRename',
    ConfigurePlugin = 'configurePlugin',
    SelectionRange = 'selectionRange',
    ToggleLineComment = 'toggleLineComment',
    ToggleMultilineComment = 'toggleMultilineComment',
    CommentSelection = 'commentSelection',
    UncommentSelection = 'uncommentSelection',
    PrepareCallHierarchy = 'prepareCallHierarchy',
    ProvideCallHierarchyIncomingCalls = 'provideCallHierarchyIncomingCalls',
    ProvideCallHierarchyOutgoingCalls = 'provideCallHierarchyOutgoingCalls',
    ProvideInlayHints = 'provideInlayHints'
}

export enum HighlightSpanKind {
    none = 'none',
    definition = 'definition',
    reference = 'reference',
    writtenReference = 'writtenReference'
}

export enum JsxEmit {
    None = 'None',
    Preserve = 'Preserve',
    ReactNative = 'ReactNative',
    React = 'React'
}

export enum ModuleKind {
    None = 'None',
    CommonJS = 'CommonJS',
    AMD = 'AMD',
    UMD = 'UMD',
    System = 'System',
    ES6 = 'ES6',
    ES2015 = 'ES2015',
    ESNext = 'ESNext'
}

export enum ModuleResolutionKind {
    Classic = 'Classic',
    Node = 'Node'
}

export enum SemicolonPreference {
    Ignore = 'ignore',
    Insert = 'insert',
    Remove = 'remove'
}

export enum ScriptElementKind {
    unknown = '',
    warning = 'warning',
    keyword = 'keyword',
    scriptElement = 'script',
    moduleElement = 'module',
    classElement = 'class',
    localClassElement = 'local class',
    interfaceElement = 'interface',
    typeElement = 'type',
    enumElement = 'enum',
    enumMemberElement = 'enum member',
    variableElement = 'var',
    localVariableElement = 'local var',
    functionElement = 'function',
    localFunctionElement = 'local function',
    memberFunctionElement = 'method',
    memberGetAccessorElement = 'getter',
    memberSetAccessorElement = 'setter',
    memberVariableElement = 'property',
    memberAccessorVariableElement = 'accessor',
    constructorImplementationElement = 'constructor',
    callSignatureElement = 'call',
    indexSignatureElement = 'index',
    constructSignatureElement = 'construct',
    parameterElement = 'parameter',
    typeParameterElement = 'type parameter',
    primitiveType = 'primitive type',
    label = 'label',
    alias = 'alias',
    constElement = 'const',
    letElement = 'let',
    directory = 'directory',
    externalModuleName = 'external module name',
    jsxAttribute = 'JSX attribute',
    string = 'string',
    link = 'link',
    linkName = 'link name',
    linkText = 'link text'
}

export enum ScriptElementKindModifier {
    none = '',
    publicMemberModifier = 'public',
    privateMemberModifier = 'private',
    protectedMemberModifier = 'protected',
    exportedModifier = 'export',
    ambientModifier = 'declare',
    staticModifier = 'static',
    abstractModifier = 'abstract',
    optionalModifier = 'optional',
    deprecatedModifier = 'deprecated',
    dtsModifier = '.d.ts',
    tsModifier = '.ts',
    tsxModifier = '.tsx',
    jsModifier = '.js',
    jsxModifier = '.jsx',
    jsonModifier = '.json',
    dmtsModifier = '.d.mts',
    mtsModifier = '.mts',
    mjsModifier = '.mjs',
    dctsModifier = '.d.cts',
    ctsModifier = '.cts',
    cjsModifier = '.cjs'
}

export enum ScriptTarget {
    ES3 = 'ES3',
    ES5 = 'ES5',
    ES6 = 'ES6',
    ES2015 = 'ES2015',
    ES2016 = 'ES2016',
    ES2017 = 'ES2017',
    ES2018 = 'ES2018',
    ES2019 = 'ES2019',
    ES2020 = 'ES2020',
    ES2021 = 'ES2021',
    ES2022 = 'ES2022',
    ESNext = 'ESNext'
}

export enum SymbolDisplayPartKind {
    aliasName = 0,
    className = 1,
    enumName = 2,
    fieldName = 3,
    interfaceName = 4,
    keyword = 5,
    lineBreak = 6,
    numericLiteral = 7,
    stringLiteral = 8,
    localName = 9,
    methodName = 10,
    moduleName = 11,
    operator = 12,
    parameterName = 13,
    propertyName = 14,
    punctuation = 15,
    space = 16,
    text = 17,
    typeParameterName = 18,
    enumMemberName = 19,
    functionName = 20,
    regularExpressionLiteral = 21,
    link = 22,
    linkName = 23,
    linkText = 24
}

export enum OrganizeImportsMode {
    All = 'All',
    SortAndCombine = 'SortAndCombine',
    RemoveUnused = 'RemoveUnused',
}

// END: Duplicated from typescript/lib/tsserverlibrary.js since we don't want to depend on typescript at runtime

export const enum EventName {
    syntaxDiag = 'syntaxDiag',
    semanticDiag = 'semanticDiag',
    suggestionDiag = 'suggestionDiag',
    configFileDiag = 'configFileDiag',
    telemetry = 'telemetry',
    projectLanguageServiceState = 'projectLanguageServiceState',
    projectsUpdatedInBackground = 'projectsUpdatedInBackground',
    beginInstallTypes = 'beginInstallTypes',
    endInstallTypes = 'endInstallTypes',
    typesInstallerInitializationFailed = 'typesInstallerInitializationFailed',
    surveyReady = 'surveyReady',
    projectLoadingStart = 'projectLoadingStart',
    projectLoadingFinish = 'projectLoadingFinish',
}

export class KindModifiers {
    public static readonly optional = 'optional';
    public static readonly deprecated = 'deprecated';
    public static readonly dtsFile = '.d.ts';
    public static readonly tsFile = '.ts';
    public static readonly tsxFile = '.tsx';
    public static readonly jsFile = '.js';
    public static readonly jsxFile = '.jsx';
    public static readonly jsonFile = '.json';

    public static readonly fileExtensionKindModifiers = [
        KindModifiers.dtsFile,
        KindModifiers.tsFile,
        KindModifiers.tsxFile,
        KindModifiers.jsFile,
        KindModifiers.jsxFile,
        KindModifiers.jsonFile,
    ];
}

const SYMBOL_DISPLAY_PART_KIND_MAP: Record<keyof typeof ts.SymbolDisplayPartKind, ts.SymbolDisplayPartKind> = {
    aliasName: 0,
    className: 1,
    enumName: 2,
    fieldName: 3,
    interfaceName: 4,
    keyword: 5,
    lineBreak: 6,
    numericLiteral: 7,
    stringLiteral: 8,
    localName: 9,
    methodName: 10,
    moduleName: 11,
    operator: 12,
    parameterName: 13,
    propertyName: 14,
    punctuation: 15,
    space: 16,
    text: 17,
    typeParameterName: 18,
    enumMemberName: 19,
    functionName: 20,
    regularExpressionLiteral: 21,
    link: 22,
    linkName: 23,
    linkText: 24,
};

export function toSymbolDisplayPartKind(kind: string): ts.SymbolDisplayPartKind {
    return SYMBOL_DISPLAY_PART_KIND_MAP[kind as keyof typeof ts.SymbolDisplayPartKind];
}

export interface SupportedFeatures {
    codeActionDisabledSupport?: boolean;
    completionCommitCharactersSupport?: boolean;
    completionInsertReplaceSupport?: boolean;
    completionLabelDetails?: boolean;
    completionSnippets?: boolean;
    completionDisableFilterText?: boolean;
    definitionLinkSupport?: boolean;
    diagnosticsTagSupport?: boolean;
}

export interface TypeScriptPlugin {
    name: string;
    location: string;
}

export interface TypeScriptInitializationOptions {
    completionDisableFilterText?: boolean;
    disableAutomaticTypingAcquisition?: boolean;
    hostInfo?: string;
    locale?: string;
    maxTsServerMemory?: number;
    npmLocation?: string;
    plugins: TypeScriptPlugin[];
    preferences?: ts.server.protocol.UserPreferences;
    tsserver?: TsserverOptions;
}

interface TsserverOptions {
    /**
     * The path to the directory where the `tsserver` log files will be created.
     * If not provided, the log files will be created within the workspace, inside the `.log` directory.
     * If no workspace root is provided when initializating the server and no custom path is specified then
     * the logs will not be created.
     * @default undefined
     */
    logDirectory?: string;
    /**
     * Verbosity of the information logged into the `tsserver` log files.
     *
     * Log levels from least to most amount of details: `'terse'`, `'normal'`, `'requestTime`', `'verbose'`.
     * Enabling particular level also enables all lower levels.
     *
     * @default 'off'
     */
    logVerbosity?: 'off' | 'terse' | 'normal' | 'requestTime' | 'verbose';
    /**
     * The path to the `tsserver.js` file or the typescript lib directory. For example: `/Users/me/typescript/lib/tsserver.js`.
     */
    path?: string;
    /**
     * The verbosity of logging the tsserver communication through the LSP messages.
     * This doesn't affect the file logging.
     * @default 'off'
     */
    trace?: TraceValue;
    /**
     * Whether a dedicated server is launched to more quickly handle syntax related operations, such as computing diagnostics or code folding.
     *
     * Allowed values:
     *  - auto: Spawn both a full server and a lighter weight server dedicated to syntax operations. The syntax server is used to speed up syntax operations and provide IntelliSense while projects are loading.
     *  - never: Don't use a dedicated syntax server. Use a single server to handle all IntelliSense operations.
     *
     * @default 'auto'
     */
    useSyntaxServer?: 'auto' | 'never';
}

export type TypeScriptInitializeParams = lsp.InitializeParams & {
    initializationOptions?: Partial<TypeScriptInitializationOptions>;
};
