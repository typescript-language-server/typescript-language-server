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

export const file = 'file';
export const untitled = 'untitled';
export const git = 'git';
export const github = 'github';

export const semanticSupportedSchemes = [
    file,
    untitled,
];

/**
 * File scheme for which JS/TS language feature should be disabled
 */
export const disabledSchemes = new Set([
    git,
    github,
]);
