import { defineConfig } from 'rollup';
import terser from '@rollup/plugin-terser';
import resolve from '@rollup/plugin-node-resolve';
import commonJS from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';

export default defineConfig({
    input: 'src/cli.ts',
    output: [
        {
            banner: '#!/usr/bin/env node',
            file: 'lib/cli.mjs',
            format: 'es',
            generatedCode: 'es2015',
            plugins: [
                terser(),
            ],
            sourcemap: true,
        },
    ],
    plugins: [
        commonJS(),
        resolve(),
        typescript(),
    ],
});
