/*
 * Copyright (C) 2024 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { URI } from 'vscode-uri';

export class ZipfileURI extends URI {
    private _originalUri: string;

    private constructor(uri: string, components: URI) {
        super(components);

        this._originalUri = uri;
    }

    override toString(_skipEncoding: boolean = false): string {
        return this._originalUri;
    }

    static override parse(value: string, _strict: boolean = false): ZipfileURI {
        const uri = URI.parse(value, _strict);

        return new ZipfileURI(value, uri);
    }
}
