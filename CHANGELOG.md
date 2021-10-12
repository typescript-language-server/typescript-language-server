# Changelog
All notable changes to this project will be documented in this file.

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
