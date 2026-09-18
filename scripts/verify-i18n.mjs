#!/usr/bin/env node
/** ConvFusion browser i18n regression checks (no network, no running DSH required). */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import process from 'node:process'
import ts from 'typescript'

const ROOT = resolve(process.argv[2] || '.')
const { en } = await import(join(ROOT, 'src/client/i18n/en.ts'))
const { zh } = await import(join(ROOT, 'src/client/i18n/zh.ts'))

let passed = 0
let failed = 0
const failures = []
function assert(condition, label) {
  if (condition) {
    passed++
    console.log(`  ✓ ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  ✗ FAIL ${label}`)
  }
}

function placeholders(text) {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
}

console.log('\n[1] 字典完整性')
const enKeys = Object.keys(en).sort()
const zhKeys = Object.keys(zh).sort()
assert(JSON.stringify(enKeys) === JSON.stringify(zhKeys), `中英 Key 完全一致（${enKeys.length}）`)
const placeholderMismatches = enKeys.filter(
  (key) => JSON.stringify(placeholders(en[key])) !== JSON.stringify(placeholders(zh[key])),
)
assert(
  placeholderMismatches.length === 0,
  `全部插值参数一致${placeholderMismatches.length ? `：${placeholderMismatches.join(', ')}` : ''}`,
)
assert(enKeys.filter((k) => k.startsWith('taxonomy.category.')).length === 9, '9 个能力类别均有翻译')
assert(enKeys.filter((k) => k.startsWith('taxonomy.skill.')).length === 50, '50 个能力均有翻译')
assert(enKeys.filter((k) => k.startsWith('section.')).length === 6, '6 个可定制章节均有翻译')
for (const dimension of ['Problem', 'Knowledge', 'Innovation', 'Method', 'Experiment', 'Evidence']) {
  assert(`maturity.dimension.${dimension}` in en, `成熟度维度 ${dimension} 有翻译`)
}

console.log('\n[2] DSH 原生 locale 接入')
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const index = readFileSync(join(ROOT, 'src/client/index.tsx'), 'utf8')
assert(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-locale'), 'package 注入 dsh-client-locale')
assert(/\['slots', 'settingsScope', 'locale'\]/.test(index), '浏览器插件硬依赖 locale 服务')
assert(/ctx\.locale\.register\(CONVFUSION_LOCALE_NS, dictionaries\)/.test(index), '字典注册到独立 namespace')
assert((index.match(/locale: CONVFUSION_LOCALE_NS/g) ?? []).length === 2, '设置页与进展按钮都声明 Slot locale')
assert(!/navigator\.language|localStorage/.test(index), '没有自建浏览器语言状态')

console.log('\n[3] 客户端 bundle 原生装配')
let captured = null
const bundle = readFileSync(join(ROOT, 'lib/client.js'), 'utf8')
new Function('window', bundle)({ __ModuleLoader__: { load: (module) => { captured = module } } })
const client = captured.factory(createRequire(import.meta.url))
const registrations = []
let registeredNamespace = ''
let registeredDictionaries = null
const ctx = {
  locale: {
    register: (namespace, dicts) => {
      registeredNamespace = namespace
      registeredDictionaries = dicts
      return () => {}
    },
    bind: () => (key, params) => {
      const template = registeredDictionaries?.en?.[key] ?? key
      return params
        ? template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match))
        : template
    },
  },
  settingsScope: {
    bind: () => ({
      getSnapshot: () => ({ status: 'ready' }),
      subscribe: () => () => {},
      set: async () => {},
      unset: async () => {},
    }),
  },
  slots: {
    inject: (_key, callback) => callback(),
    register: (options) => {
      registrations.push(options)
      return () => {}
    },
  },
  effect: (callback) => callback(),
  get: () => undefined,
}
client.apply(ctx)
assert(registeredNamespace === 'convfusion', 'apply() 实际注册 convfusion namespace')
assert(registeredDictionaries?.zh && registeredDictionaries?.en, 'apply() 实际注册中英字典')
assert(registrations.length === 2, 'apply() 实际注册设置页与进展按钮两个 Slot')
assert(registrations.every((entry) => entry.locale === 'convfusion'), '两个 Slot 实际绑定 convfusion locale')

console.log('\n[4] UI 文案边界')
for (const rel of ['src/client/index.tsx', 'src/client/settings.tsx', 'src/client/progress-panel.tsx']) {
  const source = readFileSync(join(ROOT, rel), 'utf8')
  const sf = ts.createSourceFile(rel, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const literals = []
  const visit = (node) => {
    if ((ts.isStringLiteralLike(node) || ts.isJsxText(node)) && /\p{Script=Han}/u.test(node.text)) {
      const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf))
      literals.push(`${pos.line + 1}:${node.text.trim().slice(0, 60)}`)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  assert(literals.length === 0, `${rel} 无硬编码中文 UI 字符串${literals.length ? `：${literals.join(', ')}` : ''}`)
}

console.log(`\n${failed === 0 ? '✅' : '❌'} i18n: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('failures:\n' + failures.map((f) => `  - ${f}`).join('\n'))
  process.exitCode = 1
}
