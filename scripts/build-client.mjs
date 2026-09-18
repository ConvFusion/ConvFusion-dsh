#!/usr/bin/env node
/**
 * Build the ConvFusion browser half into the DSH client-bundle format.
 *
 *   window.__ModuleLoader__.load({ id, factory: (require) => { ... } })
 *
 * `react` / `react/jsx-runtime` / `@deepseek-ai/*` stay external — the web shell
 * provides them as platform modules. Nothing else is external: the settings page
 * must be a single self-contained file so the shell can serve it without a
 * resolver for our own submodules.
 *
 * Usage:  node scripts/build-client.mjs   (also run by `npm run build:client`)
 */
import { build } from 'esbuild'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const id = pkg.name

// 宿主协议版本：单一事实来源在 src/protocol.ts，这里读出来内联进 bundle。
// 读不到就直接失败 —— 一个"悄悄用了 0"的协议号会让陈旧检测失效。
const protocolSrc = readFileSync(join(root, 'src', 'protocol.ts'), 'utf8')
const protocol = /HOST_PROTOCOL\s*=\s*(\d+)/.exec(protocolSrc)?.[1]
if (!protocol) {
  console.error('build-client: 无法从 src/protocol.ts 读取 HOST_PROTOCOL')
  process.exit(1)
}

const result = await build({
  entryPoints: [join(root, 'src/client/index.tsx')],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  // 官方客户端 bundle 就是原文 UTF-8。esbuild 默认 charset:'ascii' 会把中文转成
  // \uXXXX —— 功能一样，但产物不可读，也让"文案是否进入产物"这类断言没法写。
  charset: 'utf8',
  define: { __HOST_PROTOCOL__: protocol },
  external: ['react', 'react/jsx-runtime', 'react-dom', '@deepseek-ai/*'],
  // 品牌图形内联成 data URI：bundle 必须自包含，不能有外部资源请求
  loader: { '.svg': 'dataurl' },
  write: false,
  sourcemap: false,
  logLevel: 'warning',
})

const code = result.outputFiles[0].text
const bundle = [
  'window.__ModuleLoader__.load({',
  `\tid: ${JSON.stringify(id)},`,
  '\tfactory: (require) => {',
  '\t\tvar module = { exports: {} };',
  '\t\tvar exports = module.exports;',
  '\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });',
  code
    .trim()
    .split('\n')
    .map((line) => (line.length > 0 ? `\t\t${line}` : ''))
    .join('\n'),
  '\t\treturn module.exports;',
  '\t}',
  '});',
  '',
].join('\n')

mkdirSync(join(root, 'lib'), { recursive: true })
writeFileSync(join(root, 'lib/client.js'), bundle)
console.log(
  `client bundle -> lib/client.js (${(bundle.length / 1024).toFixed(1)} KiB, host protocol ${protocol})`,
)
