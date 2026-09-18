window.__ModuleLoader__.load({
	id: "dsh-convfusion",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		"use strict";
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __export = (target, all) => {
		  for (var name in all)
		    __defProp(target, name, { get: all[name], enumerable: true });
		};
		var __copyProps = (to, from, except, desc) => {
		  if (from && typeof from === "object" || typeof from === "function") {
		    for (let key of __getOwnPropNames(from))
		      if (!__hasOwnProp.call(to, key) && key !== except)
		        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
		  }
		  return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
		  // If the importer is in node compatibility mode or this is not an ESM
		  // file that has been converted to a CommonJS file using a Babel-
		  // compatible transform (i.e. "__esModule" has not been set), then set
		  // "default" to the CommonJS "module.exports" for node compatibility.
		  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
		  mod
		));
		var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
		
		// src/client/index.tsx
		var index_exports = {};
		__export(index_exports, {
		  ResearchProgressButton: () => ResearchProgressButton,
		  apply: () => apply,
		  applyNavIcon: () => applyNavIcon,
		  inject: () => inject,
		  installNavIcon: () => installNavIcon,
		  loadSettingsState: () => loadSettingsState,
		  logoUrl: () => favicon_default,
		  preferredCategory: () => preferredCategory,
		  preferredSection: () => preferredSection,
		  preferredSkill: () => preferredSkill,
		  readProgressValue: () => readProgressValue,
		  shortenPath: () => shortenPath
		});
		module.exports = __toCommonJS(index_exports);
		
		// assets/favicon.svg
		var favicon_default = 'data:image/svg+xml,<?xml version="1.0" encoding="UTF-8"?>%0A<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">%0A<path d="M1023.84 343.14C1023.84 345.61 1023.84 348.08 1023.84 350.55C1023.09 352.57 1023.05 354.95 1022.56 357.16C1021.32 362.65 1018.56 367.85 1015.52 372.54C1004.99 388.79 988.22 398.68 972.19 408.73C967.67 411.57 962.63 414.18 958.52 417.55C958.53 480.52 958.54 543.48 958.55 606.45C961.95 608.77 966.23 609.89 969.85 611.98C979.76 617.69 988.83 626.12 993.97 636.46C1013.53 675.85 987.24 721.91 943.11 723.76C903.32 725.44 872.89 686.17 883.24 647.98C888.73 627.76 901.9 617.52 919.46 608.32C919.55 552.97 919.64 497.61 919.73 442.26C912.15 444.53 900.3 453.38 893.27 457.9C876.5 468.69 859.2 478.9 842.02 489.01C782.46 524.05 723.76 560.44 664.12 595.37C629.78 615.49 595.5 641.12 556.76 651.59C516.75 662.41 472.51 657.62 435.22 639.81C425.92 635.37 417.34 629.62 408.51 624.37C393.06 615.19 377.52 606.19 362.16 596.87C339.56 583.16 316.54 570.17 293.75 556.78C271.66 543.81 249.98 530.04 228.06 516.75C192.55 495.23 156.58 474.42 121.44 452.28C98.08 437.56 74.49 423.24 51.08 408.6C35.77 399.03 20.32 390.24 9.57 375.25C6.3 370.69 3.8 365.7 2.06 360.39C1.31 358.11 1.04 355.62 0.16 353.5C0.16 349.76 0.16 346.02 0.16 342.28C1.18 339.95 1.45 337.14 2.26 334.63C3.93 329.4 6.63 324.34 9.95 319.98C21.82 304.38 37.86 295.55 54.59 286.05C74.8 274.57 94.92 262.84 114.93 251C158.72 225.1 203.1 200.12 247.19 174.74C272.46 160.2 297.24 144.74 322.7 130.54C339.42 121.22 356.22 111.78 372.64 101.95C386.3 93.76 400.4 86.14 413.94 77.75C448.96 56.03 484.27 39.05 526.88 44.29C570.42 49.64 603.43 73.71 640.33 95.15C699.67 129.62 759.26 163.7 818.33 198.64C859.74 223.13 901.54 247.1 943.31 270.96C952.42 276.16 961.44 281.54 970.54 286.75C988.46 297.01 1005.6 306.6 1016.94 324.55C1020.69 330.47 1021.39 336.88 1023.84 343.14ZM756.86 278.21C733.59 263.09 708 249.72 683.83 235.94C661.79 223.38 640 209.15 616.48 199.48C571.04 180.8 519.83 175.94 471.84 187.22C427.6 197.62 389.51 224.43 350.03 245.76C341.56 250.33 333.28 255.24 324.86 259.88C287.09 280.72 234.79 309.66 235.08 359.57C235.36 408.48 283.59 434.05 320.09 455.62C331.48 462.35 343 469.05 354.65 475.32C389.66 494.16 420.17 515.24 459.14 526.04C506.69 539.22 560.81 536.52 607.14 519.64C635.9 509.17 662.51 493.29 689 478.16C706.07 468.41 723.24 458.47 740.65 449.36C746.59 446.25 762.13 439.02 765.75 434.38C748.39 424.68 730.88 415.21 713.62 405.31C708.79 402.54 698.12 394.92 692.72 395.96C689.45 396.59 685.93 399.48 683.02 401.08C675.81 405.05 668.75 409.28 661.54 413.26C646.25 421.7 630.87 429.96 615.53 438.29C604.18 444.45 592.71 451.15 580.65 455.83C549.28 468 514.42 469.48 482.45 458.74C467.92 453.86 454.5 445.85 441.27 438.24C429.56 431.51 417.67 425.08 405.9 418.45C387.63 408.15 367.02 399.12 351.01 385.41C342.72 378.31 335.52 368.03 335.57 356.76C335.71 324.89 376.08 310.02 399.14 296.76C409.49 290.8 420.08 285.3 430.54 279.54C442.49 272.95 454.51 265.84 467.44 261.3C504.25 248.36 547.61 249.07 583.76 264.01C609.22 274.53 632.48 290.29 656.75 303.21C662.39 306.22 668.09 309.27 673.61 312.49C676.79 314.34 680.46 317.23 684.23 317.58C689.12 318.03 699.09 310.92 703.55 308.45C714.98 302.11 726.36 295.64 737.89 289.49C744.2 286.12 751.68 283.17 756.86 278.21ZM177.21 527.62C185.91 530.62 194.24 537.06 202.12 541.8C215.58 549.91 229.2 557.8 242.74 565.76C278.06 586.55 313.67 606.89 348.87 627.91C394.2 654.97 432.69 680.75 486.78 687.05C526.39 691.67 566.66 685.11 603.1 669.04C623.2 660.18 641.44 647.51 660.36 636.51C705.26 610.4 749.7 583.46 794.84 557.76C811.61 548.21 827.53 536.44 844.92 528.01C846.97 531.3 846.22 536.08 846.22 540.05C846.22 548.47 846.3 556.89 846.32 565.3C846.38 596.79 846.27 628.27 846.31 659.76C846.34 680.33 846.32 700.9 846.28 721.48C846.22 749.74 846.22 771.06 832.71 796.73C818.12 824.46 796.87 836.61 771.26 852.18C762.34 857.6 753.47 863.08 744.46 868.39C712.55 887.21 681.02 906.64 649.05 925.4C634.53 933.93 620.3 943.49 604.94 950.49C573.02 965.04 537.85 973.13 502.65 971.41C471.72 969.89 440.89 961.71 413.16 947.9C403.12 942.9 393.95 936.52 384.18 931.1C362.5 919.09 341.39 905.97 320.15 893.2C301.07 881.73 281.97 870.25 262.8 858.92C248.04 850.2 232.05 841.88 218.8 830.91C197.12 812.98 182.39 787.55 177.84 759.8C175.09 743.09 176.75 725.27 176.73 708.38C176.7 677.52 176.69 646.66 176.71 615.8C176.72 597.1 176.92 578.39 176.69 559.69C176.58 550.3 175.32 536.49 177.21 527.62Z" fill="%234a43ea" fill-rule="evenodd" stroke="%234a43ea" stroke-width="0.25" stroke-linejoin="round"/>%0A<path d="M756.86 278.21C751.68 283.17 744.2 286.12 737.89 289.49C726.36 295.64 714.98 302.11 703.55 308.45C699.09 310.92 689.12 318.03 684.23 317.58C680.46 317.23 676.79 314.34 673.61 312.49C668.09 309.27 662.39 306.22 656.75 303.21C632.48 290.29 609.22 274.53 583.76 264.01C547.61 249.07 504.25 248.36 467.44 261.3C454.51 265.84 442.49 272.95 430.54 279.54C420.08 285.3 409.49 290.8 399.14 296.76C376.08 310.02 335.71 324.89 335.57 356.76C335.52 368.03 342.72 378.31 351.01 385.41C367.02 399.12 387.63 408.15 405.9 418.45C417.67 425.08 429.56 431.51 441.27 438.24C454.5 445.85 467.92 453.86 482.45 458.74C514.42 469.48 549.28 468 580.65 455.83C592.71 451.15 604.18 444.45 615.53 438.29C630.87 429.96 646.25 421.7 661.54 413.26C668.75 409.28 675.81 405.05 683.02 401.08C685.93 399.48 689.45 396.59 692.72 395.96C698.12 394.92 708.79 402.54 713.62 405.31C730.88 415.21 748.39 424.68 765.75 434.38C762.13 439.02 746.59 446.25 740.65 449.36C723.24 458.47 706.07 468.41 689 478.16C662.51 493.29 635.9 509.17 607.14 519.64C560.81 536.52 506.69 539.22 459.14 526.04C420.17 515.24 389.66 494.16 354.65 475.32C343 469.05 331.48 462.35 320.09 455.62C283.59 434.05 235.36 408.48 235.08 359.57C234.79 309.66 287.09 280.72 324.86 259.88C333.28 255.24 341.56 250.33 350.03 245.76C389.51 224.43 427.6 197.62 471.84 187.22C519.83 175.94 571.04 180.8 616.48 199.48C640 209.15 661.79 223.38 683.83 235.94C708 249.72 733.59 263.09 756.86 278.21Z" fill="%23ffffff" fill-rule="evenodd" stroke="%23ffffff" stroke-width="0.25" stroke-linejoin="round"/>%0A</svg>';
		
		// src/client/settings.tsx
		var import_react = __toESM(require("react"), 1);
		
		// src/client/icon.tsx
		var import_jsx_runtime = require("react/jsx-runtime");
		function ConvFusionMark({ size = 38 }) {
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		    "img",
		    {
		      src: favicon_default,
		      width: size,
		      height: size,
		      alt: "ConvFusion",
		      style: { display: "block", width: size, height: size }
		    }
		  );
		}
		
		// src/client/settings.tsx
		var import_jsx_runtime2 = require("react/jsx-runtime");
		var SETTINGS_ROUTE_PREFIX = "/dsh-convfusion";
		function preferredSection(sections) {
		  if (!sections?.length) return "";
		  return (sections.find((s) => s.overridden) ?? sections[0])?.section ?? "";
		}
		function preferredSkill(skills) {
		  if (!skills?.length) return void 0;
		  return skills.find((s) => s.overriddenCount > 0) ?? skills[0];
		}
		function preferredCategory(categories) {
		  if (!categories?.length) return void 0;
		  return categories.find((c) => c.overriddenCount > 0) ?? categories[0];
		}
		var SETTINGS_LOAD_TIMEOUT_MS = 15e3;
		var fetchSettingsSend = async (endpoint, payload, signal) => {
		  const res = await fetch(`${SETTINGS_ROUTE_PREFIX}/${endpoint}`, {
		    method: "POST",
		    headers: { "content-type": "application/json" },
		    body: JSON.stringify({ payload }),
		    ...signal === void 0 ? {} : { signal }
		  });
		  if (!res.ok) {
		    throw new Error(`HTTP ${res.status}`);
		  }
		  return await res.json();
		};
		async function loadSettingsState(send = fetchSettingsSend, options = {}) {
		  if (typeof send !== "function") {
		    return { kind: "error", message: "设置页缺少传输实现。" };
		  }
		  const timeoutMs = options.timeoutMs ?? SETTINGS_LOAD_TIMEOUT_MS;
		  const ac = new AbortController();
		  let timedOut = false;
		  let timer;
		  const timeout = new Promise((_resolve, reject) => {
		    timer = setTimeout(() => {
		      timedOut = true;
		      ac.abort();
		      reject(new Error(`timeout after ${timeoutMs}ms`));
		    }, timeoutMs);
		  });
		  try {
		    const res = await Promise.race([send("state", {}, ac.signal), timeout]);
		    if (!res || res.ok !== true) {
		      return { kind: "error", message: `设置服务返回失败：${res?.error?.message ?? "未知原因"}` };
		    }
		    const value = res.value;
		    if (!value || !Array.isArray(value.categories)) {
		      return {
		        kind: "error",
		        message: "设置服务返回的数据不完整，请重启 DSH 后重试。"
		      };
		    }
		    return { kind: "ok", state: value };
		  } catch (e) {
		    return {
		      kind: "error",
		      message: timedOut ? `请求超时（${Math.round(timeoutMs / 1e3)} 秒无响应）。若反复出现，请查看 DSH 宿主日志中与 ${SETTINGS_ROUTE_PREFIX} 相关的记录。` : `无法连接设置服务：${e instanceof Error ? e.message : String(e)}
		（路由 ${SETTINGS_ROUTE_PREFIX}/state。DSH 宿主日志会记录该路由的注册结果。）`
		    };
		  } finally {
		    if (timer !== void 0) clearTimeout(timer);
		  }
		}
		var S = {
		  page: { display: "flex", flexDirection: "column", gap: 14 },
		  hero: {
		    display: "flex",
		    alignItems: "center",
		    gap: 14,
		    padding: "16px 18px",
		    borderRadius: 14,
		    border: "1px solid var(--dsw-alias-border-l1)",
		    background: "linear-gradient(120deg, var(--dsw-alias-state-business-tertiary), var(--dsw-alias-bg-layer-1))"
		  },
		  heroIcon: {
		    width: 38,
		    height: 38,
		    borderRadius: 11,
		    display: "grid",
		    placeItems: "center",
		    color: "var(--dsw-alias-state-business-primary)",
		    background: "var(--dsw-alias-bg-layer-1)",
		    border: "1px solid var(--dsw-alias-border-l1)",
		    flex: "0 0 auto"
		  },
		  heroTitle: {
		    fontSize: 15,
		    fontWeight: 700,
		    color: "var(--dsw-alias-label-primary)",
		    lineHeight: 1.3
		  },
		  heroSub: {
		    fontSize: 12,
		    color: "var(--dsw-alias-label-secondary)",
		    marginTop: 2,
		    lineHeight: 1.5
		  },
		  tabs: {
		    display: "flex",
		    gap: 3,
		    padding: 3,
		    borderRadius: 11,
		    background: "var(--dsw-alias-bg-layer-2)"
		  },
		  card: {
		    border: "1px solid var(--dsw-alias-border-l1)",
		    borderRadius: 12,
		    background: "var(--dsw-alias-bg-layer-1)",
		    overflow: "hidden"
		  },
		  cardHead: {
		    display: "flex",
		    alignItems: "center",
		    gap: 8,
		    padding: "10px 14px",
		    borderBottom: "1px solid var(--dsw-alias-border-l1)",
		    fontSize: 12.5,
		    fontWeight: 700,
		    color: "var(--dsw-alias-label-primary)"
		  },
		  cardBody: { padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 },
		  list: {
		    display: "flex",
		    flexDirection: "column",
		    border: "1px solid var(--dsw-alias-border-l1)",
		    borderRadius: 10,
		    overflow: "hidden"
		  },
		  listRow: {
		    display: "flex",
		    alignItems: "center",
		    gap: 12,
		    padding: "10px 12px",
		    background: "var(--dsw-alias-bg-layer-1)"
		  },
		  listTitle: {
		    fontSize: 12.5,
		    fontWeight: 600,
		    color: "var(--dsw-alias-label-primary)",
		    overflow: "hidden",
		    textOverflow: "ellipsis",
		    whiteSpace: "nowrap"
		  },
		  row: { display: "flex", gap: 12, flexWrap: "wrap" },
		  field: { display: "flex", flexDirection: "column", gap: 5, flex: "1 1 200px", minWidth: 0 },
		  label: { fontSize: 11.5, fontWeight: 600, color: "var(--dsw-alias-label-secondary)" },
		  hint: { fontSize: 11, color: "var(--dsw-alias-label-tertiary)", lineHeight: 1.5 },
		  select: {
		    appearance: "none",
		    width: "100%",
		    padding: "7px 28px 7px 10px",
		    borderRadius: 8,
		    border: "1px solid var(--dsw-alias-border-l2)",
		    background: "var(--dsw-alias-bg-layer-2)",
		    color: "var(--dsw-alias-label-primary)",
		    fontSize: 12.5,
		    fontWeight: 600,
		    backgroundImage: "linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%)",
		    backgroundPosition: "calc(100% - 15px) 52%, calc(100% - 10px) 52%",
		    backgroundSize: "5px 5px, 5px 5px",
		    backgroundRepeat: "no-repeat"
		  },
		  input: {
		    width: "100%",
		    padding: "7px 10px",
		    borderRadius: 8,
		    border: "1px solid var(--dsw-alias-border-l2)",
		    background: "var(--dsw-alias-bg-layer-2)",
		    color: "var(--dsw-alias-label-primary)",
		    fontSize: 12.5,
		    fontWeight: 600
		  },
		  textarea: {
		    width: "100%",
		    minHeight: 190,
		    resize: "vertical",
		    padding: 11,
		    borderRadius: 9,
		    border: "1px solid var(--dsw-alias-border-l2)",
		    background: "var(--dsw-alias-bg-layer-2)",
		    color: "var(--dsw-alias-label-primary)",
		    fontSize: 12.5,
		    lineHeight: 1.65,
		    fontFamily: "var(--ds-font-family-code)"
		  },
		  base: {
		    whiteSpace: "pre-wrap",
		    maxHeight: 190,
		    overflow: "auto",
		    padding: 11,
		    borderRadius: 9,
		    border: "1px solid var(--dsw-alias-border-l1)",
		    background: "var(--dsw-alias-bg-layer-3)",
		    color: "var(--dsw-alias-label-secondary)",
		    fontSize: 11.5,
		    lineHeight: 1.6,
		    fontFamily: "var(--ds-font-family-code)"
		  },
		  footer: {
		    display: "flex",
		    alignItems: "center",
		    gap: 10,
		    justifyContent: "flex-end",
		    flexWrap: "wrap"
		  },
		  primaryBtn: {
		    padding: "6px 16px",
		    borderRadius: 8,
		    border: "1px solid transparent",
		    background: "var(--dsw-alias-button-primary-fill)",
		    color: "#fff",
		    fontSize: 12.5,
		    fontWeight: 600,
		    cursor: "pointer"
		  },
		  ghostBtn: {
		    padding: "6px 14px",
		    borderRadius: 8,
		    border: "1px solid var(--dsw-alias-border-l2)",
		    background: "transparent",
		    color: "var(--dsw-alias-label-primary)",
		    fontSize: 12.5,
		    fontWeight: 600,
		    cursor: "pointer"
		  },
		  mono: { fontFamily: "var(--ds-font-family-code)", fontSize: 11 },
		  /** 紧凑的一行（登录输入 / 账号信息 / 失败提示共用）：靠 flexWrap 自适应窄宽度。 */
		  inlineRow: {
		    display: "flex",
		    alignItems: "center",
		    gap: 8,
		    flexWrap: "wrap"
		  },
		  /** 行内输入框：不占满整行（`S.input` 是 100% 宽，这里要压扁）。 */
		  compactInput: {
		    width: "auto",
		    flex: "1 1 150px",
		    minWidth: 110,
		    padding: "5px 9px",
		    borderRadius: 8,
		    border: "1px solid var(--dsw-alias-border-l2)",
		    background: "var(--dsw-alias-bg-layer-2)",
		    color: "var(--dsw-alias-label-primary)",
		    fontSize: 12
		  },
		  /** Token 余额徽章：既是数字也是按钮（点了刷新）。 */
		  tokenBadge: {
		    display: "inline-flex",
		    alignItems: "center",
		    gap: 4,
		    height: 20,
		    padding: "0 9px",
		    borderRadius: 10,
		    border: "1px solid var(--dsw-alias-border-l2)",
		    background: "var(--dsw-alias-bg-layer-2)",
		    color: "var(--dsw-alias-state-business-primary)",
		    fontSize: 11,
		    fontWeight: 700,
		    cursor: "pointer",
		    whiteSpace: "nowrap"
		  },
		  /** 已登录时的账号名。 */
		  accountName: {
		    fontSize: 13,
		    fontWeight: 700,
		    color: "var(--dsw-alias-label-primary)"
		  },
		  /** 卡片内部的**小** Tab（账号 / 服务器设置）：比页面级 Tab 更轻。 */
		  miniTabs: {
		    display: "inline-flex",
		    gap: 2,
		    padding: 2,
		    borderRadius: 8,
		    background: "var(--dsw-alias-bg-layer-2)",
		    alignSelf: "flex-start"
		  },
		  /** 次要入口（"使用邀请码注册"）：看起来是链接，不抢主按钮的注意力。 */
		  linkBtn: {
		    padding: "2px 4px",
		    border: "none",
		    background: "transparent",
		    color: "var(--dsw-alias-state-business-primary)",
		    fontSize: 11.5,
		    fontWeight: 600,
		    cursor: "pointer"
		  }
		};
		function Badge({
		  tone = "neutral",
		  children
		}) {
		  const tones = {
		    neutral: { fg: "var(--dsw-alias-label-secondary)", bg: "var(--dsw-alias-bg-layer-3)" },
		    brand: { fg: "var(--dsw-alias-state-business-primary)", bg: "var(--dsw-alias-state-business-tertiary)" },
		    success: { fg: "var(--dsw-alias-state-success-primary)", bg: "var(--dsw-alias-state-success-tertiary)" },
		    warn: { fg: "var(--dsw-alias-state-warn-primary)", bg: "var(--dsw-alias-state-warn-tertiary)" },
		    error: { fg: "var(--dsw-alias-state-error-primary)", bg: "var(--dsw-alias-bg-layer-3)" }
		  };
		  const c = tones[tone] ?? tones.neutral;
		  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		    "span",
		    {
		      style: {
		        display: "inline-flex",
		        alignItems: "center",
		        gap: 4,
		        height: 18,
		        padding: "0 8px",
		        borderRadius: 9,
		        fontSize: 10.5,
		        fontWeight: 600,
		        color: c.fg,
		        background: c.bg,
		        whiteSpace: "nowrap"
		      },
		      children
		    }
		  );
		}
		function TabButton({
		  active,
		  onClick,
		  children
		}) {
		  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		    "button",
		    {
		      type: "button",
		      onClick,
		      style: {
		        padding: "6px 14px",
		        borderRadius: 9,
		        border: "1px solid transparent",
		        background: active ? "var(--dsw-alias-bg-layer-1)" : "transparent",
		        color: active ? "var(--dsw-alias-label-primary)" : "var(--dsw-alias-label-secondary)",
		        fontSize: 12.5,
		        fontWeight: active ? 700 : 500,
		        cursor: "pointer",
		        boxShadow: active ? "0 1px 3px rgba(0,0,0,.14)" : "none",
		        transition: "background var(--ds-transition-duration) var(--ds-ease-in-out)"
		      },
		      children
		    }
		  );
		}
		function MiniTab({
		  active,
		  onClick,
		  children
		}) {
		  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		    "button",
		    {
		      type: "button",
		      onClick,
		      style: {
		        padding: "3px 10px",
		        borderRadius: 6,
		        border: "1px solid transparent",
		        background: active ? "var(--dsw-alias-bg-layer-1)" : "transparent",
		        color: active ? "var(--dsw-alias-label-primary)" : "var(--dsw-alias-label-tertiary)",
		        fontSize: 11.5,
		        fontWeight: active ? 700 : 500,
		        cursor: "pointer"
		      },
		      children
		    }
		  );
		}
		function ConvFusionProjectSettings({
		  scope,
		  send = fetchSettingsSend
		}) {
		  const [state, setState] = import_react.default.useState(null);
		  const [error, setError] = import_react.default.useState(null);
		  const [loading, setLoading] = import_react.default.useState(true);
		  const [tab, setTab] = import_react.default.useState("local");
		  const [staleHost, setStaleHost] = import_react.default.useState(false);
		  const [categoryId, setCategoryId] = import_react.default.useState("");
		  const [skillId, setSkillId] = import_react.default.useState("");
		  const [section, setSection] = import_react.default.useState("");
		  const [draft, setDraft] = import_react.default.useState("");
		  const [saving, setSaving] = import_react.default.useState(false);
		  const [notice, setNotice] = import_react.default.useState(null);
		  const scopeSnap = import_react.default.useSyncExternalStore(
		    (cb) => scope.subscribe(cb),
		    () => scope.getSnapshot(),
		    () => scope.getSnapshot()
		  );
		  const call = import_react.default.useCallback(
		    async (endpoint, payload) => {
		      try {
		        if (endpoint === "state") {
		          const outcome = await loadSettingsState(send);
		          if (outcome.kind === "error") {
		            setError(outcome.message);
		            return null;
		          }
		          setError(null);
		          setState(outcome.state);
		          setStaleHost(outcome.state.protocol !== 8);
		          return outcome.state;
		        }
		        const res = await send(endpoint, payload);
		        if (!res || res.ok !== true) {
		          setError(`设置服务返回失败：${res?.error?.message ?? "未知原因"}`);
		          return null;
		        }
		        setError(null);
		        const next = res.value;
		        setState(next);
		        return next;
		      } catch (e) {
		        setError(`调用 ${endpoint} 失败：${e instanceof Error ? e.message : String(e)}`);
		        return null;
		      }
		    },
		    [send]
		  );
		  const reload = import_react.default.useCallback(async () => {
		    setLoading(true);
		    try {
		      const next = await call("state", {});
		      if (next?.categories?.length) {
		        const first = preferredCategory(next.categories);
		        const firstSkill = preferredSkill(first?.skills);
		        if (first && firstSkill) {
		          setCategoryId(first.categoryId);
		          setSkillId(firstSkill.skillId);
		          setSection(preferredSection(firstSkill.sections));
		        }
		      }
		    } finally {
		      setLoading(false);
		    }
		  }, [call]);
		  import_react.default.useEffect(() => {
		    let alive = true;
		    void (async () => {
		      await reload();
		      if (!alive) return;
		    })();
		    return () => {
		      alive = false;
		    };
		  }, [reload]);
		  const recheckDependencies = import_react.default.useCallback(async () => {
		    try {
		      const res = await send("dependencies/check", {});
		      if (!res || res.ok !== true) return null;
		      const report = res.value;
		      const tectonic = report?.tectonic;
		      if (!tectonic) return null;
		      setState((prev) => prev ? { ...prev, dependencies: { tectonic } } : prev);
		      return tectonic;
		    } catch {
		      return null;
		    }
		  }, [send]);
		  const category = state?.categories.find((c) => c.categoryId === categoryId) ?? null;
		  const skill = category?.skills.find((s) => s.skillId === skillId) ?? null;
		  const point = skill?.sections.find((s) => s.section === section) ?? null;
		  const onCategory = (id) => {
		    setCategoryId(id);
		    setNotice(null);
		    const cat = state?.categories.find((c) => c.categoryId === id);
		    const s0 = preferredSkill(cat?.skills);
		    setSkillId(s0?.skillId ?? "");
		    setSection(preferredSection(s0?.sections));
		  };
		  const onSkill = (id) => {
		    setSkillId(id);
		    setNotice(null);
		    const s0 = category?.skills.find((s) => s.skillId === id);
		    setSection(preferredSection(s0?.sections));
		  };
		  const onSection = (name) => {
		    setSection(name);
		    setNotice(null);
		  };
		  import_react.default.useEffect(() => {
		    setDraft(point?.userText ?? "");
		  }, [skillId, section, point?.userText]);
		  const dirty = point !== null && draft !== (point.userText ?? "");
		  const save = async () => {
		    if (!skill || !point) return;
		    setSaving(true);
		    const next = await call("customization/save", {
		      skillId: skill.skillId,
		      section: point.section,
		      text: draft
		    });
		    setSaving(false);
		    if (next) setNotice({ tone: "success", text: draft.trim() ? "已保存" : "已恢复系统原文" });
		  };
		  const reset = async () => {
		    if (!skill || !point) return;
		    if (!window.confirm(`恢复「${point.section}」的系统原文？你的定制会被删除。`)) return;
		    setSaving(true);
		    const next = await call("customization/reset", { skillId: skill.skillId, section: point.section });
		    setSaving(false);
		    if (next) {
		      setDraft("");
		      setNotice({ tone: "success", text: "已恢复系统原文" });
		    }
		  };
		  const resetSkill = async () => {
		    if (!skill) return;
		    if (!window.confirm(`恢复「${skill.skillName}」的全部章节？该能力的定制会被删除。`)) return;
		    setSaving(true);
		    const next = await call("customization/resetSkill", { skillId: skill.skillId });
		    setSaving(false);
		    if (next) setNotice({ tone: "success", text: `已恢复「${skill.skillName}」` });
		  };
		  const totalOverridden = state ? state.categories.reduce((n, c) => n + c.overriddenCount, 0) : 0;
		  const totalPoints = state ? state.categories.reduce((n, c) => n + c.pointCount, 0) : 0;
		  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.page, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.hero, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.heroIcon, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ConvFusionMark, { size: 24 }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { flex: "1 1 auto", minWidth: 0 }, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.heroTitle, children: "ConvFusion" }),
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.heroSub, children: "定制各项能力，形成你自己的研究方法" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }, children: [
		        totalOverridden > 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(Badge, { tone: "brand", children: [
		          "已定制 ",
		          totalOverridden,
		          " 项"
		        ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: "neutral", children: "全部使用系统原文" }),
		        scopeSnap.status === "unavailable" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: "warn", children: "设置只读" }) : null
		      ] })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.tabs, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(TabButton, { active: tab === "local", onClick: () => setTab("local"), children: "⚙ 本地研究方法" }),
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(TabButton, { active: tab === "community", onClick: () => setTab("community"), children: "◈ ConvFusion.com" }),
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(TabButton, { active: tab === "retrieval", onClick: () => setTab("retrieval"), children: [
		        "⚙ 系统设置",
		        state && (!state.retrieval.configured || state.dependencies?.tectonic.available === false) ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { ...S.hint, marginLeft: 6 }, children: "待配置" }) : null
		      ] })
		    ] }),
		    staleHost ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.card, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.cardHead, children: [
		        "宿主侧需要重启",
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { flex: "1 1 auto" } }),
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: "warn", children: "需重启" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.cardBody, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { ...S.hint, lineHeight: 1.7 }, children: [
		        "宿主侧仍在运行旧代码，下面的内容可能不是最新的。",
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("br", {}),
		        "刷新页面不会生效（宿主模块在 DSH 启动时载入内存）。请重启 DSH 后再打开本页。"
		      ] }) })
		    ] }) : null,
		    error ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.card, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.cardHead, children: [
		        "加载失败",
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { flex: "1 1 auto" } }),
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: "error", children: "错误" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.cardBody, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		          "div",
		          {
		            style: {
		              color: "var(--dsw-alias-state-error-primary)",
		              fontSize: 12.5,
		              whiteSpace: "pre-wrap",
		              lineHeight: 1.6
		            },
		            children: error
		          }
		        ),
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.footer, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", style: S.ghostBtn, onClick: () => void reload(), children: "重试" }) })
		      ] })
		    ] }) : null,
		    loading && !state ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.card, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.cardBody, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.hint, children: "正在加载…" }) }) }) : null,
		    tab === "community" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(CommunityTab, { send, initial: state?.account ?? null }) : null,
		    tab === "retrieval" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		      SystemTab,
		      {
		        configured: state?.retrieval.configured ?? false,
		        source: state?.retrieval.source ?? "none",
		        envVar: state?.retrieval.envVar ?? "OPENALEX_API_KEY",
		        tectonic: state?.dependencies?.tectonic ?? null,
		        onRecheck: recheckDependencies,
		        scope,
		        onNotice: setNotice
		      }
		    ) : null,
		    state && tab === "local" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.card, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.cardHead, children: [
		          "能力库",
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: "neutral", children: "仅本机" }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { flex: "1 1 auto" } }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { style: { ...S.hint, fontWeight: 400 }, children: [
		            "共 ",
		            totalPoints,
		            " 项 · 已定制 ",
		            totalOverridden
		          ] })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.cardBody, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.row, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.field, children: [
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.label, children: "① 能力类别" }),
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("select", { style: S.select, value: categoryId, onChange: (e) => onCategory(e.target.value), children: state.categories.map((c) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("option", { value: c.categoryId, children: [
		              c.code ? `${c.code} ` : "",
		              c.label ?? c.categoryName,
		              "（",
		              c.skills.length,
		              "）",
		              c.overriddenCount > 0 ? ` · 已定制 ${c.overriddenCount}` : ""
		            ] }, c.categoryId)) }),
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.hint, children: category ? `${category.skills.length} 项能力 · 类别按研究过程排序` : "该类别下暂无可定制能力" })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.field, children: [
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.label, children: "② 能力" }),
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("select", { style: S.select, value: skillId, onChange: (e) => onSkill(e.target.value), children: category?.skills.map((s) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("option", { value: s.skillId, children: [
		              s.code ? `${s.code} · ` : "",
		              s.label ?? s.skillName,
		              s.overriddenCount > 0 ? ` · 已定制 ${s.overriddenCount}` : ""
		            ] }, s.skillId)) }),
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.hint, children: skill ? `${skill.sections.length} 个章节` : "" })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.field, children: [
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.label, children: "③ 可定制章节" }),
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("select", { style: S.select, value: section, onChange: (e) => onSection(e.target.value), children: skill?.sections.map((s) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("option", { value: s.section, children: [
		              s.section,
		              s.overridden ? " · 已定制" : ""
		            ] }, s.section)) }),
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.hint, children: "留空则使用系统原文" })
		          ] })
		        ] }) })
		      ] }),
		      skill && point ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.card, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.cardHead, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { style: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }, children: [
		            skill.code ? `${skill.code} · ` : "",
		            skill.label ?? skill.skillName,
		            " · ",
		            point.section
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { flex: "1 1 auto" } }),
		          point.overridden ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: "brand", children: "已定制" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: "neutral", children: "系统原文" })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.cardBody, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.hint, children: [
		            category?.code ? `${category.code} ` : "",
		            category?.label ?? category?.categoryName,
		            " · ",
		            skill.label ?? skill.skillName,
		            " · ",
		            point.section
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.label, children: "你的额外要求" }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		            "textarea",
		            {
		              style: S.textarea,
		              spellCheck: false,
		              value: draft,
		              placeholder: "留空则使用系统原文。\n例如：评估研究想法时，优先考虑能否用现有设备完成表征。",
		              onChange: (e) => setDraft(e.target.value)
		            }
		          ),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("details", { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("summary", { style: { ...S.label, cursor: "pointer" }, children: [
		              "系统原文（",
		              point.base.length,
		              " 字）"
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { ...S.base, marginTop: 8 }, children: point.base })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.footer, children: [
		            notice ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		              "span",
		              {
		                style: {
		                  marginRight: "auto",
		                  fontSize: 12,
		                  color: notice.tone === "success" ? "var(--dsw-alias-state-success-primary)" : "var(--dsw-alias-state-error-primary)"
		                },
		                children: notice.text
		              }
		            ) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { style: { ...S.hint, marginRight: "auto" }, children: [
		              draft.length,
		              " 字"
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		              "button",
		              {
		                type: "button",
		                style: { ...S.ghostBtn, opacity: point.overridden && !saving ? 1 : 0.55 },
		                disabled: !point.overridden || saving,
		                onClick: () => void reset(),
		                children: "恢复该章节"
		              }
		            ),
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		              "button",
		              {
		                type: "button",
		                style: { ...S.ghostBtn, opacity: skill.overriddenCount > 0 && !saving ? 1 : 0.55 },
		                disabled: skill.overriddenCount === 0 || saving,
		                onClick: () => void resetSkill(),
		                children: "恢复该能力"
		              }
		            ),
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		              "button",
		              {
		                type: "button",
		                style: { ...S.primaryBtn, opacity: dirty && !saving ? 1 : 0.55 },
		                disabled: !dirty || saving,
		                onClick: () => void save(),
		                children: saving ? "保存中…" : "保存"
		              }
		            )
		          ] })
		        ] })
		      ] }) : null
		    ] }) : null
		  ] });
		}
		var ROLE_LABELS = {
		  RESEARCHER: "研究者",
		  MENTOR: "导师",
		  ADMIN: "管理员"
		};
		var STATUS_LABELS = {
		  ACTIVE: "正常",
		  SUSPENDED: "已停用",
		  DEACTIVATED: "已注销"
		};
		var STAGE_LABELS = {
		  IDEA: "想法",
		  LITERATURE: "文献",
		  HYPOTHESIS: "假设",
		  PLANNING: "规划",
		  IMPLEMENTATION: "实现",
		  EXPERIMENT: "实验",
		  ANALYSIS: "分析",
		  WRITING: "写作",
		  COMPLETED: "完成"
		};
		function roleText(roles) {
		  if (!roles.length) return "—";
		  return roles.map((r) => ROLE_LABELS[r] ?? r).join(" · ");
		}
		var SAMPLE_WORKS = [
		  {
		    title: "检索增强的长上下文推理",
		    fields: ["自然语言处理"],
		    stage: "EXPERIMENT",
		    progress: 0.5,
		    question: "检索能否改善长上下文推理的准确率？"
		  },
		  {
		    title: "机器人操作失败的视觉判定",
		    fields: ["机器人学习", "多模态"],
		    stage: "ANALYSIS",
		    progress: 0.7,
		    question: "视觉语言模型能否可靠判定一次操作是否失败？"
		  },
		  {
		    title: "视觉-激光跨模态定位",
		    fields: ["多模态", "机器人"],
		    stage: "IMPLEMENTATION",
		    progress: 0.4,
		    question: "视觉与激光如何互补以提升定位精度？"
		  }
		];
		function ProgressBar({ value }) {
		  const pct2 = Math.round(Math.min(Math.max(value, 0), 1) * 100);
		  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { style: { display: "inline-flex", alignItems: "center", gap: 6 }, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		      "span",
		      {
		        style: {
		          display: "inline-block",
		          width: 44,
		          height: 4,
		          borderRadius: 2,
		          background: "var(--dsw-alias-bg-layer-3)",
		          overflow: "hidden"
		        },
		        children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		          "span",
		          {
		            style: {
		              display: "block",
		              width: `${pct2}%`,
		              height: "100%",
		              background: "var(--dsw-alias-state-business-primary)"
		            }
		          }
		        )
		      }
		    ),
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { style: S.mono, children: [
		      pct2,
		      "%"
		    ] })
		  ] });
		}
		function WorkRow({
		  title,
		  fields,
		  stage,
		  progress,
		  updatedAt,
		  disabled,
		  busy,
		  expanded,
		  onSummary,
		  onBrief
		}) {
		  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { ...S.listRow, alignItems: "flex-start" }, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { minWidth: 0, flex: "1 1 auto", display: "flex", flexDirection: "column", gap: 4 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.listTitle, children: title }),
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { ...S.hint, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }, children: [
		        fields.length ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: fields.join(" · ") }) : null,
		        stage ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: STAGE_LABELS[stage] ?? stage }) : null,
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ProgressBar, { value: progress }),
		        updatedAt ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: updatedAt.slice(0, 10) }) : null
		      ] })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", gap: 6, flex: "0 0 auto" }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		        "button",
		        {
		          type: "button",
		          style: { ...S.ghostBtn, opacity: disabled || busy ? 0.55 : 1 },
		          disabled: disabled || busy !== null,
		          onClick: onSummary,
		          children: busy === "summary" ? "读取中…" : expanded ? "收起" : "摘要"
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		        "button",
		        {
		          type: "button",
		          style: { ...S.ghostBtn, opacity: disabled || busy ? 0.55 : 1 },
		          disabled: disabled || busy !== null,
		          title: disabled ? "登录后可查看简报" : "简报消耗 1 Token，重试不会重复扣费",
		          onClick: onBrief,
		          children: busy === "brief" ? "读取中…" : "简报 · 1 Token"
		        }
		      )
		    ] })
		  ] });
		}
		function WorkDetail({ work, brief }) {
		  const line = (label, value) => value ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", gap: 8 }, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { ...S.label, flex: "0 0 56px" }, children: label }),
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { ...S.hint, color: "var(--dsw-alias-label-secondary)", whiteSpace: "pre-wrap" }, children: value })
		  ] }) : null;
		  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
		    "div",
		    {
		      style: {
		        margin: "0 12px 10px",
		        padding: 10,
		        borderRadius: 9,
		        border: "1px solid var(--dsw-alias-border-l1)",
		        background: "var(--dsw-alias-bg-layer-2)",
		        display: "flex",
		        flexDirection: "column",
		        gap: 6
		      },
		      children: [
		        line("研究问题", brief ? brief.researchQuestion : work.researchQuestion),
		        line("摘要", work.summary),
		        brief ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
		          line("动机", brief.motivation),
		          line("核心想法", brief.coreIdea),
		          line("假设", brief.hypothesis),
		          line("方法概览", brief.methodOverview),
		          brief.keyEvidence.length ? line("关键证据", brief.keyEvidence.join("；")) : null,
		          brief.openProblems.length ? line("待解问题", brief.openProblems.join("；")) : null
		        ] }) : null
		      ]
		    }
		  );
		}
		function CommunityTab({
		  send,
		  initial
		}) {
		  const [state, setState] = import_react.default.useState(initial);
		  const [phase, setPhase] = import_react.default.useState("loading");
		  const [busy, setBusy] = import_react.default.useState(false);
		  const [refreshingBalance, setRefreshingBalance] = import_react.default.useState(false);
		  const [failure, setFailure] = import_react.default.useState(null);
		  const [userTab, setUserTab] = import_react.default.useState("account");
		  const [serverDraft, setServerDraft] = import_react.default.useState(initial?.serverUrl ?? "");
		  const [apiKey, setApiKey] = import_react.default.useState("");
		  const [invite, setInvite] = import_react.default.useState({ code: "", email: "", displayName: "" });
		  const [inviteOpen, setInviteOpen] = import_react.default.useState(false);
		  const [workTab, setWorkTab] = import_react.default.useState("mine");
		  const [mine, setMine] = import_react.default.useState(null);
		  const [mineLoading, setMineLoading] = import_react.default.useState(false);
		  const [mineError, setMineError] = import_react.default.useState(null);
		  const [mineRegistry, setMineRegistry] = import_react.default.useState(null);
		  const [works, setWorks] = import_react.default.useState(null);
		  const [worksLoading, setWorksLoading] = import_react.default.useState(false);
		  const [worksError, setWorksError] = import_react.default.useState(null);
		  const [open, setOpen] = import_react.default.useState(null);
		  const [detail, setDetail] = import_react.default.useState(
		    null
		  );
		  const [detailBusy, setDetailBusy] = import_react.default.useState(null);
		  const [chargeNotice, setChargeNotice] = import_react.default.useState(null);
		  const [intents, setIntents] = import_react.default.useState({});
		  import_react.default.useEffect(() => {
		    if (state?.serverUrl) setServerDraft(state.serverUrl);
		  }, [state?.serverUrl]);
		  const post = import_react.default.useCallback(
		    async (endpoint, payload) => {
		      try {
		        const res = await send(endpoint, payload);
		        if (!res || res.ok !== true) {
		          return {
		            ok: false,
		            error: { code: res?.error?.code ?? "unknown", message: res?.error?.message ?? "未知原因" }
		          };
		        }
		        return { ok: true, value: res.value };
		      } catch (e) {
		        return {
		          ok: false,
		          error: {
		            code: "transport",
		            message: `无法访问 ${SETTINGS_ROUTE_PREFIX}（${e instanceof Error ? e.message : String(e)}）。请查看 DSH 宿主日志。`
		          }
		        };
		      }
		    },
		    [send]
		  );
		  const call = import_react.default.useCallback(
		    async (endpoint, payload) => {
		      const res = await post(endpoint, payload);
		      if (!res.ok) {
		        setFailure(res.error ?? { code: "unknown", message: "未知原因" });
		        return null;
		      }
		      const next = res.value;
		      setState(next);
		      setFailure(null);
		      return next;
		    },
		    [post]
		  );
		  import_react.default.useEffect(() => {
		    let alive = true;
		    void (async () => {
		      try {
		        const res = await send("account/state", {});
		        if (!alive) return;
		        if (!res || res.ok !== true) {
		          setFailure({
		            code: res?.error?.code ?? "unknown",
		            message: res?.error?.message ?? "读取登录状态失败。"
		          });
		          return;
		        }
		        const current = res.value;
		        setState(current);
		        if (current.keyConfigured) await call("account/verify", {});
		      } catch (e) {
		        if (!alive) return;
		        setFailure({
		          code: "transport",
		          message: `无法读取登录状态：${e instanceof Error ? e.message : String(e)}`
		        });
		      } finally {
		        if (alive) setPhase("ready");
		      }
		    })();
		    return () => {
		      alive = false;
		    };
		  }, [send, call]);
		  const account = state?.account ?? null;
		  const configured = state?.keyConfigured ?? false;
		  const canMentor = Boolean(
		    account && (account.roles.includes("MENTOR") || account.roles.includes("ADMIN"))
		  );
		  const fromEnv = state?.keySource === "env";
		  const loadWorks = import_react.default.useCallback(async () => {
		    setWorksLoading(true);
		    setWorksError(null);
		    setChargeNotice(null);
		    setOpen(null);
		    setDetail(null);
		    const res = await post("work/list", {});
		    setWorksLoading(false);
		    if (!res.ok) {
		      setWorksError(res.error ?? { code: "unknown", message: "读取研究工作列表失败。" });
		      setWorks(null);
		      return;
		    }
		    setWorks(res.value.items ?? []);
		  }, [post]);
		  const loadMine = import_react.default.useCallback(async () => {
		    setMineLoading(true);
		    setMineError(null);
		    const res = await post("work/mine", {});
		    setMineLoading(false);
		    if (!res.ok) {
		      setMine(null);
		      setMineError(
		        res.error?.code === "unknown-endpoint" ? { code: "host-restart", message: "宿主侧需要重启：当前宿主还没有 work/mine 端点。" } : res.error ?? { code: "unknown", message: "读取本机研究工作失败。" }
		      );
		      return;
		    }
		    const value = res.value;
		    setMine(value.items ?? []);
		    setMineRegistry(value.registry ?? null);
		  }, [post]);
		  import_react.default.useEffect(() => {
		    void loadMine();
		  }, [loadMine]);
		  import_react.default.useEffect(() => {
		    if (!account) {
		      setWorks(null);
		      setWorksError(null);
		      setOpen(null);
		      setDetail(null);
		      return;
		    }
		    void loadWorks();
		  }, [account, loadWorks]);
		  const toggleSummary = async (w) => {
		    if (open?.projectId === w.projectId && open.kind === "summary") {
		      setOpen(null);
		      return;
		    }
		    setDetailBusy({ projectId: w.projectId, kind: "summary" });
		    setWorksError(null);
		    const res = await post("work/summary", { projectId: w.projectId });
		    setDetailBusy(null);
		    if (!res.ok) {
		      setWorksError(res.error ?? { code: "unknown", message: "读取摘要失败。" });
		      return;
		    }
		    const fresh = res.value.work;
		    setDetail({ projectId: w.projectId, work: fresh });
		    setOpen({ projectId: w.projectId, kind: "summary" });
		  };
		  const toggleBrief = async (w) => {
		    if (open?.projectId === w.projectId && open.kind === "brief") {
		      setOpen(null);
		      return;
		    }
		    setDetailBusy({ projectId: w.projectId, kind: "brief" });
		    setWorksError(null);
		    setChargeNotice(null);
		    const intentKey = intents[w.projectId] ?? (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `cf-${Date.now()}-${Math.random().toString(16).slice(2)}`);
		    setIntents((prev) => ({ ...prev, [w.projectId]: intentKey }));
		    const res = await post("work/brief", { projectId: w.projectId, intentKey });
		    setDetailBusy(null);
		    if (!res.ok) {
		      setWorksError(res.error ?? { code: "unknown", message: "读取简报失败。" });
		      return;
		    }
		    const brief = res.value.brief;
		    setDetail({ projectId: w.projectId, work: brief, brief });
		    setOpen({ projectId: w.projectId, kind: "brief" });
		    setIntents((prev) => {
		      const next = { ...prev };
		      delete next[w.projectId];
		      return next;
		    });
		    const before = state?.tokens?.available;
		    const after = await refreshBalance();
		    if (typeof after === "number") {
		      setChargeNotice(
		        typeof before === "number" && before !== after ? `已读取简报，消耗 ${before - after} Token（余额 ${after}）` : `已读取简报（余额 ${after}）`
		      );
		    }
		  };
		  const serverUrl = serverDraft.trim() || state?.serverUrl || void 0;
		  const serverChanged = Boolean(account) && Boolean(serverDraft.trim()) && serverDraft.trim() !== (state?.serverUrl ?? "");
		  const login = async () => {
		    if (!apiKey.trim()) return;
		    setBusy(true);
		    const next = await call("account/login", { apiKey, ...serverUrl ? { serverUrl } : {} });
		    setBusy(false);
		    setApiKey("");
		    if (next) setInvite({ code: "", email: "", displayName: "" });
		  };
		  const register = async () => {
		    if (!invite.code.trim() || !invite.email.trim() || !invite.displayName.trim()) return;
		    setBusy(true);
		    const next = await call("account/register", {
		      invitationCode: invite.code,
		      email: invite.email,
		      displayName: invite.displayName,
		      ...serverUrl ? { serverUrl } : {}
		    });
		    setBusy(false);
		    if (next) setInvite({ code: "", email: "", displayName: "" });
		  };
		  const logout = async () => {
		    setBusy(true);
		    await call("account/logout", {});
		    setBusy(false);
		    setIntents({});
		  };
		  const verify = async () => {
		    setBusy(true);
		    await call("account/verify", {});
		    setBusy(false);
		  };
		  const refreshBalance = async () => {
		    setRefreshingBalance(true);
		    const res = await post("account/tokens", {});
		    setRefreshingBalance(false);
		    if (!res.ok) return null;
		    const tokens = res.value.tokens;
		    if (!tokens) return null;
		    setState((prev) => prev ? { ...prev, tokens } : prev);
		    return tokens.available;
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.card, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.cardHead, children: [
		        "◈ ConvFusion.com",
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { flex: "1 1 auto" } }),
		        state?.environment === "production" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: "brand", children: "生产环境" }) : state?.environment === "development" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: "neutral", children: "开发环境" }) : null,
		        state?.serverUrlMismatch ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: "warn", children: "地址与环境不一致" }) : null,
		        phase === "loading" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: "neutral", children: "检查中…" }) : account ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: "success", children: "已登录" }) : configured ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: "warn", children: "凭据待验证" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: "neutral", children: "未登录" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.cardBody, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.miniTabs, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(MiniTab, { active: userTab === "account", onClick: () => setUserTab("account"), children: account ? "账号" : "登录" }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(MiniTab, { active: userTab === "server", onClick: () => setUserTab("server"), children: "服务器设置" })
		        ] }),
		        userTab === "account" ? account ? (
		          /* 已登录：一行账号 + 右侧操作，没有多余说明文字 */
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.inlineRow, children: [
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: S.accountName, children: account.displayName }),
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: S.mono, children: account.email }),
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { style: S.hint, children: [
		              roleText(account.roles),
		              " · ",
		              STATUS_LABELS[account.status] ?? account.status
		            ] }),
		            state?.tokens ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
		              "button",
		              {
		                type: "button",
		                style: { ...S.tokenBadge, opacity: refreshingBalance || busy ? 0.55 : 1 },
		                disabled: refreshingBalance || busy,
		                title: state.tokens.frozen > 0 ? `可用 ${state.tokens.available} · 冻结 ${state.tokens.frozen}（冻结仍是你的，只是锁住了）` : "点击刷新余额",
		                onClick: () => void refreshBalance(),
		                children: [
		                  "◎ ",
		                  state.tokens.available,
		                  " Token",
		                  state.tokens.frozen > 0 ? `（+${state.tokens.frozen} 冻结）` : ""
		                ]
		              }
		            ) : null,
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { flex: "1 1 auto" } }),
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		              "button",
		              {
		                type: "button",
		                style: { ...S.ghostBtn, opacity: busy ? 0.55 : 1 },
		                disabled: busy,
		                onClick: () => void verify(),
		                children: busy ? "处理中…" : "重新验证"
		              }
		            ),
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		              "button",
		              {
		                type: "button",
		                style: { ...S.ghostBtn, opacity: busy || fromEnv ? 0.55 : 1 },
		                disabled: busy || fromEnv,
		                title: fromEnv ? "凭据来自环境变量，请修改环境变量后重启 DSH" : void 0,
		                onClick: () => void logout(),
		                children: "登出"
		              }
		            )
		          ] })
		        ) : (
		          /* 未登录：默认只展示**一条**登录路径 */
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.inlineRow, children: [
		              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: S.label, children: "API Key 登录" }),
		              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		                "input",
		                {
		                  style: S.compactInput,
		                  type: "password",
		                  autoComplete: "off",
		                  spellCheck: false,
		                  value: apiKey,
		                  placeholder: "cf_live_…",
		                  title: "凭据只保存在本机（DSH 设置），不会回传浏览器，也不会写进对话内容。",
		                  onChange: (e) => setApiKey(e.target.value),
		                  onKeyDown: (e) => {
		                    if (e.key === "Enter") void login();
		                  }
		                }
		              ),
		              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		                "button",
		                {
		                  type: "button",
		                  style: { ...S.primaryBtn, opacity: apiKey.trim() && !busy ? 1 : 0.55 },
		                  disabled: !apiKey.trim() || busy,
		                  onClick: () => void login(),
		                  children: busy ? "登录中…" : "登录"
		                }
		              ),
		              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		                "button",
		                {
		                  type: "button",
		                  style: S.linkBtn,
		                  onClick: () => setInviteOpen((v) => !v),
		                  "aria-expanded": inviteOpen,
		                  children: inviteOpen ? "收起邀请码注册" : "使用邀请码注册"
		                }
		              )
		            ] }),
		            inviteOpen ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
		              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.inlineRow, children: [
		                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		                  "input",
		                  {
		                    style: S.compactInput,
		                    type: "password",
		                    autoComplete: "off",
		                    spellCheck: false,
		                    value: invite.code,
		                    placeholder: "邀请码 cf_inv_…",
		                    onChange: (e) => setInvite({ ...invite, code: e.target.value })
		                  }
		                ),
		                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		                  "input",
		                  {
		                    style: S.compactInput,
		                    type: "text",
		                    autoComplete: "off",
		                    spellCheck: false,
		                    value: invite.email,
		                    placeholder: "邮箱（须与邀请码一致）",
		                    onChange: (e) => setInvite({ ...invite, email: e.target.value })
		                  }
		                ),
		                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		                  "input",
		                  {
		                    style: S.compactInput,
		                    type: "text",
		                    autoComplete: "off",
		                    spellCheck: false,
		                    value: invite.displayName,
		                    placeholder: "显示名",
		                    onChange: (e) => setInvite({ ...invite, displayName: e.target.value })
		                  }
		                ),
		                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		                  "button",
		                  {
		                    type: "button",
		                    style: {
		                      ...S.primaryBtn,
		                      opacity: invite.code.trim() && invite.email.trim() && invite.displayName.trim() && !busy ? 1 : 0.55
		                    },
		                    disabled: !invite.code.trim() || !invite.email.trim() || !invite.displayName.trim() || busy,
		                    onClick: () => void register(),
		                    children: busy ? "注册中…" : "注册并登录"
		                  }
		                )
		              ] }),
		              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.hint, children: "邮箱必须与邀请码签发时指定的邮箱一致；注册成功后服务器签发的 API Key 直接保存在本机。" })
		            ] }) : null
		          ] })
		        ) : (
		          /* 服务器设置：地址来自环境配置（开发 = 本机服务器，生产 = 线上） */
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.inlineRow, children: [
		              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: S.label, children: "服务器地址" }),
		              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		                "input",
		                {
		                  style: S.compactInput,
		                  type: "text",
		                  spellCheck: false,
		                  autoComplete: "off",
		                  value: serverDraft,
		                  placeholder: state?.defaultServerUrl ?? "",
		                  title: "留空 = 跟随环境配置" + (state?.defaultServerUrl ? `（本环境默认 ${state.defaultServerUrl}）` : "") + "；带 /api 或 /docs 的地址会自动归一。",
		                  onChange: (e) => setServerDraft(e.target.value)
		                }
		              )
		            ] }),
		            serverChanged ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.inlineRow, children: [
		              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: "warn", children: "地址已改" }),
		              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: S.hint, children: "改用新地址需要重新登录（凭据绑定在服务器上）。" })
		            ] }) : null,
		            state?.serverUrlMismatch ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: 11.5, lineHeight: 1.6, color: "var(--dsw-alias-state-warn-primary)" }, children: state.environment === "production" ? "当前是生产环境，但地址指向本机 —— 你多半连的是自己电脑上的开发服务器。" : "当前是开发环境，但地址指向线上服务器 —— 在开发机上操作线上数据有风险，请确认这是你想要的。" }) : null
		          ] })
		        ),
		        failure ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.inlineRow, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: "error", children: failure.code }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		            "span",
		            {
		              style: {
		                color: "var(--dsw-alias-state-error-primary)",
		                fontSize: 12,
		                lineHeight: 1.6,
		                flex: "1 1 320px",
		                minWidth: 0
		              },
		              children: failure.message
		            }
		          ),
		          configured ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		            "button",
		            {
		              type: "button",
		              style: { ...S.ghostBtn, opacity: busy ? 0.55 : 1 },
		              disabled: busy,
		              onClick: () => void verify(),
		              children: "重试验证"
		            }
		          ) : null
		        ] }) : null
		      ] })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.card, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.cardHead, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { marginRight: 4 }, children: "研究工作" }),
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(MiniTab, { active: workTab === "mine", onClick: () => setWorkTab("mine"), children: "我的" }),
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(MiniTab, { active: workTab === "mentor", onClick: () => setWorkTab("mentor"), children: "可指导" }),
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { flex: "1 1 auto" } }),
		        workTab === "mine" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		          "button",
		          {
		            type: "button",
		            style: { ...S.ghostBtn, opacity: mineLoading ? 0.55 : 1 },
		            disabled: mineLoading,
		            onClick: () => void loadMine(),
		            children: mineLoading ? "读取中…" : "刷新"
		          }
		        ) : null,
		        workTab === "mentor" && account ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		          "button",
		          {
		            type: "button",
		            style: { ...S.ghostBtn, opacity: worksLoading ? 0.55 : 1 },
		            disabled: worksLoading,
		            onClick: () => void loadWorks(),
		            children: worksLoading ? "读取中…" : "刷新"
		          }
		        ) : null,
		        workTab === "mentor" && !account ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: "neutral", children: "示例数据" }) : null
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.cardBody, children: [
		        chargeNotice ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.inlineRow, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: "brand", children: "已计费" }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: S.hint, children: chargeNotice })
		        ] }) : null,
		        worksError ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.inlineRow, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: "error", children: worksError.code }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		            "span",
		            {
		              style: {
		                color: "var(--dsw-alias-state-error-primary)",
		                fontSize: 12,
		                lineHeight: 1.6,
		                flex: "1 1 320px",
		                minWidth: 0
		              },
		              children: worksError.message
		            }
		          )
		        ] }) : null,
		        workTab === "mine" ? (
		          /* ── 我的：本机研究项目 ── */
		          mineError ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.inlineRow, children: [
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: "error", children: mineError.code }),
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		              "span",
		              {
		                style: {
		                  color: "var(--dsw-alias-state-error-primary)",
		                  fontSize: 12,
		                  lineHeight: 1.6,
		                  flex: "1 1 320px",
		                  minWidth: 0
		                },
		                children: mineError.message
		              }
		            ),
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", style: S.ghostBtn, onClick: () => void loadMine(), children: "重试" })
		          ] }) : mineRegistry && !mineRegistry.available ? (
		            // 注册表读不到（≠ 没有研究项目）：把原因原样说出来，便于定位
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.inlineRow, children: [
		              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: "warn", children: "注册表不可用" }),
		              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: S.hint, children: mineRegistry.reason ?? "这台 DSH 没有提供工作区注册表。" })
		            ] })
		          ) : mine === null ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.hint, children: mineLoading ? "正在读取…" : "暂无数据。" }) : mine.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.hint, children: "本机还没有研究项目（含有效 research workspace 的工作区会出现在这里）。" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.list, children: mine.map((w, i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		            "div",
		            {
		              style: i === 0 ? void 0 : { borderTop: "1px solid var(--dsw-alias-border-l1)" },
		              children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { ...S.listRow, alignItems: "flex-start" }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { minWidth: 0, flex: "1 1 auto", display: "flex", flexDirection: "column", gap: 4 }, children: [
		                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.listTitle, children: w.title }),
		                /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { ...S.hint, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }, children: [
		                  w.stage ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: w.stage }) : null,
		                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ProgressBar, { value: w.overall }),
		                  w.paper ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "已有论文" }) : null,
		                  w.counts.filter((c) => c.value > 0).slice(0, 4).map((c) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
		                    c.label,
		                    " ",
		                    c.value
		                  ] }, c.key))
		                ] }),
		                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { ...S.mono, color: "var(--dsw-alias-label-tertiary)" }, title: w.researchRoot, children: w.path })
		              ] }) })
		            },
		            w.id
		          )) })
		        ) : !account ? (
		          /* ── 可指导 · 未登录：示例数据（不可操作）── */
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.list, children: SAMPLE_WORKS.map((w, i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		              "div",
		              {
		                style: i === 0 ? void 0 : { borderTop: "1px solid var(--dsw-alias-border-l1)" },
		                children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		                  WorkRow,
		                  {
		                    title: w.title,
		                    fields: w.fields,
		                    stage: w.stage,
		                    progress: w.progress,
		                    disabled: true,
		                    busy: null,
		                    expanded: false,
		                    onSummary: () => void 0,
		                    onBrief: () => void 0
		                  }
		                )
		              },
		              w.title
		            )) }),
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.hint, children: "示例数据，登录后可浏览并操作网络上的研究工作。" })
		          ] })
		        ) : !canMentor ? (
		          /* ── 可指导 · 已登录但没有导师角色：如实说明这一层需要什么 ── */
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.inlineRow, children: [
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: "warn", children: "需要导师角色" }),
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { style: S.hint, children: [
		              "浏览可指导的研究工作需要导师角色（当前：",
		              roleText(account.roles),
		              "）。"
		            ] })
		          ] })
		        ) : works === null ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.hint, children: worksLoading ? "正在读取研究工作…" : "暂无数据。" }) : works.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.hint, children: "暂无可发现的研究工作。" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.list, children: works.map((w, i) => {
		          const expanded = open?.projectId === w.projectId;
		          const busyKind = detailBusy?.projectId === w.projectId ? detailBusy.kind : null;
		          return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
		            "div",
		            {
		              style: i === 0 ? void 0 : { borderTop: "1px solid var(--dsw-alias-border-l1)" },
		              children: [
		                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		                  WorkRow,
		                  {
		                    title: w.title,
		                    fields: w.researchFields,
		                    stage: w.stage,
		                    progress: w.progress,
		                    updatedAt: w.updatedAt,
		                    disabled: false,
		                    busy: busyKind,
		                    expanded,
		                    onSummary: () => void toggleSummary(w),
		                    onBrief: () => void toggleBrief(w)
		                  }
		                ),
		                expanded && detail?.projectId === w.projectId ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(WorkDetail, { work: detail.work, brief: detail.brief }) : null
		              ]
		            },
		            w.projectId
		          );
		        }) })
		      ] })
		    ] })
		  ] });
		}
		function SystemTab({
		  configured,
		  source,
		  envVar,
		  tectonic,
		  onRecheck,
		  scope,
		  onNotice
		}) {
		  const [draft, setDraft] = import_react.default.useState("");
		  const [busy, setBusy] = import_react.default.useState(false);
		  const [checking, setChecking] = import_react.default.useState(false);
		  const [dep, setDep] = import_react.default.useState(tectonic);
		  import_react.default.useEffect(() => {
		    setDep(tectonic);
		  }, [tectonic]);
		  const save = async () => {
		    if (!draft.trim()) return;
		    setBusy(true);
		    try {
		      await scope.set("openalexApiKey", draft.trim());
		      setDraft("");
		      onNotice({ tone: "success", text: "已保存 OpenAlex API Key" });
		    } catch (e) {
		      onNotice({ tone: "error", text: `保存失败：${e instanceof Error ? e.message : String(e)}` });
		    } finally {
		      setBusy(false);
		    }
		  };
		  const clear = async () => {
		    setBusy(true);
		    try {
		      await scope.unset("openalexApiKey");
		      setDraft("");
		      onNotice({ tone: "success", text: "已清除 OpenAlex API Key" });
		    } catch (e) {
		      onNotice({ tone: "error", text: `清除失败：${e instanceof Error ? e.message : String(e)}` });
		    } finally {
		      setBusy(false);
		    }
		  };
		  const recheck = async () => {
		    setChecking(true);
		    try {
		      const next = await onRecheck();
		      setDep(next);
		      if (next?.available) {
		        onNotice({ tone: "success", text: `tectonic 可用${next.version ? `：${next.version}` : ""}` });
		      } else {
		        onNotice({ tone: "error", text: "未找到 tectonic，请按下方说明安装后重新检查" });
		      }
		    } finally {
		      setChecking(false);
		    }
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.card, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.cardHead, children: [
		        "🧩 本地依赖",
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { flex: "1 1 auto" } }),
		        dep === null ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: "neutral", children: "未知" }) : dep.available ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: "success", children: "已安装" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: "warn", children: "未安装" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.cardBody, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: S.mono, children: "tectonic" }),
		          dep?.version ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: S.hint, children: dep.version }) : null,
		          dep?.path ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { ...S.hint, opacity: 0.7 }, children: dep.path }) : null,
		          dep?.viaEnv ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { style: S.hint, children: [
		            "（由 ",
		            dep.envVar,
		            " 指定）"
		          ] }) : null,
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { flex: "1 1 auto" } }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		            "button",
		            {
		              type: "button",
		              style: { ...S.ghostBtn, opacity: checking ? 0.55 : 1 },
		              disabled: checking,
		              onClick: () => void recheck(),
		              children: checking ? "检查中…" : "重新检查"
		            }
		          )
		        ] }),
		        dep && !dep.available ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { ...S.hint, lineHeight: 2, marginTop: 8 }, children: [
		          "论文编译成 PDF 需要本机的 ",
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: S.mono, children: "tectonic" }),
		          "（不是 npm 依赖）。安装任一即可：",
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("br", {}),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: S.mono, children: "brew install tectonic" }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("br", {}),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: S.mono, children: "mamba install -c conda-forge tectonic" }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("br", {}),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: S.mono, children: "cargo install tectonic" }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("br", {}),
		          "装在别处就设 ",
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: S.mono, children: dep.envVar || "CONVFUSION_TECTONIC" }),
		          " ",
		          "指向它，再点「重新检查」。首次编译会下载宏包（约 40 MB），之后复用。"
		        ] }) : null
		      ] })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.card, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.cardHead, children: [
		        "⌕ 文献检索",
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { flex: "1 1 auto" } }),
		        configured ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: "success", children: "已配置" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: "warn", children: "未配置" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.cardBody, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.field, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.label, children: "OpenAlex API Key" }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		            "input",
		            {
		              style: S.input,
		              type: "password",
		              autoComplete: "off",
		              spellCheck: false,
		              value: draft,
		              placeholder: configured ? "已设置，输入新值可覆盖" : "粘贴 API Key",
		              title: "留空则不修改。密钥仅保存在本机，不会回传浏览器。",
		              onChange: (e) => setDraft(e.target.value)
		            }
		          ),
		          !configured ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.hint, children: [
		            "未配置：可在 ",
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: S.mono, children: "openalex.org" }),
		            " 免费申请后粘贴（未配置时走公共池，速率较低）。"
		          ] }) : source === "env" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.hint, children: [
		            "当前由环境变量 ",
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: S.mono, children: envVar }),
		            " 提供；在此保存会覆盖它。"
		          ] }) : null
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.footer, children: [
		          source === "settings" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		            "button",
		            {
		              type: "button",
		              style: { ...S.ghostBtn, opacity: busy ? 0.55 : 1 },
		              disabled: busy,
		              onClick: () => void clear(),
		              children: "清除"
		            }
		          ) : null,
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		            "button",
		            {
		              type: "button",
		              style: { ...S.primaryBtn, opacity: draft.trim() && !busy ? 1 : 0.55 },
		              disabled: !draft.trim() || busy,
		              onClick: () => void save(),
		              children: busy ? "保存中…" : "保存"
		            }
		          )
		        ] })
		      ] })
		    ] })
		  ] });
		}
		
		// src/client/nav-icon.ts
		var NAV_ICON_MARK = "data-convfusion-nav-icon";
		var NAV_SECTION_LABEL = "ConvFusion";
		function applyNavIcon(doc, logoUrl) {
		  let replaced = 0;
		  const buttons = doc.querySelectorAll("button");
		  for (let i = 0; i < buttons.length; i += 1) {
		    const button = buttons[i];
		    if (!button) continue;
		    if ((button.textContent ?? "").trim() !== NAV_SECTION_LABEL) continue;
		    if (button.getAttribute(NAV_ICON_MARK) === "1") continue;
		    const svg = button.querySelector("svg");
		    if (!svg || !svg.parentNode) continue;
		    const img = doc.createElement("img");
		    img.setAttribute("src", logoUrl);
		    img.setAttribute("alt", "");
		    img.setAttribute("width", "16");
		    img.setAttribute("height", "16");
		    img.setAttribute("aria-hidden", "true");
		    const cls = svg.getAttribute("class");
		    if (cls) img.setAttribute("class", cls);
		    img.setAttribute(NAV_ICON_MARK, "1");
		    svg.parentNode.replaceChild(img, svg);
		    button.setAttribute(NAV_ICON_MARK, "1");
		    replaced += 1;
		  }
		  return replaced;
		}
		function installNavIcon(logoUrl) {
		  const g = globalThis;
		  const doc = g.document;
		  const Observer = g.MutationObserver;
		  if (!doc || !Observer || !doc.body) return () => {
		  };
		  const run = () => {
		    try {
		      applyNavIcon(doc, logoUrl);
		    } catch {
		    }
		  };
		  run();
		  try {
		    const observer = new Observer((records) => {
		      for (const record of records) {
		        const nodes = record.addedNodes;
		        for (let i = 0; i < nodes.length; i += 1) {
		          if (nodes[i]) {
		            run();
		            return;
		          }
		        }
		      }
		    });
		    observer.observe(doc.body, { childList: true, subtree: true });
		    return () => {
		      try {
		        observer.disconnect();
		      } catch {
		      }
		    };
		  } catch {
		    return () => {
		    };
		  }
		}
		
		// src/client/progress-panel.tsx
		var import_react2 = require("react");
		var import_jsx_runtime3 = require("react/jsx-runtime");
		function readProgressValue(res) {
		  const envelope = res;
		  if (envelope?.ok !== true) return { kind: "hidden" };
		  const value = envelope.value ?? {};
		  if (value.research !== true) return { kind: "hidden" };
		  return {
		    kind: "shown",
		    workspace: value.workspace ?? null,
		    report: value.report ?? null,
		    lastTurn: value.lastTurn ?? null
		  };
		}
		function shortenPath(path) {
		  if (!path) return "";
		  const parts = path.split(/[\\/]/).filter(Boolean);
		  return parts.slice(-2).join("/");
		}
		function ProgressGlyph() {
		  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("svg", { width: "16", height: "16", viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("rect", { x: "3.2", y: "8.4", width: "2.3", height: "4.4", rx: "0.6", fill: "currentColor" }),
		    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("rect", { x: "6.85", y: "5.4", width: "2.3", height: "7.4", rx: "0.6", fill: "currentColor" }),
		    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("rect", { x: "10.5", y: "2.4", width: "2.3", height: "10.4", rx: "0.6", fill: "currentColor" })
		  ] });
		}
		var pct = (v) => `${Math.round(v * 100)}%`;
		var PROGRESS_REFRESH_MS = 6e4;
		function Bar({ scale }) {
		  const width = `${Math.max(0, Math.min(1, scale)) * 100}%`;
		  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		    "span",
		    {
		      style: {
		        display: "inline-block",
		        width: "88px",
		        height: "7px",
		        borderRadius: "4px",
		        background: "var(--dsw-alias-interactive-bg-hover, rgba(15,17,21,0.08))",
		        overflow: "hidden",
		        verticalAlign: "middle"
		      },
		      children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		        "span",
		        {
		          style: {
		            display: "block",
		            width,
		            height: "100%",
		            background: "var(--dsw-alias-state-business-primary, #4176e6)"
		          }
		        }
		      )
		    }
		  );
		}
		function clarityText(clarity) {
		  switch (clarity) {
		    case "clear":
		      return "方向明确 → 可直接推进";
		    case "ambiguous":
		      return "需要你选一个方向";
		    case "blocked":
		      return "等你拍板（阻塞）";
		    default:
		      return "（未判定）";
		  }
		}
		function ResearchProgressButton({ sessionId }) {
		  const [probe, setProbe] = (0, import_react2.useState)({ kind: "loading" });
		  const [open, setOpen] = (0, import_react2.useState)(false);
		  const [hover, setHover] = (0, import_react2.useState)(false);
		  const [busy, setBusy] = (0, import_react2.useState)(false);
		  const [pos, setPos] = (0, import_react2.useState)(null);
		  const anchorRef = (0, import_react2.useRef)(null);
		  const panelRef = (0, import_react2.useRef)(null);
		  const load = (0, import_react2.useCallback)(async () => {
		    if (!sessionId) {
		      setProbe({ kind: "hidden" });
		      return;
		    }
		    setBusy(true);
		    try {
		      const res = await fetchSettingsSend("progress/workspace", { sessionId });
		      setProbe(readProgressValue(res));
		    } catch {
		      setProbe({ kind: "hidden" });
		    } finally {
		      setBusy(false);
		    }
		  }, [sessionId]);
		  (0, import_react2.useEffect)(() => {
		    void load();
		  }, [load]);
		  (0, import_react2.useEffect)(() => {
		    if (open) void load();
		  }, [open, load]);
		  (0, import_react2.useEffect)(() => {
		    if (probe.kind !== "shown") return void 0;
		    const timer = window.setInterval(() => void load(), PROGRESS_REFRESH_MS);
		    const onVisible = () => {
		      if (document.visibilityState === "visible") void load();
		    };
		    document.addEventListener("visibilitychange", onVisible);
		    return () => {
		      window.clearInterval(timer);
		      document.removeEventListener("visibilitychange", onVisible);
		    };
		  }, [probe.kind, load]);
		  const place = (0, import_react2.useCallback)(() => {
		    const rect = anchorRef.current?.getBoundingClientRect();
		    if (!rect) return;
		    setPos({ top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) });
		  }, []);
		  (0, import_react2.useLayoutEffect)(() => {
		    if (open) place();
		  }, [open, place]);
		  (0, import_react2.useEffect)(() => {
		    if (!open) return void 0;
		    const onMove = () => place();
		    const onDown = (event) => {
		      const target = event.target;
		      if (!target) return;
		      if (anchorRef.current?.contains(target) === true) return;
		      if (panelRef.current?.contains(target) === true) return;
		      setOpen(false);
		    };
		    const onKey = (event) => {
		      if (event.key === "Escape") setOpen(false);
		    };
		    window.addEventListener("resize", onMove);
		    window.addEventListener("scroll", onMove, true);
		    window.addEventListener("pointerdown", onDown, true);
		    window.addEventListener("keydown", onKey);
		    return () => {
		      window.removeEventListener("resize", onMove);
		      window.removeEventListener("scroll", onMove, true);
		      window.removeEventListener("pointerdown", onDown, true);
		      window.removeEventListener("keydown", onKey);
		    };
		  }, [open, place]);
		  if (probe.kind !== "shown") return null;
		  const report = probe.report;
		  const lastTurn = probe.lastTurn;
		  const muted = "var(--dsw-alias-label-tertiary, #81858c)";
		  const mono = {
		    fontFamily: "var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace)",
		    fontSize: "11.5px"
		  };
		  const section = { marginTop: "10px" };
		  const sectionTitle = { color: muted, fontSize: "11.5px", letterSpacing: "0.04em" };
		  const iconButton = {
		    border: "none",
		    background: "transparent",
		    color: "inherit",
		    cursor: "pointer",
		    padding: "0 4px",
		    borderRadius: "4px",
		    font: "inherit",
		    lineHeight: 1
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { ref: anchorRef, style: { display: "inline-flex", alignItems: "center" }, "data-convfusion-progress-button": "1", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
		      "button",
		      {
		        type: "button",
		        "aria-label": report ? `研究进展（成熟度折算 ${pct(report.overall)}）` : "研究进展",
		        "aria-haspopup": "dialog",
		        "aria-expanded": open,
		        title: report ? `查看当前工作区的研究进展（成熟度折算 ${pct(report.overall)}）` : "查看当前工作区的研究进展",
		        onClick: () => setOpen((v) => !v),
		        onMouseEnter: () => setHover(true),
		        onMouseLeave: () => setHover(false),
		        style: {
		          display: "inline-flex",
		          alignItems: "center",
		          justifyContent: "center",
		          gap: "4px",
		          minWidth: "24px",
		          height: "24px",
		          border: "none",
		          borderRadius: "6px",
		          background: open || hover ? "var(--dsw-alias-interactive-bg-hover, rgba(15,17,21,0.06))" : "transparent",
		          color: "inherit",
		          cursor: "pointer",
		          padding: "0 6px",
		          font: "inherit",
		          lineHeight: 1
		        },
		        children: [
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ProgressGlyph, {}),
		          report ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		            "span",
		            {
		              "data-convfusion-progress-percent": "1",
		              style: { fontSize: "12px", fontVariantNumeric: "tabular-nums", letterSpacing: "0.02em" },
		              children: pct(report.overall)
		            }
		          ) : null
		        ]
		      }
		    ),
		    open ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
		      "div",
		      {
		        ref: panelRef,
		        role: "dialog",
		        "aria-label": "研究进展",
		        "data-convfusion-progress-panel": "1",
		        style: {
		          position: "fixed",
		          top: pos?.top ?? 0,
		          right: pos?.right ?? 12,
		          visibility: pos ? "visible" : "hidden",
		          zIndex: 2147483e3,
		          width: "min(440px, calc(100vw - 24px))",
		          maxHeight: "70vh",
		          overflowY: "auto",
		          padding: "12px 16px 14px",
		          // ⚠️ 面板是**自己画的浮层**，必须显式给出浅色底与文字色：
		          // 这两个 token 在浅色主题下分别是 #fff 与近黑；写错 token 名会静默落到兜底值。
		          background: "var(--dsw-alias-bg-layer-2, #ffffff)",
		          color: "var(--dsw-alias-label-primary, #0f1115)",
		          border: "1px solid var(--dsw-alias-border-l2, rgba(15,17,21,0.10))",
		          borderRadius: "10px",
		          boxShadow: "0 8px 24px rgba(15,17,21,0.12), 0 2px 6px rgba(15,17,21,0.06)",
		          fontSize: "12.5px",
		          lineHeight: 1.6,
		          textAlign: "left"
		        },
		        children: [
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }, children: [
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("strong", { children: "研究进展" }),
		            report ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { style: { color: muted, ...mono }, children: [
		              "成熟度折算 ",
		              pct(report.overall),
		              report.progress.stage ? ` · 当前阶段 ${report.progress.stage}` : ""
		            ] }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { color: muted }, children: "尚无数据" }),
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { style: { marginLeft: "auto", display: "inline-flex", gap: "2px" }, children: [
		              busy ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { color: muted, ...mono }, children: "读取中…" }) : null,
		              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		                "button",
		                {
		                  type: "button",
		                  style: { ...iconButton, opacity: busy ? 0.5 : 1 },
		                  "aria-label": "刷新",
		                  title: "刷新",
		                  disabled: busy,
		                  onClick: () => void load(),
		                  children: "⟳"
		                }
		              ),
		              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", style: iconButton, "aria-label": "关闭", title: "关闭", onClick: () => setOpen(false), children: "✕" })
		            ] })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { color: muted, ...mono }, children: shortenPath(probe.workspace) }),
		          report ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: section, children: [
		              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: sectionTitle, children: "A · 研究成熟度（等级折算，非测量值）" }),
		              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "2px 16px" }, children: report.progress.dimensions.map((d) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "8px" }, children: [
		                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { minWidth: "92px", ...mono }, children: d.dimension }),
		                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Bar, { scale: d.scale }),
		                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { color: muted, ...mono }, children: d.level })
		              ] }, d.dimension)) })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: section, children: [
		              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: sectionTitle, children: "A2 · 可数资产（真实计数）" }),
		              /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "2px 16px" }, children: [
		                report.counts.map((row) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", gap: "8px" }, children: [
		                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { minWidth: "92px", ...mono }, children: row.label }),
		                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: mono, children: row.value }),
		                  row.note ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { color: muted }, children: row.note }) : null
		                ] }, row.key)),
		                /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", gap: "8px" }, children: [
		                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { minWidth: "92px", ...mono }, children: "论文正文" }),
		                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { color: muted }, children: report.paper ? "已有正文" : "尚无正文" })
		                ] })
		              ] }),
		              /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { color: muted }, children: [
		                "Research State 版本：",
		                report.stateVersion
		              ] })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: section, children: [
		              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: sectionTitle, children: "B · 最近一轮变化" }),
		              lastTurn ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
		                /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { color: muted, ...mono }, children: [
		                  "第 ",
		                  lastTurn.turn,
		                  " 轮 · ",
		                  lastTurn.summary
		                ] }),
		                lastTurn.changes.changed ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("ul", { style: { margin: "2px 0 0", paddingLeft: "18px" }, children: [
		                  lastTurn.changes.maturity.map((m) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("li", { children: [
		                    "成熟度 ",
		                    m.dimension,
		                    "：",
		                    m.from,
		                    " → ",
		                    m.to
		                  ] }, `m-${m.dimension}`)),
		                  lastTurn.changes.counts.map((c) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("li", { children: [
		                    c.label,
		                    "：",
		                    c.from,
		                    " → ",
		                    c.to,
		                    "（",
		                    c.to - c.from > 0 ? "+" : "",
		                    c.to - c.from,
		                    "）"
		                  ] }, `c-${c.key}`))
		                ] }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { color: muted }, children: "这一轮没有形成新的可验证研究资产（讨论/澄清不产生资产，这是正常的）。" })
		              ] }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { color: muted }, children: "本会话还没有回合报告（对话结束后宿主才会生成；面板的 A 段始终是最新状态）。" })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: section, children: [
		              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: sectionTitle, children: "C · 当前缺口与推进判定" }),
		              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("ul", { style: { margin: "2px 0 0", paddingLeft: "18px" }, children: report.need.gaps.map((g) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("li", { children: g }, g)) }),
		              /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { marginTop: "2px" }, children: [
		                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { color: muted }, children: "推进判定：" }),
		                clarityText(report.need.clarity),
		                report.need.basis ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { style: { color: muted }, children: [
		                  "（依据：",
		                  report.need.basis,
		                  "）"
		                ] }) : null
		              ] }),
		              report.need.nextStep ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
		                "下一步：",
		                report.need.nextStep
		              ] }) : null,
		              report.need.needsUserDecision ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
		                "待你决定：",
		                report.need.needsUserDecision
		              ] }) : null
		            ] })
		          ] }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { marginTop: "8px", color: muted }, children: "宿主还没有返回这个工作区的进展数据。" }),
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { marginTop: "10px", color: muted, fontSize: "11.5px" }, children: "数据全部来自磁盘上的真实资产（project.md / research-state.md / evidence / claims / plans）。 成熟度是 Research State 的等级折算，不是测量值；这里只陈述研究需求，不代表必须执行的下一步。" })
		        ]
		      }
		    ) : null
		  ] });
		}
		
		// src/client/index.tsx
		var inject = ["slots", "settingsScope"];
		var SECTION_ORDER = 60;
		function apply(ctx) {
		  const scope = ctx.settingsScope.bind({ namespace: "convfusion" });
		  ctx.slots.inject(
		    "settings.section",
		    () => ctx.slots.register(
		      {
		        name: "settings.section",
		        id: "convfusion",
		        order: SECTION_ORDER,
		        // label 由注册方本地化；这里直接给中文名，与 DSH 设置壳的其余中文项一致
		        label: () => "ConvFusion",
		        inject: () => ({ scope })
		      },
		      ConvFusionProjectSettings
		    )
		  );
		  ctx.slots.inject(
		    "conversation.session.header.utilities",
		    () => ctx.slots.register(
		      { name: "conversation.session.header.utilities", id: "convfusion-progress", order: 20 },
		      ResearchProgressButton
		    )
		  );
		  try {
		    installNavIcon(favicon_default);
		  } catch {
		  }
		}
		return module.exports;
	}
});
