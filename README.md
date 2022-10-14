[![Build Status](https://travis-ci.org/theia-ide/typescript-language-server.svg?branch=master)](https://travis-ci.org/theia-ide/typescript-language-server)
[![Discord](https://img.shields.io/discord/873659987413573634)](https://discord.gg/AC7Vs6hwFa)

# TypeScript Language Server

[Language Server Protocol](https://github.com/Microsoft/language-server-protocol) implementation for TypeScript wrapping `tsserver`.

[![https://nodei.co/npm/typescript-language-server.png?downloads=true&downloadRank=true&stars=true](https://nodei.co/npm/typescript-language-server.png?downloads=true&downloadRank=true&stars=true)](https://www.npmjs.com/package/typescript-language-server)

Based on concepts and ideas from https://github.com/prabirshrestha/typescript-language-server and originally maintained by [TypeFox](https://typefox.io)

Maintained by a [community of contributors](https://github.com/typescript-language-server/typescript-language-server/graphs/contributors) like you

<!-- MarkdownTOC -->

- [Installing](#installing)
- [Running the language server](#running-the-language-server)
- [CLI Options](#cli-options)
- [initializationOptions](#initializationoptions)
- [workspace/didChangeConfiguration](#workspacedidchangeconfiguration)
- [Code actions on save](#code-actions-on-save)
- [Workspace commands \(`workspace/executeCommand`\)](#workspace-commands-workspaceexecutecommand)
    - [Go to Source Definition](#go-to-source-definition)
    - [Apply Workspace Edits](#apply-workspace-edits)
    - [Apply Code Action](#apply-code-action)
    - [Apply Refactoring](#apply-refactoring)
    - [Organize Imports](#organize-imports)
    - [Rename File](#rename-file)
    - [Configure plugin](#configure-plugin)
- [Inlay hints \(`typescript/inlayHints`\) \(experimental\)](#inlay-hints-typescriptinlayhints-experimental)
- [Callers and callees \(`textDocument/calls`\) \(experimental\)](#callers-and-callees-textdocumentcalls-experimental)
- [Supported Protocol features](#supported-protocol-features)
    - [Experimental](#experimental)
- [Development](#development)
    - [Build](#build)
    - [Test](#test)
    - [Watch](#watch)
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
    --tsserver-log-verbosity <verbosity>   [deprecated] Specify tsserver log verbosity (off, terse, normal, verbose). Defaults to `normal`. example: --tsserver-log-verbosity=verbose
    --tsserver-path <path>                 [deprecated] Specify path to tsserver directory. example: --tsserver-path=/Users/me/typescript/lib/
    -h, --help                             output usage information
```

> The `--tsserver-log-verbosity` and `--tsserver-path` options are deprecated and it is recommended to pass those through corresponding `tsserver.*` `initializationOptions` instead.

> Note: The path passed to `--tsserver-path` should be a path to the `[...]/typescript/lib/tssserver.js` file or to the `[...]/typescript/lib/` directory and not to the shell script `[...]/node_modules/.bin/tsserver`. Though for backward-compatibility reasons, the server will try to do the right thing even when passed a path to the shell script.

## initializationOptions

The language server accepts various settings through the `initializationOptions` object passed through the `initialize` request. Refer to your LSP client's documentation on how to set these. Here is the list of supported options:

| Setting           | Type     | Description                                                                                                                                                                                                                                                          |
|:------------------|:---------|:---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| hostInfo          | string   | Information about the host, for example `"Emacs 24.4"` or `"Sublime Text v3075"`. **Default**: `undefined`                                                                                                                                                           |
| disableAutomaticTypingAcquisition | boolean | Disables tsserver from automatically fetching missing type definitions (`@types` packages) for external modules. |
| maxTsServerMemory | number   | The maximum size of the V8's old memory section in megabytes (for example `4096` means 4GB). The default value is dynamically configured by Node so can differ per system. Increase for very big projects that exceed allowed memory usage. **Default**: `undefined` |
| npmLocation       | string   | Specifies the path to the NPM executable used for Automatic Type Acquisition. |
| locale            | string   | The locale to use to show error messages. |
| plugins           | object[] | An array of `{ name: string, location: string }` objects for registering a Typescript plugins. **Default**: []                                                                                                                                                         |
| preferences       | object   | Preferences passed to the Typescript (`tsserver`) process. See below for more info.                                                                                                                              |
| tsserver          | object   | Options related to the `tsserver` process. See below for more info.                                                                                                                              |

The `tsserver` setting specifies additional options related to the internal `tsserver` process, like tracing and logging.

```ts
interface TsserverOptions {
    /**
     * The path to the directory where the `tsserver` log files will be created.
     * If not provided, the log files will be created within the workspace, inside the `.log` directory.
     * If no workspace root is provided when initializating the server and no custom path is specified then
     * the logs will not be created.
     *
     * @default undefined
     */
    logDirectory?: string;
    /**
     * Verbosity of the information logged into the `tsserver` log files.
     *
     * Log levels from least to most amount of details: `'terse'`, `'normal'`, `'requestTime`', `'verbose'`.
     * Enabling particular level also enables all lower levels.
     *
     * @default 'off'
     */
    logVerbosity?: 'off' | 'terse' | 'normal' | 'requestTime' | 'verbose';
    /**
     * The path to the `tsserver.js` file or the typescript lib directory. For example: `/Users/me/typescript/lib/tsserver.js`.
     */
    path?: string;
    /**
     * The verbosity of logging of the tsserver communication.
     * Delivered through the LSP messages and not related to file logging.
     *
     * @default 'off'
     */
    trace?: 'off' | 'messages' | 'verbose';
}
```

The `preferences` object is an object specifying preferences for the internal `tsserver` process. Those options depend on the version of Typescript used but at the time of writing Typescript v4.4.3 contains these options:

```ts
interface UserPreferences {
    /**
     * Glob patterns of files to exclude from auto imports. Requires using TypeScript 4.8 or newer in the workspace.
     * Relative paths are resolved relative to the workspace root.
     * @since 4.8.2
     */
    autoImportFileExcludePatterns: [],
    disableSuggestions: boolean;
    quotePreference: "auto" | "double" | "single";
    /**
     * If enabled, TypeScript will search through all external modules' exports and add them to the completions list.
     * This affects lone identifier completions but not completions on the right hand side of `obj.`.
     */
    includeCompletionsForModuleExports: boolean;
    /**
     * Enables auto-import-style completions on partially-typed import statements. E.g., allows
     * `import write|` to be completed to `import { writeFile } from "fs"`.
     */
    includeCompletionsForImportStatements: boolean;
    /**
     * Allows completions to be formatted with snippet text, indicated by `CompletionItem["isSnippet"]`.
     */
    includeCompletionsWithSnippetText: boolean;
    /**
     * If enabled, the completion list will include completions with invalid identifier names.
     * For those entries, The `insertText` and `replacementSpan` properties will be set to change from `.x` property access to `["x"]`.
     */
    includeCompletionsWithInsertText: boolean;
    /**
     * Unless this option is `false`, or `includeCompletionsWithInsertText` is not enabled,
     * member completion lists triggered with `.` will include entries on potentially-null and potentially-undefined
     * values, with insertion text to replace preceding `.` tokens with `?.`.
     */
    includeAutomaticOptionalChainCompletions: boolean;
    /**
     * If enabled, completions for class members (e.g. methods and properties) will include
     * a whole declaration for the member.
     * E.g., `class A { f| }` could be completed to `class A { foo(): number {} }`, instead of
     * `class A { foo }`.
     * @since 4.5.2
     * @default true
     */
    includeCompletionsWithClassMemberSnippets: boolean;
    /**
     * If enabled, object literal methods will have a method declaration completion entry in addition
     * to the regular completion entry containing just the method name.
     * E.g., `const objectLiteral: T = { f| }` could be completed to `const objectLiteral: T = { foo(): void {} }`,
     * in addition to `const objectLiteral: T = { foo }`.
     * @since 4.7.2
     * @default true
     */
    includeCompletionsWithObjectLiteralMethodSnippets: boolean;
    /**
     * Indicates whether {@link CompletionEntry.labelDetails completion entry label details} are supported.
     * If not, contents of `labelDetails` may be included in the {@link CompletionEntry.name} property.
     * Only supported if the client supports `textDocument.completion.completionItem.labelDetailsSupport` capability
     * and a compatible TypeScript version is used.
     * @since 4.7.2
     * @default true
     */
    useLabelDetailsInCompletionEntries: boolean;
    /**
     * Allows import module names to be resolved in the initial completions request.
     * @default false
     */
    allowIncompleteCompletions: boolean;
    importModuleSpecifierPreference: "shortest" | "project-relative" | "relative" | "non-relative";
    /** Determines whether we import `foo/index.ts` as "foo", "foo/index", or "foo/index.js" */
    importModuleSpecifierEnding: "auto" | "minimal" | "index" | "js";
    allowTextChangesInNewFiles: boolean;
    lazyConfiguredProjectsFromExternalProject: boolean;
    providePrefixAndSuffixTextForRename: boolean;
    provideRefactorNotApplicableReason: boolean;
    allowRenameOfImportPath: boolean;
    includePackageJsonAutoImports: "auto" | "on" | "off";
    /**
     * Preferred style for JSX attribute completions:
     * - `"auto"` - Insert `={}` or `=\"\"` after attribute names based on the prop type.
     * - `"braces"` - Insert `={}` after attribute names.
     * - `"none"` - Only insert attribute names.
     * @since 4.5.2
     * @default 'auto'
     */
    jsxAttributeCompletionStyle: "auto" | "braces" | "none";
    displayPartsForJSDoc: boolean;
    generateReturnInDocTemplate: boolean;

    includeInlayParameterNameHints: "none" | "literals" | "all";
    includeInlayParameterNameHintsWhenArgumentMatchesName: boolean;
    includeInlayFunctionParameterTypeHints: boolean,
    includeInlayVariableTypeHints: boolean;
    /**
     * When disabled then type hints on variables whose name is identical to the type name won't be shown. Requires using TypeScript 4.8+ in the workspace.
     * @since 4.8.2
     * @default false
     */
    includeInlayVariableTypeHintsWhenTypeMatchesName: boolean;
    includeInlayPropertyDeclarationTypeHints: boolean;
    includeInlayFunctionLikeReturnTypeHints: boolean;
    includeInlayEnumMemberValueHints: boolean;
}
```

From the `preferences` options listed above, this server explicilty sets the following options (all other options use their default values):

```js
{
    allowIncompleteCompletions: true,
    allowRenameOfImportPath: true,
    allowTextChangesInNewFiles: true,
    displayPartsForJSDoc: true,
    generateReturnInDocTemplate: true,
    includeAutomaticOptionalChainCompletions: true,
    includeCompletionsForImportStatements: true,
    includeCompletionsForModuleExports: true,
    includeCompletionsWithClassMemberSnippets: true,
    includeCompletionsWithObjectLiteralMethodSnippets: true,
    includeCompletionsWithInsertText: true,
    includeCompletionsWithSnippetText: true,
    jsxAttributeCompletionStyle: "auto",
    providePrefixAndSuffixTextForRename: true,
    provideRefactorNotApplicableReason: true,
}
```

## workspace/didChangeConfiguration

Some of the preferences can be controlled through the `workspace/didChangeConfiguration` notification. Below is a list of supported options that can be passed. Note that the settings are specified separately for the typescript and javascript files so `[language]` can be either `javascript` or `typescript`.

```ts
// Formatting preferences
[language].format.baseIndentSize: number;
[language].format.convertTabsToSpaces: boolean;
[language].format.indentSize: number;
[language].format.indentStyle: 'None' | 'Block' | 'Smart';
[language].format.insertSpaceAfterCommaDelimiter: boolean;
[language].format.insertSpaceAfterConstructor: boolean;
[language].format.insertSpaceAfterFunctionKeywordForAnonymousFunctions: boolean;
[language].format.insertSpaceAfterKeywordsInControlFlowStatements: boolean;
[language].format.insertSpaceAfterOpeningAndBeforeClosingEmptyBraces: boolean;
[language].format.insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces: boolean;
[language].format.insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: boolean;
[language].format.insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: boolean;
[language].format.insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: boolean;
[language].format.insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces: boolean;
[language].format.insertSpaceAfterSemicolonInForStatements: boolean;
[language].format.insertSpaceAfterTypeAssertion: boolean;
[language].format.insertSpaceBeforeAndAfterBinaryOperators: boolean;
[language].format.insertSpaceBeforeFunctionParenthesis: boolean;
[language].format.insertSpaceBeforeTypeAnnotation: boolean;
[language].format.newLineCharacter: string;
[language].format.placeOpenBraceOnNewLineForControlBlocks: boolean;
[language].format.placeOpenBraceOnNewLineForFunctions: boolean;
[language].format.semicolons: 'ignore' | 'insert' | 'remove';
[language].format.tabSize: number;
[language].format.trimTrailingWhitespace: boolean;
// Inlay Hints preferences
[language].inlayHints.includeInlayEnumMemberValueHints: boolean;
[language].inlayHints.includeInlayFunctionLikeReturnTypeHints: boolean;
[language].inlayHints.includeInlayFunctionParameterTypeHints: boolean;
[language].inlayHints.includeInlayParameterNameHints: 'none' | 'literals' | 'all';
[language].inlayHints.includeInlayParameterNameHintsWhenArgumentMatchesName: boolean;
[language].inlayHints.includeInlayPropertyDeclarationTypeHints: boolean;
[language].inlayHints.includeInlayVariableTypeHints: boolean;
[language].inlayHints.includeInlayVariableTypeHintsWhenTypeMatchesName: boolean;
/**
 * Complete functions with their parameter signature.
 *
 * This functionality relies on LSP client resolving the completion using the `completionItem/resolve` call. If the
 * client can't do that before inserting the completion then it's not safe to enable it as it will result in some
 * completions having a snippet type without actually being snippets, which can then cause problems when inserting them.
 *
 * @default false
 */
completions.completeFunctionCalls: boolean;
// Diagnostics code to be omitted when reporting diagnostics.
// See https://github.com/microsoft/TypeScript/blob/master/src/compiler/diagnosticMessages.json for a full list of valid codes.
diagnostics.ignoredCodes: number[];
/**
 * Enable/disable semantic checking of JavaScript files. Existing `jsconfig.json` or `tsconfig.json` files override this setting.
 *
 * @default false
 */
implicitProjectConfiguration.checkJs: boolean;
/**
 * Enable/disable `experimentalDecorators` in JavaScript files that are not part of a project. Existing `jsconfig.json` or `tsconfig.json` files override this setting.
 *
 * @default false
 */
implicitProjectConfiguration.experimentalDecorators: boolean;
/**
 * Sets the module system for the program. See more: https://www.typescriptlang.org/tsconfig#module.
 *
 * @default 'ESNext'
 */
implicitProjectConfiguration.module: string;
/**
 * Enable/disable [strict function types](https://www.typescriptlang.org/tsconfig#strictFunctionTypes) in JavaScript and TypeScript files that are not part of a project. Existing `jsconfig.json` or `tsconfig.json` files override this setting.
 *
 * @default true
 */
implicitProjectConfiguration.strictFunctionTypes: boolean;
/**
 * Enable/disable [strict null checks](https://www.typescriptlang.org/tsconfig#strictNullChecks) in JavaScript and TypeScript files that are not part of a project. Existing `jsconfig.json` or `tsconfig.json` files override this setting.
 *
 * @default true
 */
implicitProjectConfiguration.strictNullChecks: boolean;
/**
 * Set target JavaScript language version for emitted JavaScript and include library declarations. See more: https://www.typescriptlang.org/tsconfig#target.
 *
 * @default 'ES2020'
 */
implicitProjectConfiguration.target: string;
```

## Code actions on save

Server announces support for the following code action kinds:

 - `source.addMissingImports.ts` - adds imports for used but not imported symbols
 - `source.fixAll.ts` - despite the name, fixes a couple of specific issues: unreachable code, await in non-async functions, incorrectly implemented interface
 - `source.removeUnused.ts` - removes declared but unused variables
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

## Workspace commands (`workspace/executeCommand`)

See [LSP specification](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#workspace_executeCommand).

Most of the time, you'll execute commands with arguments retrieved from another request like `textDocument/codeAction`. There are some use cases for calling them manually.

`lsp` refers to the language server protocol types, `tsp` refers to the typescript server protocol types.

### Go to Source Definition

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

### Apply Workspace Edits

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

### Apply Code Action

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

### Apply Refactoring

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

### Organize Imports

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

### Rename File

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

### Configure plugin

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

## Inlay hints (`typescript/inlayHints`) (experimental)

> !!! This implementation is deprecated. Use the spec-compliant `textDocument/inlayHint` request instead. !!!

Supports experimental inline hints.

```ts
type Request = {
  textDocument: TextDocumentIdentifier,
  range?: Range,
}

type Response = {
  inlayHints: InlayHint[];
}

type InlayHint = {
    text: string;
    position: lsp.Position;
    kind: 'Type' | 'Parameter' | 'Enum';
    whitespaceBefore?: boolean;
    whitespaceAfter?: boolean;
};
```

For the request to return any results, some or all of the following options need to be enabled through `preferences`:

```ts
// Not officially part of UserPreferences yet but you can send them along with the UserPreferences just fine:
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

## Callers and callees (`textDocument/calls`) (experimental)

Supports showing callers and calles for a given symbol. If the editor has support for appropriate UI, it can generate a tree of callers and calles for a document.

```ts
type Request = {
    /**
     * The text document.
     */
    textDocument: TextDocumentIdentifier;
    /**
     * The position inside the text document.
     */
    position: Position;
    /**
     * Outgoing direction for callees.
     * The default is incoming for callers.
     */
    direction?: CallDirection;
}

export enum CallDirection {
    /**
     * Incoming calls aka. callers
     */
    Incoming = 'incoming',
    /**
     * Outgoing calls aka. callees
     */
    Outgoing = 'outgoing',
}

type Result = {
    /**
     * The symbol of a definition for which the request was made.
     *
     * If no definition is found at a given text document position, the symbol is undefined.
     */
    symbol?: DefinitionSymbol;
    /**
     * List of calls.
     */
    calls: Call[];
}

interface Call {
    /**
     * Actual location of a call to a definition.
     */
    location: Location;
    /**
     * Symbol refered to by this call. For outgoing calls this is a callee,
     * otherwise a caller.
     */
    symbol: DefinitionSymbol;
}

interface DefinitionSymbol {
    /**
     * The name of this symbol.
     */
    name: string;
    /**
     * More detail for this symbol, e.g the signature of a function.
     */
    detail?: string;
    /**
     * The kind of this symbol.
     */
    kind: SymbolKind;
    /**
     * The range enclosing this symbol not including leading/trailing whitespace but everything else
     * like comments. This information is typically used to determine if the the clients cursor is
     * inside the symbol to reveal in the symbol in the UI.
     */
    location: Location;
    /**
     * The range that should be selected and revealed when this symbol is being picked, e.g the name of a function.
     * Must be contained by the the `range`.
     */
    selectionRange: Range;
}
```

## Supported Protocol features

- [x] textDocument/codeAction
- [x] textDocument/completion (incl. `completion/resolve`)
- [x] textDocument/definition
- [x] textDocument/didChange (incremental)
- [x] textDocument/didClose
- [x] textDocument/didOpen
- [x] textDocument/didSave
- [x] textDocument/documentHighlight
- [x] textDocument/documentSymbol
- [x] textDocument/executeCommand
- [x] textDocument/formatting
- [x] textDocument/hover
- [x] textDocument/inlayHint (no support for `inlayHint/resolve` or `workspace/inlayHint/refresh`)
- [x] textDocument/rangeFormatting
- [x] textDocument/references
- [x] textDocument/rename
- [x] textDocument/signatureHelp
- [x] workspace/symbol
- [x] workspace/didChangeConfiguration
- [x] workspace/executeCommand

### Experimental

- [x] textDocument/calls (experimental)
- [x] typescript/inlayHints (experimental, supported from Typescript v4.4.2) DEPRECATED (use  `textDocument/inlayHint` instead)

## Development

### Build

```sh
yarn
```

### Test

 - `yarn test` - run all tests
 - `yarn test:watch` - run all tests and enable watch mode for developing

By default only console logs of level `warning` and higher are printed to the console. You can override the `CONSOLE_LOG_LEVEL` level in `package.json` to either `log`, `info`, `warning` or `error` to log other levels.

### Watch

```sh
yarn watch
```

### Publishing

New version of the package is published automatically on pushing new tag to the upstream repo.
