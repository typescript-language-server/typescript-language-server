/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/*
 * Copyright (C) 2022 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import vscodeUri from 'vscode-uri';
import type tsp from 'typescript/lib/protocol.d.js';
import { CommandTypes } from '../tsp-command-types.js';
import { ExecutionTarget } from './server.js';

export enum ServerType {
    Syntax = 'syntax',
    Semantic = 'semantic',
}

export namespace ServerResponse {

    export class Cancelled {
        public readonly type = 'cancelled';

        constructor(
            public readonly reason: string,
        ) { }
    }

    export const NoContent = { type: 'noContent' } as const;

    export const NoServer = { type: 'noServer' } as const;

    export type Response<T extends tsp.Response> = T | Cancelled | typeof NoContent | typeof NoServer;
}

export interface TypeScriptRequestTypes {
    [CommandTypes.ApplyCodeActionCommand]: [tsp.ApplyCodeActionCommandRequestArgs, tsp.ApplyCodeActionCommandResponse];
    [CommandTypes.Change]: [tsp.ChangeRequestArgs, null];
    [CommandTypes.Close]: [tsp.FileRequestArgs, null];
    [CommandTypes.CompilerOptionsForInferredProjects]: [tsp.SetCompilerOptionsForInferredProjectsArgs, tsp.SetCompilerOptionsForInferredProjectsResponse];
    [CommandTypes.CompletionDetails]: [tsp.CompletionDetailsRequestArgs, tsp.CompletionDetailsResponse];
    [CommandTypes.CompletionInfo]: [tsp.CompletionsRequestArgs, tsp.CompletionInfoResponse];
    [CommandTypes.Configure]: [tsp.ConfigureRequestArguments, tsp.ConfigureResponse];
    [CommandTypes.ConfigurePlugin]: [tsp.ConfigurePluginRequestArguments, tsp.ConfigurePluginResponse];
    [CommandTypes.Definition]: [tsp.FileLocationRequestArgs, tsp.DefinitionResponse];
    [CommandTypes.DefinitionAndBoundSpan]: [tsp.FileLocationRequestArgs, tsp.DefinitionInfoAndBoundSpanResponse];
    [CommandTypes.DocCommentTemplate]: [tsp.FileLocationRequestArgs, tsp.DocCommandTemplateResponse];
    [CommandTypes.DocumentHighlights]: [tsp.DocumentHighlightsRequestArgs, tsp.DocumentHighlightsResponse];
    [CommandTypes.EncodedSemanticClassificationsFull]: [tsp.EncodedSemanticClassificationsRequestArgs, tsp.EncodedSemanticClassificationsResponse];
    [CommandTypes.FindSourceDefinition]: [tsp.FileLocationRequestArgs, tsp.DefinitionResponse];
    [CommandTypes.Format]: [tsp.FormatRequestArgs, tsp.FormatResponse];
    [CommandTypes.Formatonkey]: [tsp.FormatOnKeyRequestArgs, tsp.FormatResponse];
    [CommandTypes.GetApplicableRefactors]: [tsp.GetApplicableRefactorsRequestArgs, tsp.GetApplicableRefactorsResponse];
    [CommandTypes.GetCodeFixes]: [tsp.CodeFixRequestArgs, tsp.CodeFixResponse];
    [CommandTypes.GetCombinedCodeFix]: [tsp.GetCombinedCodeFixRequestArgs, tsp.GetCombinedCodeFixResponse];
    [CommandTypes.GetEditsForFileRename]: [tsp.GetEditsForFileRenameRequestArgs, tsp.GetEditsForFileRenameResponse];
    [CommandTypes.GetEditsForRefactor]: [tsp.GetEditsForRefactorRequestArgs, tsp.GetEditsForRefactorResponse];
    [CommandTypes.Geterr]: [tsp.GeterrRequestArgs, any];
    [CommandTypes.GetOutliningSpans]: [tsp.FileRequestArgs, tsp.OutliningSpansResponse];
    [CommandTypes.GetSupportedCodeFixes]: [null, tsp.GetSupportedCodeFixesResponse];
    [CommandTypes.Implementation]: [tsp.FileLocationRequestArgs, tsp.ImplementationResponse];
    [CommandTypes.JsxClosingTag]: [tsp.JsxClosingTagRequestArgs, tsp.JsxClosingTagResponse];
    [CommandTypes.Navto]: [tsp.NavtoRequestArgs, tsp.NavtoResponse];
    [CommandTypes.NavTree]: [tsp.FileRequestArgs, tsp.NavTreeResponse];
    [CommandTypes.Open]: [tsp.OpenRequestArgs, null];
    [CommandTypes.OrganizeImports]: [tsp.OrganizeImportsRequestArgs, tsp.OrganizeImportsResponse];
    [CommandTypes.ProjectInfo]: [tsp.ProjectInfoRequestArgs, tsp.ProjectInfoResponse];
    [CommandTypes.ProvideInlayHints]: [tsp.InlayHintsRequestArgs, tsp.InlayHintsResponse];
    [CommandTypes.Quickinfo]: [tsp.FileLocationRequestArgs, tsp.QuickInfoResponse];
    [CommandTypes.References]: [tsp.FileLocationRequestArgs, tsp.ReferencesResponse];
    [CommandTypes.Rename]: [tsp.RenameRequestArgs, tsp.RenameResponse];
    [CommandTypes.SignatureHelp]: [tsp.SignatureHelpRequestArgs, tsp.SignatureHelpResponse];
    [CommandTypes.TypeDefinition]: [tsp.FileLocationRequestArgs, tsp.TypeDefinitionResponse];
    [CommandTypes.UpdateOpen]: [tsp.UpdateOpenRequestArgs, tsp.Response];
}

export type ExecConfig = {
    readonly lowPriority?: boolean;
    readonly nonRecoverable?: boolean;
    readonly cancelOnResourceChange?: vscodeUri.URI;
    readonly executionTarget?: ExecutionTarget;
};

