module.exports = {
    root: true,
    env: {
        es2022: true,
        node: true,
    },
    extends: 'eslint:recommended',
    parserOptions: {
        sourceType: 'module',
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
    },
    rules: {
        'array-bracket-spacing':  'error',
        'brace-style': 'error',
        'comma-dangle': ['error', 'always-multiline'],
        'comma-spacing': 'error',
        'computed-property-spacing': 'error',
        curly: 'error',
        'dot-notation': 'error',
        'eol-last': 'error',
        eqeqeq: 'error',
        'func-call-spacing': 'error',
        indent: [
            'error', 4, {
                SwitchCase: 1,
            },
        ],
        'keyword-spacing': 'error',
        'linebreak-style': 'error',
        'no-console': [
            'error', {
                allow: ['assert', 'warn', 'error'],
            },
        ],
        'no-constant-binary-expression': 'error',
        'no-constructor-return': 'error',
        'no-multi-spaces': ['error', { ignoreEOLComments: true }],
        'no-multiple-empty-lines': ['error', { max: 1 }],
        'no-tabs': 'error',
        'no-template-curly-in-string': 'error',
        'no-trailing-spaces': 'error',
        'no-var': 'error',
        'no-whitespace-before-property': 'error',
        'object-curly-spacing': ['error', 'always'],
        'one-var-declaration-per-line': ['error', 'always'],
        'prefer-const': 'error',
        'quote-props': ['error', 'as-needed'],
        quotes: ['error', 'single'],
        'padded-blocks': ['error', 'never'],
        semi: ['error', 'always'],
        'space-before-blocks': 'error',
        'space-before-function-paren': [
            'error', {
                anonymous: 'never',
                named: 'never',
            },
        ],
        'space-in-parens': 'error',
        'space-infix-ops': 'error',
    },
    overrides: [
        {
            files: ['*.ts'],
            extends: 'plugin:@typescript-eslint/recommended',
            rules: {
                // Disable base rules that have typescript equivalents.
                indent: 'off',
                'no-extra-parens': 'off',
                'no-extra-semi': 'off',
                quotes: 'off',
                semi: 'off',
                // TODO: Try to remove existing uses.
                // https://github.com/typescript-eslint/typescript-eslint/blob/master/packages/eslint-plugin/docs/rules/explicit-function-return-type.md
                '@typescript-eslint/explicit-function-return-type': [
                    'off', {
                        allowExpressions: true,
                    },
                ],
                '@typescript-eslint/explicit-module-boundary-types': [
                    'error', {
                        allowArgumentsExplicitlyTypedAsAny: true,
                    },
                ],
                '@typescript-eslint/indent': [
                    'error', 4, {
                        SwitchCase: 1,
                        FunctionDeclaration: { parameters: 'first' },
                        FunctionExpression: { parameters: 'first' },
                        CallExpression: { arguments: 'first' },
                    },
                ],
                '@typescript-eslint/member-delimiter-style': [
                    'error', {
                        singleline: {
                            delimiter: 'semi',
                            requireLast: true,
                        },
                    },
                ],
                '@typescript-eslint/no-empty-function': 'off',
                '@typescript-eslint/no-empty-interface': ['error', { allowSingleExtends: true }],
                '@typescript-eslint/no-explicit-any': 'off',
                '@typescript-eslint/no-extra-parens': 'error',
                '@typescript-eslint/no-extra-semi': 'error',
                // TODO: Investigate whether we can replace it with modern syntax.
                // https://github.com/typescript-eslint/typescript-eslint/blob/master/packages/eslint-plugin/docs/rules/no-namespace.md
                '@typescript-eslint/no-namespace': 'off',
                '@typescript-eslint/no-require-imports': 'error',
                '@typescript-eslint/no-unnecessary-qualifier': 'error',
                '@typescript-eslint/no-unused-vars': [
                    'error', {
                        argsIgnorePattern: '^_',
                        varsIgnorePattern: '^_',
                    },
                ],
                '@typescript-eslint/no-useless-constructor': 'error',
                // TODO: Try to remove existing uses.
                // https://github.com/typescript-eslint/typescript-eslint/blob/master/packages/eslint-plugin/docs/rules/no-non-null-assertion.md
                '@typescript-eslint/no-non-null-assertion': 'off',
                '@typescript-eslint/quotes': ['error', 'single', { avoidEscape: true, allowTemplateLiterals: false }],
                '@typescript-eslint/restrict-plus-operands': 'error',
                '@typescript-eslint/semi': ['error', 'always'],
            },
        },
    ],
};
