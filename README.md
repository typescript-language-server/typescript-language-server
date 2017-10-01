# TypeScript LSP
[Language Server Protocol](https://github.com/Microsoft/language-server-protocol) implementation for TypeScript wrapping `tsserver`.

[![https://nodei.co/npm/typescript-lsp.png?downloads=true&downloadRank=true&stars=true](https://nodei.co/npm/typescript-lsp.png?downloads=true&downloadRank=true&stars=true)](https://www.npmjs.com/package/typescript-lsp)

Based on concepts and ideas from https://github.com/prabirshrestha/typescript-language-server.

# Supported Protocol features

* textDocument/didChange (incremental)
* textDocument/didClose
* textDocument/didOpen
* textDocument/didSave

* textDocument/completion (incl. completion/resolve)
* textDocument/definition
* textDocument/documentSymbol
* textDocument/format
* textDocument/hover
* textDocument/rename
* textDocument/references
* textDocument/signatureHelp
* textDocument/codeAction
* textDocument/executeCommand
* workspace/symbol

# Installing

```sh
npm install -g typescript-lsp
```

# Running the language server

```
typescript-lsp --stdio
```

## Options

```
$ typescript-lsp --help

  Usage: typescript-lsp [options]


  Options:

    -V, --version           output the version number
    --stdio                 use stdio
    --node-ipc              use node-ipc
    --socket <port>         use socket. example: --socket=5000
    --tsserver-path <path>  absolute path to tsserver. example: --tsserver-path=/bin/tsserver
    --tsserver-logFile <logFile>     Specify a log file. example: --tsserver-logFile=logs.txt
    -h, --help              output usage information
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
