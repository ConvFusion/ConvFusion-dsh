/**
 * The workspace side of Action Construction: the state to score against, and the record
 * of what was scored.
 *
 * The metric needs a *scoreable* state — candidate mechanisms, intervention arms, a belief
 * and a budget — while a research workspace holds prose.  The bridge is one small JSON file
 * that the agent fills once per campaign:
 *
 * ```
 * workspace/research/action-state.json      ← the scoreable state (mechanisms/arms/prior/budget)
 * workspace/research/action-construction.jsonl ← append-only evaluations, one per decision
 * ```
 *
 * Why a record and not just a number in the chat: the plugin's experiment gate can then ask
 * "was the action you are about to run written as an executable design, and can the stated
 * budget pay for it?" — and the answer is a file, not a memory.  The record is also the
 * traceability trail the paper's protocol asks for (every measurement regenerable from disk).
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { normaliseState } from './states.js';
export const ACTION_STATE_FILE = 'research/action-state.json';
export const ACTION_LOG_FILE = 'research/action-construction.jsonl';
function ensureDir(path) {
    const dir = dirname(path);
    if (!existsSync(dir))
        mkdirSync(dir, { recursive: true });
}
export function actionStatePath(workspace) {
    return join(workspace, ACTION_STATE_FILE);
}
export function actionLogPath(workspace) {
    return join(workspace, ACTION_LOG_FILE);
}
/** Read the scoreable state the workspace declares, or null when it has not been set. */
export function readActionState(workspace) {
    const path = actionStatePath(workspace);
    if (!existsSync(path))
        return null;
    try {
        return normaliseState(readFileSync(path, 'utf8'));
    }
    catch {
        return null;
    }
}
/** Write (or replace) the scoreable state.  Returns the workspace-relative path. */
export function writeActionState(workspace, state) {
    const normalised = normaliseState(state);
    const path = actionStatePath(workspace);
    ensureDir(path);
    writeFileSync(path, `${JSON.stringify(normalised, null, 2)}\n`, 'utf8');
    return ACTION_STATE_FILE;
}
/** Turn an evaluation into the compact record that goes on disk. */
export function toRecord(evaluation, options) {
    const answer = options.answer ? options.answer.slice(0, 400) : null;
    return {
        at: new Date().toISOString(),
        level: options.level,
        answer,
        design: options.design
            ? {
                action_type: options.design.action_type,
                target: options.design.target ?? null,
                arms: options.design.arms ?? null,
                n: options.design.n ?? null,
            }
            : null,
        ig_per_cost: evaluation.ig_per_cost,
        bound_share: evaluation.bound_share,
        compliant: evaluation.compliant,
        feasible: evaluation.feasible,
        cost: evaluation.cost,
        budget: evaluation.budget,
        guess_rate: evaluation.guess_rate,
        pointer_gap: evaluation.pointer_gap,
        resolution_gap: evaluation.resolution_gap,
        ...(options.note ? { note: options.note } : {}),
    };
}
/** Append one evaluation.  The log is append-only: history is part of the evidence. */
export function appendActionRecord(workspace, record) {
    const path = actionLogPath(workspace);
    ensureDir(path);
    appendFileSync(path, `${JSON.stringify(record)}\n`, 'utf8');
    return ACTION_LOG_FILE;
}
/** The most recent records, oldest first within the returned window. */
export function readActionRecords(workspace, limit = 5) {
    const path = actionLogPath(workspace);
    if (!existsSync(path))
        return [];
    const rows = [];
    for (const line of readFileSync(path, 'utf8').split('\n')) {
        if (!line.trim())
            continue;
        try {
            rows.push(JSON.parse(line));
        }
        catch {
            /* a truncated line (interrupted run) must not break the whole report */
        }
    }
    return rows.slice(-Math.max(1, limit));
}
/** How many records exist, and how many of them the stated budget could pay for. */
export function summariseActionRecords(workspace) {
    const path = actionLogPath(workspace);
    if (!existsSync(path))
        return { count: 0, inBudget: 0, latest: null };
    let count = 0;
    let inBudget = 0;
    let latest = null;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
        if (!line.trim())
            continue;
        try {
            const record = JSON.parse(line);
            count += 1;
            if (record.feasible)
                inBudget += 1;
            latest = record;
        }
        catch {
            /* ignore a partial line */
        }
    }
    return { count, inBudget, latest };
}
//# sourceMappingURL=workspace.js.map