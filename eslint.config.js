import eslint from '@eslint/js';
import globals from 'globals';
import tsEslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin';
import vitest from '@vitest/eslint-plugin';

export default tsEslint.config([
    eslint.configs.recommended,
    tsEslint.configs.recommendedTypeChecked,
    {
        languageOptions: {
            ecmaVersion: 2022,
            globals: globals.node,
            parserOptions: {
                projectService: true,
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
    {
        plugins: {
            '@stylistic': stylistic,
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
            '@stylistic/quotes': ['error', 'single'],
            'padded-blocks': ['error', 'never'],
            '@stylistic/semi': ['error', 'always'],
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
    },
    {
        files: ['**/*.ts'],
        rules: {
            '@stylistic/indent': [
                'error', 4, {
                    SwitchCase: 1,
                    FunctionDeclaration: { parameters: 'first' },
                    FunctionExpression: { parameters: 'first' },
                    CallExpression: { arguments: 'first' },
                },
            ],
            '@stylistic/member-delimiter-style': [
                'error', {
                    singleline: {
                        delimiter: 'semi',
                        requireLast: true,
                    },
                },
            ],
            '@stylistic/no-extra-parens': 'error',
            '@stylistic/no-extra-semi': 'error',
            '@stylistic/quotes': ['error', 'single', { avoidEscape: true, allowTemplateLiterals: 'never' }],
            '@stylistic/semi': ['error', 'always'],
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
            '@typescript-eslint/no-empty-function': 'off',
            '@typescript-eslint/no-empty-interface': ['error', { allowSingleExtends: true }],
            '@typescript-eslint/no-explicit-any': 'off',
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
            '@typescript-eslint/restrict-plus-operands': 'error',
        },
    },
    {
        files: ['tests/**'],
        plugins: {
            vitest,
        },
        rules: {
            ...vitest.configs.all.rules,
            'vitest/max-expects': 'off',
            'vitest/no-conditional-in-test': 'off',
            'vitest/no-conditional-tests': 'off',
            'vitest/no-hooks': 'off',
            'vitest/prefer-expect-assertions': 'off',
            'vitest/require-top-level-describe': 'off',
        },
    },
]);
