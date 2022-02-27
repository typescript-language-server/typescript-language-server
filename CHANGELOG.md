# Changelog
All notable changes to this project will be documented in this file.

### [0.9.7](https://github.com/typescript-language-server/typescript-language-server/compare/v0.9.6...v0.9.7) (2022-02-27)


### Bug Fixes

* add more logging for resolving user-specified tsserver ([#412](https://github.com/typescript-language-server/typescript-language-server/issues/412)) ([7139a32](https://github.com/typescript-language-server/typescript-language-server/commit/7139a32da05b6e3dfcd3252bde934dc499412d3d))
* help users resolve no valid tsserver version error ([#337](https://github.com/typescript-language-server/typescript-language-server/issues/337)) ([d835543](https://github.com/typescript-language-server/typescript-language-server/commit/d835543e455a51ec159457a1479a550712574099))

## [0.9.6] - 2022-02-02

 - **fix**: don't transform zipfile URIs from Vim (#386)

## [0.9.5] - 2022-01-27

 - **fix**: don't transform Yarn zipfile URIs (#384)

## [0.9.4] - 2022-01-19

 - **fix**: call configure before completion resolve (#377)

## [0.9.3] - 2022-01-16

 - **fix**: wait for tsserver configuration requests to finish (#372)

## [0.9.2] - 2022-01-14

 - **fix**: use correct name for the addMissingImports code action (#371)

## [0.9.1] - 2022-01-07

 - **fix**: don't use the postinstall script

## [0.9.0] - 2022-01-07

 - **feat**: implement additional code actions for handling auto-fixing (#318)

 - **feat**: report progress when loading the project (#326)

 - **feat**: add new preferences from typescript 4.5.3 (#304)

 - **fix**: correct matching of "only" kinds provided by the client (#334)

 - **fix**: pass format options for organizing import (#348)

 - **fix**: use snippet type for jsx attribute completions (#362)

## [0.8.1] - 2021-11-25

 - **fix**: lookup workspace typescript in dirs higher up the tree also (#314)

## [0.8.0] - 2021-11-21

 - **feat**: implement semantic tokens support (#290)

 - **feat**: add support for snippet completions for methods/functions (#303)

 - **feat**: ability to ignore diagnostics by code (#272)
   Adds new `diagnostics.ignoredCodes` workspace setting to ignore specific diagnostics.

 - **feat**: add `npmLocation` option to specify NPM location (#293)

 - **fix**: don't announce support for codeActionKinds (#289)

 - **fix**: mark import completions as snippets (#291)

 - **fix**: specify minimum node version to be v12 (#301)

 - **fix**: ensure that the `tsserver` subprocess uses forked node instance (#292)
   Potentially **BREAKING**. The lookup of `tsserver` was refactored to never use `spawn` logic but instead always `fork` the current node instance. See more info in the PR.

 - **fix**: exit the server if tsserver process crashes (#305)

 - **fix**: respect "includeDeclaration" for references request (#306)

## [0.7.1] - 2021-11-10

 - fix: add missing `semver` dependency (#288)

## [0.7.0] - 2021-11-09

### Breaking

Changes to default options sent to tsserver could affect behavior (hopefully for the better). Read changes below for more details.

### Changes

- **feat**: include import specifier for import completions (#281)
   For completions that import from another package, the completions will include a "detail" field with the name of the module.

   Also aligned some other logic with the typescript language services used in VSCode:
    * annotate the completions with the local name of the import when completing a path in import foo from '...'
    * update completion "sortText" regardless if the completion "isRecommended"

- **feat**: allow skip destructive actions on running OrganizeImports (#228)
   Add support for the new skipDestructiveCodeActions argument to TypeScript's organize imports feature - [1] to support [2].

   Support is added in two places:
     * Automatically inferring the proper value based on diagnostics for the file when returning code actions.
     * Supporting sending it when manually executing the organize imports action.

   Also added documentation to the readme about the supported commands that can be manually executed.

   [1] https://github.com/microsoft/TypeScript/issues/43051
   [2] https://github.com/apexskier/nova-typescript/issues/273

- **feat**: support running server on files without root workspace (#286)
   The tsserver seems to be good at inferring the project configuration when opening single files without a workspace so don't crash on missing `rootPath`.

- **feat**: add `disableAutomaticTypingAcquisition` option to disable automatic type acquisition (#285)
- **feat**: update default tsserver options (#284)
  Set the following additional options by default:
    ```
    allowRenameOfImportPath: true,
    displayPartsForJSDoc: true,
    generateReturnInDocTemplate: true,
    includeAutomaticOptionalChainCompletions: true,
    includeCompletionsForImportStatements: true,
    includeCompletionsWithSnippetText: true,
    ```
    This aligns more with the default options of the typescript language services in VSCode.
- **feat**: announce support for "source.organizeImports.ts-ls" action (#283)
    Announcing support for that code action allows editors that support
    running code actions on save to automatically run the code action if
    the user has configured the editor with settings like

    ```js
      "codeActionsOnSave": {
        "source.organizeImports": true,
        // or
        "source.organizeImports.ts-ls": true,
      },
    ```
 - **chore**: change default log level from "warn" to "info" (#287)

## [0.6.5] - 2021-11-03

 - fix: normalize client and tsserver paths (#275)
   This should ensure consistent behavior regradless of the platform. Previously some functionality could be malfunctioning on Windows depending on the LSP client used due to using non-normalized file paths.
 - Handle the `APPLY_COMPLETION_CODE_ACTION` command internally (#270)
   This means that the clients that have implemented a custom handling for the `_typescript.applyCompletionCodeAction` command can remove that code.
   Without removing the custom handling everything should work as before but some edge cases might work better when custom handling is removed.
 - fix: ignore empty code blocks in content returned from `textDocument/hover` (#276)
 - fix: remove unsupported --node-ipc and --socket options (#278)

## [0.6.4] - 2021-10-12

 - Fix broken logging (#267)
 - Add support for `workspace/didChangeConfiguration` and setting formatting options per language (#268)
 - Add option to set inlayHints preferences by language (#266)

## [0.6.3] - 2021-10-27

 - Implement experimental inlay hints (#259) ([documentation](https://github.com/typescript-language-server/typescript-language-server#typescriptinlayhints-experimental-supported-from-typescript-v442))
 - Send diagnostics even to clients that don't signal support (#261) (reverts #229)

## [0.6.2] - 2021-08-16

 - Mark completion items as deprecated if JSDoc says so (#227)
 - Add a `maxTsServerMemory` option (#252)
 - (chore) Add Windows and Mac CI runner (#248)

## [0.6.1] - 2021-08-16

- Fix Windows path regression introduced in #220 (#249)

## [0.6.0] - 2021-08-12

- Refactor code actions to better support filtering against "only" (#170)
- Support Yarn PnP (#220)
- Update internal Typescript dependency from 3.9.0 to 4.3.4 (#226)
- Only publish diagnostics if client supports the capability (#229)
- Add support for "unnecessary" and "deprecated" diagnostic tags (#230)
- Upgrade vscode-languageserver (#231)
- Lookup tsserver using direct path rather than through .bin alias (#234)
- Don't pass deprecated options to Completion request

## [0.5.4] - 2021-07-01

- Remove hardcoded request timeouts
- Forward user preferences in `initializationOptions`
- Use `require.resolve` for module resolution (#195)

## [0.5.0] - 2021-01-16

- Fix empty documentHighlight results due to inconsistent path delimiters
- Update command line option `tssserver-log-verbosity` to support `off`
- Call compilerOptionsForInferredProjects during initialization (set good defaults when tsconfig.json missing)
- Remove warnings from LSP completion results
- Add support for formatting range (textDocument/rangeFormatting)
- Ensure TSP request cancellation cancels timeout handling

## [0.4.0] - 2019-08-28

- Upgraded to LSP 5.3.0 and Monaco 0.17.0. [#115](https://github.com/theia-ide/typescript-language-server/pull/115)

## [0.3.7] - 2018-11-18

- Let documentSymbol return the correct results when mergeable elements are used [#77](https://github.com/theia-ide/typescript-language-server/pull/77)
- Return correct ranges for hierarchical document symbol [#79](https://github.com/theia-ide/typescript-language-server/pull/79)
- Return null when resolving completion request at an invalid location [#81](https://github.com/theia-ide/typescript-language-server/pull/81)
- Initial call hierarchy support [#85](https://github.com/theia-ide/typescript-language-server/pull/85)
- Allowing starting tsserver as a module using cp.fork [#88](https://github.com/theia-ide/typescript-language-server/pull/88)

Thanks to [@AlexTugarev](https://github.com/AlexTugarev) and [@keyboardDrummer](https://github.com/keyboardDrummer)

## [0.3.6] - 2018-09-18

- Respect URIs received from clients [#75](https://github.com/theia-ide/typescript-language-server/pull/75)

## [0.3.5] - 2018-09-14
- Fixed publishing diagnostics for all opened documents [#71](https://github.com/theia-ide/typescript-language-server/pull/71) - thanks to [@keyboardDrummer](https://github.com/keyboardDrummer)
- Support global tsserver plugins [#73](https://github.com/theia-ide/typescript-language-server/pull/73)
- Configure a tsserver log file via `TSSERVER_LOG_FILE` env variable [#73](https://github.com/theia-ide/typescript-language-server/pull/73)

## [0.3.4] - 2018-09-12
- Restore containerName for non-hierarchical symbols [#69](https://github.com/theia-ide/typescript-language-server/pull/69)

## [0.3.3] - 2018-09-11
- Fix updating documents on `didChange` notification [#65](https://github.com/theia-ide/typescript-language-server/pull/65)
- Debounce triggering diagnostics if a client is spamming with edits [#65](https://github.com/theia-ide/typescript-language-server/pull/65)

## [0.3.2] - 2018-09-06
- Hierarchical document symbols support [#62](https://github.com/theia-ide/typescript-language-server/pull/62)

## [0.3.1] - 2018-09-04

- Allow a client to enable tsserver logging [#59](https://github.com/theia-ide/typescript-language-server/pull/59)

## [0.3.0] - 2018-08-23

- Setup the monorepo with yarn workspaces and ts project references [#48](https://github.com/theia-ide/typescript-language-server/pull/48)
- Added a Monaco based example [#48](https://github.com/theia-ide/typescript-language-server/pull/48)
- Aligned `completion/completionResolve` with VS Code behaviour [#50](https://github.com/theia-ide/typescript-language-server/pull/50)
- Interrupt diagnostics to improve response time for other requests, as completion and signature help [#51](https://github.com/theia-ide/typescript-language-server/pull/51)
- Applied refactorings support [#51](https://github.com/theia-ide/typescript-language-server/pull/51)
- Suggest diagnostics support [#51](https://github.com/theia-ide/typescript-language-server/pull/51)
- Diagnostics buffering [#51](https://github.com/theia-ide/typescript-language-server/pull/51)
- Tolerating non-file URIs [#51](https://github.com/theia-ide/typescript-language-server/pull/51)
- Organize imports support [#51](https://github.com/theia-ide/typescript-language-server/pull/51)
- Added `Apply Rename File` command [#56](https://github.com/theia-ide/typescript-language-server/pull/56)

[0.4.0]: https://github.com/theia-ide/typescript-language-server/compare/v0.3.7...v0.4.0
[0.3.7]: https://github.com/theia-ide/typescript-language-server/compare/v0.3.6...v0.3.7
[0.3.6]: https://github.com/theia-ide/typescript-language-server/compare/v0.3.5...v0.3.6
[0.3.5]: https://github.com/theia-ide/typescript-language-server/compare/v0.3.4...v0.3.5
[0.3.4]: https://github.com/theia-ide/typescript-language-server/compare/v0.3.3...v0.3.4
[0.3.3]: https://github.com/theia-ide/typescript-language-server/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/theia-ide/typescript-language-server/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/theia-ide/typescript-language-server/compare/961d937f3ee3ea6b68cb98a6c235c6beea5f2fa5...v0.3.1
[0.3.0]: https://github.com/theia-ide/typescript-language-server/compare/v0.2.0...961d937f3ee3ea6b68cb98a6c235c6beea5f2fa5
