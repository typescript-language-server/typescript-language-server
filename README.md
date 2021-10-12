[![Build Status](https://travis-ci.org/theia-ide/typescript-language-server.svg?branch=master)](https://travis-ci.org/theia-ide/typescript-language-server)
[![Discord](https://img.shields.io/discord/873659987413573634)](https://discord.gg/AC7Vs6hwFa)

# TypeScript Language Server

[Language Server Protocol](https://github.com/Microsoft/language-server-protocol) implementation for TypeScript wrapping `tsserver`.

[![https://nodei.co/npm/typescript-language-server.png?downloads=true&downloadRank=true&stars=true](https://nodei.co/npm/typescript-language-server.png?downloads=true&downloadRank=true&stars=true)](https://www.npmjs.com/package/typescript-language-server)

Based on concepts and ideas from https://github.com/prabirshrestha/typescript-language-server and originally maintained by [TypeFox](https://typefox.io)

Maintained by a [community of contributors](https://github.com/typescript-language-server/typescript-language-server/graphs/contributors) like you

# Installing

```sh
npm install -g typescript-language-server
```

# Running the language server

```
typescript-language-server --stdio
```

## CLI Options

```
  Usage: typescript-language-server [options]


  Options:

    -V, --version                          output the version number
    --stdio                                use stdio
    --node-ipc                             use node-ipc
    --log-level <log-level>                A number indicating the log level (4 = log, 3 = info, 2 = warn, 1 = error). Defaults to `2`.
    --socket <port>                        use socket. example: --socket=5000
    --tsserver-log-file <tsServerLogFile>  Specify a tsserver log file. example: --tsserver-log-file=ts-logs.txt
    --tsserver-log-verbosity <verbosity>   Specify tsserver log verbosity (off, terse, normal, verbose). Defaults to `normal`. example: --tsserver-log-verbosity=verbose
    --tsserver-path <path>                 Specify path to tsserver. example: --tsserver-path=tsserver
    -h, --help                             output usage information
```

## initializationOptions

The language server accepts various settings through the `initializationOptions` object passed through the `initialize` request. Refer to your LSP client's documentation on how to set these. Here is the list of supported options:

| Setting           | Type     | Description                                                                                                                                                                                                                                                          |
|:------------------|:---------|:---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| hostInfo          | string   | Information about the host, for example `"Emacs 24.4"` or `"Sublime Text v3075"`. **Default**: `undefined`                                                                                                                                                           |
| logVerbosity      | string   | The verbosity level of the information printed in the log by `tsserver`. Accepts values: `"off"`, `"terse"`, `"normal"`, `"requesttime"`, `"verbose"`. **Default**: `undefined` (`"off"`).                                                                                         |
| maxTsServerMemory | number   | The maximum size of the V8's old memory section in megabytes (for example `4096` means 4GB). The default value is dynamically configured by Node so can differ per system. Increase for very big projects that exceed allowed memory usage. **Default**: `undefined` |
| plugins           | object[] | An array of `{ name: string, location: string }` objects for registering a Typescript plugins. **Default**: []                                                                                                                                                         |
| preferences       | object   | Preferences passed to the Typescript (`tsserver`) process. See below for more info.                                                                                                                              |

The `preferences` object is an object specifying preferences for the internal `tsserver` process. Those options depend on the version of Typescript used but at the time of writing Typescript v4.4.3 contains these options:

```ts
interface UserPreferences {
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
    displayPartsForJSDoc: boolean;
    generateReturnInDocTemplate: boolean;
}
```

From the `preferences` options listed above, this server explicilty sets the following options (all other options use their default values):

```js
{
  includeCompletionsForModuleExports: true,
  includeCompletionsWithInsertText: true,
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
```

# Supported Protocol features

- [x] textDocument/didChange (incremental)
- [x] textDocument/didClose
- [x] textDocument/didOpen
- [x] textDocument/didSave

- [x] textDocument/codeAction
- [x] textDocument/completion (incl. completion/resolve)
- [x] textDocument/definition
- [x] textDocument/documentHighlight
- [x] textDocument/documentSymbol
- [x] textDocument/executeCommand
- [x] textDocument/formatting
- [x] textDocument/rangeFormatting
- [x] textDocument/hover
- [x] textDocument/rename
- [x] textDocument/references
- [x] textDocument/signatureHelp
- [x] workspace/symbol
- [x] workspace/didChangeConfiguration

## `typescript/inlayHints` (experimental, supported from Typescript v4.4.2)

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
    includeInlayPropertyDeclarationTypeHints: boolean;
    includeInlayFunctionLikeReturnTypeHints: boolean;
    includeInlayEnumMemberValueHints: boolean;
}
```

## `textDocument/calls` (experimental)

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

# Development

### Build

```sh
yarn
```

## Test

```sh
yarn test
```

### Watch

```sh
yarn watch
```

### Publishing

```sh
yarn publish
```
