/**
 * 构建期资源声明。
 *
 * esbuild 用 `dataurl` loader 把 `.svg` 变成 data URI 字符串（客户端 bundle 只能
 * 是自包含单文件，不能有外部资源请求），所以这里声明的类型是 `string`。
 */
declare module '*.svg' {
  const dataUrl: string
  export default dataUrl
}

/**
 * 宿主协议版本，由 `scripts/build-client.mjs` 从 `src/protocol.ts` 读出后
 * 在构建期注入（esbuild `define`）。
 *
 * 刻意**不用** import：`src/protocol.ts` 在客户端 tsconfig 的 rootDir 之外，
 * 而且 bundle 本来就该内联这个数字 —— 这样"宿主内存中的值 vs 客户端内联的值"
 * 才有可比性（见 `src/protocol.ts` 的说明）。
 */
declare const __HOST_PROTOCOL__: number
