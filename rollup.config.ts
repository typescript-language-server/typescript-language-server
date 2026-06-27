import { defineConfig } from 'rollup';
import terserPlugin from '@rollup/plugin-terser';
import commonjsPlugin from '@rollup/plugin-commonjs';
import typescriptPlugin from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import { rollupForceExit } from './rollup-exit-plugin.js';

// These plugins ship CJS with a single unconditional `types` entry that nodenext resolves as a
// namespace (`{ default: fn }`), while at runtime the ESM build's default export is the plugin
// function itself. Cast the default import to its callable `.default` type so the config both
// type-checks and runs (the cast is a no-op at runtime; plugin options stay type-checked).
const terser = terserPlugin as unknown as typeof terserPlugin.default;
const commonJS = commonjsPlugin as unknown as typeof commonjsPlugin.default;
const typescript = typescriptPlugin as unknown as typeof typescriptPlugin.default;

export default defineConfig({
    // Fail the build on TypeScript diagnostics instead of only logging them as warnings.
    onwarn(warning, warn) {
        if (warning.plugin === 'typescript') {
            throw new Error(warning.message);
        }
        warn(warning);
    },
    input: 'src/cli.ts',
    output: [
        {
            banner: '#!/usr/bin/env node',
            file: 'lib/cli.mjs',
            format: 'es',
            generatedCode: 'es2015',
            plugins: [
                terser({
                    compress: false,
                    mangle: false,
                    format: { beautify: true, quote_style: 1, indent_level: 2 },
                }),
            ],
            sourcemap: true,
        },
    ],
    plugins: [
        commonJS(),
        nodeResolve({ exportConditions: ['node'] }),
        typescript(),
        rollupForceExit('rollup-build', 5),
    ],
});
