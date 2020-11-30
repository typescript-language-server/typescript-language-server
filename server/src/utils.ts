/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { clearTimeout } from "timers";

export class Deferred<T> {

    private timer: NodeJS.Timer

    constructor(private operation: string, timeout?: number) {
        this.timer = setTimeout(() => {
            this.reject(new Error(this.operation + " timeout"));
        }, timeout || 20000)
    }

    cancel() {
        // ignore rejections due to timeouts
        clearTimeout(this.timer);
    }

    resolve: (value?: T) => void;
    reject: (err?: unknown) => void;

    promise = new Promise<T | undefined>((resolve, reject) => {
        this.resolve = obj => {
            clearTimeout(this.timer);
            resolve(obj);
        }
        this.reject = obj => {
            clearTimeout(this.timer);
            reject(obj);
        }
    });
}

export function getTsserverExecutable(): string {
    return isWindows() ? 'tsserver.cmd' : 'tsserver'
}

function isWindows(): boolean {
    return /^win/.test(process.platform);
}