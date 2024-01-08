import { defineConfig } from 'rollup';
import terser from '@rollup/plugin-terser';
import resolve from '@rollup/plugin-node-resolve';
import commonJS from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import { rollupForceExit } from './rollup-exit-plugin.js';

export default defineConfig({
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
        resolve(),
        typescript(),
        rollupForceExit('rollup-build', 5),
    ],
});
