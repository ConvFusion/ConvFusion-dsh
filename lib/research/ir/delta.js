/**
 * ConvFusion v0.5.6 — IR Delta（规格 §17：增量变更，不整份重写）
 *
 * > 长期研究尤其需要记录 **Agent 到底改变了什么**。
 *
 * 每次变更 = 一个 {@link IRDelta}（change / target / operations / reason），
 * 施加到当前 IR 上得到新修订；施加后**整体再验证**（§15 Agent Loop 的
 * "IR Proposal → Kernel Validation"），验证不过就不产生新修订。
 *
 * ## 确定性操作语义
 *
 * 对象目标（`question` / `decision` / `plan` / `research` / 元素）：
 *
 * | 操作 | 语义 | 失败 |
 * |---|---|---|
 * | `add: {字段: 值}` | 增加**尚不存在**的字段 | 字段已存在 → R303 |
 * | `update: {字段: 值}` | 修改**已存在**的字段 | 字段不存在 → R304 |
 * | `remove: [字段]` | 删除字段 | 字段不存在 → R305 |
 *
 * 数组目标（`hypotheses` / `evidence_requirements` / `plan.steps`）：
 *
 * | 操作 | 语义 |
 * |---|---|
 * | `add` + `items: [...]` | 追加元素（id 缺失自动分配，冲突 → R303） |
 * | `update` + `items: [{id, …}]` | 按 id 合并元素的部分字段（找不到 → R304） |
 * | `remove: [id, …]` | 按 id 删除元素（找不到 → R305） |
 */
import { normalizeIR, validateIR } from './validate.js';
/* ════════════════════════════════════════════════════════════════════════
 * 目标解析（白名单 —— 自由路径会让 delta 变成第二个 write 工具）
 * ════════════════════════════════════════════════════════════════════════ */
/** 对象目标（字段级操作）。 */
const OBJECT_TARGETS = new Set(['research', 'question', 'decision', 'plan']);
/** 数组目标（元素级操作）—— 这里用**归一后**的字段名（下划线风格输入会被映射过来）。 */
const ARRAY_TARGETS = new Set(['hypotheses', 'evidenceRequirements', 'plan.steps']);
/** 目标名 → IR 字段名（规格用下划线，内部用驼峰）。 */
function fieldName(target) {
    if (target === 'evidence_requirements' || target.startsWith('evidence_requirements.')) {
        return target.replace('evidence_requirements', 'evidenceRequirements');
    }
    return target;
}
function resolveTarget(target) {
    const t = fieldName(target.trim());
    if (OBJECT_TARGETS.has(t))
        return { kind: 'object', field: t };
    if (ARRAY_TARGETS.has(t))
        return { kind: 'array', container: t };
    const dot = t.indexOf('.');
    if (dot <= 0)
        return undefined;
    const container = t.slice(0, dot);
    const elementId = t.slice(dot + 1);
    if (!ARRAY_TARGETS.has(container) || !elementId)
        return undefined;
    return { kind: 'element', container, elementId };
}
function err(code, field, message, repair) {
    return { code, layer: 'structural', field, message, repair };
}
function asRecord(v) {
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}
function deepClone(v) {
    return JSON.parse(JSON.stringify(v));
}
function arrayField(ir, container) {
    const v = ir[container === 'plan.steps' ? 'plan' : container];
    const arr = container === 'plan.steps' ? asRecord(v).steps : v;
    return Array.isArray(arr) ? arr : [];
}
/**
 * 对一个 IR 施加 delta，返回新修订（`revision + 1`）。
 *
 * 只在**整体验证通过**后才返回 ok —— 非法修订不产生（Repair 循环的确定性闸门）。
 */
