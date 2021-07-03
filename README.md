[![Gitpod - Code Now](https://img.shields.io/badge/Gitpod-code%20now-blue.svg?longCache=true)](https://gitpod.io#https://github.com/theia-ide/typescript-language-server)
[![Build Status](https://travis-ci.org/theia-ide/typescript-language-server.svg?branch=master)](https://travis-ci.org/theia-ide/typescript-language-server)
[![IRC](https://img.shields.io/badge/IRC-%23typescript--language--server-1e72ff.svg?style=flat)](https://webchat.freenode.net/#typescript-language-server)

# TypeScript Language Server
[Language Server Protocol](https://github.com/Microsoft/language-server-protocol) implementation for TypeScript wrapping `tsserver`.

[![https://nodei.co/npm/typescript-language-server.png?downloads=true&downloadRank=true&stars=true](https://nodei.co/npm/typescript-language-server.png?downloads=true&downloadRank=true&stars=true)](https://www.npmjs.com/package/typescript-language-server)

Based on concepts and ideas from https://github.com/prabirshrestha/typescript-language-server.

Maintained by [TypeFox](https://typefox.io) and others.

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
- [x] [workspace/executeCommand](https://microsoft.github.io/language-server-protocol/specifications/specification-3-17/#workspace_executeCommand)  
    Most of the time, you'll execute commands with arguments retrieved from another request like `textDocument/codeAction`. There are some use cases for calling them
    manually.

    Supported commands:

    `lsp` refers to the language server protocol, `tsp` refers to the typescript server protocol.
    
    * `_typescript.applyWorkspaceEdit`
        ```ts
        type Arguments = [lsp.WorkspaceEdit]
        ```
    * `_typescript.applyCodeAction`
        ```ts
        type Arguments = [tsp.CodeAction]
        ```
    * `_typescript.applyRefactoring`
        ```ts
        type Arguments = [tsp.GetEditsForRefactorRequestArgs]
        ```
    * `_typescript.organizeImports`
        ```ts
        type Arguments = [string] | [string, { skipDestructiveCodeActions?: boolean }]
        ```
    * `_typescript.applyRenameFile`
        ```ts
        type Arguments = [{ sourceUri: string; targetUri: string; }]
        ```

# Installing

```sh
npm install -g typescript-language-server
```

# Running the language server

```
typescript-language-server --stdio
```

## Options

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

# Development

[![Open in Gitpod](https://gitpod.io/button/open-in-gitpod.svg)](https://gitpod.io#https://github.com/theia-ide/typescript-language-server)

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

### Bundle the example

```sh
yarn bundle
```

### Start the example

```sh
yarn start
```

### Publishing

```sh
yarn publish
```
