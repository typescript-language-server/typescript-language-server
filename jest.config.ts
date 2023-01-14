import type { Config } from 'jest';

const config: Config = {
    preset: 'ts-jest/presets/default-esm',
    moduleNameMapper: {
        // Typescript expects ".js" extension with Node16 even when imported file has ".ts" extension. Jest can't handle that.
        '(.*)\\.js': '$1',
        // vscode-uri has buggy exports: https://github.com/microsoft/vscode-uri/pull/25
        'vscode-uri': 'vscode-uri/lib/esm/index.js',
    },
    slowTestThreshold: 15,
    testTimeout: 20000,
    transform: {
        // transpile vscode-uri as we're redirecting to esm imports but the package has no "type": "module" set.
        '^.+vscode-uri.+.js$': 'babel-jest',
        '^.+\\.tsx?$': [
            'ts-jest',
            {
                useESM: true,
            },
        ],
    },
    transformIgnorePatterns: [
        '/node_modules/(?!(vscode-uri)/)',
    ],
    testEnvironment: 'node',
    testMatch: ['**/src/**/?(*.)+(spec|test).[jt]s?(x)'],
    verbose: true,
};

export default config;
