/**
 * ConvFusion 2.0 — Harness Runtime 事件桥（Stage 1）
 *
 * ## 它实现 v2-Stage1 的哪一条
 *
 * §14 ConvFusion 应该 **Observe + enrich + react**，而不是取代 Harness Runtime
 * §25E 能够观察 Harness 原生 Agent / Turn / Step / Tool / Message 事件，
 *      并把**科研相关**事件反馈给 ConvFusion
 *
 * ## 关键约束：这不是第二套事件流，也不是第二套 UI（§12 / §27）
 *
 * 本模块**只观察**：订阅 Harness 自己发出的 `agent/*` 事件，转换成 ConvFusion
 * 内部的科研活动记录，供 Stage 4（Evidence / Research State）消费。
 *
 * 它**不**：
 *   - 向会话日志写 UI 事件（旧实现的 `convfusion/node`、`convfusion/<module>-run` 已删除）；
 *   - 复制 / 伪造 native 事件；
 *   - 渲染任何东西 —— Harness 的原生 UI 自己渲染（§13）。
 *
 * 已核实的 Harness 原生事件（`@deepseek-ai/dsh-agent` runtime-types）：
 *
 *   agent/created · agent/disposed · agent/status
 *   agent/session-start
 *   agent/pre-step        （waterfall：含 agent/messages/turn/step）
 *   agent/request         （waterfall：模型调用配置）
 *   agent/request-error   （waterfall）
 *   agent/assistant-stream（emit：start/chunk/end 帧）
 *   agent/turn-stopping   （serial：turn 即将收尾）
 *   agent/error
 *
 * Stage 1 只建立**可靠的事件桥接机制**（§15），Event → Evidence 的语义化留给 Stage 4。
 */
/**
 * 挂载事件桥：订阅 Harness 原生 agent 事件并记录为科研活动。
 *
 * @returns `{ bridge, dispose }` —— dispose 由插件入口按 Cordis effect 管理。
 */
export function mountEventBridge(ctx, options = {}) {
    const capacity = options.capacity && options.capacity > 0 ? options.capacity : 200;
    const buffer = [];
    const counts = {};
    const push = (a) => {
        counts[a.kind] = (counts[a.kind] ?? 0) + 1;
        buffer.push(a);
        if (buffer.length > capacity)
            buffer.splice(0, buffer.length - capacity);
    };
    const now = () => new Date().toISOString();
    const sid = (p) => {
        const id = p.agent?.session?.id;
        return id == null ? undefined : String(id);
    };
    const disposers = [];
    // ── turn 生命周期 ─────────────────────────────────────────────────────
    // Harness 没有独立 'turn/start' 事件；`agent/pre-step` 的 (turn, step) 是
    // 权威的步骤起点，首个 step=1 视为 turn 开始。
    disposers.push(ctx.on('agent/pre-step', (payload, next) => {
        const p = payload;
        const isTurnStart = p.step === 1 || p.step === undefined;
        push({
            kind: isTurnStart ? 'turn-started' : 'step-started',
            at: now(),
            ...(sid(p) ? { sessionId: sid(p) } : {}),
            ...(typeof p.turn === 'number' ? { turn: p.turn } : {}),
            ...(typeof p.step === 'number' ? { step: p.step } : {}),
            detail: `turn ${String(p.turn ?? '?')} step ${String(p.step ?? '?')}`,
        });
        // ⚠️ 必须调用 next() —— 这是 waterfall，不调用会阻断 Agent 运行。
        return next();
    }));
    // ── 模型请求（waterfall；同样必须放行）────────────────────────────────
    disposers.push(ctx.on('agent/request', (payload, next) => {
        const p = payload;
        push({
            kind: 'model-request',
            at: now(),
            ...(sid(p) ? { sessionId: sid(p) } : {}),
            ...(typeof p.turn === 'number' ? { turn: p.turn } : {}),
            ...(typeof p.step === 'number' ? { step: p.step } : {}),
        });
        return next();
    }));
    // ── 流式帧（emit；默认不记录，只计数以证明桥在工作）──────────────────
    disposers.push(ctx.on('agent/assistant-stream', (payload) => {
        const p = payload;
        if (options.recordStreamFrames === true) {
            push({
                kind: 'model-stream',
                at: now(),
                ...(sid(p) ? { sessionId: sid(p) } : {}),
                detail: String(p.frame?.kind ?? 'frame'),
            });
        }
        else {
            counts['model-stream'] = (counts['model-stream'] ?? 0) + 1;
        }
    }));
    // ── 请求失败 ──────────────────────────────────────────────────────────
    disposers.push(ctx.on('agent/request-error', (payload, next) => {
        const p = payload;
        push({
            kind: 'model-error',
            at: now(),
            ...(sid(p) ? { sessionId: sid(p) } : {}),
            ...(typeof p.turn === 'number' ? { turn: p.turn } : {}),
            ...(typeof p.step === 'number' ? { step: p.step } : {}),
            detail: [p.failure?.kind, p.failure?.message].filter(Boolean).join(': ') || 'model request failed',
        });
        return next();
    }));
    // ── turn 收尾（serial；可返回 void）──────────────────────────────────
    disposers.push(ctx.on('agent/turn-stopping', (payload) => {
        const p = payload;
        push({
            kind: 'turn-stopping',
            at: now(),
            ...(sid(p) ? { sessionId: sid(p) } : {}),
            ...(typeof p.turn === 'number' ? { turn: p.turn } : {}),
        });
    }));
    // ── Agent 状态与错误 ──────────────────────────────────────────────────
    disposers.push(ctx.on('agent/status', (payload) => {
        const p = payload;
        push({
            kind: 'agent-status',
            at: now(),
            ...(sid(p) ? { sessionId: sid(p) } : {}),
            detail: String(p.status ?? ''),
        });
    }));
    disposers.push(ctx.on('agent/error', (payload) => {
        const p = payload;
        push({
            kind: 'agent-error',
            at: now(),
            ...(sid(p) ? { sessionId: sid(p) } : {}),
            detail: String(p.error ?? 'agent error'),
        });
    }));
    const bridge = {
        recent(limit) {
            const n = limit && limit > 0 ? limit : buffer.length;
            return buffer.slice(Math.max(0, buffer.length - n));
        },
        forSession(sessionId, limit) {
            const filtered = buffer.filter((a) => a.sessionId === sessionId);
            const n = limit && limit > 0 ? limit : filtered.length;
            return filtered.slice(Math.max(0, filtered.length - n));
        },
        counts() {
            return { ...counts };
        },
        clear() {
            buffer.length = 0;
            for (const k of Object.keys(counts))
                delete counts[k];
        },
    };
    return {
        bridge,
        dispose: () => {
            for (const d of disposers) {
                try {
                    d();
                }
                catch {
                    /* 单个取消失败不应影响其余（卸载路径必须健壮） */
                }
            }
            disposers.length = 0;
        },
    };
}
//# sourceMappingURL=runtime-events.js.map