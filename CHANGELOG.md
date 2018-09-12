# Changelog
All notable changes to this project will be documented in this file.

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

[0.3.4]: https://github.com/theia-ide/typescript-language-server/compare/v0.3.3...v0.3.4
[0.3.3]: https://github.com/theia-ide/typescript-language-server/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/theia-ide/typescript-language-server/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/theia-ide/typescript-language-server/compare/961d937f3ee3ea6b68cb98a6c235c6beea5f2fa5...v0.3.1
[0.3.0]: https://github.com/theia-ide/typescript-language-server/compare/v0.2.0...961d937f3ee3ea6b68cb98a6c235c6beea5f2fa5
