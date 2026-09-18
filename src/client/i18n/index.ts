import { en } from './en.js'
import { zh } from './zh.js'

export const CONVFUSION_LOCALE_NS = 'convfusion'
export type MessageKey = keyof typeof en
export type TranslateParams = Record<string, unknown>
export type Translate = (key: string, params?: TranslateParams) => string

export const dictionaries = { zh, en }

/** English fallback for pure helpers and offline tests that run without DSH. */
export const translateEnglish: Translate = (key, params) => {
  const template = (en as Record<string, string>)[key] ?? key
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  )
}

/** DSH returns the key itself when a namespace has no matching entry. */
export function translateOr(t: Translate, key: string, fallback: string): string {
  const value = t(key)
  return value === key ? fallback : value
}

export function categoryText(t: Translate, categoryId: string, fallback: string): string {
  return translateOr(t, `taxonomy.category.${categoryId}`, fallback)
}

export function skillText(t: Translate, skillId: string, fallback: string): string {
  return translateOr(t, `taxonomy.skill.${skillId}`, fallback)
}

export function sectionText(t: Translate, section: string): string {
  return translateOr(t, `section.${section}`, section)
}

export function maturityDimensionText(t: Translate, dimension: string): string {
  return translateOr(t, `maturity.dimension.${dimension}`, dimension)
}

export function maturityLevelText(t: Translate, level: string): string {
  return translateOr(t, `maturity.level.${level}`, level)
}

export function progressCountText(t: Translate, key: string): string {
  return translateOr(t, `progress.count.${key}`, key)
}
