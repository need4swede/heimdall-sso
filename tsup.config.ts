import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        'server/index': 'src/server/index.ts',
        'client/index': 'src/client/index.ts',
        'database/index': 'src/database/index.ts',
    },
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    external: ['react', 'react-dom', 'express'],
    treeshake: true,
    minify: false,
    target: 'es2020',
    platform: 'node',
    esbuildOptions(options) {
        options.jsx = 'automatic';
    },
});
