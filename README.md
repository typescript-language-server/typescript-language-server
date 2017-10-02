# TypeScript LSP
[Language Server Protocol](https://github.com/Microsoft/language-server-protocol) implementation for TypeScript wrapping `tsserver`.

[![https://nodei.co/npm/typescript-language-server.png?downloads=true&downloadRank=true&stars=true](https://nodei.co/npm/typescript-language-server.png?downloads=true&downloadRank=true&stars=true)](https://www.npmjs.com/package/typescript-language-server)

Based on concepts and ideas from https://github.com/prabirshrestha/typescript-language-server.

Maintained by [TypeFox](typefox.io) and others.

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
- [x] textDocument/format
- [x] textDocument/hover
- [x] textDocument/rename
- [x] textDocument/references
- [x] textDocument/signatureHelp
- [x] workspace/symbol

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
$ typescript-language-server --help

  Usage: typescript-language-server [options]


  Options:

    -V, --version                         output the version number
    --stdio                               use stdio
    --node-ipc                            use node-ipc
    --socket <port>                       use socket. example: --socket=5000
    --tsserver-logFile <tsServerLogFile>  Specify a tsserver log file. example: --tsServerLogFile=ts-logs.txt
    --tsserver-path <path>                Specifiy absolute path to tsserver. example: --tsserver-path=/bin/tsserver
    -h, --help                            output usage information
```

# Development

### Build

```sh
yarn install
yarn build
yarn test
```

### Watch

```sh
yarn
yarn watch
```
