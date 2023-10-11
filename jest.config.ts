import type { Config } from 'jest';

const config: Config = {
    preset: 'ts-jest/presets/default-esm',
    moduleNameMapper: {
        // Typescript expects ".js" extension with Node16 even when imported file has ".ts" extension. Jest can't handle that.
        '(.*)\\.js': '$1',
    },
    slowTestThreshold: 15,
    testTimeout: 20000,
    transform: {
        '^.+\\.tsx?$': [
            'ts-jest',
            {
                useESM: true,
            },
        ],
    },
    testEnvironment: 'node',
    testMatch: ['**/src/**/?(*.)+(spec|test).[jt]s?(x)'],
    verbose: true,
};

export default config;
