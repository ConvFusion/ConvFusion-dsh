/**
 * ConvFusion v0.5.6 — Research IR Kernel 出口
 *
 * 对应规格 `dev-notes/v0.5.6-ResearchIR.md`。模块分工：
 *
 * | 模块 | 角色 | 规格 |
 * |---|---|---|
 * | `types.ts` | Typed IR 核心对象（canonical representation） | §3 / §4 / §9 |
 * | `policy.ts` | Research Decision Policy（决策边界） | §7 |
 * | `validate.ts` | Structural(R0xx) + Scientific(R1xx) 校验与 Repair | §8.1 / §8.2 / §16 |
 * | `delta.ts` | IR Delta 增量变更 | §17 |
 * | `store.ts` | 持久化 / 修订版本 / State Object / Trace | §9 / §10 / §18 |
 * | `transition.ts` | Transition(R2xx) + Evidence satisfies/coverage | §8.3 / §11 |
 */

export * from './types.js'
export * from './policy.js'
export * from './validate.js'
export * from './delta.js'
export * from './store.js'
export * from './transition.js'
