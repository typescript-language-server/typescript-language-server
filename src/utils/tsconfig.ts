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

import tsp from 'typescript/lib/protocol.d.js';
import type { WorkspaceConfigurationImplicitProjectConfigurationOptions } from '../configuration-manager.js';

const DEFAULT_PROJECT_CONFIG: tsp.ExternalProjectCompilerOptions = Object.freeze({
    module: tsp.ModuleKind.ESNext,
    moduleResolution: tsp.ModuleResolutionKind.Node,
    target: tsp.ScriptTarget.ES2020,
    jsx: tsp.JsxEmit.React,
});

export function getInferredProjectCompilerOptions(
    workspaceConfig: WorkspaceConfigurationImplicitProjectConfigurationOptions,
): tsp.ExternalProjectCompilerOptions {
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
        projectConfig.module = workspaceConfig.module as tsp.ModuleKind;
    }

    if (workspaceConfig.target) {
        projectConfig.target = workspaceConfig.target as tsp.ScriptTarget;
    }

    projectConfig.sourceMap = true;

    return projectConfig;
}
