import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        coverage: {
            provider: 'v8',
            reporter: 'text',
        },
        testTimeout: 20000,
    },
});
