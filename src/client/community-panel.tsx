/**
 * ConvFusion 2.0 — 顶部「科V社区」按钮（图标 + 文字，+ 展开浮层）
 *
 * ## 它是什么
 *
 * 会话头部工具区里的一个入口：**ConvFusion 品牌标记 + 「科V社区」**，点开即显示
 * 【设置】-【ConvFusion】-【ConvFusion.com】这一页的**全部内容**。内容不是复制的 ——
 * 它直接渲染 `./settings.js` 里那一个 `CommunityTab`，因此两处**永远同一份实现**。
 *
 * ```text
 * conversation.session.header.utilities     （右对齐，order 升序 = 从左到右）
 *   ├─ open-in-app         order -10
 *   ├─ schedule-catalog    order  -5
 *   ├─ 本文件               order  -1   ← 图标 + 科V社区（品牌入口）
 *   └─ session-log-download order  0   ← 「…」（更多操作）
 * ```
 *
 * ## 为什么是 order -1（2026-10 用户要求：显示在「…」**之前**）
 *
 * 用户 2026-10 要求恢复这个顶部入口（品牌效果），位置是「…」**之前**。
 * 「…」是 `dsh-session-log-export` 的 `SessionLogDownloadHeaderAction`，它**没写 order**
 * ⇒ 取默认 0；官方另两个占用（open-in-app -10、schedule-catalog -5）都在它左边。
 * 所以取 **-1**：紧贴「…」左侧、又不越过官方那两个 —— 靠 order 排序，不靠 DOM 补丁。
 *
 * ⚠️ 别把它写成 order 21（v0.5.3 的旧值）：那会落到「…」**右边**，也就是这次要修的观感。
 *
 * ## 三条边界
 *
 * 1. **不抄内容、不抄状态**：`CommunityTab` 自给自足（自己读 `account/state`、
 *    自己联网验证），这里只给它一个容器；宿主状态传 `null` 只是省掉首屏闪烁。
 * 2. **不抢别人的槽位**：`list` 槽位是追加式，官方条目照常显示；
 *    浮层是本组件自己画的，不开模态、不拦截对话。
 * 3. **失败即静默**：定位/事件任何异常都不该影响会话页 —— 浮层拿不到位就隐藏，
 *    绝不留下一个"点不开的按钮"。
 *
 * ## 为什么是浮层而不是"打开设置页并跳到这一页"
 *
 * DSH 没有公开"打开设置面板并导航到某个 section"的客户端服务
 * （`settings.launcher` 的 `openSettings()` 是**单选槽位**、已被官方账号启动器占走），
 * 所以外部插件只能自己承载这一页的内容。浮层用 `position: fixed`：header 一类的祖先
 * 常有 `overflow: hidden`，`absolute` 会被裁掉。
 *
 * ## 与「科V社区」会话 Tab 的关系（两个入口，各司其职）
 *
 * Tab（`./community-view.js`，只在研究工作区出现）是"在这里工作"的入口；
 * 这个顶部按钮是**品牌入口**：任何会话、任何工作区都能看见它，点开就能登录 / 看研究网络。
 * 两者渲染的是同一个 `CommunityTab` —— 不存在两份实现。
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ConvFusionMark } from './icon.js'
import { CommunityTab, fetchSettingsSend } from './settings.js'
import type { Translate } from './i18n/index.js'

/**
 * 顶部入口在 `conversation.session.header.utilities` 里的排序键。
 *
 * 「…」（session-log-export，默认 order 0）之前、官方另两个（-10 / -5）之后。
 * 改这个数字前请读文件头的「为什么是 order -1」。
 */
export const COMMUNITY_BUTTON_ORDER = -1

interface ButtonProps {
  /** DSH Slot 标准注入（本按钮不按会话判定，保留以对齐槽位契约）。 */
  sessionId?: string
  /** DSH Slot 标准注入。 */
  t: Translate
}

/**
 * 会话头部的「科V社区」按钮。
 *
 * 与进展 tab 不同，它**不按工作区判定**：账号与研究网络在任何会话里都可能要用到，
 * 而它同时承担品牌露出的作用。
 */
