import * as esbuild from 'esbuild'

await esbuild.build({
    entryPoints: ['src/index_github.js'],
    bundle: true,
    outfile: 'dist/index.js',
    format: "esm",
    target: "esnext",
    platform: "node",
    loader: {".node" : 'copy'},
    banner:{
        js: `
        import { fileURLToPath as __fileURLToPath } from 'url';
        import { createRequire as topLevelCreateRequire } from 'module';
        const require = topLevelCreateRequire(import.meta.url);
        const __filename = __fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        `
    },
})
