/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/*
 * Copyright (C) 2023 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { URI } from 'vscode-uri';
import type * as lsp from 'vscode-languageserver-protocol';
import { type DocumentUri } from 'vscode-languageserver-textdocument';
import type { LspDocument } from './document.js';
import { CommandTypes } from './ts-protocol.js';
import type { ts } from './ts-protocol.js';
import { PluginManager } from './tsServer/plugins.js';
import { ExecutionTarget } from './tsServer/server.js';
import API from './utils/api.js';

export enum ServerType {
    Syntax = 'syntax',
    Semantic = 'semantic',
}

export namespace ServerResponse {
    export class Cancelled {
        public readonly type = 'cancelled';
        constructor(public readonly reason: string) {}
    }
    export const NoContent = { type: 'noContent' } as const;
    export const NoServer = { type: 'noServer' } as const;
    export type Response<T extends ts.server.protocol.Response> = T | Cancelled | typeof NoContent | typeof NoServer;
}

export type ExecConfig = {
    readonly lowPriority?: boolean;
    readonly nonRecoverable?: boolean;
    readonly cancelOnResourceChange?: string;
    readonly executionTarget?: ExecutionTarget;
};

export enum ClientCapability {
    /**
     * Basic syntax server. All clients should support this.
     */
    Syntax,

    /**
     * Advanced syntax server that can provide single file IntelliSense.
     */
    EnhancedSyntax,

    /**
     * Complete, multi-file semantic server
     */
    Semantic,
}

export class ClientCapabilities {
    private readonly capabilities: ReadonlySet<ClientCapability>;

    constructor(...capabilities: ClientCapability[]) {
        this.capabilities = new Set(capabilities);
    }

    public has(capability: ClientCapability): boolean {
        return this.capabilities.has(capability);
    }
}

export interface ITypeScriptServiceClient {
    /**
     * Convert a client resource to a path that TypeScript server understands.
     */
    toTsFilePath(stringUri: string): string | undefined;

    /**
     * Convert a path to a resource.
     */
    toResource(filepath: string): URI;

    /**
     * Tries to ensure that a document is open on the TS server.
     *
     * @return The open document or `undefined` if the document is not open on the server.
     */
    toOpenDocument(textDocumentUri: DocumentUri, options?: {
        suppressAlertOnFailure?: boolean;
    }): LspDocument | undefined;

    /**
     * Checks if `resource` has a given capability.
     */
    hasCapabilityForResource(resource: URI, capability: ClientCapability): boolean;

    getWorkspaceRootForResource(resource: URI): URI | undefined;

    // readonly onTsServerStarted: vscode.Event<{ version: TypeScriptVersion; usedApiVersion: API; }>;
    // readonly onProjectLanguageServiceStateChanged: vscode.Event<Proto.ProjectLanguageServiceStateEventBody>;
    // readonly onDidBeginInstallTypings: vscode.Event<Proto.BeginInstallTypesEventBody>;
    // readonly onDidEndInstallTypings: vscode.Event<Proto.EndInstallTypesEventBody>;
    // readonly onTypesInstallerInitializationFailed: vscode.Event<Proto.TypesInstallerInitializationFailedEventBody>;

    readonly capabilities: ClientCapabilities;
    // readonly onDidChangeCapabilities: vscode.Event<void>;

    // onReady(f: () => void): Promise<void>;

    // showVersionPicker(): void;

    readonly apiVersion: API;

    readonly pluginManager: PluginManager;
    // readonly configuration: TypeScriptServiceConfiguration;
    // readonly bufferSyncSupport: BufferSyncSupport;
    // readonly telemetryReporter: TelemetryReporter;

    execute<K extends keyof StandardTsServerRequests>(
        command: K,
        args: StandardTsServerRequests[K][0],
        token?: lsp.CancellationToken,
        config?: ExecConfig
    ): Promise<ServerResponse.Response<StandardTsServerRequests[K][1]>>;

