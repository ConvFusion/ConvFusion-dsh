/**
 * ConvFusion 2.0 — Markdown 子集**渲染**（React 元素，不用 HTML 字符串）
 *
 * 解析在 `./markdown.js`（纯函数，可离线断言）；这里只把 token 变成元素。
 * 因此源码里的 HTML 标签永远是文字，**不存在注入**，也不需要 sanitizer。
 *
 * 版面目标：挤在【可指导】的一行里也读得下去 —— 表格能横向滚动、代码块缩到 11px、
 * 引用用左边线、列表缩进 16px。
 */

import * as React from 'react'
import { parseInline, parseMarkdownBlocks, type MdBlock, type MdInline } from './markdown.js'

/** 行内 token → 元素。 */
function inline(tokens: MdInline[]): React.ReactNode[] {
  return tokens.map((tk, i) => {
    switch (tk.kind) {
      case 'bold':
        return (
          <strong key={i} style={{ fontWeight: 650 }}>
            {tk.text}
          </strong>
        )
      case 'italic':
        return (
          <em key={i} style={{ fontStyle: 'italic' }}>
            {tk.text}
          </em>
        )
      case 'strike':
        return (
          <span key={i} style={{ textDecoration: 'line-through', opacity: 0.75 }}>
            {tk.text}
          </span>
        )
      case 'code':
        return (
          <code
            key={i}
            style={{
              fontFamily: 'var(--dsw-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
              fontSize: 11,
              padding: '1px 4px',
              borderRadius: 4,
              background: 'var(--dsw-alias-bg-layer-3)',
            }}
          >
            {tk.text}
          </code>
        )
      case 'link':
        return (
          <a
            key={i}
            href={tk.href}
            target="_blank"
            rel="noreferrer noopener"
            style={{ color: 'var(--dsw-alias-state-business-primary)', textDecoration: 'underline' }}
          >
            {tk.text}
          </a>
        )
      default:
        return <React.Fragment key={i}>{tk.text}</React.Fragment>
    }
  })
}

/** 一段（可含换行）的行内文本。 */
function Inline({ text }: { text: string }): JSX.Element {
  return <>{inline(parseInline(text))}</>
}

function Block({ block }: { block: MdBlock }): JSX.Element {
  switch (block.kind) {
    case 'heading':
      return (
        <div
          style={{
            fontWeight: 700,
            fontSize: block.level <= 2 ? 13 : 12.5,
            margin: '4px 0 2px',
          }}
        >
          <Inline text={block.text} />
        </div>
      )
    case 'code':
      return (
        <pre
          style={{
            margin: '4px 0',
            padding: '6px 8px',
            borderRadius: 6,
            overflowX: 'auto',
            background: 'var(--dsw-alias-bg-layer-3)',
            fontFamily: 'var(--dsw-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
            fontSize: 11,
            lineHeight: 1.5,
          }}
        >
          {block.text}
        </pre>
      )
    case 'quote':
      return (
        <div
          style={{
            margin: '4px 0',
            paddingLeft: 8,
            borderLeft: '2px solid var(--dsw-alias-border-l2)',
            color: 'var(--dsw-alias-label-secondary)',
          }}
        >
          <Inline text={block.text} />
        </div>
      )
    case 'list': {
      const items = block.items.map((it, i) => (
        <li key={i} style={{ margin: '1px 0' }}>
          <Inline text={it} />
        </li>
      ))
      return block.ordered ? (
        <ol style={{ margin: '3px 0', paddingLeft: 20 }}>{items}</ol>
      ) : (
        <ul style={{ margin: '3px 0', paddingLeft: 18 }}>{items}</ul>
      )
    }
    case 'table':
      return (
        <div style={{ margin: '4px 0', overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 11.5 }}>
            <thead>
              <tr>
                {block.head.map((cell, i) => (
                  <th
                    key={i}
                    style={{
                      textAlign: 'left',
                      fontWeight: 650,
                      padding: '2px 6px',
                      border: '1px solid var(--dsw-alias-border-l1)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <Inline text={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td
                      key={c}
                      style={{
                        padding: '2px 6px',
                        border: '1px solid var(--dsw-alias-border-l1)',
                        verticalAlign: 'top',
                      }}
                    >
                      <Inline text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case 'hr':
      return (
        <hr
          style={{
            margin: '6px 0',
            border: 0,
            borderTop: '1px solid var(--dsw-alias-border-l1)',
          }}
        />
      )
    default:
      return (
        <div style={{ margin: '2px 0', whiteSpace: 'pre-wrap' }}>
          <Inline text={block.text} />
        </div>
      )
  }
}

/** 渲染一段 Markdown 正文（空文本渲染成空）。 */
export function Markdown({ text }: { text: string | null | undefined }): JSX.Element | null {
  if (!text || text.trim() === '') return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      {parseMarkdownBlocks(text).map((b, i) => (
        <Block key={i} block={b} />
      ))}
    </div>
  )
}
