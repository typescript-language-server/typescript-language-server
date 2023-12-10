[![Discord][discord-src]][discord-href]
[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]

# TypeScript Language Server

[Language Server Protocol](https://github.com/Microsoft/language-server-protocol) implementation for TypeScript wrapping `tsserver`.

Based on concepts and ideas from https://github.com/prabirshrestha/typescript-language-server and originally maintained by [TypeFox](https://typefox.io).

Maintained by a [community of contributors](https://github.com/typescript-language-server/typescript-language-server/graphs/contributors) like you.

<!-- MarkdownTOC -->

- [Installing](#installing)
- [Running the language server](#running-the-language-server)
- [CLI Options](#cli-options)
- [Configuration](#configuration)
- [Features](#features)
    - [Code actions on save](#code-actions-on-save)
    - [Workspace commands \(`workspace/executeCommand`\)](#workspace-commands-workspaceexecutecommand)
        - [Go to Source Definition](#go-to-source-definition)
        - [Apply Workspace Edits](#apply-workspace-edits)
        - [Apply Code Action](#apply-code-action)
        - [Apply Refactoring](#apply-refactoring)
        - [Organize Imports](#organize-imports)
        - [Rename File](#rename-file)
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

#### Apply Workspace Edits

- Request:
    ```ts
    {
        command: `_typescript.applyWorkspaceEdit`
        arguments: [lsp.WorkspaceEdit]
    }
    ```
- Response:
    ```ts
    lsp.ApplyWorkspaceEditResult
    ```

#### Apply Code Action

- Request:
    ```ts
    {
        command: `_typescript.applyCodeAction`
        arguments: [
            tsp.CodeAction,  // TypeScript Code Action object
        ]
    }
    ```
- Response:
    ```ts
    void
    ```

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