    executeWithoutWaitingForResponse<K extends keyof NoResponseTsServerRequests>(
        command: K,
        args: NoResponseTsServerRequests[K][0]
    ): void;

    executeAsync<K extends keyof AsyncTsServerRequests>(
        command: K,
        args: AsyncTsServerRequests[K][0],
        token: lsp.CancellationToken
    ): Promise<ServerResponse.Response<ts.server.protocol.Response>>;

    /**
     * Cancel on going geterr requests and re-queue them after `f` has been evaluated.
     */
    interruptGetErr<R>(f: () => R): R;

    cancelInflightRequestsForResource(resource: URI): void;
}

export interface StandardTsServerRequests {
    [CommandTypes.ApplyCodeActionCommand]: [ts.server.protocol.ApplyCodeActionCommandRequestArgs, ts.server.protocol.ApplyCodeActionCommandResponse];
    [CommandTypes.CompletionDetails]: [ts.server.protocol.CompletionDetailsRequestArgs, ts.server.protocol.CompletionDetailsResponse];
    [CommandTypes.CompletionInfo]: [ts.server.protocol.CompletionsRequestArgs, ts.server.protocol.CompletionInfoResponse];
    [CommandTypes.Configure]: [ts.server.protocol.ConfigureRequestArguments, ts.server.protocol.ConfigureResponse];
    [CommandTypes.Definition]: [ts.server.protocol.FileLocationRequestArgs, ts.server.protocol.DefinitionResponse];
    [CommandTypes.DefinitionAndBoundSpan]: [ts.server.protocol.FileLocationRequestArgs, ts.server.protocol.DefinitionInfoAndBoundSpanResponse];
    [CommandTypes.DocCommentTemplate]: [ts.server.protocol.FileLocationRequestArgs, ts.server.protocol.DocCommandTemplateResponse];
    [CommandTypes.DocumentHighlights]: [ts.server.protocol.DocumentHighlightsRequestArgs, ts.server.protocol.DocumentHighlightsResponse];
    [CommandTypes.EncodedSemanticClassificationsFull]: [ts.server.protocol.EncodedSemanticClassificationsRequestArgs, ts.server.protocol.EncodedSemanticClassificationsResponse];
    [CommandTypes.FindSourceDefinition]: [ts.server.protocol.FileLocationRequestArgs, ts.server.protocol.DefinitionResponse];
    [CommandTypes.Format]: [ts.server.protocol.FormatRequestArgs, ts.server.protocol.FormatResponse];
    [CommandTypes.Formatonkey]: [ts.server.protocol.FormatOnKeyRequestArgs, ts.server.protocol.FormatResponse];
    [CommandTypes.GetApplicableRefactors]: [ts.server.protocol.GetApplicableRefactorsRequestArgs, ts.server.protocol.GetApplicableRefactorsResponse];
    [CommandTypes.GetCodeFixes]: [ts.server.protocol.CodeFixRequestArgs, ts.server.protocol.CodeFixResponse];
    [CommandTypes.GetCombinedCodeFix]: [ts.server.protocol.GetCombinedCodeFixRequestArgs, ts.server.protocol.GetCombinedCodeFixResponse];
    [CommandTypes.GetEditsForFileRename]: [ts.server.protocol.GetEditsForFileRenameRequestArgs, ts.server.protocol.GetEditsForFileRenameResponse];
    [CommandTypes.GetEditsForRefactor]: [ts.server.protocol.GetEditsForRefactorRequestArgs, ts.server.protocol.GetEditsForRefactorResponse];
    [CommandTypes.GetOutliningSpans]: [ts.server.protocol.FileRequestArgs, ts.server.protocol.OutliningSpansResponse];
    [CommandTypes.GetSupportedCodeFixes]: [null, ts.server.protocol.GetSupportedCodeFixesResponse];
    [CommandTypes.Implementation]: [ts.server.protocol.FileLocationRequestArgs, ts.server.protocol.ImplementationResponse];
    [CommandTypes.JsxClosingTag]: [ts.server.protocol.JsxClosingTagRequestArgs, ts.server.protocol.JsxClosingTagResponse];
    [CommandTypes.LinkedEditingRange]: [ts.server.protocol.FileLocationRequestArgs, ts.server.protocol.LinkedEditingRangeResponse];
    [CommandTypes.Navto]: [ts.server.protocol.NavtoRequestArgs, ts.server.protocol.NavtoResponse];
    [CommandTypes.NavTree]: [ts.server.protocol.FileRequestArgs, ts.server.protocol.NavTreeResponse];
    [CommandTypes.OrganizeImports]: [ts.server.protocol.OrganizeImportsRequestArgs, ts.server.protocol.OrganizeImportsResponse];
    [CommandTypes.PrepareCallHierarchy]: [ts.server.protocol.FileLocationRequestArgs, ts.server.protocol.PrepareCallHierarchyResponse];
    [CommandTypes.ProvideCallHierarchyIncomingCalls]: [ts.server.protocol.FileLocationRequestArgs, ts.server.protocol.ProvideCallHierarchyIncomingCallsResponse];
    [CommandTypes.ProvideCallHierarchyOutgoingCalls]: [ts.server.protocol.FileLocationRequestArgs, ts.server.protocol.ProvideCallHierarchyOutgoingCallsResponse];
    [CommandTypes.ProjectInfo]: [ts.server.protocol.ProjectInfoRequestArgs, ts.server.protocol.ProjectInfoResponse];
    [CommandTypes.ProvideInlayHints]: [ts.server.protocol.InlayHintsRequestArgs, ts.server.protocol.InlayHintsResponse];
    [CommandTypes.Quickinfo]: [ts.server.protocol.FileLocationRequestArgs, ts.server.protocol.QuickInfoResponse];
    [CommandTypes.References]: [ts.server.protocol.FileLocationRequestArgs, ts.server.protocol.ReferencesResponse];
    [CommandTypes.Rename]: [ts.server.protocol.RenameRequestArgs, ts.server.protocol.RenameResponse];
    [CommandTypes.SelectionRange]: [ts.server.protocol.SelectionRangeRequestArgs, ts.server.protocol.SelectionRangeResponse];
    [CommandTypes.SignatureHelp]: [ts.server.protocol.SignatureHelpRequestArgs, ts.server.protocol.SignatureHelpResponse];
    [CommandTypes.TypeDefinition]: [ts.server.protocol.FileLocationRequestArgs, ts.server.protocol.TypeDefinitionResponse];
    [CommandTypes.UpdateOpen]: [ts.server.protocol.UpdateOpenRequestArgs, ts.server.protocol.Response];
}

