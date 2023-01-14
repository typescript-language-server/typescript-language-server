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

import type { WorkspaceConfigurationImplicitProjectConfigurationOptions } from '../configuration-manager.js';
import { ModuleKind, ModuleResolutionKind, ScriptTarget, JsxEmit } from '../ts-protocol.js';
import type { ts } from '../ts-protocol.js';

const DEFAULT_PROJECT_CONFIG: ts.server.protocol.ExternalProjectCompilerOptions = Object.freeze({
    module: ModuleKind.ESNext,
    moduleResolution: ModuleResolutionKind.Node,
    target: ScriptTarget.ES2020,
    jsx: JsxEmit.React,
});

export function getInferredProjectCompilerOptions(
    workspaceConfig: WorkspaceConfigurationImplicitProjectConfigurationOptions,
): ts.server.protocol.ExternalProjectCompilerOptions {
    const projectConfig = { ...DEFAULT_PROJECT_CONFIG };

    if (workspaceConfig.checkJs) {
        projectConfig.checkJs = true;
    }

    if (workspaceConfig.experimentalDecorators) {
        projectConfig.experimentalDecorators = true;
    }

    if (workspaceConfig.strictNullChecks) {
        projectConfig.strictNullChecks = true;
    }

    if (workspaceConfig.strictFunctionTypes) {
        projectConfig.strictFunctionTypes = true;
    }

    if (workspaceConfig.module) {
        projectConfig.module = workspaceConfig.module as ts.server.protocol.ModuleKind;
    }

    if (workspaceConfig.target) {
        projectConfig.target = workspaceConfig.target as ts.server.protocol.ScriptTarget;
    }

    projectConfig.sourceMap = true;

    return projectConfig;
}
