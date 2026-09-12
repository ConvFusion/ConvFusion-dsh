/**
 * ConvFusion 2.0 — 设置页图标
 *
 * 用 ConvFusion 自己的品牌图形（来源 `ConvFusion-dev/web/public/favicon.svg`）。
 *
 * 为什么是 `assets/favicon.svg` 的**副本**、而不是去读那个仓库路径：插件必须自包含
 * （`files: ["lib", ...]` 决定发布出去只有这些），运行期不能依赖另一个仓库存在。
 * 副本在构建期由 esbuild 以 `dataurl` 内联进 `lib/client.js` —— 客户端 bundle 只能
 * 是一个自包含单文件，不能发外部资源请求。
 */

import logoUrl from '../../assets/favicon.svg'

/** ConvFusion 品牌标记。 */
export function ConvFusionMark({ size = 38 }: { size?: number }): JSX.Element {
  return (
    <img
      src={logoUrl}
      width={size}
      height={size}
      alt="ConvFusion"
      style={{ display: 'block', width: size, height: size }}
    />
  )
}
