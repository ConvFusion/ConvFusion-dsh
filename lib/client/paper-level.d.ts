/**
 * ConvFusion — **论文等级**（JCR 分区 / CCF 类别）的取值规则（纯函数，界面与自检共用）
 *
 * ## 为什么单独一个模块
 *
 * v0.6.3 起，平台的定价基础是**发表等级**：`PAPER_ACCEPTED` / `PAPER_PUBLISHED` 这两类
 * 成功条件的**价格就是等级**，所以对话框必须让用户选等级、并把它写进提案。规则有三条
 * 容易配错、而且错了**不会报错**（只会安静地把价钱算错或把条件发成必然 400）：
 *
 * 1. **哪些条件需要等级** —— 只有论文类两种；其余（`MUTUAL_COMPLETION` 等）**不该**带等级；
 * 2. **两个体系与取值的合法域** —— JCR 是 `1`–`4`（数字），CCF 是 `'A'`/`'B'`/`'C'`（大写字母）；
 * 3. **发出去时只发一个字段** —— `jcr_level` **或** `ccf_level`，不是两个都发。
 *
 * 抽成纯函数之后自检可以直接断言这三条，不必去正则匹配 JSX。
 *
 * ⚠️ **价格不在这里**。等级 → 金额由服务器 `fee-suggestion?jcr_level=|ccf_level=` 算
 * （平台唯一的价目表，见 `server-client.ts` 的 `fetchFeeSuggestion`）。客户端写死
 * "1区=1000"之类，平台调价后界面就会显示旧价钱。
 *
 * ⚠️ 本模块**自包含、不 import 任何东西**：客户端 `tsconfig.client.json` 把 `rootDir`
 * 钉在 `src/client`，一旦 import 宿主的模块就会把 node 内置模块拖进来而报错。
 */
/** 计价体系：`JCR` 分区（1–4，1 最高）与 `CCF` 类别（A–C，A 最高）。 */
export type PaperLevelSystem = 'JCR' | 'CCF';
/** 一个等级（体系 + 取值）—— 提案里落成 `jcr_level` 或 `ccf_level`。 */
export interface PaperLevel {
    system: PaperLevelSystem;
    /** JCR：`1`–`4`；CCF：`'A'`/`'B'`/`'C'`。 */
    level: number | string;
}
/** 价格 = 等级的**论文类**成功条件（与服务器 `PAPER_CONDITION_TYPES` 一致）。 */
export declare const PAPER_CONDITION_TYPES: readonly ["PAPER_ACCEPTED", "PAPER_PUBLISHED"];
/** 这个成功条件是不是按论文等级定价的（是 → 界面必须要求选等级）。 */
export declare function isPaperCondition(type: string | null | undefined): boolean;
/** JCR 分区（1 = 最高）。 */
export declare const JCR_LEVELS: readonly number[];
/** CCF 类别（A = 最高）。 */
export declare const CCF_LEVELS: readonly string[];
/** 某个体系下的全部可选等级（下拉用）。 */
export declare function levelOptions(system: PaperLevelSystem): readonly (number | string)[];
/** 归一 JCR 分区：`1`–`4` 的整数，别的（含字符串 `'2'`）一律 `null`。 */
export declare function asJcrLevel(v: unknown): number | null;
/** 归一 CCF 类别：大小写不敏感 → 大写 `A`/`B`/`C`，别的 `null`。 */
export declare function asCcfLevel(v: unknown): string | null;
/** 等级 → 发出去的字段（**只发一个**：`jcrLevel` 或 `ccfLevel`）。 */
export declare function levelQuery(level: PaperLevel | null | undefined): {
    jcrLevel?: number;
    ccfLevel?: string;
};
/**
 * 等级 ⇄ 下拉框的取值（`'JCR:2'` / `'CCF:A'`，空串 = 还没选）。
 *
 * 下拉框只能存字符串，而等级必须是"体系 + 取值"两件事；把两件事塞进一个控件
 * （optgroup 分组）比并排两个下拉更省版面，也不会出现"选了 CCF 却还残留 JCR 等级"
 * 这种半选状态 —— 一个字符串就是一份完整状态。
 */
export declare function encodeLevel(level: PaperLevel | null | undefined): string;
/** 下拉框取值 → 等级（认不出来一律 `null`，绝不猜一个等级出来）。 */
export declare function decodeLevel(value: string | null | undefined): PaperLevel | null;
/** 等级 → i18n 词条（`community.mentor.level.JCR` / `…CCF`）+ 插值参数。 */
export declare function paperLevelText(level: PaperLevel | null | undefined): {
    key: string;
    params: {
        level: string;
    };
} | null;
/**
 * 从提案 / 合同 / 列表行的成功条件里读出**它声明的等级**（没声明 → `null`）。
 *
 * 读取顺序与服务器一致（先 `jcr_level` 再 `ccf_level`）：界面的说法必须跟定价的那一侧
 * 一致，否则会出现"界面显示 CCF-B、价钱按 JCR 2 区算"这种自相矛盾。
 */
export declare function paperLevelOf(condition: {
    jcrLevel?: number | null;
    ccfLevel?: string | null;
} | null | undefined): PaperLevel | null;
