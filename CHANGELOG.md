# Changelog
All notable changes to this project will be documented in this file.

## [2.1.0](https://github.com/typescript-language-server/typescript-language-server/compare/v2.0.1...v2.1.0) (2022-10-17)


### Features

* add `_typescript.configurePlugin` workspace command ([#607](https://github.com/typescript-language-server/typescript-language-server/issues/607)) ([59a5217](https://github.com/typescript-language-server/typescript-language-server/commit/59a52174148f3dc95fa2969971a1f95c6e432812))
* add `tsserver.logVerbosity` and `tsserver.path` to `initializationOptions` ([#611](https://github.com/typescript-language-server/typescript-language-server/issues/611)) ([a03eab5](https://github.com/typescript-language-server/typescript-language-server/commit/a03eab5f1442ad68745d6bec464191a66ab85fc7))
* add support for `[@link](https://github.com/link)` references in JSDoc ([#612](https://github.com/typescript-language-server/typescript-language-server/issues/612)) ([3722b51](https://github.com/typescript-language-server/typescript-language-server/commit/3722b51c0ad8e758c4e42f622bbe25ae981071e1))
* add workspace implicit project defaults configuration ([#605](https://github.com/typescript-language-server/typescript-language-server/issues/605)) ([c6b3947](https://github.com/typescript-language-server/typescript-language-server/commit/c6b39473ed5343f99434506ee034fd0d45a5364d))


### Bug Fixes

* loading progress sometimes getting stuck ([#603](https://github.com/typescript-language-server/typescript-language-server/issues/603)) ([8cf4381](https://github.com/typescript-language-server/typescript-language-server/commit/8cf43810e0ff7a32d3499afc6da2344939b2d6de))
* respect user-provided tsserver.js path from `--tsserver-path` ([#610](https://github.com/typescript-language-server/typescript-language-server/issues/610)) ([417339f](https://github.com/typescript-language-server/typescript-language-server/commit/417339fa66bc1910c80888c3f909e3d059da8ee5))

## [2.0.1](https://github.com/typescript-language-server/typescript-language-server/compare/v2.0.0...v2.0.1) (2022-10-07)


### Bug Fixes

* disable IPC communication until TypeScript bug is fixed ([#600](https://github.com/typescript-language-server/typescript-language-server/issues/600)) ([a6153a6](https://github.com/typescript-language-server/typescript-language-server/commit/a6153a66e88bed52704761f92dd4168605ef9a45))

## [2.0.0](https://github.com/typescript-language-server/typescript-language-server/compare/v1.2.0...v2.0.0) (2022-09-28)


### ⚠ BREAKING CHANGES

* Replace the CLI argument `--tsserver-log-file` with `tsserver.logDirectory` option provided through `initializationOptions` of the `initialize` request.

### Features

* add `tsserver.logDirectory` to `initializationOptions` ([#588](https://github.com/typescript-language-server/typescript-language-server/issues/588)) ([114d430](https://github.com/typescript-language-server/typescript-language-server/commit/114d4309cb1450585f991604118d3eff3690237c))
* add `tsserver.trace` init option for tracing tsserver ([#586](https://github.com/typescript-language-server/typescript-language-server/issues/586)) ([e3e8930](https://github.com/typescript-language-server/typescript-language-server/commit/e3e893094e501e3d6a72148e05f11286d688d2bd))


### Bug Fixes

* **completions:** don't create snippet kind without `completeFunctionCalls` ([#595](https://github.com/typescript-language-server/typescript-language-server/issues/595)) ([7f69c27](https://github.com/typescript-language-server/typescript-language-server/commit/7f69c27eb8cce71d3db006623757a74f93d76dd3))
* **completions:** remove filterText override for bracket accessor ([#593](https://github.com/typescript-language-server/typescript-language-server/issues/593)) ([1ed4e2e](https://github.com/typescript-language-server/typescript-language-server/commit/1ed4e2eccf0b52e10204b5c2617d4944ae513afd))
* wrong import completion when insert/replace supported ([#592](https://github.com/typescript-language-server/typescript-language-server/issues/592)) ([4fe902a](https://github.com/typescript-language-server/typescript-language-server/commit/4fe902a9e28ec4c3ccc14a9e75488efeb8079544))

## [1.2.0](https://github.com/typescript-language-server/typescript-language-server/compare/v1.1.2...v1.2.0) (2022-09-12)


### Features

* Add insert replace support for completions ([#583](https://github.com/typescript-language-server/typescript-language-server/issues/583)) ([fdf9d11](https://github.com/typescript-language-server/typescript-language-server/commit/fdf9d11200c49a160ed3c3bd523e4792bc98e99d))
* add support for new features from TypeScript 4.8 ([#576](https://github.com/typescript-language-server/typescript-language-server/issues/576)) ([7e88db3](https://github.com/typescript-language-server/typescript-language-server/commit/7e88db301a56d6d2dcd0fc1872d6baa386210497))
* include "triggerReason" and "kind" in code action requests ([#579](https://github.com/typescript-language-server/typescript-language-server/issues/579)) ([f872078](https://github.com/typescript-language-server/typescript-language-server/commit/f872078fa3b40d8b9b90f737fec7a4c808f1ccc7))
* support communicating with tsserver using IPC ([#585](https://github.com/typescript-language-server/typescript-language-server/issues/585)) ([8725b9b](https://github.com/typescript-language-server/typescript-language-server/commit/8725b9bee4432b7520ebd9adc67f4c65303b2c8c))
* support for codeAction disabledSupport client capability ([#578](https://github.com/typescript-language-server/typescript-language-server/issues/578)) ([f93b849](https://github.com/typescript-language-server/typescript-language-server/commit/f93b8493eeafda32c865c93e99025c8ca11c3226))


### Bug Fixes

* only use optionalReplacementSpan if client supports InsertReplace ([#584](https://github.com/typescript-language-server/typescript-language-server/issues/584)) ([899ba6b](https://github.com/typescript-language-server/typescript-language-server/commit/899ba6b5c5f13faac8eec6478ced4d9f8d90836d))

## [1.1.2](https://github.com/typescript-language-server/typescript-language-server/compare/v1.1.1...v1.1.2) (2022-08-25)


### Bug Fixes

* definition request crashing on getting span ([#574](https://github.com/typescript-language-server/typescript-language-server/issues/574)) ([4e1c82b](https://github.com/typescript-language-server/typescript-language-server/commit/4e1c82b82878316a12ff6b524d7dd5ab54b86acd))

## [1.1.1](https://github.com/typescript-language-server/typescript-language-server/compare/v1.1.0...v1.1.1) (2022-08-22)


### Bug Fixes

* move deepmerge to dependencies ([06109d4](https://github.com/typescript-language-server/typescript-language-server/commit/06109d4646d94bdf1bbeb2768e18f1323ae1b630))

## [1.1.0](https://github.com/typescript-language-server/typescript-language-server/compare/v1.0.0...v1.1.0) (2022-08-21)


### Features

* add "Go To Source Definition" command ([#560](https://github.com/typescript-language-server/typescript-language-server/issues/560)) ([9bcdaf2](https://github.com/typescript-language-server/typescript-language-server/commit/9bcdaf2b0b09da9aa4d7e6ed79bdcd742b3cfc17))
* support `textDocument/inlayHint` request from 3.17.0 spec ([#566](https://github.com/typescript-language-server/typescript-language-server/issues/566)) ([9a2fd4e](https://github.com/typescript-language-server/typescript-language-server/commit/9a2fd4e34b6c50c57b974f617018dcefdb469788))
* support LocationLink[] for textDocument/definition response ([#563](https://github.com/typescript-language-server/typescript-language-server/issues/563)) ([196f328](https://github.com/typescript-language-server/typescript-language-server/commit/196f328cd9fd7a06998151d59bed0b945cc68b40))


### Bug Fixes

* don't trigger error on empty Source Definition response ([#568](https://github.com/typescript-language-server/typescript-language-server/issues/568)) ([146a6ba](https://github.com/typescript-language-server/typescript-language-server/commit/146a6ba97f0792701ff8afcc431d3a1dfdb978a6))
* make wording in the typescript lookup error more generic ([585a05e](https://github.com/typescript-language-server/typescript-language-server/commit/585a05e43a0b530f10e488aed634fac0436109ae)), closes [#554](https://github.com/typescript-language-server/typescript-language-server/issues/554)
* snippet completions returned to clients that don't support them ([#556](https://github.com/typescript-language-server/typescript-language-server/issues/556)) ([050d335](https://github.com/typescript-language-server/typescript-language-server/commit/050d3350e16fe78b7c60d7443ed3ad6d2cc4730d))
* update signature help feature to v3.15.0 LSP spec ([#555](https://github.com/typescript-language-server/typescript-language-server/issues/555)) ([da074a6](https://github.com/typescript-language-server/typescript-language-server/commit/da074a618ca6c29819834a0344682094d6ff08f6))

## [1.0.0](https://github.com/typescript-language-server/typescript-language-server/compare/v0.11.2...v1.0.0) (2022-08-06)


### ⚠ BREAKING CHANGES

* Ship as an ES module. Might be breaking for programmatic users of this server. Read more about consuming ES module packages at gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c
* **deps:** LSP libraries updated to match the 3.17 version of the LSP spec. Requires minimum Node 14.

### Features

* add support for CompletionItem.labelDetails ([#534](https://github.com/typescript-language-server/typescript-language-server/issues/534)) ([3c140d9](https://github.com/typescript-language-server/typescript-language-server/commit/3c140d958507300d7d186adb84f5b0baa549edb2))


### Bug Fixes

* declare quickfix/refactor CodeAction capabilities ([#553](https://github.com/typescript-language-server/typescript-language-server/issues/553)) ([e76fc64](https://github.com/typescript-language-server/typescript-language-server/commit/e76fc6493295649d6ada83c8a5f6d88abe2a6167))
* handle shutdown lifecycle properly ([#536](https://github.com/typescript-language-server/typescript-language-server/issues/536)) ([ac8536b](https://github.com/typescript-language-server/typescript-language-server/commit/ac8536bf8eb805bfc28e484a8f4827b5375d6824))


### Miscellaneous Chores

* **deps:** update LSP libraries to match 3.17 spec ([#532](https://github.com/typescript-language-server/typescript-language-server/issues/532)) ([bdbdd83](https://github.com/typescript-language-server/typescript-language-server/commit/bdbdd8379815583aa28d2a770034253050ba24de))


### Code Refactoring

* ship as an ES module ([#547](https://github.com/typescript-language-server/typescript-language-server/issues/547)) ([0dfd411](https://github.com/typescript-language-server/typescript-language-server/commit/0dfd41125c04868b547a3893334bb0bb822e0517))

## [0.11.2](https://github.com/typescript-language-server/typescript-language-server/compare/v0.11.1...v0.11.2) (2022-06-24)


### Bug Fixes

* apply refactoring returns -1 positions in ranges ([#502](https://github.com/typescript-language-server/typescript-language-server/issues/502)) ([5f52db0](https://github.com/typescript-language-server/typescript-language-server/commit/5f52db0383d6c326cd321c13fc969ab9d3958011))

## [0.11.1](https://github.com/typescript-language-server/typescript-language-server/compare/v0.11.0...v0.11.1) (2022-06-13)


### Bug Fixes

* completion for strings with trigger character ([#492](https://github.com/typescript-language-server/typescript-language-server/issues/492)) ([76bf9a4](https://github.com/typescript-language-server/typescript-language-server/commit/76bf9a4817ffa1e340422cfd5177dbcb96528ddb))

## [0.11.0](https://github.com/typescript-language-server/typescript-language-server/compare/v0.10.1...v0.11.0) (2022-06-06)


### Features

* add support for rename prefixText and suffixText on rename ([#478](https://github.com/typescript-language-server/typescript-language-server/issues/478)) ([b3c8535](https://github.com/typescript-language-server/typescript-language-server/commit/b3c85354c71dc36e1d4775bf61d7064a6b85e958))

### [0.10.1](https://github.com/typescript-language-server/typescript-language-server/compare/v0.10.0...v0.10.1) (2022-05-18)


### Bug Fixes

* pin old version of LSP libraries for node <14 compatibility ([#467](https://github.com/typescript-language-server/typescript-language-server/issues/467)) ([55600e1](https://github.com/typescript-language-server/typescript-language-server/commit/55600e12635c01d5a531b776b33d10f9e622a7a6))

## [0.10.0](https://github.com/typescript-language-server/typescript-language-server/compare/v0.9.7...v0.10.0) (2022-05-11)


### Features

* add support for locale option ([#461](https://github.com/typescript-language-server/typescript-language-server/issues/461)) ([be6a95d](https://github.com/typescript-language-server/typescript-language-server/commit/be6a95ddf6abf8cb68689a6995e3e55858eacb23))

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
