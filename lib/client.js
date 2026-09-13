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
		  ResearchProgressCard: () => ResearchProgressCard,
		  ResearchProgressWarmer: () => ResearchProgressWarmer,
		  apply: () => apply,
		  applyNavIcon: () => applyNavIcon,
		  inject: () => inject,
		  installNavIcon: () => installNavIcon,
		  loadSettingsState: () => loadSettingsState,
		  logoUrl: () => favicon_default,
		  resetProgressCardState: () => resetProgressCardState,
		  selectResearchTurn: () => selectResearchTurn
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
		  mono: { fontFamily: "var(--ds-font-family-code)", fontSize: 11 }
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
		          setStaleHost(outcome.state.protocol !== 2);
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
		        const first = next.categories[0];
		        setCategoryId(first.categoryId);
		        const firstSkill = first.skills[0];
		        if (firstSkill) {
		          setSkillId(firstSkill.skillId);
		          setSection(firstSkill.sections[0]?.section ?? "");
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
		    const s0 = cat?.skills[0];
		    setSkillId(s0?.skillId ?? "");
		    setSection(s0?.sections[0]?.section ?? "");
		  };
		  const onSkill = (id) => {
		    setSkillId(id);
		    setNotice(null);
		    const s0 = category?.skills.find((s) => s.skillId === id);
		    setSection(s0?.sections[0]?.section ?? "");
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
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(TabButton, { active: tab === "community", onClick: () => setTab("community"), children: [
		        "◈ 研究方法库",
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { ...S.hint, marginLeft: 6 }, children: "即将开放" })
		      ] }),
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
		    tab === "community" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(CommunityTab, {}) : null,
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
		              c.categoryName,
		              "（",
		              c.skills.length,
		              "）",
		              c.overriddenCount > 0 ? ` · 已定制 ${c.overriddenCount}` : ""
		            ] }, c.categoryId)) }),
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.hint, children: category ? `${category.skills.length} 项能力` : "该类别下暂无可定制能力" })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.field, children: [
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.label, children: "② 能力" }),
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("select", { style: S.select, value: skillId, onChange: (e) => onSkill(e.target.value), children: category?.skills.map((s) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("option", { value: s.skillId, children: [
		              s.skillName,
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
		            skill.skillName,
		            " · ",
		            point.section
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { flex: "1 1 auto" } }),
		          point.overridden ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: "brand", children: "已定制" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: "neutral", children: "系统原文" })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.cardBody, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.hint, children: [
		            category?.categoryName,
		            " · ",
		            skill.skillName,
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
		var COMMUNITY_DEMO_METHODS = [
		  { name: "实验验证导向", discipline: "材料科学", count: 47, author: "convfusion 官方" },
		  { name: "理论建构导向", discipline: "社会科学", count: 39, author: "ss_theory" },
		  { name: "应用与可复现导向", discipline: "机器学习", count: 47, author: "convfusion 官方" },
		  { name: "临床相关性导向", discipline: "生物医学", count: 41, author: "bm_researcher" }
		];
		function CommunityTab() {
		  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.card, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.cardHead, children: [
		        "研究方法库",
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { flex: "1 1 auto" } }),
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: "warn", children: "尚未开放" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.cardBody, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.hint, children: "汇集其他研究者分享的研究方法，可直接套用，也可在此基础上继续定制。" }),
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.row, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.field, children: [
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.label, children: "社区开放方法" }),
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.hint, children: "免费，登录后可浏览与套用" })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.field, children: [
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.label, children: "作者分享的方法库" }),
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.hint, children: "由作者提供，可含付费内容。本期不实现" })
		          ] })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.label, children: "开放方法" }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { flex: "1 1 auto" } }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: "neutral", children: "演示数据" })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.list, children: COMMUNITY_DEMO_METHODS.map((m, i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
		          "div",
		          {
		            style: i === 0 ? S.listRow : { ...S.listRow, borderTop: "1px solid var(--dsw-alias-border-l1)" },
		            children: [
		              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { minWidth: 0, flex: "1 1 auto" }, children: [
		                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.listTitle, children: m.name }),
		                /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.hint, children: [
		                  m.discipline,
		                  " · ",
		                  m.count,
		                  " 项能力 · ",
		                  m.author
		                ] })
		              ] }),
		              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", style: { ...S.ghostBtn, opacity: 0.55 }, disabled: true, children: "套用" })
		            ]
		          },
		          m.name
		        )) }),
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.hint, children: "以上为界面演示，服务尚未开通，暂不可套用。" })
		      ] })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.card, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.cardBody, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { ...S.label, color: "var(--dsw-alias-label-primary)" }, children: "登录 ConvFusion.com 可获得更多研究方法" }),
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.hint, children: "登录后还可将你在「本地研究方法」里定制好的研究方法发布给其他研究者。" }),
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.footer, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", style: { ...S.primaryBtn, opacity: 0.55 }, disabled: true, children: "登录 ConvFusion.com" }),
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: S.hint, children: "服务尚未开通" })
		      ] })
		    ] }) })
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
		  const installCmd = { ...S.mono, display: "inline-block" };
		  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.card, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.cardHead, children: [
		        "🧩 本地依赖",
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { flex: "1 1 auto" } }),
		        dep === null ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: "neutral", children: "未知" }) : dep.available ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: "success", children: "已安装" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: "warn", children: "未安装" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.cardBody, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { ...S.hint, lineHeight: 1.7 }, children: [
		          "论文最终要交付 LaTeX/PDF，编译由本机的",
		          " ",
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: S.mono, children: "tectonic" }),
		          " 完成。它",
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("b", { children: "不是 npm 依赖" }),
		          "，需要单独安装； 未安装时 LaTeX 组装仍然可用，但无法产出 PDF。"
		        ] }),
		        dep ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.field, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.label, children: "tectonic" }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { ...S.hint, lineHeight: 1.9 }, children: [
		            dep.available ? "已找到可执行文件。" : "未在本机找到可执行文件。",
		            dep.path ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
		              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("br", {}),
		              "路径：",
		              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: S.mono, children: dep.path })
		            ] }) : null,
		            dep.version ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
		              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("br", {}),
		              "版本：",
		              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: S.mono, children: dep.version })
		            ] }) : null,
		            dep.viaEnv ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
		              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("br", {}),
		              "由环境变量 ",
		              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: S.mono, children: dep.envVar }),
		              " 指定"
		            ] }) : null,
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("br", {}),
		            "用途：",
		            dep.purpose
		          ] })
		        ] }) : null,
		        dep && !dep.available ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.field, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.label, children: "安装方法（任选其一）" }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { ...S.hint, lineHeight: 2.1 }, children: [
		            "macOS（Homebrew）：",
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("br", {}),
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: installCmd, children: "brew install tectonic" }),
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("br", {}),
		            "Conda / Mamba：",
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("br", {}),
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: installCmd, children: "mamba install -c conda-forge tectonic" }),
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("br", {}),
		            "Rust（Cargo）：",
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("br", {}),
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: installCmd, children: "cargo install tectonic" }),
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("br", {}),
		            "或从 ",
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: S.mono, children: "tectonic-typesetting.github.io" }),
		            " 下载发行版。",
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("br", {}),
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("b", { children: "首次编译" }),
		            "会按需下载宏包（约 40 MB），缓存在研究工作区内，之后复用。"
		          ] })
		        ] }) : null,
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.field, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.label, children: "装在了非标准位置？" }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { ...S.hint, lineHeight: 1.8 }, children: [
		            "设置环境变量 ",
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: S.mono, children: dep?.envVar ?? "CONVFUSION_TECTONIC" }),
		            " ",
		            "指向可执行文件（绝对路径），然后点「重新检查」。"
		          ] })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: S.footer, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		          "button",
		          {
		            type: "button",
		            style: { ...S.ghostBtn, opacity: checking ? 0.55 : 1 },
		            disabled: checking,
		            onClick: () => void recheck(),
		            children: checking ? "检查中…" : "重新检查"
		          }
		        ) })
		      ] })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.card, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.cardHead, children: [
		        "⌕ 文献检索",
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { flex: "1 1 auto" } }),
		        configured ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: "success", children: "已配置" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { tone: "warn", children: "未配置" })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.cardBody, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.hint, children: [
		          "文献检索使用 OpenAlex。请前往 ",
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: S.mono, children: "openalex.org" }),
		          " 免费注册并复制 API Key。 未配置时仍可通过公共池检索，但速率较低。"
		        ] }),
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
		              onChange: (e) => setDraft(e.target.value)
		            }
		          ),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: S.hint, children: [
		            "留空则不修改。密钥仅保存在本机，不会发送到浏览器。",
		            source === "env" ? ` 当前使用环境变量 ${envVar}。` : ""
		          ] })
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
		
		// src/client/progress-card.tsx
		var import_react2 = require("react");
		var import_jsx_runtime3 = require("react/jsx-runtime");
		var researchSessions = /* @__PURE__ */ new Map();
		var activeSessionId;
		function resetProgressCardState(active) {
		  researchSessions.clear();
		  activeSessionId = active;
		}
		function selectResearchTurn() {
		  const id = activeSessionId;
		  if (!id) return null;
		  return researchSessions.get(id) === true ? { sessionId: id } : null;
		}
		function ResearchProgressWarmer({ sessionId }) {
		  (0, import_react2.useEffect)(() => {
		    if (!sessionId) return;
		    activeSessionId = sessionId;
		    if (researchSessions.has(sessionId)) return;
		    let cancelled = false;
		    void (async () => {
		      try {
		        const res = await fetchSettingsSend("progress/session", { sessionId });
		        if (cancelled) return;
		        researchSessions.set(sessionId, res?.ok === true && res.value?.research === true);
		      } catch {
		        if (!cancelled) researchSessions.set(sessionId, false);
		      }
		    })();
		    return () => {
		      cancelled = true;
		    };
		  }, [sessionId]);
		  return null;
		}
		var pct = (v) => `${Math.round(v * 100)}%`;
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
		        background: "var(--dsw-alias-fill-tertiary, rgba(127,127,127,0.22))",
		        overflow: "hidden",
		        verticalAlign: "middle"
		      },
		      children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { display: "block", width, height: "100%", background: "var(--dsw-alias-brand-primary, #4b7bec)" } })
		    }
		  );
		}
		function delta(before, after) {
		  const d = Math.round((after - before) * 100);
		  if (d > 0) return `↑${d}%`;
		  if (d < 0) return `↓${Math.abs(d)}%`;
		  return "—";
		}
		function ResearchProgressCard({ sessionId, turn, seq }) {
		  const [report, setReport] = (0, import_react2.useState)(null);
		  const turnNo = turn?.turn;
		  (0, import_react2.useEffect)(() => {
		    if (!sessionId) return;
		    let cancelled = false;
		    void (async () => {
		      try {
		        const res = await fetchSettingsSend("progress/latest", { sessionId });
		        if (cancelled) return;
		        setReport(res?.ok === true ? res.value?.report ?? null : null);
		      } catch {
		        if (!cancelled) setReport(null);
		      }
		    })();
		    return () => {
		      cancelled = true;
		    };
		  }, [sessionId, turnNo, seq]);
		  if (!report) return null;
		  const muted = "var(--dsw-alias-label-tertiary, #8a8f98)";
		  const box = {
		    margin: "8px 0 4px",
		    padding: "10px 14px 12px",
		    border: "1px solid var(--dsw-alias-border-secondary, rgba(127,127,127,0.22))",
		    borderRadius: "10px",
		    background: "var(--dsw-alias-bg-elevated, rgba(127,127,127,0.06))",
		    fontSize: "12.5px",
		    lineHeight: 1.6
		  };
		  const head = {
		    display: "flex",
		    alignItems: "baseline",
		    gap: "8px",
		    flexWrap: "wrap"
		  };
		  const section = { marginTop: "8px" };
		  const sectionTitle = { color: muted, fontSize: "11.5px", letterSpacing: "0.04em" };
		  const mono = {
		    fontFamily: "var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace)",
		    fontSize: "11.5px"
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: box, "data-convfusion-progress-card": "1", "data-turn": report.turn, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: head, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { fontSize: "14px" }, children: "📊" }),
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("strong", { children: "本轮研究进展" }),
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { style: { color: muted, ...mono }, children: [
		        "成熟度折算 ",
		        pct(report.overall.before),
		        " → ",
		        pct(report.overall.after)
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { color: report.moved ? "var(--dsw-alias-brand-primary, #4b7bec)" : muted, ...mono }, children: delta(report.overall.before, report.overall.after) }),
		      report.progress.stage ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { style: { color: muted }, children: [
		        "· 当前阶段 ",
		        report.progress.stage
		      ] }) : null
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: section, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: sectionTitle, children: "A · 研究成熟度（等级折算，非测量值）" }),
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "2px 18px" }, children: report.progress.dimensions.map((d) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "8px" }, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { minWidth: "92px", ...mono }, children: d.dimension }),
		        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Bar, { scale: d.scale }),
		        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { color: muted, ...mono }, children: d.level })
		      ] }, d.dimension)) })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: section, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: sectionTitle, children: "B · 本轮变化" }),
		      report.changes.changed ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("ul", { style: { margin: "2px 0 0", paddingLeft: "18px" }, children: [
		        report.changes.maturity.map((m) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("li", { children: [
		          "成熟度 ",
		          m.dimension,
		          "：",
		          m.from,
		          " → ",
		          m.to
		        ] }, `m-${m.dimension}`)),
		        report.changes.counts.map((c) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("li", { children: [
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
		      ] }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { color: muted }, children: "本轮没有形成新的可验证研究资产（讨论/澄清不产生资产，这是正常的）。" })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: section, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: sectionTitle, children: "C · 当前缺口与推进判定" }),
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("ul", { style: { margin: "2px 0 0", paddingLeft: "18px" }, children: report.need.gaps.map((g) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("li", { children: g }, g)) }),
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { marginTop: "2px" }, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { color: muted }, children: "推进判定：" }),
		        report.need.clarity === "clear" ? "方向明确 → 可直接推进" : report.need.clarity === "ambiguous" ? "需要你选一个方向" : report.need.clarity === "blocked" ? "等你拍板（阻塞）" : "（未判定）",
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
		      ] }) : null,
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { marginTop: "4px", color: muted }, children: "以上是 Research State 暴露出的研究需求，不是必须执行的下一步。你可以接受，也可以继续自由对话。" })
		    ] })
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
		    "conversation.input.dock",
		    () => ctx.slots.register(
		      { name: "conversation.input.dock", id: "convfusion-progress-warm", order: 900 },
		      ResearchProgressWarmer
		    )
		  );
		  ctx.slots.inject(
		    "conversation.chat.turnTail",
		    () => ctx.slots.register(
		      { name: "conversation.chat.turnTail", id: "convfusion-progress-card", order: -100, select: selectResearchTurn },
		      ResearchProgressCard
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