export function ConvFusionComButton({ t }: ButtonProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const anchorRef = useRef<HTMLSpanElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  // 定位：从按钮的视口矩形算出 `fixed` 坐标（理由见文件头"为什么是浮层"）。
  const place = useCallback((): void => {
    const rect = anchorRef.current?.getBoundingClientRect()
    if (!rect) return
    setPos({ top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) })
  }, [])

  useLayoutEffect(() => {
    if (open) place()
  }, [open, place])

  // 打开态：窗口尺寸/滚动重算位置；点外部或 Esc 关闭。
  useEffect(() => {
    if (!open) return undefined
    const onMove = (): void => place()
    const onDown = (event: PointerEvent): void => {
      const target = event.target as Node | null
      if (!target) return
      if (anchorRef.current?.contains(target) === true) return
      if (panelRef.current?.contains(target) === true) return
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, place])

  /**
   * 入口名与设置页那一页的标题**故意用两个 key**。
   *
   * 用户 2026-09 拍板：顶部入口叫「科V社区」（英文界面仍是 ConvFusion.com），
   * 而【设置】-【ConvFusion】-【ConvFusion.com】那一页的名字**不动**。
   * 共用一个 key 就会连带把设置页里那张卡片的标题也改掉 —— 那是没被要求的改动。
   */
  const entryLabel = t('community.entry.label')
  const title = t('community.button.title')

  return (
    <span
      ref={anchorRef}
      style={{ display: 'inline-flex', alignItems: 'center' }}
      data-convfusion-community-button="1"
    >
      <button
        type="button"
        aria-label={title}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={title}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '5px',
          height: '24px',
          border: 'none',
          borderRadius: '6px',
          background: open || hover ? 'var(--dsw-alias-interactive-bg-hover, rgba(15,17,21,0.06))' : 'transparent',
          color: 'inherit',
          cursor: 'pointer',
          padding: '0 6px',
          font: 'inherit',
          lineHeight: 1,
        }}
      >
        <ConvFusionMark size={14} />
        <span style={{ fontSize: '12px', letterSpacing: '0.01em' }}>{entryLabel}</span>
      </button>

      {open ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={entryLabel}
          data-convfusion-community-panel="1"
          style={{
            position: 'fixed',
            top: pos?.top ?? 0,
            right: pos?.right ?? 12,
            visibility: pos ? 'visible' : 'hidden',
            zIndex: 2147483000,
            display: 'flex',
            flexDirection: 'column',
            width: 'min(720px, calc(100vw - 24px))',
            maxHeight: '78vh',
            // ⚠️ 面板是**自己画的浮层**：必须显式给出浅色底与文字色。写错 token 名
            // 会静默落到兜底值（2026-09 实测：面板因此变成深色）。
            background: 'var(--dsw-alias-bg-layer-2, #ffffff)',
            color: 'var(--dsw-alias-label-primary, #0f1115)',
            border: '1px solid var(--dsw-alias-border-l2, rgba(15,17,21,0.10))',
            borderRadius: '10px',
            boxShadow: '0 8px 24px rgba(15,17,21,0.12), 0 2px 6px rgba(15,17,21,0.06)',
            fontSize: '12.5px',
            lineHeight: 1.6,
            textAlign: 'left',
            overflow: 'hidden',
          }}
        >
          {/* 标题行固定，内容滚动 —— 页面很长（账号 / 服务器 / 研究工作 / 指导中）。 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '9px 14px',
              borderBottom: '1px solid var(--dsw-alias-border-l1, rgba(15,17,21,0.08))',
              flex: '0 0 auto',
            }}
          >
            <ConvFusionMark size={16} />
            <strong>{entryLabel}</strong>
            <span style={{ marginLeft: 'auto', display: 'inline-flex' }}>
              <button
                type="button"
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'inherit',
                  cursor: 'pointer',
                  padding: '0 4px',
                  borderRadius: '4px',
                  font: 'inherit',
                  lineHeight: 1,
                }}
                aria-label={t('community.action.close')}
                title={t('community.action.close')}
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </span>
          </div>

          <div style={{ padding: '12px 14px 14px', overflowY: 'auto', flex: '1 1 auto' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* `initial` 传 null：这一页自己会读宿主状态，无需先加载设置页的 state。 */}
              <CommunityTab send={fetchSettingsSend} initial={null} t={t} />
            </div>
          </div>
        </div>
      ) : null}
    </span>
  )
}
