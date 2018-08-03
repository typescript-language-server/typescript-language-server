/**
 * copied over from typescript/lib/protocol.d.ts due to https://github.com/Microsoft/TypeScript/issues/18468
 */

/******************************************************************************
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0

THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
MERCHANTABLITY OR NON-INFRINGEMENT.

See the Apache Version 2.0 License for specific language governing permissions
and limitations under the License.
***************************************************************************** */

export const enum CommandTypes {
    Brace = "brace",
    BraceCompletion = "braceCompletion",
    GetSpanOfEnclosingComment = "getSpanOfEnclosingComment",
    Change = "change",
    Close = "close",
    Completions = "completions",
    CompletionDetails = "completionEntryDetails",
    CompileOnSaveAffectedFileList = "compileOnSaveAffectedFileList",
    CompileOnSaveEmitFile = "compileOnSaveEmitFile",
    Configure = "configure",
    Definition = "definition",
    DefinitionAndBoundSpan = "definitionAndBoundSpan",
    Implementation = "implementation",
    Exit = "exit",
    Format = "format",
    Formatonkey = "formatonkey",
    Geterr = "geterr",
    GeterrForProject = "geterrForProject",
    SemanticDiagnosticsSync = "semanticDiagnosticsSync",
    SyntacticDiagnosticsSync = "syntacticDiagnosticsSync",
    SuggestionDiagnosticsSync = "suggestionDiagnosticsSync",
    NavBar = "navbar",
    Navto = "navto",
    NavTree = "navtree",
    NavTreeFull = "navtree-full",
    /** @deprecated */
    Occurrences = "occurrences",
    DocumentHighlights = "documentHighlights",
    Open = "open",
    Quickinfo = "quickinfo",
    References = "references",
    Reload = "reload",
    Rename = "rename",
    Saveto = "saveto",
    SignatureHelp = "signatureHelp",
    Status = "status",
    TypeDefinition = "typeDefinition",
    ProjectInfo = "projectInfo",
    ReloadProjects = "reloadProjects",
    Unknown = "unknown",
    OpenExternalProject = "openExternalProject",
    OpenExternalProjects = "openExternalProjects",
    CloseExternalProject = "closeExternalProject",
    GetOutliningSpans = "getOutliningSpans",
    TodoComments = "todoComments",
    Indentation = "indentation",
    DocCommentTemplate = "docCommentTemplate",
    CompilerOptionsForInferredProjects = "compilerOptionsForInferredProjects",
    GetCodeFixes = "getCodeFixes",
    GetCombinedCodeFix = "getCombinedCodeFix",
    ApplyCodeActionCommand = "applyCodeActionCommand",
    GetSupportedCodeFixes = "getSupportedCodeFixes",
    GetApplicableRefactors = "getApplicableRefactors",
    GetEditsForRefactor = "getEditsForRefactor",
    OrganizeImports = "organizeImports",
    GetEditsForFileRename = "getEditsForFileRename"
}

export const enum EventTypes {
    ConfigFileDiag = 'configFileDiag',
    RequestCompleted = 'requestCompleted',
    SyntaxDiag = 'syntaxDiag',
    SementicDiag = 'semanticDiag',
    Telemetry = 'telemetry'
}