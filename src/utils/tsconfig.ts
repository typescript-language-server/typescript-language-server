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

import API from './api.js';
import type { WorkspaceConfigurationImplicitProjectConfigurationOptions } from '../features/fileConfigurationManager.js';
import { ModuleKind, ModuleResolutionKind, ScriptTarget, JsxEmit } from '../ts-protocol.js';
import type { ts } from '../ts-protocol.js';

export function getInferredProjectCompilerOptions(
    version: API,
    workspaceConfig: WorkspaceConfigurationImplicitProjectConfigurationOptions,
): ts.server.protocol.ExternalProjectCompilerOptions {
    const projectConfig: ts.server.protocol.ExternalProjectCompilerOptions = {
        module: ModuleKind.ESNext,
        moduleResolution: ModuleResolutionKind.Node,
        target: ScriptTarget.ES2022,
        jsx: JsxEmit.React,
    };

    if (version.gte(API.v500)) {
        projectConfig.allowImportingTsExtensions = true;
    }

    if (workspaceConfig.checkJs) {
        projectConfig.checkJs = true;
        projectConfig.allowJs = true;
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