export interface NoResponseTsServerRequests {
    [CommandTypes.Change]: [ts.server.protocol.ChangeRequestArgs, null];
    [CommandTypes.Close]: [ts.server.protocol.FileRequestArgs, null];
    [CommandTypes.CompilerOptionsForInferredProjects]: [ts.server.protocol.SetCompilerOptionsForInferredProjectsArgs, ts.server.protocol.SetCompilerOptionsForInferredProjectsResponse];
    [CommandTypes.Configure]: [ts.server.protocol.ConfigureRequestArguments, ts.server.protocol.ConfigureResponse];
    [CommandTypes.ConfigurePlugin]: [ts.server.protocol.ConfigurePluginRequestArguments, ts.server.protocol.ConfigurePluginResponse];
    [CommandTypes.Open]: [ts.server.protocol.OpenRequestArgs, null];
}

export interface AsyncTsServerRequests {
    [CommandTypes.Geterr]: [ts.server.protocol.GeterrRequestArgs, ts.server.protocol.Response];
    [CommandTypes.GeterrForProject]: [ts.server.protocol.GeterrForProjectRequestArgs, ts.server.protocol.Response];
}

export type TypeScriptRequestTypes = StandardTsServerRequests & NoResponseTsServerRequests & AsyncTsServerRequests;
