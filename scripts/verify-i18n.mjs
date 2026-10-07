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
assert(enKeys.filter((k) => k.startsWith('taxonomy.category.')).length === 10, '10 个能力类别均有翻译（含 C00 全局能力与 C09 工作评阅）')
// 技能条数从**分类树**取，不写死：写死的数字一旦随着"新增技能"被顺手 +1，
// 这个断言此后就不再证明任何东西（它只证明有人改过数字）。
const { SYSTEM_CATEGORIES } = await import(join(ROOT, 'src/research/taxonomy.ts'))
const skillLeaves = SYSTEM_CATEGORIES.filter((c) => c.id.includes('/')).map((c) => c.id.split('/').pop())
const translated = new Set(enKeys.filter((k) => k.startsWith('taxonomy.skill.')).map((k) => k.slice('taxonomy.skill.'.length)))
const missingTranslations = skillLeaves.filter((id) => !translated.has(id))
assert(
  missingTranslations.length === 0,
  `${skillLeaves.length} 个能力均有翻译${missingTranslations.length ? `：缺 ${missingTranslations.join(', ')}` : ''}`,
)
assert(
  [...translated].filter((id) => !skillLeaves.includes(id)).length === 0,
  '没有多余的技能翻译（分类树里已删的技能不该留下词条）',
)
assert(enKeys.filter((k) => k.startsWith('section.')).length === 7, '7 个可定制章节均有翻译（含 Prerequisites）')
for (const dimension of ['Problem', 'Knowledge', 'Innovation', 'Method', 'Experiment', 'Evidence']) {
  assert(`maturity.dimension.${dimension}` in en, `成熟度维度 ${dimension} 有翻译`)
}

console.log('\n[2] DSH 原生 locale 接入')
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const index = readFileSync(join(ROOT, 'src/client/index.tsx'), 'utf8')
// 会话 Tab 的注册项写在 ./convfusion-tab.ts（条件注册，见 verify-progress [9c]），一并统计
const convfusionTab = readFileSync(join(ROOT, 'src/client/convfusion-tab.ts'), 'utf8')
const slotSources = index + convfusionTab
assert(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-locale'), 'package 注入 dsh-client-locale')
// `locale` 必须留在硬依赖里（文案跟随语言）；`sessions` 是 2026-10 为会话 Tab 加的（见 verify-progress [9c]）
assert(/export const inject = \[[^\]]*'locale'[^\]]*\]/.test(index), '浏览器插件硬依赖 locale 服务')
assert(/ctx\.locale\.register\(CONVFUSION_LOCALE_NS, dictionaries\)/.test(index), '字典注册到独立 namespace')
assert(
  (slotSources.match(/locale: CONVFUSION_LOCALE_NS/g) ?? []).length === 2,
  '设置页与（两个）会话 Tab 的注册项都声明 Slot locale',
)
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
  // DSH 0.2.0：客户端服务由 `settingsScope.bind({namespace})` 改为 `configForms.get(entryId)`
  configForms: {
    get: () => ({
      getSnapshot: () => ({ status: 'ready' }),
      subscribe: () => () => {},
      set: async () => true,
      unset: async () => true,
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
assert(
  registrations.length === 1,
  'apply() 直接注册的只有设置页（两个会话 Tab 是条件注册：桩 ctx 没有会话服务 → 不注册，见 verify-progress [9c]）',
)
assert(registrations.every((entry) => entry.locale === 'convfusion'), '直接注册的 Slot 绑定 convfusion locale')

console.log('\n[4] UI 文案边界')
for (const rel of [
  'src/client/index.tsx',
  'src/client/settings.tsx',
  'src/client/progress-panel.tsx',
  'src/client/community-view.tsx',
  'src/client/convfusion-tab.ts',
]) {
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
