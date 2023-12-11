# Configuration

<!--toc:start-->
- [Configuration](#configuration)
  - [initializationOptions](#initializationoptions)
    - [`tsserver` options](#tsserver-options)
    - [`preferences` options](#preferences-options)
  - [workspace/didChangeConfiguration](#workspacedidchangeconfiguration)
<!--toc:end-->

## initializationOptions

The language server accepts various settings through the `initializationOptions` object passed through the `initialize` request. Refer to your LSP client's documentation on how to set these. Here is the list of supported options:

| Setting           | Type     | Description                                                                           |
|:------------------|:---------|:--------------------------------------------------------------------------------------|
| hostInfo          | string   | Information about the host, for example `"Emacs 24.4"` or `"Sublime Text v3075"`. **Default**: `undefined` |
| completionDisableFilterText  | boolean | Don't set `filterText` property on completion items. **Default**: `false` |
| disableAutomaticTypingAcquisition | boolean | Disables tsserver from automatically fetching missing type definitions (`@types` packages) for external modules. |
| maxTsServerMemory | number   | The maximum size of the V8's old memory section in megabytes (for example `4096` means 4GB). The default value is dynamically configured by Node so can differ per system. Increase for very big projects that exceed allowed memory usage. **Default**: `undefined` |
| npmLocation       | string   | Specifies the path to the NPM executable used for Automatic Type Acquisition. |
| locale            | string   | The locale to use to show error messages. |
| plugins           | object[] | An array of `{ name: string, location: string, languages?: string[] }` objects for registering a Typescript plugins. **Default**: [] |
| preferences       | object   | Preferences passed to the Typescript (`tsserver`) process. See below for more |
| tsserver          | object   | Options related to the `tsserver` process. See below for more |

### `plugins` option

Accepts a list of `tsserver` (typescript) plugins.
The `name` and the `location` are required. The `location` is a path to the package or a directory in which `tsserver` will try to import the plugin `name` using Node's `require` API.
The `languages` property specifies which extra language IDs the language server should accept. This is required when plugin enables support for language IDs that this server does not support by default (so other than `typescript`, `typescriptreact`, `javascript`, `javascriptreact`). It's an optional property and only affects which file types the language server allows to be opened and do not concern the `tsserver` itself.

### `tsserver` options

Specifies additional options related to the internal `tsserver` process, like tracing and logging:

**logDirectory** [string] The path to the directory where the `tsserver` log files will be created. If not provided, the log files will be created within the workspace, inside the `.log` directory. If no workspace root is provided when initializating the server and no custom path is specified then the logs will not be created. **Default**: `undefined`

**logVerbosity** [string] Verbosity of the information logged into the `tsserver` log files. Log levels from least to most amount of details: `'off'`, `'terse'`, `'normal'`, `'requestTime`', `'verbose'`. **Default**: `'off'`

**path** [string] The path to the `tsserver.js` file or the typescript lib directory. For example: `/Users/me/typescript/lib/tsserver.js`. Note: The path should point at the `[...]/typescript/lib/tssserver.js` file or the `[...]/typescript/lib/` directory and not the shell script (`[...]/node_modules/.bin/tsserver`) but for backward-compatibility reasons, the server will try to do the right thing even when passed a path to the shell script. **Default**: `undefined`

**fallbackPath** [string] The path to the `tsserver.js` file or the typescript lib directory to use when `tsserver.path` is unspecified/invalid and the `tsserver` isn't available via the current workspace. For example: `/Users/me/typescript/lib/tsserver.js`. Note: The path should point at the `[...]/typescript/lib/tssserver.js` file or the `[...]/typescript/lib/` directory and not the shell script (`[...]/node_modules/.bin/tsserver`) but for backward-compatibility reasons, the server will try to do the right thing even when passed a path to the shell script. **Default**: `undefined`

**trace** [string] The verbosity of logging of the tsserver communication. Delivered through the LSP messages and not related to file logging. Allowed values are: `'off'`, `'messages'`, `'verbose'`. **Default**: `'off'`

**useSyntaxServer** [string] Whether a dedicated server is launched to more quickly handle syntax related operations, such as computing diagnostics or code folding. **Default**: `'auto'`. Allowed values:
  - `'auto'`: Spawn both a full server and a lighter weight server dedicated to syntax operations. The syntax server is used to speed up syntax operations and provide IntelliSense while projects are loading.
  - `'never'`: Don't use a dedicated syntax server. Use a single server to handle all IntelliSense operations.

### `preferences` options

Specifies preferences for the internal `tsserver` process. Those options depend on the version of Typescript used but the most recently synced with version contains these options:

**autoImportFileExcludePatterns** [array of strings] Glob patterns of files to exclude from auto imports. Relative paths are resolved relative to the workspace root. Since TypeScript 4.8.2+. **Default**: `[]`

**disableSuggestions** [boolean] **Default**: `false`

**quotePreference** [string] Supported values `'auto'`, `'double'`, `'single'`. **Default**: `'auto'`

**includeCompletionsForModuleExports** [boolean] If enabled, TypeScript will search through all external modules' exports and add them to the completions list. This affects lone identifier completions but not completions on the right hand side of `obj.`. **Default**: `true`

**includeCompletionsForImportStatements** [boolean] Enables auto-import-style completions on partially-typed import statements. E.g., allows `import write|` to be completed to `import { writeFile } from "fs"`. **Default**: `true`

**includeCompletionsWithSnippetText** [boolean] Allows completions to be formatted with snippet text, indicated by `CompletionItem["isSnippet"]`. **Default**: `true`

**includeCompletionsWithInsertText** [boolean] If enabled, the completion list will include completions with invalid identifier names. For those the `insertText` and `replacementSpan` properties will be set to change from `.x` property access to `["x"]`. **Default**: `true`

**includeAutomaticOptionalChainCompletions** [boolean] Unless this option is `false`, or `includeCompletionsWithInsertText` is not enabled, member completion lists triggered with `.` will include entries on potentially-null and potentially-undefined values, with insertion text to replace preceding `.` tokens with `?.`. **Default**: `true`

**includeCompletionsWithClassMemberSnippets** [boolean] If enabled, completions for class members (e.g. methods and properties) will include a whole declaration for the member. E.g., `class A { f| }` could be completed to `class A { foo(): number {} }`, instead of `class A { foo }`. Since TypeScript 4.5.2. **Default**: `true`

**includeCompletionsWithObjectLiteralMethodSnippets** [boolean] If enabled, object literal methods will have a method declaration completion entry in addition to the regular completion entry containing just the method name. E.g., `const objectLiteral: T = { f| }` could be completed to `const objectLiteral: T = { foo(): void {} }`, in addition to `const objectLiteral: T = { foo }`. Since TypeScript 4.7.2. **Default**: `true`

**useLabelDetailsInCompletionEntries** [boolean] Indicates whether `CompletionEntry.labelDetails` completion entry label details are supported. If not, contents of `labelDetails` may be included in the `CompletionEntry.name` property. Only supported if the client supports `textDocument.completion.completionItem.labelDetailsSupport` capability and a compatible TypeScript version is used. Since TypeScript 4.7.2. **Default**: `true`

**allowIncompleteCompletions** [boolean] Allows import module names to be resolved in the initial completions request. **Default**: `true`

**importModuleSpecifierPreference** [string] Supported values: `'shortest'`, `'project-relative'`, `'relative'`, `'non-relative'`. **Default**: `'shortest'`

**importModuleSpecifierEnding** [string] Determines whether we import `foo/index.ts` as "foo", "foo/index", or "foo/index.js". Supported values: `'auto'`, `'minimal'`, `'index'`, `'js'`. **Default**: `'auto'`

**allowTextChangesInNewFiles** [boolean]  **Default**: `true`

**lazyConfiguredProjectsFromExternalProject** [boolean] **Default**: `false`

<a name="organizeImportsIgnoreCase"></a> **organizeImportsIgnoreCase** [string or boolean] Indicates whether imports should be organized in a case-insensitive manner. Supported values: `'auto'`, `boolean`. **Default**: `'auto'`

<a name="organizeImportsCollation"></a> **organizeImportsCollation** [string] Indicates whether imports should be organized via an "ordinal" (binary) comparison using the numeric value of their code points, or via "unicode" collation (via the [Unicode Collation Algorithm](https://unicode.org/reports/tr10/#Scope)) using rules associated with the locale specified in [organizeImportsCollationLocale](#organizeImportsCollationLocale). Supported values: `'ordinal'`, `'unicode'`. **Default**: `'ordinal'`

<a name="organizeImportsCollationLocale"></a> **organizeImportsCollationLocale** [string] Indicates the locale to use for "unicode" collation. If not specified, the locale `"en"` is used as an invariant for the sake of consistent sorting. Use `"auto"` to use the detected UI locale. This preference is ignored if [organizeImportsCollation](#organizeImportsNumericCollation) is not `"unicode"`. **Default**: `'en'`

<a name="organizeImportsNumericCollation"></a> **organizeImportsNumericCollation** [boolean] Indicates whether numeric collation should be used for digit sequences in strings. When `true`, will collate strings such that `a1z < a2z < a100z`. When `false`, will collate strings such that `a1z < a100z < a2z`. This preference is ignored if [organizeImportsCollation](#organizeImportsCollation) is not `"unicode"`. **Default**: `false`

**organizeImportsAccentCollation** [boolean] Indicates whether accents and other diacritic marks are considered unequal for the purpose of collation. When `true`, characters with accents and other diacritics will be collated in the order defined by the locale specified in [organizeImportsCollationLocale](#organizeImportsCollationLocale). This preference is ignored if [organizeImportsCollation](#organizeImportsCollation) is not `"unicode"`. **Default**: `true`

**organizeImportsCaseFirst** [string or boolean] Indicates whether upper case or lower case should sort first. When `false`, the default order for the locale specified in [organizeImportsCollationLocale](#organizeImportsCollationLocale) is used. This preference is ignored if [organizeImportsCollation](#organizeImportsCollation) is not `"unicode"`. This preference is also ignored if we are using case-insensitive sorting, which occurs when [organizeImportsIgnoreCase](#organizeImportsIgnoreCase) is `true`, or if [organizeImportsIgnoreCase](#organizeImportsIgnoreCase) is `"auto"` and the auto-detected case sensitivity is determined to be case-insensitive. Supported values: `'upper'`, `'lower'`, `false`. **Default**: `false`

**providePrefixAndSuffixTextForRename** [boolean]  **Default**: `true`

**provideRefactorNotApplicableReason** [boolean]  **Default**: `true`

**allowRenameOfImportPath** [boolean]  **Default**: `true`

**includePackageJsonAutoImports** [string] Supported values: `'auto'`, `'on'`, `'off'`. **Default**: `'auto'`

**interactiveInlayHints** [boolean] Since TypeScript 5.2.2. **Default**: `true`,

**jsxAttributeCompletionStyle** [string] Preferred style for JSX attribute completions: `"auto"` - Insert `={}` or `=\"\"` after attribute names based on the prop type. `"braces"` - Insert `={}` after attribute names. `"none"` - Only insert attribute names. Supported values: `'auto'`, `'braces'`, `'none'`. Since TypeScript 4.5.2. **Default**: `auto`

**displayPartsForJSDoc** [boolean] **Default**: `true`

**excludeLibrarySymbolsInNavTo** [boolean] **Default**: `true`

**generateReturnInDocTemplate** [boolean] **Default**: `true`

**includeInlayParameterNameHints** [string] Supported values: `'none'`, `'literals'`, `'all'`. **Default**: `'none'`

**includeInlayParameterNameHintsWhenArgumentMatchesName** [boolean]  **Default**: `false`

**includeInlayFunctionParameterTypeHints** [boolean] **Default**: `false`

**includeInlayVariableTypeHints** [boolean] **Default**: `false`

**includeInlayVariableTypeHintsWhenTypeMatchesName** [boolean] When disabled then type hints on variables whose name is identical to the type name won't be shown. Since TypeScript 4.8.2. **Default**: `false`

**includeInlayPropertyDeclarationTypeHints** [boolean] **Default**: `false`

**includeInlayFunctionLikeReturnTypeHints** [boolean] **Default**: `false`

**includeInlayEnumMemberValueHints** [boolean] **Default**: `false`

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
// Code Lens preferences
[language].implementationsCodeLens.enabled: boolean;
[language].referencesCodeLens.enabled: boolean;
[language].referencesCodeLens.showOnAllFunctions: boolean;

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