export function applyDelta(ir, delta) {
    const errors = [];
    const applied = [];
    if (!delta || typeof delta !== 'object') {
        return { ok: false, errors: [err('R302', 'delta', 'Invalid delta structure.', 'specify_change_target_operations')] };
    }
    const target = typeof delta.target === 'string' ? delta.target.trim() : '';
    const resolved = resolveTarget(target);
    if (!resolved) {
        return {
            ok: false,
            errors: [
                err('R301', 'delta.target', `Unknown delta target "${target}" (allowed: research · question · decision · plan · hypotheses · evidence_requirements · plan.steps, or one of their elements like hypotheses.H01).`, 'use_known_delta_target'),
            ],
        };
    }
    const operations = Array.isArray(delta.operations) ? delta.operations : [];
    if (!operations.length) {
        return { ok: false, errors: [err('R302', 'delta.operations', 'Delta has no operations.', 'specify_delta_operations')] };
    }
    const next = deepClone(ir);
    for (const op of operations) {
        const ops = [op?.add ? 'add' : '', op?.update ? 'update' : '', op?.remove ? 'remove' : ''].filter(Boolean);
        if (ops.length !== 1) {
            errors.push(err('R302', 'delta.operations', `Each operation must carry exactly one of add/update/remove (got: ${ops.join('+') || 'none'}).`, 'split_operations'));
            continue;
        }
        if (resolved.kind === 'object' || resolved.kind === 'element') {
            const targetObj = resolved.kind === 'object'
                ? next[resolved.field]
                : arrayField(next, resolved.container).find((e) => String(e.id) === resolved.elementId);
            if (!targetObj) {
                errors.push(err('R301', 'delta.target', `Delta target "${target}" does not exist.`, 'fix_delta_target'));
                continue;
            }
            if (op.add) {
                for (const [k, v] of Object.entries(op.add)) {
                    if (k in targetObj) {
                        errors.push(err('R303', `${target}.${k}`, `Cannot add "${k}": the field already exists (use update).`, 'use_update_instead_of_add'));
                    }
                    else {
                        targetObj[k] = v;
                        applied.push(`add ${target}.${k}`);
                    }
                }
            }
            if (op.update) {
                for (const [k, v] of Object.entries(op.update)) {
                    if (!(k in targetObj)) {
                        errors.push(err('R304', `${target}.${k}`, `Cannot update "${k}": the field does not exist (use add).`, 'use_add_instead_of_update'));
                    }
                    else {
                        targetObj[k] = v;
                        applied.push(`update ${target}.${k}`);
                    }
                }
            }
            if (op.remove) {
                for (const k of op.remove) {
                    if (!(k in targetObj)) {
                        errors.push(err('R305', `${target}.${k}`, `Cannot remove "${k}": the field does not exist.`, 'drop_remove_for_missing_field'));
                    }
                    else {
                        delete targetObj[k];
                        applied.push(`remove ${target}.${k}`);
                    }
                }
            }
            continue;
        }
        // 数组目标
        const arr = arrayField(next, resolved.container);
        const items = Array.isArray(op.items) ? op.items : [];
        if (op.add) {
            if (!items.length) {
                errors.push(err('R302', 'delta.operations', 'Array add requires `items` (the elements to append).', 'specify_delta_items'));
                continue;
            }
            for (const item of items) {
                const id = String(asRecord(item).id ?? '');
                if (id && arr.some((e) => String(e.id) === id)) {
                    errors.push(err('R303', `${target}.${id}`, `Cannot add "${id}": the element already exists.`, 'use_update_for_existing_element'));
                    continue;
                }
                arr.push(item);
                applied.push(`add ${target}.${id || '(new)'}`);
            }
        }
        if (op.update) {
            if (!items.length) {
                errors.push(err('R302', 'delta.operations', 'Array update requires `items` (each with an `id`).', 'specify_delta_items'));
                continue;
            }
            for (const item of items) {
                const id = String(asRecord(item).id ?? '');
                const el = arr.find((e) => String(e.id) === id);
                if (!id || !el) {
                    errors.push(err('R304', `${target}.${id || '?'}`, `Cannot update "${id || '(missing id)'}": no such element.`, 'fix_delta_item_id'));
                    continue;
                }
                Object.assign(el, asRecord(item));
                applied.push(`update ${target}.${id}`);
            }
        }
        if (op.remove) {
            for (const id of op.remove) {
                const idx = arr.findIndex((e) => String(e.id) === id);
                if (idx < 0) {
                    errors.push(err('R305', `${target}.${id}`, `Cannot remove "${id}": no such element.`, 'drop_remove_for_missing_element'));
                    continue;
                }
                arr.splice(idx, 1);
                applied.push(`remove ${target}.${id}`);
            }
        }
        if (!op.add && !op.update && !op.remove)
            continue;
    }
    if (errors.length)
        return { ok: false, errors };
    const candidate = normalizeIR(next);
    const report = validateIR(candidate);
    if (report.status === 'failed') {
        return { ok: false, errors: report.errors, report };
    }
    return {
        ok: true,
        ir: { ...candidate, revision: ir.revision + 1 },
        applied,
        report,
    };
}
/** 一句话摘要（进 trace / 日志）。 */
export function summarizeDelta(delta) {
    const ops = (delta.operations ?? [])
        .map((op) => {
        const keys = [...Object.keys(op.add ?? {}), ...Object.keys(op.update ?? {}), ...(op.remove ?? [])];
        const items = Array.isArray(op.items) ? op.items.length : 0;
        const verb = op.add ? 'add' : op.update ? 'update' : op.remove ? 'remove' : '?';
        return `${verb} ${keys.join('/')}${items ? `(+${items} items)` : ''}`;
    })
        .join('; ');
    return `${delta.change} @ ${delta.target}: ${ops}${delta.reason ? ` (${delta.reason})` : ''}`;
}
//# sourceMappingURL=delta.js.map