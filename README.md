# TypeScript Language Server

Language Server Protocol implementation for TypeScript wrapping `tsserver`

This is a fork of the project **[typescript-language-server](https://github.com/theia-ide/typescript-language-server)** maintained by [TypeFox](https://typefox.io).

# Supported Protocol features

-   [x] textDocument/didChange (incremental)
-   [x] textDocument/didClose
-   [x] textDocument/didOpen
-   [x] textDocument/didSave

-   [x] textDocument/codeAction
-   [x] textDocument/completion (incl. completion/resolve)
-   [x] textDocument/definition
-   [x] textDocument/documentHighlight
-   [x] textDocument/documentSymbol
-   [x] textDocument/executeCommand
-   [x] textDocument/format
-   [x] textDocument/hover
-   [x] textDocument/rename
-   [x] textDocument/references
-   [x] textDocument/signatureHelp
-   [x] workspace/symbol

# dev

```sh
npm install
```

# Running the language server

```
node lib/cli.js --stdio
```

## Options

```
  node lib/cli.js [options]

  Options:

    -V, --version                          output the version number
    --stdio                                use stdio
    --node-ipc                             use node-ipc
    --log-level <log-level>                A number indicating the log level:
                                            (4 = log, 3 = info, 2 = warn, 1 = error). Defaults to `2`.
    --socket <port>                        use socket. example: --socket=5000
    --tsserver-log-file <tsServerLogFile>  Specify a tsserver log file. example: --tsserver-log-file=ts-logs.txt
    --tsserver-log-verbosity <verbosity>   Specify tsserver log verbosity:
    				            (terse, normal, verbose). Defaults to `normal`. example: --tsserver-log-verbosity=verbose
    --tsserver-path <path>                 Specify path to tsserver. example: --tsserver-path=tsserver
    -h, --help                             output usage information
```

```sh
npm run compile
```
