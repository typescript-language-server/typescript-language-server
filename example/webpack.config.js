/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
// @ts-check
const path = require('path');
const fs = require('fs');
const lib = path.resolve(__dirname, "lib");

fs.writeFileSync(path.resolve(lib, "index.html"), `<!DOCTYPE html>
<html>

<head>
	<meta http-equiv="X-UA-Compatible" content="IE=edge" />
	<meta http-equiv="Content-Type" content="text/html;charset=utf-8">
</head>

<body>
	<script>
        window.rootUri = "file://${path.resolve(__dirname, '../server/test-data')}";
    </script>
	<h2>TypeScript Language Server</h2>
	<div id="container" style="width:800px;height:600px;border:1px solid grey"></div>
    <script src="main.bundle.js"></script>
</html>
`, { encoding: 'utf-8' });

module.exports = {
    entry: {
        "main": path.resolve(lib, "main.js"),
        "editor.worker": 'monaco-editor-core/esm/vs/editor/editor.worker.js'
    },
    output: {
        filename: '[name].bundle.js',
        path: lib
    },
    module: {
        rules: [{
            test: /\.css$/,
            use: ['style-loader', 'css-loader']
        },
        {
            test: /\\.js$/,
            enforce: 'pre',
            loader: 'source-map-loader'
        }]
    },
    devtool: 'source-map',
    target: 'web',
    node: {
        fs: 'empty',
        child_process: 'empty',
        net: 'empty',
        crypto: 'empty'
    },
    resolve: {
        alias: {
            'vscode': require.resolve('monaco-languageclient/lib/vscode-compatibility')
        }
    }
};