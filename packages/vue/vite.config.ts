import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import ts from 'typescript'
import { copyFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const CORE_SRC = resolve(__dirname, '../core/src')
const CORE_TYPES = resolve(__dirname, '.core-types')

// Keeps src/style.css in sync with the canonical core stylesheet and ships it as dist/style.css.
function syncStyle() {
  const local = resolve(__dirname, 'src/style.css')
  return {
    name: 'diff-text-sync-style',
    apply: 'build' as const,
    buildStart() {
      copyFileSync(resolve(CORE_SRC, 'style.css'), local)
    },
    closeBundle() {
      mkdirSync(resolve(__dirname, 'dist'), { recursive: true })
      copyFileSync(local, resolve(__dirname, 'dist/style.css'))
    },
  }
}

// @diff-text/core is private and bundled, and it ships TypeScript source. Emit its declarations
// into a cache dir; the dts plugin maps the import there and rolls them into dist/index.d.ts,
// so the published types never reference @diff-text/core.
function emitCoreTypes() {
  return {
    name: 'diff-text-core-types',
    apply: 'build' as const,
    // config() runs before any plugin's buildStart (those run in parallel), so the dts
    // plugin never type-checks against stale declarations from a previous build.
    config() {
      const program = ts.createProgram([resolve(CORE_SRC, 'index.ts')], {
        declaration: true,
        emitDeclarationOnly: true,
        outDir: CORE_TYPES,
        rootDir: CORE_SRC,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        strict: true,
        skipLibCheck: true,
        types: [],
      })
      const result = program.emit()
      const errors = ts.getPreEmitDiagnostics(program).concat(result.diagnostics)
      if (errors.length > 0) {
        throw new Error(ts.formatDiagnostics(errors, ts.createCompilerHost({})))
      }
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    emitCoreTypes(),
    dts({
      tsconfigPath: './tsconfig.json',
      rollupTypes: true,
      compilerOptions: {
        paths: { '@diff-text/core': [resolve(CORE_TYPES, 'index.d.ts')] },
      },
    }),
    syncStyle(),
  ],
  test: {
    environment: 'jsdom',
  },
  build: {
    lib: {
      // Could also be a dictionary or array of multiple entry points
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'VueDiffText',
      // the proper extensions will be added
      fileName: 'vue-diff-text',
    },
    rollupOptions: {
      // make sure to externalize deps that shouldn't be bundled
      // into your library
      external: ['vue'],
      output: {
        // Provide global variables to use in the UMD build
        // for externalized deps
        globals: {
          vue: 'Vue',
        },
      },
    },
  },
})
