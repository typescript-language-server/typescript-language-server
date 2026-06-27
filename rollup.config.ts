import { defineConfig } from 'rollup';
import terserPlugin from '@rollup/plugin-terser';
import commonjsPlugin from '@rollup/plugin-commonjs';
import typescriptPlugin from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import { rollupForceExit } from './rollup-exit-plugin.js';

// These plugins ship CJS with a single unconditional `types` entry that nodenext resolves as a
// namespace (`{ default: fn }`), so `tsc` types the default import as the namespace rather than the
// callable function. At runtime the ESM build's default export is the function itself (no `.default`).
// `fn.default ?? fn` reconciles both: it picks the callable in either shape, type-checks (the result
// is the function type, with options still checked), and stays plain JS so rollup's config loader can
// parse this file on any Node version — a TS-only cast here breaks the loader on Node without type
// stripping.
const terser = terserPlugin.default ?? terserPlugin;
const commonJS = commonjsPlugin.default ?? commonjsPlugin;
const typescript = typescriptPlugin.default ?? typescriptPlugin;

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
