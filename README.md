[![Discord][discord-src]][discord-href]
[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]

# TypeScript Language Server

<!-- MarkdownTOC -->

- [What is it, exactly?](#what-is-it-exactly)
- [Installing](#installing)
- [Running the language server](#running-the-language-server)
- [CLI Options](#cli-options)
- [Configuration](#configuration)
- [Features](#features)
    - [Code actions on save](#code-actions-on-save)
    - [Workspace commands \(`workspace/executeCommand`\)](#workspace-commands-workspaceexecutecommand)
        - [Go to Source Definition](#go-to-source-definition)
        - [Apply Refactoring](#apply-refactoring)
        - [Organize Imports](#organize-imports)
        - [Rename File](#rename-file)
        - [Send Tsserver Command](#send-tsserver-command)
        - [Configure plugin](#configure-plugin)
    - [Code Lenses \(`textDocument/codeLens`\)](#code-lenses-textdocumentcodelens)
    - [Inlay hints \(`textDocument/inlayHint`\)](#inlay-hints-textdocumentinlayhint)
    - [TypeScript Version Notification](#typescript-version-notification)
- [Development](#development)
    - [Build](#build)
    - [Dev](#dev)
    - [Test](#test)
    - [Publishing](#publishing)

<!-- /MarkdownTOC -->

## What is it, exactly?

The [TypeScript](https://github.com/microsoft/TypeScript) project/package includes a `tsserver` component which provides a custom API that can be used for gathering various intelligence about a typescript/javascript project. The [VSCode](https://github.com/microsoft/vscode) team has built a project called `Typescript Language Features` (and bundled it as an internal extension in VSCode) that provides code intelligence for your javascript and typescript projects by utilizing that `tsserver` API. Since that extension doesn't use the standardized [Language Server Protocol](https://microsoft.github.io/language-server-protocol/) to communicate with the editor, other editors that implement LSP can't directly utilize it. Here is where the `TypeScript Language Server` project comes in with the aim to provide a thin LSP interface on top of that extension's code base for the benefit of all other editors that implement the LSP protocol.

Originally based on concepts and ideas from https://github.com/prabirshrestha/typescript-language-server and maintained by [TypeFox](https://typefox.io). Currently maintained by a [community of contributors](https://github.com/typescript-language-server/typescript-language-server/graphs/contributors) like you.

This project is not directly associated with Microsoft and is not used in their [VSCode](https://github.com/microsoft/vscode) editor. If you have an issue with VSCode functionality, report it in their repository instead.

Currently Microsoft is working on [TypeScript 7](https://github.com/microsoft/typescript-go) written natively in the go language that will include the LSP implementation and will hopefully supersede this project.

## Installing

```sh
npm install -g typescript-language-server typescript
```

## Running the language server

```
typescript-language-server --stdio
```

## CLI Options

```
  Usage: typescript-language-server [options]


  Options:

    -V, --version                          output the version number
    --stdio                                use stdio (required option)
    --log-level <log-level>                A number indicating the log level (4 = log, 3 = info, 2 = warn, 1 = error). Defaults to `3`.
    -h, --help                             output usage information
```

## Configuration

See [configuration documentation](./docs/configuration.md).

## Features

### Code actions on save

Server announces support for the following code action kinds:

 - `source.fixAll.ts` - despite the name, fixes a couple of specific issues: unreachable code, await in non-async functions, incorrectly implemented interface
 - `source.removeUnused.ts` - removes declared but unused variables
 - `source.addMissingImports.ts` - adds imports for used but not imported symbols
 - `source.removeUnusedImports.ts` - removes unused imports
 - `source.sortImports.ts` - sorts imports
 - `source.organizeImports.ts` - organizes and removes unused imports

This allows editors that support running code actions on save to automatically run fixes associated with those kinds.

Those code actions, if they apply in the current code, should also be presented in the list of "Source Actions" if the editor exposes those.

The user can enable it with a setting similar to (can vary per-editor):

```js
"codeActionsOnSave": {
    "source.organizeImports.ts": true,
    // or just
    "source.organizeImports": true,
}
```

### Workspace commands (`workspace/executeCommand`)

See [LSP specification](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#workspace_executeCommand).

Most of the time, you'll execute commands with arguments retrieved from another request like `textDocument/codeAction`. There are some use cases for calling them manually.

`lsp` refers to the language server protocol types, `tsp` refers to the typescript server protocol types.

#### Go to Source Definition

- Request:
    ```ts
    {
        command: `_typescript.goToSourceDefinition`
        arguments: [
            lsp.DocumentUri,  // String URI of the document
            lsp.Position,     // Line and character position (zero-based)
        ]
    }
    ```
- Response:
    ```ts
    lsp.Location[] | null
    ```

(This command is supported from Typescript 4.7.)

#### Apply Refactoring

- Request:
    ```ts
    {
        command: `_typescript.applyRefactoring`
        arguments: [
            tsp.GetEditsForRefactorRequestArgs,
        ]
    }
    ```
- Response:
    ```ts
    void
    ```

#### Organize Imports

- Request:
    ```ts
    {
        command: `_typescript.organizeImports`
        arguments: [
            // The "skipDestructiveCodeActions" argument is supported from Typescript 4.4+
            [string] | [string, { skipDestructiveCodeActions?: boolean }],
        ]
    }
    ```
- Response:
    ```ts
    void
    ```

#### Rename File

- Request:
    ```ts
    {
        command: `_typescript.applyRenameFile`
        arguments: [
            { sourceUri: string; targetUri: string; },
        ]
    }
    ```
- Response:
    ```ts
    void
    ```

#### Send Tsserver Command

- Request:
    ```ts
    {
        command: `typescript.tsserverRequest`
        arguments: [
            string,       // command
            any,          // command arguments in a format that the command expects
            ExecuteInfo,  // configuration object used for the tsserver request (see below)
        ]
    }
    ```
- Response:
    ```ts
    any
    ```

The `ExecuteInfo` object is defined as follows:

```ts
type ExecuteInfo = {
    executionTarget?: number;  // 0 - semantic server, 1 - syntax server; default: 0
    expectsResult?: boolean;   // default: true
    isAsync?: boolean;         // default: false
    lowPriority?: boolean;     // default: true
};
```

#### Configure plugin

- Request:
    ```ts
    {
        command: `_typescript.configurePlugin`
        arguments: [pluginName: string, configuration: any]
    }
    ```
- Response:
    ```ts
    void
    ```

### Code Lenses (`textDocument/codeLens`)

Code lenses can be enabled using the `implementationsCodeLens` and `referencesCodeLens` [workspace configuration options](/docs/configuration.md/#workspacedidchangeconfiguration).

Code lenses provide a count of **references** and/or **implemenations** for symbols in the document. For clients that support it it's also possible to click on those to navigate to the relevant locations in the the project. Do note that clicking those trigger a `editor.action.showReferences` command which is something that client needs to have explicit support for. Many do by default but some don't. An example command will look like this:

```ts
command: {
    title: '1 reference',
    command: 'editor.action.showReferences',
    arguments: [
        'file://project/foo.ts',    // URI
        { line: 1, character: 1 },  // Position
        [                           // A list of Location objects.
            {
                uri: 'file://project/bar.ts',
                range: {
                    start: {
                        line: 7,
                        character: 24,
                    },
                    end: {
                        line: 7,
                        character: 28,
                    },
                },
            },
        ],
    ],
}
```

### Inlay hints (`textDocument/inlayHint`)

For the request to return any results, some or all of the following options need to be enabled through `preferences`:

```ts
export interface InlayHintsOptions extends UserPreferences {
    includeInlayParameterNameHints: 'none' | 'literals' | 'all';
    includeInlayParameterNameHintsWhenArgumentMatchesName: boolean;
    includeInlayFunctionParameterTypeHints: boolean;
    includeInlayVariableTypeHints: boolean;
    includeInlayVariableTypeHintsWhenTypeMatchesName: boolean;
    includeInlayPropertyDeclarationTypeHints: boolean;
    includeInlayFunctionLikeReturnTypeHints: boolean;
    includeInlayEnumMemberValueHints: boolean;
}
```

### TypeScript Version Notification

Right after initializing, the server sends a custom `$/typescriptVersion` notification that carries information about the version of TypeScript that is utilized by the server. The editor can then display that information in the UI.

The `$/typescriptVersion` notification params include two properties:

 - `version` - a semantic version (for example `4.8.4`)
 - `source` - a string specifying whether used TypeScript version comes from the local workspace (`workspace`), is explicitly specified through a `initializationOptions.tsserver.path` setting (`user-setting`) or was bundled with the server (`bundled`)

## Development

### Build

```sh
yarn build
```

### Dev

Build and rebuild on change.

```sh
yarn dev
```

### Test

 - `yarn test` - run all tests in watch mode for developing
 - `yarn test:commit` - run all tests once

By default only console logs of level `warning` and higher are printed to the console. You can override the `CONSOLE_LOG_LEVEL` level in `package.json` to either `log`, `info`, `warning` or `error` to log other levels.

### Publishing

The project uses https://github.com/google-github-actions/release-please-action Github action to automatically release new version on merging a release PR.

[npm-version-src]: https://img.shields.io/npm/dt/typescript-language-server.svg?style=flat-square
[npm-version-href]: https://npmjs.com/package/typescript-language-server
[npm-downloads-src]: https://img.shields.io/npm/v/typescript-language-server/latest.svg?style=flat-square
[npm-downloads-href]: https://npmjs.com/package/typescript-language-server
[discord-src]: https://img.shields.io/discord/873659987413573634?style=flat-square
[discord-href]: https://discord.gg/AC7Vs6hwFa
