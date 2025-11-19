// sync: file[extensions/typescript-language-features/src/commands/commandManager.ts] sha[f76ac124233270762d11ec3afaaaafcba53b3bbf]
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/*
 * Copyright (C) 2024 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

export interface Command {
    readonly id: string;

    execute(...args: unknown[]): any;
}

export class CommandManager {
    private readonly commands = new Map<string, Command>();

    public dispose(): void {
        this.commands.clear();
    }

    public register<T extends Command>(command: T): void {
        const entry = this.commands.get(command.id);
        if (!entry) {
            this.commands.set(command.id, command);
        }
    }

    public get registeredIds(): string[] {
        return Array.from(this.commands.keys());
    }

    public async handle(commandId: Command['id'], ...args: unknown[]): Promise<boolean> {
        const entry = this.commands.get(commandId);
        if (entry) {
            await entry.execute(...args);
            return true;
        }
        return false;
    }
}
