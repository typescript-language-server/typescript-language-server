module.exports = {
    extends: '../.eslintrc.cjs',
    parserOptions: {
        sourceType: 'module',
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
    },
};
