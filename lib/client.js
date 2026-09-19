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

		// src/client/i18n/en.ts
		var en = {
		  "settings.nav": "ConvFusion",
		  "settings.hero.subtitle": "Customize capabilities to create your own research methodology",
		  "settings.badge.customized": "{count} customized",
		  "settings.badge.systemDefaults": "Using all system defaults",
		  "settings.badge.readOnly": "Read-only settings",
		  "settings.tab.local": "Local Methodology",
		  "settings.tab.community": "ConvFusion.com",
		  "settings.tab.system": "System Settings",
		  "settings.status.needsConfiguration": "Needs setup",
		  "settings.stale.title": "Host restart required",
		  "settings.stale.badge": "Restart required",
		  "settings.stale.body": "The Host is still running older code, so the content below may be outdated.",
		  "settings.stale.action": "Refreshing this page will not help because Host modules are loaded when DSH starts. Restart DSH, then reopen this page.",
		  "settings.error.title": "Unable to load",
		  "settings.error.badge": "Error",
		  "settings.error.missingTransport": "The settings page has no transport implementation.",
		  "settings.error.service": "The settings service returned an error: {detail}",
		  "settings.error.incomplete": "The settings service returned incomplete data. Restart DSH and try again.",
		  "settings.error.timeout": "The request timed out after {seconds} seconds. Check the DSH Host logs for entries related to {route}.",
		  "settings.error.connection": "Could not connect to the settings service: {detail}\n(Route: {route}. The DSH Host logs record whether this route was registered.)",
		  "settings.error.call": "The {endpoint} request failed: {detail}",
		  "settings.error.unknown": "Unknown cause",
		  "settings.error.code.bad-request": "The request is missing required data.",
		  "settings.error.code.not-customizable": "This section cannot be customized.",
		  "settings.error.code.unknown-endpoint": "The settings endpoint is not supported.",
		  "settings.error.code.not-found": "The requested settings route was not found.",
		  "settings.error.code.method-not-allowed": "The settings route rejected this request method.",
		  "settings.error.code.rejected": "The request was rejected by the DSH trust or authentication check.",
		  "settings.error.code.bad-body": "The request body is invalid.",
		  "settings.action.retry": "Retry",
		  "settings.status.loading": "Loading…",
		  "settings.library.title": "Capability Library",
		  "settings.library.summary": "{total} items · {customized} customized",
		  "settings.library.category": "① Capability category",
		  "settings.library.skill": "② Capability",
		  "settings.library.section": "③ Customizable section",
		  "settings.library.optionCount": "{count}",
		  "settings.library.customizedSuffix": " · {count} customized",
		  "settings.library.categoryHint": "{count} capabilities · Categories follow the research process",
		  "settings.library.emptyCategory": "No customizable capabilities in this category",
		  "settings.library.sectionCount": "{count} sections",
		  "settings.library.sectionCustomizedSuffix": " · Customized",
		  "settings.library.emptyUsesDefault": "Leave blank to use the system default",
		  "settings.editor.customized": "Customized",
		  "settings.editor.systemDefault": "System default",
		  "settings.editor.requirements": "Your additional requirements",
		  "settings.editor.placeholder": "Leave blank to use the system default.\nExample: When evaluating research ideas, prioritize whether characterization can be completed with available equipment.",
		  "settings.editor.base": "System default ({count} characters)",
		  "settings.editor.characterCount": "{count} characters",
		  "settings.editor.resetSection": "Reset section",
		  "settings.editor.resetSkill": "Reset capability",
		  "settings.editor.save": "Save",
		  "settings.editor.saving": "Saving…",
		  "settings.editor.saved": "Saved",
		  "settings.editor.restoredDefault": "Restored system default",
		  "settings.editor.restoredSkill": "Restored “{skill}”",
		  "settings.editor.confirmSection": "Restore the system default for “{section}”? Your customization will be deleted.",
		  "settings.editor.confirmSkill": "Restore all sections of “{skill}”? This capability’s customizations will be deleted.",
		  "community.title": "ConvFusion.com",
		  "community.notice.published": "{title} · state v{version}",
		  "community.notice.tokens": "{tokens} Token",
		  "community.notice.files": "{count} attachment(s)",
		  "community.notice.oversize": "{count} too large to upload",
		  "community.publish.title": "Publish {title}",
		  "community.publish.cost": "Costs {tokens} Token : ConvFusion.com",
		  "community.publish.costUnknown": "Cost unknown",
		  "community.publish.unknown": "unknown",
		  "community.publish.storage": "This upload {selected} · server free {available}",
		  "community.publish.changed": "{count} file(s) to update",
		  "community.publish.unchanged": "no content changes",
		  "community.publish.expand": "Expand",
		  "community.publish.collapse": "Collapse",
		  "community.publish.tooLarge": "over the per-file limit",
		  "community.publish.oversizeWarning": "{count} file(s) exceed the server per-file limit (100 MB) and will not be uploaded.",
		  "community.publish.summary": "{files} file(s) selected · {size} · {batches} batch(es)",
		  "community.publish.remember": "Remember this selection",
		  "community.publish.confirm": "Publish",
		  "community.action.cancel": "Cancel",
		  "upload.category.state": "Research state and definition",
		  "upload.category.plans": "Research plans",
		  "upload.category.papers": "Paper and figures",
		  "upload.category.experiments": "Experiments and code",
		  "upload.category.research-assets": "Research assets",
		  "upload.category.outputs": "Outputs",
		  "upload.category.literature-raw": "Literature extracts and search payloads",
		  "upload.category.literature-fulltext": "Literature full texts (PDF)",
		  "upload.category.large-files": "Large files (≥10 MB)",
		  "upload.category.others": "Other files",
		  "upload.reason.state": "The core evidence of what this research is",
		  "upload.reason.plans": "Plans: what happens next and where it stands",
		  "upload.reason.papers": "Paper text and figures: how results are expressed",
		  "upload.reason.experiments": "Experiment scripts and results: how it was verified",
		  "upload.reason.research-assets": "Evidence, claims, decisions and literature notes: the researcher’s judgement",
		  "upload.reason.outputs": "Deliverables (reports, slides, …)",
		  "upload.reason.literature-raw": "Machine-extracted text and raw search payloads: not uploaded by default",
		  "upload.reason.literature-fulltext": "Other people’s papers: not uploaded by default; select individually if needed",
		  "upload.reason.large-files": "Single files ≥10 MB: not uploaded by default; select if genuinely useful",
		  "upload.reason.others": "Unclassified files: not uploaded by default",
		  "community.action.seekMentor": "Find a mentor",
		  "community.action.republish": "Update",
		  "community.action.publishing": "Publishing…",
		  "community.badge.inNetwork": "On the network",
		  "community.badge.published": "Published",
		  "community.tip.publish": "Publish this research progress to ConvFusion.com so mentors can discover it. Research methods are never uploaded.",
		  "community.tip.publishNeedSignIn": "Sign in to ConvFusion.com before publishing",
		  "community.hint.publishMissing": "These fields have no content on this machine yet, so they are not visible on the network: {fields}.",
		  "community.error.publish": "Publishing failed.",
		  "community.tab.account": "Account",
		  "community.tab.signIn": "Sign in",
		  "community.tab.server": "Server",
		  "community.work.title": "Research work",
		  "community.tab.mine": "Mine",
		  "community.tab.mentor": "Can mentor",
		  "community.login.keyLabel": "Sign in with API key",
		  "community.server.address": "Server address",
		  "community.server.title": "Leave empty to follow the environment config (this environment defaults to {url}); addresses containing /api or /docs are normalized automatically.",
		  "community.badge.production": "Production",
		  "community.badge.development": "Development",
		  "community.badge.envMismatch": "Address does not match environment",
		  "community.badge.checking": "Checking…",
		  "community.badge.signedIn": "Signed in",
		  "community.badge.unverified": "Credential unverified",
		  "community.badge.signedOut": "Not signed in",
		  "community.badge.sample": "Sample data",
		  "community.badge.charged": "Charged",
		  "community.badge.registryUnavailable": "Registry unavailable",
		  "community.badge.mentorRequired": "Mentor role required",
		  "community.badge.addressChanged": "Address changed",
		  // Two disclosure levels, named for what the reader is doing:
		  //   Overview = topic + work note, free, to judge relevance;
		  //   Details  = motivation / core idea / hypothesis / method / evidence / open problems, 1 Token.
		  "community.action.summary": "Overview",
		  "community.action.collapse": "Collapse",
		  // The button carries only the action; price/state goes in the badge after it
		  "community.action.brief": "Details",
		  "community.briefState.cost": "1 Token",
		  "community.briefState.paid": "Paid",
		  "community.action.loading": "Loading…",
		  "community.action.refresh": "Refresh",
		  "community.action.retry": "Retry",
		  "community.action.reverify": "Re-verify",
		  "community.action.reverifying": "Working…",
		  "community.action.retryVerify": "Retry verification",
		  "community.action.signIn": "Sign in",
		  "community.action.signingIn": "Signing in…",
		  "community.action.signOut": "Sign out",
		  "community.action.register": "Register and sign in",
		  "community.action.registering": "Registering…",
		  "community.action.inviteShow": "Register with an invitation",
		  "community.action.inviteHide": "Hide invitation form",
		  "community.tip.summary": "Free: topic and work note — see whether it relates to you",
		  "community.tip.briefDisabled": "Sign in to read the details",
		  "community.tip.briefCost": "Go deeper: motivation / core idea / hypothesis / method / evidence / open problems (1 Token on first read)",
		  "community.tip.briefUnlocked": "Unlocked: re-reading this one is free",
		  // Charged-action confirmation: clicking Brief only opens this dialog; the request (and the charge) happens on confirm
		  "community.briefConfirm.title": "Reading the details costs Tokens",
		  "community.briefConfirm.scope": "Includes: motivation / core idea / hypothesis / method overview / key evidence / open problems",
		  "community.briefConfirm.cost": "First read costs 1 Token (free for your own research)",
		  "community.briefConfirm.balance": "Balance {balance}",
		  "community.briefConfirm.balanceUnknown": "Balance unknown",
		  "community.briefConfirm.idempotent": "Re-opening the same research does not charge again",
		  "community.briefConfirm.confirm": "Confirm",
		  "community.tip.balance": "Click to refresh the balance",
		  "community.tip.balanceDetail": "Available {available} · frozen {frozen} (frozen funds are still yours, merely locked)",
		  "community.tip.keyPrivacy": "The credential is stored only on this machine (DSH settings); it is never sent back to the browser or written into the conversation.",
		  "community.tip.envKey": "The credential comes from an environment variable; change it and restart DSH",
		  "community.balance.frozenNote": " (+{count} frozen)",
		  "community.detail.researchQuestion": "Research question",
		  "community.detail.summary": "Summary",
		  "community.detail.motivation": "Motivation",
		  "community.detail.coreIdea": "Core idea",
		  "community.detail.hypothesis": "Hypothesis",
		  "community.detail.methodOverview": "Method overview",
		  "community.detail.keyEvidence": "Key evidence",
		  "community.detail.openProblems": "Open problems",
		  "community.hint.inviteRule": "The email must match the one the invitation was issued to; the API key issued on registration is stored on this machine automatically.",
		  "community.hint.addressChanged": "Using the new address requires signing in again (the credential is bound to the server).",
		  "community.hint.mismatchProduction": "This is the production environment but the address points at localhost — you are most likely connected to a development server on this machine.",
		  "community.hint.mismatchDevelopment": "This is the development environment but the address points at the live server — acting on live data from a development machine is risky; please confirm this is intended.",
		  "community.hint.sampleFootnote": "Sample data; sign in to browse and act on research work from the network.",
		  "community.hint.mentorRequiresRole": "Browsing mentorable research work requires the mentor role (current: {roles}).",
		  "community.hint.registryUnavailable": "This DSH instance does not provide the workspace registry.",
		  "community.hint.loading": "Loading…",
		  "community.hint.loadingWork": "Loading research work…",
		  "community.hint.noData": "No data.",
		  "community.hint.mineEmpty": "No local research projects yet (workspaces containing a valid research workspace appear here).",
		  "community.hint.paper": "Paper available",
		  "community.hint.noDiscoverable": "No discoverable research work right now.",
		  "community.error.unknown": "Unknown reason",
		  "community.error.readAccount": "Failed to read the sign-in state.",
		  "community.error.readAccountDetail": "Cannot read the sign-in state: {detail}",
		  "community.error.readWorkList": "Failed to load the research work list.",
		  "community.error.readMine": "Failed to load local research work.",
		  "community.error.readSummary": "Failed to load the overview.",
		  "community.error.readBrief": "Failed to load the details.",
		  "community.error.hostRestart": "The host must be restarted: it does not expose the work/mine endpoint yet.",
		  "community.error.transport": "Cannot reach {route} ({detail}). Check the DSH host log.",
		  "community.notice.charged": "Details read; {tokens} Token charged (balance {balance})",
		  "community.notice.briefRead": "Details read (balance {balance})",
		  "community.placeholder.invitation": "Invitation code cf_inv_…",
		  "community.placeholder.email": "Email (must match the invitation)",
		  "community.placeholder.displayName": "Display name",
		  "community.sample.retrieval.title": "Retrieval-augmented long-context reasoning",
		  "community.sample.retrieval.fields": "Natural language processing",
		  "community.sample.robotFailure.title": "Visual judgement of robot manipulation failures",
		  "community.sample.robotFailure.fields": "Robot learning, Multimodal",
		  "community.sample.lidar.title": "Vision-LiDAR cross-modal localisation",
		  "community.sample.lidar.fields": "Multimodal, Robotics",
		  "community.role.RESEARCHER": "Researcher",
		  "community.role.MENTOR": "Mentor",
		  "community.role.ADMIN": "Administrator",
		  "community.status.ACTIVE": "Active",
		  "community.status.SUSPENDED": "Suspended",
		  "community.status.DEACTIVATED": "Deactivated",
		  "community.stage.IDEA": "Idea",
		  "community.stage.LITERATURE": "Literature",
		  "community.stage.HYPOTHESIS": "Hypothesis",
		  "community.stage.PLANNING": "Planning",
		  "community.stage.IMPLEMENTATION": "Implementation",
		  "community.stage.EXPERIMENT": "Experiment",
		  "community.stage.ANALYSIS": "Analysis",
		  "community.stage.WRITING": "Writing",
		  "community.stage.COMPLETED": "Completed",
		  "settings.library.localOnly": "Local only",
		  "system.retrieval.notConfigured": "Not configured: register for free at",
		  "system.retrieval.notConfiguredAction": "and paste a key (without one, searches use the public pool at a lower rate).",
		  "system.retrieval.envFrom": "Currently provided by the environment variable",
		  "system.retrieval.envFromAction": "; saving a key here overrides it.",
		  "system.dependency.title": "Local dependency",
		  "system.status.unknown": "Unknown",
		  "system.status.installed": "Installed",
		  "system.status.notInstalled": "Not installed",
		  "system.dependency.viaEnv": "(specified by {envVar})",
		  "system.dependency.checking": "Checking…",
		  "system.dependency.recheck": "Check again",
		  "system.dependency.available": "tectonic is available{version}",
		  "system.dependency.missing": "tectonic was not found. Install it using the instructions below, then check again.",
		  "system.dependency.installIntro": "Compiling a paper to PDF requires tectonic on this machine (it is not an npm dependency). Install it using any one of these commands:",
		  "system.dependency.installOutro": "If it is installed elsewhere, set {envVar} to its path, then click “Check again”. The first compilation downloads about 40 MB of packages; later runs reuse them.",
		  "system.retrieval.title": "Literature search",
		  "system.status.configured": "Configured",
		  "system.status.notConfigured": "Not configured",
		  "system.retrieval.placeholderReplace": "A key is set; enter a new value to replace it",
		  "system.retrieval.placeholderPaste": "Paste API Key",
		  "system.retrieval.secretHint": "Leave blank to keep the current value. The key is stored locally and is never returned to the browser.",
		  "system.retrieval.clear": "Clear",
		  "system.retrieval.saved": "OpenAlex API Key saved",
		  "system.retrieval.cleared": "OpenAlex API Key cleared",
		  "system.retrieval.saveFailed": "Save failed: {detail}",
		  "system.retrieval.clearFailed": "Clear failed: {detail}",
		  "progress.name": "Research progress",
		  "progress.button.ariaWithPercent": "Research progress (maturity conversion {percent})",
		  "progress.button.title": "View research progress for this workspace",
		  "progress.button.titleWithPercent": "View research progress for this workspace (maturity conversion {percent})",
		  "progress.summary": "Maturity conversion {percent}",
		  "progress.currentStage": " · Current stage: {stage}",
		  "progress.noData": "No data yet",
		  "progress.reading": "Reading…",
		  "progress.refresh": "Refresh",
		  "progress.close": "Close",
		  "progress.section.maturity": "A · Research maturity (level conversion, not a measurement)",
		  "progress.section.assets": "A2 · Countable assets (actual counts)",
		  "progress.paper": "Paper body",
		  "progress.paper.present": "Draft exists",
		  "progress.paper.absent": "No draft yet",
		  "progress.stateVersion": "Research State version: {version}",
		  "progress.section.turn": "B · Most recent turn",
		  "progress.turn.summary": "Turn {turn} · Maturity conversion {before} → {after}{assetChange}",
		  "progress.turn.assetChange": " · {count} asset changes",
		  "progress.turn.noAssetChange": " · No asset changes",
		  "progress.turn.maturityChange": "Maturity {dimension}: {from} → {to}",
		  "progress.turn.countChange": "{label}: {from} → {to} ({delta})",
		  "progress.turn.noChange": "This turn created no new verifiable research assets. Discussion and clarification do not create assets, which is normal.",
		  "progress.turn.unavailable": "This session has no turn report yet. The Host creates one after a conversation turn; section A always shows the latest state.",
		  "progress.section.need": "C · Current gaps and advance assessment",
		  "progress.need.assessment": "Advance assessment:",
		  "progress.need.basis": " (Basis: {basis})",
		  "progress.need.nextStep": "Next step: {text}",
		  "progress.need.decision": "Your decision is needed: {text}",
		  "progress.basis.blockingQuestion": "A research question is explicitly marked as blocking",
		  "progress.basis.stalled": "No new verifiable research assets were created for {rounds} consecutive turns",
		  "progress.basis.draftPlans": "{count} plans are still drafts ({plans})",
		  "progress.basis.processComplete": "Every research-process stage has a landed asset; there is no structural gap",
		  "progress.basis.stagePending": "The current stage “{stage}” has not landed yet ({evidence})",
		  "progress.decision.stalled": "The current approach is not producing assets. Continue in this direction, switch direction, or adjust the objective?",
		  "progress.decision.draftPlans": "Several plans are still drafts and have not been ranked. Choose a primary plan or provide selection criteria.",
		  "progress.decision.processComplete": "Should the research deepen, move to writing, or open a new question? Choose a direction.",
		  "progress.noReport": "The Host has not returned progress data for this workspace yet.",
		  "progress.footnote": "All data comes from real assets on disk (project.md / research-state.md / evidence / claims / plans). Maturity is a conversion of Research State levels, not a measurement. This panel describes research needs; it does not prescribe the next action.",
		  "progress.clarity.clear": "Direction is clear → proceed directly",
		  "progress.clarity.ambiguous": "Choose a direction",
		  "progress.clarity.blocked": "Waiting for your decision (blocked)",
		  "progress.clarity.unknown": "Not assessed",
		  "progress.gap.stagePending": "Current research-process stage: {stage} (not yet landed)",
		  "progress.gap.processComplete": "Every research-process stage has a landed asset",
		  "progress.gap.unsupportedClaims": "{count} claims still lack supporting evidence",
		  "progress.gap.missingArtifacts": "{count} evidence items lack a raw-artifact reference (incomplete provenance)",
		  "progress.gap.openQuestions": "{count} open questions remain",
		  "progress.stage.problem": "Problem Definition",
		  "progress.stage.literature": "Literature Grounding",
		  "progress.stage.innovation": "Innovation and Hypotheses",
		  "progress.stage.method": "Method Design",
		  "progress.stage.experiment": "Experimental Validation",
		  "progress.stage.analysis": "Analysis and Argument",
		  "progress.stage.decision": "Research Decision",
		  "progress.stage.writing": "Academic Writing",
		  "progress.stageEvidence.problem": "a falsifiable research question and scope (project.md)",
		  "progress.stageEvidence.literature": "retrieved literature evidence (research/evidence/)",
		  "progress.stageEvidence.innovation": "testable hypotheses and claims (research/claims/)",
		  "progress.stageEvidence.method": "a method design implementable by a third party",
		  "progress.stageEvidence.experiment": "experimental artifacts (experiments/<name>/results/)",
		  "progress.stageEvidence.analysis": "settled result evidence (Evidence status supported/verified)",
		  "progress.stageEvidence.decision": "research decisions with recorded rationale (research/decisions/)",
		  "progress.stageEvidence.writing": "paper body (papers/<id>/paper.md)",
		  "progress.stageOutput.problem": "Formulate a falsifiable research question and scope in project.md.",
		  "progress.stageOutput.literature": "Collect actual literature evidence in research/evidence/.",
		  "progress.stageOutput.innovation": "Create testable hypotheses and claims in research/claims/.",
		  "progress.stageOutput.method": "Produce a method design that a third party can implement.",
		  "progress.stageOutput.experiment": "Produce experimental artifacts under experiments/<name>/results/.",
		  "progress.stageOutput.analysis": "Settle result evidence as supported or verified.",
		  "progress.stageOutput.decision": "Record a research decision and its rationale in research/decisions/.",
		  "progress.stageOutput.writing": "Develop the paper body under papers/<id>/paper.md.",
		  "progress.count.evidence": "Evidence",
		  "progress.count.claims": "Claims",
		  "progress.count.decisions": "Decisions",
		  "progress.count.plans": "Plans",
		  "progress.count.openQuestions": "Open questions",
		  "progress.count.outputs": "Outputs",
		  "progress.count.settled": "{count} confirmed",
		  "progress.count.supported": "{count} supported by evidence",
		  "progress.count.ready": "{count} executable",
		  "maturity.dimension.Problem": "Problem",
		  "maturity.dimension.Knowledge": "Knowledge",
		  "maturity.dimension.Innovation": "Innovation",
		  "maturity.dimension.Method": "Method",
		  "maturity.dimension.Experiment": "Experiment",
		  "maturity.dimension.Evidence": "Evidence",
		  "maturity.level.Unknown": "Unknown",
		  "maturity.level.Weak": "Weak",
		  "maturity.level.Emerging": "Emerging",
		  "maturity.level.Strong": "Strong",
		  "maturity.level.Established": "Established",
		  "section.Purpose": "Purpose",
		  "section.When to Use": "When to Use",
		  "section.Research Method": "Research Method",
		  "section.Reasoning Guidance": "Reasoning Guidance",
		  "section.Evidence Requirements": "Evidence Requirements",
		  "section.Expected Output": "Expected Output",
		  "taxonomy.category.research-understanding": "Research Understanding",
		  "taxonomy.category.literature": "Literature",
		  "taxonomy.category.innovation": "Innovation",
		  "taxonomy.category.methodology": "Methodology",
		  "taxonomy.category.experiment": "Experiment",
		  "taxonomy.category.analysis": "Analysis",
		  "taxonomy.category.research-decision": "Research Decision",
		  "taxonomy.category.academic-writing": "Academic Writing",
		  "taxonomy.category.research-management": "Research Management",
		  "taxonomy.skill.topic-understanding": "Topic Understanding",
		  "taxonomy.skill.research-intent-assessment": "Research Intent Assessment",
		  "taxonomy.skill.problem-definition": "Problem Definition",
		  "taxonomy.skill.research-domain-profiling": "Research Domain Profiling",
		  "taxonomy.skill.research-foundation-assessment": "Research Foundation Assessment",
		  "taxonomy.skill.literature-search": "Literature Search",
		  "taxonomy.skill.literature-screening": "Literature Screening",
		  "taxonomy.skill.paper-fulltext-download": "Paper Full-Text Download",
		  "taxonomy.skill.literature-review": "Literature Review",
		  "taxonomy.skill.research-landscape": "Research Landscape",
		  "taxonomy.skill.research-idea-generation": "Research Idea Generation",
		  "taxonomy.skill.innovation-gap-analysis": "Innovation Gap Analysis",
		  "taxonomy.skill.idea-novelty-assessment": "Idea Novelty Assessment",
		  "taxonomy.skill.hypothesis-formulation": "Hypothesis Formulation",
		  "taxonomy.skill.contribution-design": "Contribution Design",
		  "taxonomy.skill.research-method-design": "Research Method Design",
		  "taxonomy.skill.experiment-design": "Experiment Design & Feasibility",
		  "taxonomy.skill.dataset-selection": "Dataset Selection & Data Pipeline Specification",
		  "taxonomy.skill.baseline-selection": "Baseline Selection & Comparison Protocol",
		  "taxonomy.skill.evaluation-protocol": "Evaluation Protocol & Metric Design",
		  "taxonomy.skill.ablation-design": "Ablation & Contribution Isolation",
		  "taxonomy.skill.reproducible-implementation-spec": "Reproducible Implementation Specification",
		  "taxonomy.skill.simulation-baseline": "Simulation-First Results & Baseline Reference",
		  "taxonomy.skill.result-analysis": "Result Analysis & Finding Extraction",
		  "taxonomy.skill.comparative-analysis": "Comparative Analysis & Significance",
		  "taxonomy.skill.evidence-assessment": "Evidence Assessment & Claim Traceability",
		  "taxonomy.skill.research-direction-steering": "Research Direction Steering",
		  "taxonomy.skill.research-topic-ranking": "Research Topic Ranking",
		  "taxonomy.skill.research-direction": "Research Direction",
		  "taxonomy.skill.research-direction-selection": "Research Direction Selection",
		  "taxonomy.skill.plan-risk-assessment": "Plan Risk Assessment",
		  "taxonomy.skill.research-risk-assessment": "Research Risk Assessment",
		  "taxonomy.skill.feasibility-cost-and-resource-plan": "Feasibility, Cost and Resource Plan",
		  "taxonomy.skill.go-no-go-decision": "Go / No-Go Decision",
		  "taxonomy.skill.venue-fit-decision": "Venue Fit Decision",
		  "taxonomy.skill.paper-architecture": "Paper Architecture",
		  "taxonomy.skill.research-narrative": "Research Narrative and Positioning",
		  "taxonomy.skill.section-drafting": "Section Drafting from Evidence",
		  "taxonomy.skill.equation-formalization": "Equation Formalization",
		  "taxonomy.skill.visual-evidence-selection": "Visual Evidence Selection",
		  "taxonomy.skill.manuscript-revision": "Manuscript Revision and Style",
		  "taxonomy.skill.submission-compile-and-format": "Submission Formatting and Compile Repair",
		  "taxonomy.skill.technical-report-writing": "Technical Report Writing",
		  "taxonomy.skill.patent-drafting": "Patent Drafting",
		  "taxonomy.skill.presentation-design": "Research Presentation Design",
		  "taxonomy.skill.research-process": "Research Process",
		  "taxonomy.skill.research-strategy-portfolio": "Research Strategy Portfolio",
		  "taxonomy.skill.experiment-pipeline-design": "Experiment Pipeline Design",
		  "taxonomy.skill.resource-requirement-estimation": "Resource Requirement Estimation",
		  "taxonomy.skill.infrastructure-cost-selection": "Infrastructure and Cost Selection"
		};

		// src/client/i18n/zh.ts
		var zh = {
		  "settings.nav": "ConvFusion",
		  "settings.hero.subtitle": "定制各项能力，形成你自己的研究方法",
		  "settings.badge.customized": "已定制 {count} 项",
		  "settings.badge.systemDefaults": "全部使用系统原文",
		  "settings.badge.readOnly": "设置只读",
		  "settings.tab.local": "本地研究方法",
		  "settings.tab.community": "ConvFusion.com",
		  "settings.tab.system": "系统设置",
		  "settings.status.needsConfiguration": "待配置",
		  "settings.stale.title": "宿主侧需要重启",
		  "settings.stale.badge": "需重启",
		  "settings.stale.body": "宿主侧仍在运行旧代码，下面的内容可能不是最新的。",
		  "settings.stale.action": "刷新页面不会生效（宿主模块在 DSH 启动时载入内存）。请重启 DSH 后再打开本页。",
		  "settings.error.title": "加载失败",
		  "settings.error.badge": "错误",
		  "settings.error.missingTransport": "设置页缺少传输实现。",
		  "settings.error.service": "设置服务返回失败：{detail}",
		  "settings.error.incomplete": "设置服务返回的数据不完整，请重启 DSH 后重试。",
		  "settings.error.timeout": "请求超时（{seconds} 秒无响应）。若反复出现，请查看 DSH 宿主日志中与 {route} 相关的记录。",
		  "settings.error.connection": "无法连接设置服务：{detail}\n（路由 {route}。DSH 宿主日志会记录该路由的注册结果。）",
		  "settings.error.call": "调用 {endpoint} 失败：{detail}",
		  "settings.error.unknown": "未知原因",
		  "settings.error.code.bad-request": "请求缺少必要数据。",
		  "settings.error.code.not-customizable": "该章节不允许定制。",
		  "settings.error.code.unknown-endpoint": "设置服务不支持该端点。",
		  "settings.error.code.not-found": "未找到请求的设置路由。",
		  "settings.error.code.method-not-allowed": "设置路由不接受该请求方法。",
		  "settings.error.code.rejected": "请求被 DSH 的信任或认证检查拒绝。",
		  "settings.error.code.bad-body": "请求体无效。",
		  "settings.action.retry": "重试",
		  "settings.status.loading": "正在加载…",
		  "settings.library.title": "能力库",
		  "settings.library.summary": "共 {total} 项 · 已定制 {customized}",
		  "settings.library.category": "① 能力类别",
		  "settings.library.skill": "② 能力",
		  "settings.library.section": "③ 可定制章节",
		  "settings.library.optionCount": "{count}",
		  "settings.library.customizedSuffix": " · 已定制 {count}",
		  "settings.library.categoryHint": "{count} 项能力 · 类别按研究过程排序",
		  "settings.library.emptyCategory": "该类别下暂无可定制能力",
		  "settings.library.sectionCount": "{count} 个章节",
		  "settings.library.sectionCustomizedSuffix": " · 已定制",
		  "settings.library.emptyUsesDefault": "留空则使用系统原文",
		  "settings.editor.customized": "已定制",
		  "settings.editor.systemDefault": "系统原文",
		  "settings.editor.requirements": "你的额外要求",
		  "settings.editor.placeholder": "留空则使用系统原文。\n例如：评估研究想法时，优先考虑能否用现有设备完成表征。",
		  "settings.editor.base": "系统原文（{count} 字）",
		  "settings.editor.characterCount": "{count} 字",
		  "settings.editor.resetSection": "恢复该章节",
		  "settings.editor.resetSkill": "恢复该能力",
		  "settings.editor.save": "保存",
		  "settings.editor.saving": "保存中…",
		  "settings.editor.saved": "已保存",
		  "settings.editor.restoredDefault": "已恢复系统原文",
		  "settings.editor.restoredSkill": "已恢复「{skill}」",
		  "settings.editor.confirmSection": "恢复「{section}」的系统原文？你的定制会被删除。",
		  "settings.editor.confirmSkill": "恢复「{skill}」的全部章节？该能力的定制会被删除。",
		  "community.title": "ConvFusion.com",
		  "community.notice.published": "{title} · 研究状态 v{version}",
		  "community.notice.tokens": "{tokens} Token",
		  "community.notice.files": "{count} 附件",
		  "community.notice.oversize": "{count} 个超大未传",
		  "community.publish.title": "发布 {title}",
		  "community.publish.cost": "花费 {tokens} Token : ConvFusion.com",
		  "community.publish.costUnknown": "成本未知",
		  "community.publish.unknown": "未知",
		  "community.publish.storage": "本次 {selected} · 服务器可用 {available}",
		  "community.publish.changed": "本次将更新 {count} 个文件",
		  "community.publish.unchanged": "内容无变化",
		  "community.publish.expand": "展开",
		  "community.publish.collapse": "收起",
		  "community.publish.tooLarge": "超过单文件上限",
		  "community.publish.oversizeWarning": "有 {count} 个文件超过服务器单文件上限（100 MB），不会上传。",
		  "community.publish.summary": "已选 {files} 个文件 · {size} · {batches} 批上传",
		  "community.publish.remember": "记住这次选择",
		  "community.publish.confirm": "发布",
		  "community.action.cancel": "取消",
		  "upload.category.state": "研究状态与定义",
		  "upload.category.plans": "研究计划",
		  "upload.category.papers": "论文与图表",
		  "upload.category.experiments": "实验与代码",
		  "upload.category.research-assets": "研究资产",
		  "upload.category.outputs": "成果输出",
		  "upload.category.literature-raw": "文献抽取文本 / 检索报文",
		  "upload.category.literature-fulltext": "文献原文 (PDF)",
		  "upload.category.large-files": "大文件（≥10 MB）",
		  "upload.category.others": "其它文件",
		  "upload.reason.state": '导师判断"这项研究在做什么"的核心依据',
		  "upload.reason.plans": "研究计划：接下来怎么做、做到哪一步",
		  "upload.reason.papers": "论文正文与图表：研究结果的表达",
		  "upload.reason.experiments": "实验脚本与结果：怎么验证的",
		  "upload.reason.research-assets": "证据 / 主张 / 决策 / 文献笔记：研究者的判断",
		  "upload.reason.outputs": "交付成果（报告 / 演示等）",
		  "upload.reason.literature-raw": "机器抽取的原文与检索报文：默认不上传",
		  "upload.reason.literature-fulltext": "别人的论文原文：默认不上传，需要时单独勾选",
		  "upload.reason.large-files": "单个文件 ≥10 MB：默认不上传，确认有用再勾选",
		  "upload.reason.others": "未归类的文件：默认不上传",
		  "community.action.seekMentor": "寻找指导",
		  "community.action.republish": "更新",
		  "community.action.publishing": "发布中…",
		  "community.badge.inNetwork": "已在网络中",
		  "community.badge.published": "已发布",
		  "community.tip.publish": "把这项研究的进展发布到 ConvFusion.com，让导师能在网络里发现它。研究方法不会被上传。",
		  "community.tip.publishNeedSignIn": "先登录 ConvFusion.com 才能发布",
		  "community.hint.publishMissing": "本机这几项还没有内容，网络上暂时看不到：{fields}。",
		  "community.error.publish": "发布失败。",
		  "community.tab.account": "账号",
		  "community.tab.signIn": "登录",
		  "community.tab.server": "服务器设置",
		  "community.work.title": "研究工作",
		  "community.tab.mine": "我的",
		  "community.tab.mentor": "可指导",
		  "community.login.keyLabel": "API Key 登录",
		  "community.server.address": "服务器地址",
		  "community.server.title": "留空 = 跟随环境配置（本环境默认 {url}）；带 /api 或 /docs 的地址会自动归一。",
		  "community.badge.production": "生产环境",
		  "community.badge.development": "开发环境",
		  "community.badge.envMismatch": "地址与环境不一致",
		  "community.badge.checking": "检查中…",
		  "community.badge.signedIn": "已登录",
		  "community.badge.unverified": "凭据待验证",
		  "community.badge.signedOut": "未登录",
		  "community.badge.sample": "示例数据",
		  "community.badge.charged": "已计费",
		  "community.badge.registryUnavailable": "注册表不可用",
		  "community.badge.mentorRequired": "需要导师角色",
		  "community.badge.addressChanged": "地址已改",
		  // 两级披露的界面术语（对齐业务：先免费判断相关性，再付费深入了解）：
		  //   概览 = 研究主题 + 工作说明，任何人都能看，用来判断"跟不跟我相关"；
		  //   详情 = 动机 / 核心想法 / 假设 / 方法概览 / 关键证据 / 待解问题，1 Token。
		  //   注意：面板里的字段标签仍是 `community.detail.summary`（那是接口字段名，不跟着改）。
		  "community.action.summary": "概览",
		  "community.action.collapse": "收起",
		  // 按钮只写动作名，价格/状态交给后面的角标（两种状态要一样宽）
		  "community.action.brief": "详情",
		  "community.briefState.cost": "1 Token",
		  "community.briefState.paid": "已支付",
		  "community.action.loading": "读取中…",
		  "community.action.refresh": "刷新",
		  "community.action.retry": "重试",
		  "community.action.reverify": "重新验证",
		  "community.action.reverifying": "处理中…",
		  "community.action.retryVerify": "重试验证",
		  "community.action.signIn": "登录",
		  "community.action.signingIn": "登录中…",
		  "community.action.signOut": "登出",
		  "community.action.register": "注册并登录",
		  "community.action.registering": "注册中…",
		  "community.action.inviteShow": "使用邀请码注册",
		  "community.action.inviteHide": "收起邀请码注册",
		  "community.tip.summary": "免费：研究主题与工作说明，先看是否与你相关",
		  "community.tip.briefDisabled": "登录后可查看详情",
		  "community.tip.briefCost": "深入了解：动机 / 核心想法 / 假设 / 方法 / 证据 / 待解问题（首次读取 1 Token）",
		  "community.tip.briefUnlocked": "已解锁：这一项重读不再扣费",
		  // 扣费确认：点【详情】先弹这个对话框，点「确认读取」才真的发请求、才扣费
		  "community.briefConfirm.title": "查看详情会消耗 Token",
		  "community.briefConfirm.scope": "包含：动机 / 核心想法 / 假设 / 方法概览 / 关键证据 / 待解问题",
		  "community.briefConfirm.cost": "首次读取消耗 1 Token（自己的研究免费）",
		  "community.briefConfirm.balance": "余额 {balance}",
		  "community.briefConfirm.balanceUnknown": "余额未知",
		  "community.briefConfirm.idempotent": "同一项研究不会重复扣费",
		  "community.briefConfirm.confirm": "确认读取",
		  "community.tip.balance": "点击刷新余额",
		  "community.tip.balanceDetail": "可用 {available} · 冻结 {frozen}（冻结仍是你的，只是锁住了）",
		  "community.tip.keyPrivacy": "凭据只保存在本机（DSH 设置），不会回传浏览器，也不会写进对话内容。",
		  "community.tip.envKey": "凭据来自环境变量，请修改环境变量后重启 DSH",
		  "community.balance.frozenNote": "（+{count} 冻结）",
		  "community.detail.researchQuestion": "研究问题",
		  "community.detail.summary": "摘要",
		  "community.detail.motivation": "动机",
		  "community.detail.coreIdea": "核心想法",
		  "community.detail.hypothesis": "假设",
		  "community.detail.methodOverview": "方法概览",
		  "community.detail.keyEvidence": "关键证据",
		  "community.detail.openProblems": "待解问题",
		  "community.hint.inviteRule": "邮箱必须与邀请码签发时指定的邮箱一致；注册成功后服务器签发的 API Key 直接保存在本机。",
		  "community.hint.addressChanged": "改用新地址需要重新登录（凭据绑定在服务器上）。",
		  "community.hint.mismatchProduction": "当前是生产环境，但地址指向本机 —— 你多半连的是自己电脑上的开发服务器。",
		  "community.hint.mismatchDevelopment": "当前是开发环境，但地址指向线上服务器 —— 在开发机上操作线上数据有风险，请确认这是你想要的。",
		  "community.hint.sampleFootnote": "示例数据，登录后可浏览并操作网络上的研究工作。",
		  "community.hint.mentorRequiresRole": "浏览可指导的研究工作需要导师角色（当前：{roles}）。",
		  "community.hint.registryUnavailable": "这台 DSH 没有提供工作区注册表。",
		  "community.hint.loading": "正在读取…",
		  "community.hint.loadingWork": "正在读取研究工作…",
		  "community.hint.noData": "暂无数据。",
		  "community.hint.mineEmpty": "本机还没有研究项目（含有效 research workspace 的工作区会出现在这里）。",
		  "community.hint.paper": "已有论文",
		  "community.hint.noDiscoverable": "暂无可发现的研究工作。",
		  "community.error.unknown": "未知原因",
		  "community.error.readAccount": "读取登录状态失败。",
		  "community.error.readAccountDetail": "无法读取登录状态：{detail}",
		  "community.error.readWorkList": "读取研究工作列表失败。",
		  "community.error.readMine": "读取本机研究工作失败。",
		  "community.error.readSummary": "读取概览失败。",
		  "community.error.readBrief": "读取详情失败。",
		  "community.error.hostRestart": "宿主侧需要重启：当前宿主还没有 work/mine 端点。",
		  "community.error.transport": "无法访问 {route}（{detail}）。请查看 DSH 宿主日志。",
		  "community.notice.charged": "已读取详情，消耗 {tokens} Token（余额 {balance}）",
		  "community.notice.briefRead": "已读取详情（余额 {balance}）",
		  "community.placeholder.invitation": "邀请码 cf_inv_…",
		  "community.placeholder.email": "邮箱（须与邀请码一致）",
		  "community.placeholder.displayName": "显示名",
		  "community.sample.retrieval.title": "检索增强的长上下文推理",
		  "community.sample.retrieval.fields": "自然语言处理",
		  "community.sample.robotFailure.title": "机器人操作失败的视觉判定",
		  "community.sample.robotFailure.fields": "机器人学习、多模态",
		  "community.sample.lidar.title": "视觉-激光跨模态定位",
		  "community.sample.lidar.fields": "多模态、机器人",
		  "community.role.RESEARCHER": "研究者",
		  "community.role.MENTOR": "导师",
		  "community.role.ADMIN": "管理员",
		  "community.status.ACTIVE": "正常",
		  "community.status.SUSPENDED": "已停用",
		  "community.status.DEACTIVATED": "已注销",
		  "community.stage.IDEA": "想法",
		  "community.stage.LITERATURE": "文献",
		  "community.stage.HYPOTHESIS": "假设",
		  "community.stage.PLANNING": "规划",
		  "community.stage.IMPLEMENTATION": "实现",
		  "community.stage.EXPERIMENT": "实验",
		  "community.stage.ANALYSIS": "分析",
		  "community.stage.WRITING": "写作",
		  "community.stage.COMPLETED": "完成",
		  "settings.library.localOnly": "仅本机",
		  "system.retrieval.notConfigured": "未配置：可在",
		  "system.retrieval.notConfiguredAction": "免费申请后粘贴（未配置时走公共池，速率较低）。",
		  "system.retrieval.envFrom": "当前由环境变量",
		  "system.retrieval.envFromAction": "提供；在此保存会覆盖它。",
		  "system.dependency.title": "本地依赖",
		  "system.status.unknown": "未知",
		  "system.status.installed": "已安装",
		  "system.status.notInstalled": "未安装",
		  "system.dependency.viaEnv": "（由 {envVar} 指定）",
		  "system.dependency.checking": "检查中…",
		  "system.dependency.recheck": "重新检查",
		  "system.dependency.available": "tectonic 可用{version}",
		  "system.dependency.missing": "未找到 tectonic，请按下方说明安装后重新检查",
		  "system.dependency.installIntro": "论文编译成 PDF 需要本机的 tectonic（不是 npm 依赖）。安装任一即可：",
		  "system.dependency.installOutro": "装在别处就设 {envVar} 指向它，再点「重新检查」。首次编译会下载宏包（约 40 MB），之后复用。",
		  "system.retrieval.title": "文献检索",
		  "system.status.configured": "已配置",
		  "system.status.notConfigured": "未配置",
		  "system.retrieval.placeholderReplace": "已设置，输入新值可覆盖",
		  "system.retrieval.placeholderPaste": "粘贴 API Key",
		  "system.retrieval.secretHint": "留空则不修改。密钥仅保存在本机，不会发送到浏览器。",
		  "system.retrieval.clear": "清除",
		  "system.retrieval.saved": "已保存 OpenAlex API Key",
		  "system.retrieval.cleared": "已清除 OpenAlex API Key",
		  "system.retrieval.saveFailed": "保存失败：{detail}",
		  "system.retrieval.clearFailed": "清除失败：{detail}",
		  "progress.name": "研究进展",
		  "progress.button.ariaWithPercent": "研究进展（成熟度折算 {percent}）",
		  "progress.button.title": "查看当前工作区的研究进展",
		  "progress.button.titleWithPercent": "查看当前工作区的研究进展（成熟度折算 {percent}）",
		  "progress.summary": "成熟度折算 {percent}",
		  "progress.currentStage": " · 当前阶段 {stage}",
		  "progress.noData": "尚无数据",
		  "progress.reading": "读取中…",
		  "progress.refresh": "刷新",
		  "progress.close": "关闭",
		  "progress.section.maturity": "A · 研究成熟度（等级折算，非测量值）",
		  "progress.section.assets": "A2 · 可数资产（真实计数）",
		  "progress.paper": "论文正文",
		  "progress.paper.present": "已有正文",
		  "progress.paper.absent": "尚无正文",
		  "progress.stateVersion": "Research State 版本：{version}",
		  "progress.section.turn": "B · 最近一轮变化",
		  "progress.turn.summary": "第 {turn} 轮 · 成熟度折算 {before} → {after}{assetChange}",
		  "progress.turn.assetChange": " · {count} 项资产变化",
		  "progress.turn.noAssetChange": " · 本轮无资产变化",
		  "progress.turn.maturityChange": "成熟度 {dimension}：{from} → {to}",
		  "progress.turn.countChange": "{label}：{from} → {to}（{delta}）",
		  "progress.turn.noChange": "这一轮没有形成新的可验证研究资产（讨论/澄清不产生资产，这是正常的）。",
		  "progress.turn.unavailable": "本会话还没有回合报告（对话结束后宿主才会生成；面板的 A 段始终是最新状态）。",
		  "progress.section.need": "C · 当前缺口与推进判定",
		  "progress.need.assessment": "推进判定：",
		  "progress.need.basis": "（依据：{basis}）",
		  "progress.need.nextStep": "下一步：{text}",
		  "progress.need.decision": "待你决定：{text}",
		  "progress.basis.blockingQuestion": "研究问题中存在显式标记的阻塞项",
		  "progress.basis.stalled": "连续 {rounds} 轮没有形成新的可验证研究资产",
		  "progress.basis.draftPlans": "存在 {count} 个仍是 draft 的计划（{plans}）",
		  "progress.basis.processComplete": "科研过程各阶段均已有落地资产，没有结构性缺口",
		  "progress.basis.stagePending": "当前阶段「{stage}」尚未落地（{evidence}）",
		  "progress.decision.stalled": "当前推进方式没有产生资产。请确认：是继续这个方向，还是换一个方向／调整目标？",
		  "progress.decision.draftPlans": "多个计划都还是草稿、没有排序。请确认以哪一个为准，或说明取舍标准。",
		  "progress.decision.processComplete": "接下来是继续深化、转向写作，还是开新的问题？请指定方向。",
		  "progress.noReport": "宿主还没有返回这个工作区的进展数据。",
		  "progress.footnote": "数据全部来自磁盘上的真实资产（project.md / research-state.md / evidence / claims / plans）。成熟度是 Research State 的等级折算，不是测量值；这里只陈述研究需求，不代表必须执行的下一步。",
		  "progress.clarity.clear": "方向明确 → 可直接推进",
		  "progress.clarity.ambiguous": "需要你选一个方向",
		  "progress.clarity.blocked": "等你拍板（阻塞）",
		  "progress.clarity.unknown": "（未判定）",
		  "progress.gap.stagePending": "科研过程当前阶段：{stage}（尚未落地）",
		  "progress.gap.processComplete": "科研过程各阶段均已有落地资产",
		  "progress.gap.unsupportedClaims": "{count} 条主张尚缺支撑证据",
		  "progress.gap.missingArtifacts": "{count} 条证据缺原始产物引用（provenance 不完整）",
		  "progress.gap.openQuestions": "{count} 个开放问题待解",
		  "progress.stage.problem": "问题定义",
		  "progress.stage.literature": "文献调研",
		  "progress.stage.innovation": "创新与假设",
		  "progress.stage.method": "方法设计",
		  "progress.stage.experiment": "实验验证",
		  "progress.stage.analysis": "分析论证",
		  "progress.stage.decision": "研究决策",
		  "progress.stage.writing": "论文写作",
		  "progress.stageEvidence.problem": "可证伪的研究问题与范围（project.md）",
		  "progress.stageEvidence.literature": "实际检索到的文献证据（research/evidence/）",
		  "progress.stageEvidence.innovation": "可检验的假设与主张（research/claims/）",
		  "progress.stageEvidence.method": "可被第三方实现的方法设计",
		  "progress.stageEvidence.experiment": "实验产物（experiments/<name>/results/）",
		  "progress.stageEvidence.analysis": "经确认的结果证据（Evidence 状态 supported/verified）",
		  "progress.stageEvidence.decision": "已记录理由的研究决策（research/decisions/）",
		  "progress.stageEvidence.writing": "论文正文（papers/<id>/paper.md）",
		  "progress.stageOutput.problem": "在 project.md 中形成可证伪的研究问题与范围。",
		  "progress.stageOutput.literature": "在 research/evidence/ 中形成实际检索到的文献证据。",
		  "progress.stageOutput.innovation": "在 research/claims/ 中形成可检验的假设与主张。",
		  "progress.stageOutput.method": "形成可被第三方实现的方法设计。",
		  "progress.stageOutput.experiment": "在 experiments/<name>/results/ 中形成实验产物。",
		  "progress.stageOutput.analysis": "形成状态为 supported 或 verified 的结果证据。",
		  "progress.stageOutput.decision": "在 research/decisions/ 中记录研究决策及其理由。",
		  "progress.stageOutput.writing": "在 papers/<id>/paper.md 中形成论文正文。",
		  "progress.count.evidence": "证据",
		  "progress.count.claims": "主张",
		  "progress.count.decisions": "决策",
		  "progress.count.plans": "计划",
		  "progress.count.openQuestions": "开放问题",
		  "progress.count.outputs": "产出",
		  "progress.count.settled": "{count} 已确认",
		  "progress.count.supported": "{count} 有支撑证据",
		  "progress.count.ready": "{count} 可执行",
		  "maturity.dimension.Problem": "问题",
		  "maturity.dimension.Knowledge": "知识",
		  "maturity.dimension.Innovation": "创新",
		  "maturity.dimension.Method": "方法",
		  "maturity.dimension.Experiment": "实验",
		  "maturity.dimension.Evidence": "证据",
		  "maturity.level.Unknown": "未知",
		  "maturity.level.Weak": "薄弱",
		  "maturity.level.Emerging": "形成中",
		  "maturity.level.Strong": "较强",
		  "maturity.level.Established": "已建立",
		  "section.Purpose": "用途",
		  "section.When to Use": "适用场景",
		  "section.Research Method": "研究方法",
		  "section.Reasoning Guidance": "推理指导",
		  "section.Evidence Requirements": "证据要求",
		  "section.Expected Output": "预期输出",
		  "taxonomy.category.research-understanding": "理解问题",
		  "taxonomy.category.literature": "文献调研",
		  "taxonomy.category.innovation": "创新假设",
		  "taxonomy.category.methodology": "方法设计",
		  "taxonomy.category.experiment": "实验验证",
		  "taxonomy.category.analysis": "分析论证",
		  "taxonomy.category.research-decision": "研究决策",
		  "taxonomy.category.academic-writing": "论文写作",
		  "taxonomy.category.research-management": "研究管理",
		  "taxonomy.skill.topic-understanding": "主题理解",
		  "taxonomy.skill.research-intent-assessment": "研究意图判断",
		  "taxonomy.skill.problem-definition": "问题定义",
		  "taxonomy.skill.research-domain-profiling": "研究领域画像",
		  "taxonomy.skill.research-foundation-assessment": "研究基础评估",
		  "taxonomy.skill.literature-search": "文献检索",
		  "taxonomy.skill.literature-screening": "文献筛选",
		  "taxonomy.skill.paper-fulltext-download": "论文全文下载",
		  "taxonomy.skill.literature-review": "文献综述",
		  "taxonomy.skill.research-landscape": "研究全景",
		  "taxonomy.skill.research-idea-generation": "研究想法生成",
		  "taxonomy.skill.innovation-gap-analysis": "创新缺口分析",
		  "taxonomy.skill.idea-novelty-assessment": "新颖性评估",
		  "taxonomy.skill.hypothesis-formulation": "假设形式化",
		  "taxonomy.skill.contribution-design": "贡献设计",
		  "taxonomy.skill.research-method-design": "研究方法设计",
		  "taxonomy.skill.experiment-design": "实验设计",
		  "taxonomy.skill.dataset-selection": "数据集选择",
		  "taxonomy.skill.baseline-selection": "基线选择",
		  "taxonomy.skill.evaluation-protocol": "评测协议",
		  "taxonomy.skill.ablation-design": "消融设计",
		  "taxonomy.skill.reproducible-implementation-spec": "可复现实现规范",
		  "taxonomy.skill.simulation-baseline": "仿真预期结果",
		  "taxonomy.skill.result-analysis": "结果分析",
		  "taxonomy.skill.comparative-analysis": "对比分析",
		  "taxonomy.skill.evidence-assessment": "证据评估",
		  "taxonomy.skill.research-direction-steering": "研究方向引导",
		  "taxonomy.skill.research-topic-ranking": "研究主题排序",
		  "taxonomy.skill.research-direction": "研究方向收敛",
		  "taxonomy.skill.research-direction-selection": "研究方向选择",
		  "taxonomy.skill.plan-risk-assessment": "计划风险评估",
		  "taxonomy.skill.research-risk-assessment": "研究风险评估",
		  "taxonomy.skill.feasibility-cost-and-resource-plan": "可行性与资源规划",
		  "taxonomy.skill.go-no-go-decision": "继续/放弃决策",
		  "taxonomy.skill.venue-fit-decision": "投稿渠道决策",
		  "taxonomy.skill.paper-architecture": "论文架构",
		  "taxonomy.skill.research-narrative": "研究叙事",
		  "taxonomy.skill.section-drafting": "章节起草",
		  "taxonomy.skill.equation-formalization": "公式形式化",
		  "taxonomy.skill.visual-evidence-selection": "图表证据选择",
		  "taxonomy.skill.manuscript-revision": "手稿修订",
		  "taxonomy.skill.submission-compile-and-format": "投稿编译与格式化",
		  "taxonomy.skill.technical-report-writing": "技术报告写作",
		  "taxonomy.skill.patent-drafting": "专利撰写",
		  "taxonomy.skill.presentation-design": "演讲设计",
		  "taxonomy.skill.research-process": "研究过程定义",
		  "taxonomy.skill.research-strategy-portfolio": "研究策略组合",
		  "taxonomy.skill.experiment-pipeline-design": "实验流水线设计",
		  "taxonomy.skill.resource-requirement-estimation": "资源需求估算",
		  "taxonomy.skill.infrastructure-cost-selection": "基础设施选型"
		};

		// src/client/i18n/index.ts
		var CONVFUSION_LOCALE_NS = "convfusion";
		var dictionaries = { zh, en };
		var translateEnglish = (key, params) => {
		  const template = en[key] ?? key;
		  if (!params) return template;
		  return template.replace(
		    /\{(\w+)\}/g,
		    (match, name) => name in params ? String(params[name]) : match
		  );
		};
		function translateOr(t, key, fallback) {
		  const value = t(key);
		  return value === key ? fallback : value;
		}
		function categoryText(t, categoryId, fallback) {
		  return translateOr(t, `taxonomy.category.${categoryId}`, fallback);
		}
		function skillText(t, skillId, fallback) {
		  return translateOr(t, `taxonomy.skill.${skillId}`, fallback);
		}
		function sectionText(t, section) {
		  return translateOr(t, `section.${section}`, section);
		}
		function maturityDimensionText(t, dimension) {
		  return translateOr(t, `maturity.dimension.${dimension}`, dimension);
		}
		function maturityLevelText(t, level) {
		  return translateOr(t, `maturity.level.${level}`, level);
		}
		function progressCountText(t, key) {
		  return translateOr(t, `progress.count.${key}`, key);
		}

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

		// src/client/markdown-view.tsx
		var React = __toESM(require("react"), 1);

		// src/client/markdown.ts
		var INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(~~[^~]+~~)|(\*[^*\n]+\*)|(_[^_\n]+_)|(\[[^\]\n]+\]\([^)\s]+\))/;
		var TABLE_SEP = /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/;
		var LIST_ITEM = /^\s*([-*+]|\d+[.)])\s+(.*)$/;
		var HEADING = /^(#{1,6})\s+(.*)$/;
		var HR = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
		function splitRow(line) {
		  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
		  return trimmed.split("|").map((cell) => cell.trim());
		}
		function parseMarkdownBlocks(src) {
		  const lines = (src ?? "").replace(/\r\n?/g, "\n").split("\n");
		  const blocks = [];
		  let i = 0;
		  while (i < lines.length) {
		    const line = lines[i];
		    if (line.trim() === "") {
		      i += 1;
		      continue;
		    }
		    const fence = /^\s*(```+|~~~+)\s*(\S*)\s*$/.exec(line);
		    if (fence) {
		      const marker = fence[1];
		      const lang = fence[2] ?? "";
		      const body = [];
		      i += 1;
		      while (i < lines.length && !new RegExp(`^\\s*${marker[0]}{${marker.length},}\\s*$`).test(lines[i])) {
		        body.push(lines[i]);
		        i += 1;
		      }
		      i += 1;
		      blocks.push({ kind: "code", lang, text: body.join("\n") });
		      continue;
		    }
		    if (HR.test(line)) {
		      blocks.push({ kind: "hr" });
		      i += 1;
		      continue;
		    }
		    const heading = HEADING.exec(line);
		    if (heading) {
		      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2].trim() });
		      i += 1;
		      continue;
		    }
		    if (/^\s*>/.test(line)) {
		      const quote = [];
		      while (i < lines.length && /^\s*>/.test(lines[i])) {
		        quote.push(lines[i].replace(/^\s*>\s?/, ""));
		        i += 1;
		      }
		      blocks.push({ kind: "quote", text: quote.join("\n") });
		      continue;
		    }
		    if (line.includes("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
		      const head = splitRow(line);
		      const rows = [];
		      i += 2;
		      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
		        rows.push(splitRow(lines[i]));
		        i += 1;
		      }
		      blocks.push({ kind: "table", head, rows });
		      continue;
		    }
		    const item = LIST_ITEM.exec(line);
		    if (item) {
		      const ordered = /^\d/.test(item[1]);
		      const items = [];
		      while (i < lines.length) {
		        const m = LIST_ITEM.exec(lines[i]);
		        if (!m || /^\d/.test(m[1]) !== ordered) break;
		        items.push(m[2]);
		        i += 1;
		      }
		      blocks.push({ kind: "list", ordered, items });
		      continue;
		    }
		    const para = [];
		    while (i < lines.length) {
		      const l = lines[i];
		      if (l.trim() === "" || HEADING.test(l) || HR.test(l) || LIST_ITEM.test(l) || /^\s*>/.test(l) || /^\s*(```+|~~~+)/.test(l)) {
		        break;
		      }
		      para.push(l);
		      i += 1;
		    }
		    blocks.push({ kind: "paragraph", text: para.join("\n") });
		  }
		  return blocks;
		}
		function parseInline(src) {
		  const out = [];
		  let rest = src ?? "";
		  while (rest.length > 0) {
		    const m = INLINE.exec(rest);
		    if (!m || m.index === void 0) {
		      out.push({ kind: "text", text: rest });
		      break;
		    }
		    if (m.index > 0) out.push({ kind: "text", text: rest.slice(0, m.index) });
		    const token = m[0];
		    if (token.startsWith("`")) {
		      out.push({ kind: "code", text: token.slice(1, -1) });
		    } else if (token.startsWith("**") || token.startsWith("__")) {
		      out.push({ kind: "bold", text: token.slice(2, -2) });
		    } else if (token.startsWith("~~")) {
		      out.push({ kind: "strike", text: token.slice(2, -2) });
		    } else if (token.startsWith("[")) {
		      const at = token.indexOf("](");
		      out.push({ kind: "link", text: token.slice(1, at), href: token.slice(at + 2, -1) });
		    } else {
		      out.push({ kind: "italic", text: token.slice(1, -1) });
		    }
		    rest = rest.slice(m.index + token.length);
		  }
		  return out;
		}

		// src/client/markdown-view.tsx
		var import_jsx_runtime2 = require("react/jsx-runtime");
		function inline(tokens) {
		  return tokens.map((tk, i) => {
		    switch (tk.kind) {
		      case "bold":
		        return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { style: { fontWeight: 650 }, children: tk.text }, i);
		      case "italic":
		        return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("em", { style: { fontStyle: "italic" }, children: tk.text }, i);
		      case "strike":
		        return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { textDecoration: "line-through", opacity: 0.75 }, children: tk.text }, i);
		      case "code":
		        return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		          "code",
		          {
		            style: {
		              fontFamily: "var(--dsw-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
		              fontSize: 11,
		              padding: "1px 4px",
		              borderRadius: 4,
		              background: "var(--dsw-alias-bg-layer-3)"
		            },
		            children: tk.text
		          },
		          i
		        );
		      case "link":
		        return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		          "a",
		          {
		            href: tk.href,
		            target: "_blank",
		            rel: "noreferrer noopener",
		            style: { color: "var(--dsw-alias-state-business-primary)", textDecoration: "underline" },
		            children: tk.text
		          },
		          i
		        );
		      default:
		        return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(React.Fragment, { children: tk.text }, i);
		    }
		  });
		}
		function Inline({ text }) {
		  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_jsx_runtime2.Fragment, { children: inline(parseInline(text)) });
		}
		function Block({ block }) {
		  switch (block.kind) {
		    case "heading":
		      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		        "div",
		        {
		          style: {
		            fontWeight: 700,
		            fontSize: block.level <= 2 ? 13 : 12.5,
		            margin: "4px 0 2px"
		          },
		          children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Inline, { text: block.text })
		        }
		      );
		    case "code":
		      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		        "pre",
		        {
		          style: {
		            margin: "4px 0",
		            padding: "6px 8px",
		            borderRadius: 6,
		            overflowX: "auto",
		            background: "var(--dsw-alias-bg-layer-3)",
		            fontFamily: "var(--dsw-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
		            fontSize: 11,
		            lineHeight: 1.5
		          },
		          children: block.text
		        }
		      );
		    case "quote":
		      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		        "div",
		        {
		          style: {
		            margin: "4px 0",
		            paddingLeft: 8,
		            borderLeft: "2px solid var(--dsw-alias-border-l2)",
		            color: "var(--dsw-alias-label-secondary)"
		          },
		          children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Inline, { text: block.text })
		        }
		      );
		    case "list": {
		      const items = block.items.map((it, i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("li", { style: { margin: "1px 0" }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Inline, { text: it }) }, i));
		      return block.ordered ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("ol", { style: { margin: "3px 0", paddingLeft: 20 }, children: items }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("ul", { style: { margin: "3px 0", paddingLeft: 18 }, children: items });
		    }
		    case "table":
		      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { margin: "4px 0", overflowX: "auto" }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("table", { style: { borderCollapse: "collapse", fontSize: 11.5 }, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("tr", { children: block.head.map((cell, i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		          "th",
		          {
		            style: {
		              textAlign: "left",
		              fontWeight: 650,
		              padding: "2px 6px",
		              border: "1px solid var(--dsw-alias-border-l1)",
		              whiteSpace: "nowrap"
		            },
		            children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Inline, { text: cell })
		          },
		          i
		        )) }) }),
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("tbody", { children: block.rows.map((row, r) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("tr", { children: row.map((cell, c) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		          "td",
		          {
		            style: {
		              padding: "2px 6px",
		              border: "1px solid var(--dsw-alias-border-l1)",
		              verticalAlign: "top"
		            },
		            children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Inline, { text: cell })
		          },
		          c
		        )) }, r)) })
		      ] }) });
		    case "hr":
		      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		        "hr",
		        {
		          style: {
		            margin: "6px 0",
		            border: 0,
		            borderTop: "1px solid var(--dsw-alias-border-l1)"
		          }
		        }
		      );
		    default:
		      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { margin: "2px 0", whiteSpace: "pre-wrap" }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Inline, { text: block.text }) });
		  }
		}
		function Markdown({ text }) {
		  if (!text || text.trim() === "") return null;
		  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }, children: parseMarkdownBlocks(text).map((b, i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Block, { block: b }, i)) });
		}

		// src/client/settings.tsx
		var import_jsx_runtime3 = require("react/jsx-runtime");
		function rpcErrorDetail(t, error) {
		  if (!error) return t("settings.error.unknown");
		  if (error.code) {
		    const key = `settings.error.code.${error.code}`;
		    const localized = t(key);
		    if (localized !== key) return localized;
		  }
		  return error.message ?? t("settings.error.unknown");
		}
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
		async function loadSettingsState(send = fetchSettingsSend, options = {}, t = translateEnglish) {
		  if (typeof send !== "function") {
		    return { kind: "error", message: t("settings.error.missingTransport") };
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
		      return {
		        kind: "error",
		        message: t("settings.error.service", {
		          detail: rpcErrorDetail(t, res?.error)
		        })
		      };
		    }
		    const value = res.value;
		    if (!value || !Array.isArray(value.categories)) {
		      return {
		        kind: "error",
		        message: t("settings.error.incomplete")
		      };
		    }
		    return { kind: "ok", state: value };
		  } catch (e) {
		    return {
		      kind: "error",
		      message: timedOut ? t("settings.error.timeout", {
		        seconds: Math.round(timeoutMs / 1e3),
		        route: SETTINGS_ROUTE_PREFIX
		      }) : t("settings.error.connection", {
		        detail: e instanceof Error ? e.message : String(e),
		        route: `${SETTINGS_ROUTE_PREFIX}/state`
		      })
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
		  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
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
		  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
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
		  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
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
		  t,
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
		          const outcome = await loadSettingsState(send, {}, t);
		          if (outcome.kind === "error") {
		            setError(outcome.message);
		            return null;
		          }
		          setError(null);
		          setState(outcome.state);
		          setStaleHost(outcome.state.protocol !== 12);
		          return outcome.state;
		        }
		        const res = await send(endpoint, payload);
		        if (!res || res.ok !== true) {
		          setError(
		            t("settings.error.service", {
		              detail: rpcErrorDetail(t, res?.error)
		            })
		          );
		          return null;
		        }
		        setError(null);
		        const next = res.value;
		        setState(next);
		        return next;
		      } catch (e) {
		        setError(
		          t("settings.error.call", {
		            endpoint,
		            detail: e instanceof Error ? e.message : String(e)
		          })
		        );
		        return null;
		      }
		    },
		    [send, t]
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
		    if (next) {
		      setNotice({
		        tone: "success",
		        text: draft.trim() ? t("settings.editor.saved") : t("settings.editor.restoredDefault")
		      });
		    }
		  };
		  const reset = async () => {
		    if (!skill || !point) return;
		    if (!window.confirm(t("settings.editor.confirmSection", { section: sectionText(t, point.section) }))) return;
		    setSaving(true);
		    const next = await call("customization/reset", { skillId: skill.skillId, section: point.section });
		    setSaving(false);
		    if (next) {
		      setDraft("");
		      setNotice({ tone: "success", text: t("settings.editor.restoredDefault") });
		    }
		  };
		  const resetSkill = async () => {
		    if (!skill) return;
		    const displaySkill = skillText(t, skill.skillId, skill.skillName);
		    if (!window.confirm(t("settings.editor.confirmSkill", { skill: displaySkill }))) return;
		    setSaving(true);
		    const next = await call("customization/resetSkill", { skillId: skill.skillId });
		    setSaving(false);
		    if (next) setNotice({ tone: "success", text: t("settings.editor.restoredSkill", { skill: displaySkill }) });
		  };
		  const totalOverridden = state ? state.categories.reduce((n, c) => n + c.overriddenCount, 0) : 0;
		  const totalPoints = state ? state.categories.reduce((n, c) => n + c.pointCount, 0) : 0;
		  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.page, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.hero, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.heroIcon, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ConvFusionMark, { size: 24 }) }),
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { flex: "1 1 auto", minWidth: 0 }, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.heroTitle, children: "ConvFusion" }),
		        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.heroSub, children: t("settings.hero.subtitle") })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }, children: [
		        totalOverridden > 0 ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: "brand", children: t("settings.badge.customized", { count: totalOverridden }) }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: "neutral", children: t("settings.badge.systemDefaults") }),
		        scopeSnap.status === "unavailable" ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: "warn", children: t("settings.badge.readOnly") }) : null
		      ] })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.tabs, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(TabButton, { active: tab === "local", onClick: () => setTab("local"), children: [
		        "⚙ ",
		        t("settings.tab.local")
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(TabButton, { active: tab === "community", onClick: () => setTab("community"), children: [
		        "◈ ",
		        t("settings.tab.community")
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(TabButton, { active: tab === "retrieval", onClick: () => setTab("retrieval"), children: [
		        "⚙ ",
		        t("settings.tab.system"),
		        state && (!state.retrieval.configured || state.dependencies?.tectonic.available === false) ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { ...S.hint, marginLeft: 6 }, children: t("settings.status.needsConfiguration") }) : null
		      ] })
		    ] }),
		    staleHost ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.card, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.cardHead, children: [
		        t("settings.stale.title"),
		        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { flex: "1 1 auto" } }),
		        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: "warn", children: t("settings.stale.badge") })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.cardBody, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { ...S.hint, lineHeight: 1.7 }, children: [
		        t("settings.stale.body"),
		        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("br", {}),
		        t("settings.stale.action")
		      ] }) })
		    ] }) : null,
		    error ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.card, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.cardHead, children: [
		        t("settings.error.title"),
		        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { flex: "1 1 auto" } }),
		        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: "error", children: t("settings.error.badge") })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.cardBody, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
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
		        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.footer, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", style: S.ghostBtn, onClick: () => void reload(), children: t("settings.action.retry") }) })
		      ] })
		    ] }) : null,
		    loading && !state ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.card, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.cardBody, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.hint, children: t("settings.status.loading") }) }) }) : null,
		    tab === "community" ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(CommunityTab, { send, initial: state?.account ?? null, t }) : null,
		    tab === "retrieval" ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		      SystemTab,
		      {
		        configured: state?.retrieval.configured ?? false,
		        source: state?.retrieval.source ?? "none",
		        envVar: state?.retrieval.envVar ?? "OPENALEX_API_KEY",
		        tectonic: state?.dependencies?.tectonic ?? null,
		        onRecheck: recheckDependencies,
		        scope,
		        onNotice: setNotice,
		        t
		      }
		    ) : null,
		    state && tab === "local" ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.card, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.cardHead, children: [
		          t("settings.library.title"),
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: "neutral", children: t("settings.library.localOnly") }),
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { flex: "1 1 auto" } }),
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { ...S.hint, fontWeight: 400 }, children: t("settings.library.summary", { total: totalPoints, customized: totalOverridden }) })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.cardBody, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.row, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.field, children: [
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.label, children: t("settings.library.category") }),
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("select", { style: S.select, value: categoryId, onChange: (e) => onCategory(e.target.value), children: state.categories.map((c) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("option", { value: c.categoryId, children: [
		              c.code ? `${c.code} ` : "",
		              categoryText(t, c.categoryId, c.categoryName),
		              " (",
		              c.skills.length,
		              ")",
		              c.overriddenCount > 0 ? t("settings.library.customizedSuffix", { count: c.overriddenCount }) : ""
		            ] }, c.categoryId)) }),
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.hint, children: category ? t("settings.library.categoryHint", { count: category.skills.length }) : t("settings.library.emptyCategory") })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.field, children: [
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.label, children: t("settings.library.skill") }),
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("select", { style: S.select, value: skillId, onChange: (e) => onSkill(e.target.value), children: category?.skills.map((s) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("option", { value: s.skillId, children: [
		              s.code ? `${s.code} · ` : "",
		              skillText(t, s.skillId, s.skillName),
		              s.overriddenCount > 0 ? t("settings.library.customizedSuffix", { count: s.overriddenCount }) : ""
		            ] }, s.skillId)) }),
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.hint, children: skill ? t("settings.library.sectionCount", { count: skill.sections.length }) : "" })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.field, children: [
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.label, children: t("settings.library.section") }),
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("select", { style: S.select, value: section, onChange: (e) => onSection(e.target.value), children: skill?.sections.map((s) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("option", { value: s.section, children: [
		              sectionText(t, s.section),
		              s.overridden ? t("settings.library.sectionCustomizedSuffix") : ""
		            ] }, s.section)) }),
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.hint, children: t("settings.library.emptyUsesDefault") })
		          ] })
		        ] }) })
		      ] }),
		      skill && point ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.card, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.cardHead, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { style: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }, children: [
		            skill.code ? `${skill.code} · ` : "",
		            skillText(t, skill.skillId, skill.skillName),
		            " · ",
		            sectionText(t, point.section)
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { flex: "1 1 auto" } }),
		          point.overridden ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: "brand", children: t("settings.editor.customized") }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: "neutral", children: t("settings.editor.systemDefault") })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.cardBody, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.hint, children: [
		            category?.code ? `${category.code} ` : "",
		            category ? categoryText(t, category.categoryId, category.categoryName) : "",
		            " ·",
		            " ",
		            skillText(t, skill.skillId, skill.skillName),
		            " · ",
		            sectionText(t, point.section)
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.label, children: t("settings.editor.requirements") }),
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		            "textarea",
		            {
		              style: S.textarea,
		              spellCheck: false,
		              value: draft,
		              placeholder: t("settings.editor.placeholder"),
		              onChange: (e) => setDraft(e.target.value)
		            }
		          ),
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("details", { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("summary", { style: { ...S.label, cursor: "pointer" }, children: t("settings.editor.base", { count: point.base.length }) }),
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { ...S.base, marginTop: 8 }, children: point.base })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.footer, children: [
		            notice ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		              "span",
		              {
		                style: {
		                  marginRight: "auto",
		                  fontSize: 12,
		                  color: notice.tone === "success" ? "var(--dsw-alias-state-success-primary)" : "var(--dsw-alias-state-error-primary)"
		                },
		                children: notice.text
		              }
		            ) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { ...S.hint, marginRight: "auto" }, children: t("settings.editor.characterCount", { count: draft.length }) }),
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		              "button",
		              {
		                type: "button",
		                style: { ...S.ghostBtn, opacity: point.overridden && !saving ? 1 : 0.55 },
		                disabled: !point.overridden || saving,
		                onClick: () => void reset(),
		                children: t("settings.editor.resetSection")
		              }
		            ),
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		              "button",
		              {
		                type: "button",
		                style: { ...S.ghostBtn, opacity: skill.overriddenCount > 0 && !saving ? 1 : 0.55 },
		                disabled: skill.overriddenCount === 0 || saving,
		                onClick: () => void resetSkill(),
		                children: t("settings.editor.resetSkill")
		              }
		            ),
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		              "button",
		              {
		                type: "button",
		                style: { ...S.primaryBtn, opacity: dirty && !saving ? 1 : 0.55 },
		                disabled: !dirty || saving,
		                onClick: () => void save(),
		                children: saving ? t("settings.editor.saving") : t("settings.editor.save")
		              }
		            )
		          ] })
		        ] })
		      ] }) : null
		    ] }) : null
		  ] });
		}
		var ROLE_LABEL_KEYS = {
		  RESEARCHER: "community.role.RESEARCHER",
		  MENTOR: "community.role.MENTOR",
		  ADMIN: "community.role.ADMIN"
		};
		var STATUS_LABEL_KEYS = {
		  ACTIVE: "community.status.ACTIVE",
		  SUSPENDED: "community.status.SUSPENDED",
		  DEACTIVATED: "community.status.DEACTIVATED"
		};
		var STAGE_LABEL_KEYS = {
		  IDEA: "community.stage.IDEA",
		  LITERATURE: "community.stage.LITERATURE",
		  HYPOTHESIS: "community.stage.HYPOTHESIS",
		  PLANNING: "community.stage.PLANNING",
		  IMPLEMENTATION: "community.stage.IMPLEMENTATION",
		  EXPERIMENT: "community.stage.EXPERIMENT",
		  ANALYSIS: "community.stage.ANALYSIS",
		  WRITING: "community.stage.WRITING",
		  COMPLETED: "community.stage.COMPLETED"
		};
		function enumText(t, keys, value) {
		  if (!value) return "";
		  return translateOr(t, keys[value] ?? value, value);
		}
		function roleText(t, roles) {
		  if (!roles.length) return "—";
		  return roles.map((r) => translateOr(t, ROLE_LABEL_KEYS[r] ?? r, r)).join(" · ");
		}
		var SAMPLE_WORKS = [
		  {
		    titleKey: "community.sample.retrieval.title",
		    fieldsKey: "community.sample.retrieval.fields",
		    stage: "EXPERIMENT",
		    progress: 0.5
		  },
		  {
		    titleKey: "community.sample.robotFailure.title",
		    fieldsKey: "community.sample.robotFailure.fields",
		    stage: "ANALYSIS",
		    progress: 0.7
		  },
		  {
		    titleKey: "community.sample.lidar.title",
		    fieldsKey: "community.sample.lidar.fields",
		    stage: "IMPLEMENTATION",
		    progress: 0.4
		  }
		];
		function ProgressBar({ value }) {
		  const pct2 = Math.round(Math.min(Math.max(value, 0), 1) * 100);
		  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { style: { display: "inline-flex", alignItems: "center", gap: 6 }, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
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
		        children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
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
		    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { style: S.mono, children: [
		      pct2,
		      "%"
		    ] })
		  ] });
		}
		var BRIEF_BADGE_MIN_WIDTH = 64;
		function briefFree(w) {
		  if (typeof w.briefPaid === "boolean") return w.briefPaid;
		  if (w.briefOpened === true) return true;
		  return false;
		}
		function WorkRow({
		  t,
		  title,
		  fields,
		  stage,
		  progress,
		  updatedAt,
		  disabled,
		  busy,
		  expanded,
		  briefFree: briefFree2,
		  onSummary,
		  onBrief
		}) {
		  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { ...S.listRow, alignItems: "flex-start" }, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { minWidth: 0, flex: "1 1 auto", display: "flex", flexDirection: "column", gap: 4 }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.listTitle, children: title }),
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { ...S.hint, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }, children: [
		        fields.length ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: fields.join(" · ") }) : null,
		        stage ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: enumText(t, STAGE_LABEL_KEYS, stage) }) : null,
		        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ProgressBar, { value: progress }),
		        updatedAt ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: updatedAt.slice(0, 10) }) : null
		      ] })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", gap: 6, flex: "0 0 auto" }, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		        "button",
		        {
		          type: "button",
		          style: { ...S.ghostBtn, opacity: disabled || busy ? 0.55 : 1 },
		          disabled: disabled || busy !== null,
		          title: t("community.tip.summary"),
		          onClick: onSummary,
		          children: busy === "summary" ? t("community.action.loading") : expanded ? t("community.action.collapse") : t("community.action.summary")
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		        "button",
		        {
		          type: "button",
		          style: {
		            ...S.ghostBtn,
		            display: "inline-flex",
		            alignItems: "center",
		            gap: 5,
		            opacity: disabled || busy ? 0.55 : 1
		          },
		          disabled: disabled || busy !== null,
		          title: disabled ? t("community.tip.briefDisabled") : briefFree2 ? t("community.tip.briefUnlocked") : t("community.tip.briefCost"),
		          onClick: onBrief,
		          children: busy === "brief" ? t("community.action.loading") : /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
		            t("community.action.brief"),
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		              "span",
		              {
		                style: { display: "inline-flex", minWidth: BRIEF_BADGE_MIN_WIDTH, justifyContent: "center" },
		                children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: briefFree2 ? "success" : "brand", children: briefFree2 ? t("community.briefState.paid") : t("community.briefState.cost") })
		              }
		            )
		          ] })
		        }
		      )
		    ] })
		  ] });
		}
		function WorkDetail({
		  t,
		  work,
		  brief
		}) {
		  const line = (label, value) => value ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", gap: 8 }, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { ...S.label, flex: "0 0 56px" }, children: label }),
		    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { ...S.hint, color: "var(--dsw-alias-label-secondary)", whiteSpace: "pre-wrap" }, children: value })
		  ] }) : null;
		  const block = (label, value) => value && value.trim() !== "" ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", gap: 8 }, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { ...S.label, flex: "0 0 56px" }, children: label }),
		    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { ...S.hint, minWidth: 0, flex: "1 1 auto", color: "var(--dsw-alias-label-secondary)" }, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Markdown, { text: value }) })
		  ] }) : null;
		  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
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
		        block(t("community.detail.researchQuestion"), brief ? brief.researchQuestion : work.researchQuestion),
		        block(t("community.detail.summary"), work.summary),
		        brief ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
		          block(t("community.detail.motivation"), brief.motivation),
		          block(t("community.detail.coreIdea"), brief.coreIdea),
		          block(t("community.detail.hypothesis"), brief.hypothesis),
		          block(t("community.detail.methodOverview"), brief.methodOverview),
		          brief.keyEvidence.length ? line(t("community.detail.keyEvidence"), brief.keyEvidence.join("；")) : null,
		          brief.openProblems.length ? brief.openProblems.map((p, i) => block(i === 0 ? t("community.detail.openProblems") : "", p)).filter(Boolean) : null
		        ] }) : null
		      ]
		    }
		  );
		}
		function formatBytes(bytes) {
		  if (bytes < 1024) return `${bytes} B`;
		  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
		  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
		  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
		}
		function PublishDialog({
		  t,
		  data,
		  selection,
		  remember,
		  expanded,
		  busy,
		  onToggleCategory,
		  onToggleFile,
		  onToggleExpand,
		  onRemember,
		  onCancel,
		  onConfirm
		}) {
		  const visible = data.plan.categories.filter((c) => c.decision !== "excluded" && c.files.length > 0);
		  const selectedFiles = visible.flatMap((c) => c.files.map((f) => f.relPath)).filter((r) => selection.has(r));
		  const selectedBytes = visible.flatMap((c) => c.files).filter((f) => selection.has(f.relPath)).reduce((n, f) => n + f.size, 0);
		  const batches = Math.max(1, Math.ceil(selectedFiles.length / data.plan.limits.maxFilesPerRequest));
		  const storage = data.usage?.storage;
		  const oversizeSelected = visible.flatMap((c) => c.files).filter((f) => selection.has(f.relPath) && f.size > data.plan.limits.maxFileBytes);
		  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		    "div",
		    {
		      style: {
		        position: "fixed",
		        inset: 0,
		        background: "rgba(0,0,0,.45)",
		        display: "grid",
		        placeItems: "center",
		        zIndex: 1e3,
		        padding: 20
		      },
		      role: "dialog",
		      "aria-modal": "true",
		      children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
		        "div",
		        {
		          style: {
		            ...S.card,
		            width: "min(760px, 96vw)",
		            maxHeight: "88vh",
		            overflow: "auto",
		            background: "var(--dsw-alias-bg-layer-1)"
		          },
		          children: [
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.cardHead, children: [
		              t("community.publish.title", { title: data.title }),
		              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { flex: "1 1 auto" } }),
		              data.usage ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: data.usage.nextPublishCost > 0 ? "brand" : "neutral", children: t("community.publish.cost", { tokens: data.usage.nextPublishCost }) }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: "neutral", children: t("community.publish.costUnknown") })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { ...S.cardBody, gap: 12 }, children: [
		              /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.hint, children: [
		                t("community.publish.storage", {
		                  selected: formatBytes(selectedBytes),
		                  available: storage ? formatBytes(storage.availableBytes) : t("community.publish.unknown")
		                }),
		                data.changed.length > 0 ? ` · ${t("community.publish.changed", { count: data.changed.length })}` : data.remembered ? ` · ${t("community.publish.unchanged")}` : ""
		              ] }),
		              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.list, children: visible.map((cat, i) => {
		                const files = cat.files;
		                const all = files.every((f) => selection.has(f.relPath));
		                const some = !all && files.some((f) => selection.has(f.relPath));
		                const isOpen = expanded.has(cat.id);
		                return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
		                  "div",
		                  {
		                    style: i === 0 ? void 0 : { borderTop: "1px solid var(--dsw-alias-border-l1)" },
		                    children: [
		                      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { ...S.listRow, alignItems: "flex-start" }, children: [
		                        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		                          "input",
		                          {
		                            type: "checkbox",
		                            checked: all,
		                            ref: (el) => {
		                              if (el) el.indeterminate = some;
		                            },
		                            onChange: (e) => onToggleCategory(cat.id, files.map((f) => f.relPath), e.target.checked),
		                            style: { marginTop: 3 }
		                          }
		                        ),
		                        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { minWidth: 0, flex: "1 1 auto", display: "flex", flexDirection: "column", gap: 3 }, children: [
		                          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.listTitle, children: [
		                            t(`upload.category.${cat.id}`),
		                            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { style: { ...S.hint, marginLeft: 8 }, children: [
		                              formatBytes(cat.bytes),
		                              " · ",
		                              files.length
		                            ] })
		                          ] }),
		                          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.hint, children: t(`upload.reason.${cat.id}`) })
		                        ] }),
		                        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", style: S.linkBtn, onClick: () => onToggleExpand(cat.id), children: isOpen ? t("community.publish.collapse") : t("community.publish.expand") })
		                      ] }),
		                      isOpen ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { maxHeight: 200, overflow: "auto", padding: "4px 12px 10px 34px" }, children: files.map((f) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
		                        "label",
		                        {
		                          style: { display: "flex", alignItems: "center", gap: 8, padding: "2px 0" },
		                          children: [
		                            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		                              "input",
		                              {
		                                type: "checkbox",
		                                checked: selection.has(f.relPath),
		                                onChange: (e) => onToggleFile(f.relPath, e.target.checked)
		                              }
		                            ),
		                            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { ...S.mono, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }, children: f.relPath }),
		                            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { style: { ...S.hint, marginLeft: "auto", whiteSpace: "nowrap" }, children: [
		                              formatBytes(f.size),
		                              f.size > data.plan.limits.maxFileBytes ? ` ⚠ ${t("community.publish.tooLarge")}` : ""
		                            ] })
		                          ]
		                        },
		                        f.relPath
		                      )) }) : null
		                    ]
		                  },
		                  cat.id
		                );
		              }) }),
		              oversizeSelected.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { fontSize: 11.5, color: "var(--dsw-alias-state-warn-primary)", lineHeight: 1.6 }, children: t("community.publish.oversizeWarning", { count: oversizeSelected.length }) }) : null,
		              /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.footer, children: [
		                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { ...S.hint, marginRight: "auto" }, children: t("community.publish.summary", {
		                  files: selectedFiles.length,
		                  size: formatBytes(selectedBytes),
		                  batches
		                }) }),
		                /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { style: { ...S.hint, display: "flex", alignItems: "center", gap: 6 }, children: [
		                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("input", { type: "checkbox", checked: remember, onChange: (e) => onRemember(e.target.checked) }),
		                  t("community.publish.remember")
		                ] }),
		                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", style: S.ghostBtn, disabled: busy, onClick: onCancel, children: t("community.action.cancel") }),
		                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		                  "button",
		                  {
		                    type: "button",
		                    style: { ...S.primaryBtn, opacity: busy ? 0.55 : 1 },
		                    disabled: busy,
		                    onClick: onConfirm,
		                    children: busy ? t("community.action.publishing") : t("community.publish.confirm")
		                  }
		                )
		              ] })
		            ] })
		          ]
		        }
		      )
		    }
		  );
		}
		function BriefConfirmDialog({
		  t,
		  title,
		  balance,
		  onCancel,
		  onConfirm
		}) {
		  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		    "div",
		    {
		      style: {
		        position: "fixed",
		        inset: 0,
		        background: "rgba(0,0,0,.45)",
		        display: "grid",
		        placeItems: "center",
		        zIndex: 1e3,
		        padding: 20
		      },
		      role: "dialog",
		      "aria-modal": "true",
		      children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { ...S.card, width: "min(430px, 94vw)", background: "var(--dsw-alias-bg-layer-1)" }, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.cardHead, children: [
		          t("community.briefConfirm.title"),
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { flex: "1 1 auto" } }),
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: "brand", children: t("community.briefState.cost") })
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { ...S.cardBody, gap: 9 }, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.listTitle, children: title }),
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.hint, children: t("community.briefConfirm.scope") }),
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.hint, children: [
		            t("community.briefConfirm.cost"),
		            " · ",
		            typeof balance === "number" ? t("community.briefConfirm.balance", { balance }) : t("community.briefConfirm.balanceUnknown")
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.hint, children: t("community.briefConfirm.idempotent") }),
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.footer, children: [
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { flex: "1 1 auto" } }),
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", style: S.ghostBtn, onClick: onCancel, children: t("community.action.cancel") }),
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", style: S.primaryBtn, onClick: onConfirm, children: t("community.briefConfirm.confirm") })
		          ] })
		        ] })
		      ] })
		    }
		  );
		}
		function CommunityTab({
		  send,
		  initial,
		  t
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
		  const [publishing, setPublishing] = import_react.default.useState(null);
		  const [publishNotice, setPublishNotice] = import_react.default.useState(null);
		  const [dialog, setDialog] = import_react.default.useState(null);
		  const [dialogLoading, setDialogLoading] = import_react.default.useState(null);
		  const [works, setWorks] = import_react.default.useState(null);
		  const [worksLoading, setWorksLoading] = import_react.default.useState(false);
		  const [worksError, setWorksError] = import_react.default.useState(null);
		  const [open, setOpen] = import_react.default.useState(null);
		  const [detail, setDetail] = import_react.default.useState(
		    null
		  );
		  const [detailBusy, setDetailBusy] = import_react.default.useState(null);
		  const [chargeNotice, setChargeNotice] = import_react.default.useState(null);
		  const [briefConfirm, setBriefConfirm] = import_react.default.useState(null);
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
		            error: { code: res?.error?.code ?? "unknown", message: res?.error?.message ?? t("community.error.unknown") }
		          };
		        }
		        return { ok: true, value: res.value };
		      } catch (e) {
		        return {
		          ok: false,
		          error: {
		            code: "transport",
		            message: t("community.error.transport", {
		              route: SETTINGS_ROUTE_PREFIX,
		              detail: e instanceof Error ? e.message : String(e)
		            })
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
		        setFailure(res.error ?? { code: "unknown", message: t("community.error.unknown") });
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
		            message: res?.error?.message ?? t("community.error.readAccount")
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
		          message: t("community.error.readAccountDetail", {
		            detail: e instanceof Error ? e.message : String(e)
		          })
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
		      setWorksError(res.error ?? { code: "unknown", message: t("community.error.readWorkList") });
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
		        res.error?.code === "unknown-endpoint" ? { code: "host-restart", message: t("community.error.hostRestart") } : res.error ?? { code: "unknown", message: t("community.error.readMine") }
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
		  const openPublish = async (w) => {
		    setDialogLoading(w.id);
		    setPublishNotice(null);
		    const res = await post("work/uploadPlan", { id: w.id });
		    setDialogLoading(null);
		    if (!res.ok) {
		      const staleHost = res.error?.code === "unknown-endpoint";
		      setPublishNotice({
		        tone: "error",
		        code: staleHost ? "host-restart" : res.error?.code ?? "unknown",
		        text: staleHost ? t("community.error.hostRestart") : res.error?.message ?? t("community.error.publish")
		      });
		      return;
		    }
		    const data = res.value;
		    if (w.published && data.remembered && data.changed.length === 0 && data.selection.length > 0) {
		      await doPublish(w, data.selection, true);
		      return;
		    }
		    setDialog({
		      work: w,
		      data,
		      selection: new Set(data.selection),
		      remember: true,
		      expanded: /* @__PURE__ */ new Set()
		    });
		  };
		  const doPublish = async (w, selection, remember) => {
		    setPublishing(w.id);
		    setPublishNotice(null);
		    const res = await post("work/publish", { id: w.id, selection, remember });
		    setPublishing(null);
		    if (!res.ok) {
		      const staleHost = res.error?.code === "unknown-endpoint";
		      setPublishNotice({
		        tone: "error",
		        code: staleHost ? "host-restart" : res.error?.code ?? "unknown",
		        text: staleHost ? t("community.error.hostRestart") : res.error?.message ?? t("community.error.publish")
		      });
		      return;
		    }
		    const value = res.value;
		    const bits = [
		      t("community.notice.published", { title: w.title, version: value.published.version })
		    ];
		    if (value.published.chargedTokens > 0) {
		      bits.push(t("community.notice.tokens", { tokens: value.published.chargedTokens }));
		    }
		    if (value.attachments && value.attachments.uploaded > 0) {
		      bits.push(t("community.notice.files", { count: value.attachments.uploaded }));
		    }
		    if (value.attachments && value.attachments.oversize.length > 0) {
		      bits.push(t("community.notice.oversize", { count: value.attachments.oversize.length }));
		    }
		    setPublishNotice({
		      tone: "success",
		      text: bits.join(" · "),
		      ...value.missing && value.missing.length ? { missing: value.missing } : {}
		    });
		    setDialog(null);
		    await loadMine();
		  };
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
		      setWorksError(res.error ?? { code: "unknown", message: t("community.error.readSummary") });
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
		      setWorksError(res.error ?? { code: "unknown", message: t("community.error.readBrief") });
		      return;
		    }
		    const brief = res.value.brief;
		    setDetail({ projectId: w.projectId, work: brief, brief });
		    setOpen({ projectId: w.projectId, kind: "brief" });
		    setWorks(
		      (prev) => prev === null ? prev : prev.map(
		        (it) => it.projectId === w.projectId ? { ...it, briefPaid: true, briefOpened: true } : it
		      )
		    );
		    setIntents((prev) => {
		      const next = { ...prev };
		      delete next[w.projectId];
		      return next;
		    });
		    const before = state?.tokens?.available;
		    const after = await refreshBalance();
		    if (typeof after === "number") {
		      const charged = brief.chargedTokens;
		      if (typeof charged === "number") {
		        setChargeNotice(
		          charged > 0 ? t("community.notice.charged", { tokens: charged, balance: after }) : t("community.notice.briefRead", { balance: after })
		        );
		      } else {
		        setChargeNotice(
		          typeof before === "number" && before !== after ? t("community.notice.charged", { tokens: before - after, balance: after }) : t("community.notice.briefRead", { balance: after })
		        );
		      }
		    }
		  };
		  const requestBrief = (w) => {
		    if (open?.projectId === w.projectId && open.kind === "brief") {
		      void toggleBrief(w);
		      return;
		    }
		    if (briefFree(w)) {
		      void toggleBrief(w);
		      return;
		    }
		    setBriefConfirm(w);
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
		  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.card, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.cardHead, children: [
		        "◈ ",
		        t("community.title"),
		        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { flex: "1 1 auto" } }),
		        state?.environment === "production" ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: "brand", children: t("community.badge.production") }) : state?.environment === "development" ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: "neutral", children: t("community.badge.development") }) : null,
		        state?.serverUrlMismatch ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: "warn", children: t("community.badge.envMismatch") }) : null,
		        phase === "loading" ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: "neutral", children: t("community.badge.checking") }) : account ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: "success", children: t("community.badge.signedIn") }) : configured ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: "warn", children: t("community.badge.unverified") }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: "neutral", children: t("community.badge.signedOut") })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.cardBody, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.miniTabs, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(MiniTab, { active: userTab === "account", onClick: () => setUserTab("account"), children: account ? t("community.tab.account") : t("community.tab.signIn") }),
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(MiniTab, { active: userTab === "server", onClick: () => setUserTab("server"), children: t("community.tab.server") })
		        ] }),
		        userTab === "account" ? account ? (
		          /* 已登录：一行账号 + 右侧操作，没有多余说明文字 */
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.inlineRow, children: [
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: S.accountName, children: account.displayName }),
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: S.mono, children: account.email }),
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { style: S.hint, children: [
		              roleText(t, account.roles),
		              " · ",
		              enumText(t, STATUS_LABEL_KEYS, account.status)
		            ] }),
		            state?.tokens ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
		              "button",
		              {
		                type: "button",
		                style: { ...S.tokenBadge, opacity: refreshingBalance || busy ? 0.55 : 1 },
		                disabled: refreshingBalance || busy,
		                title: state.tokens.frozen > 0 ? t("community.tip.balanceDetail", {
		                  available: state.tokens.available,
		                  frozen: state.tokens.frozen
		                }) : t("community.tip.balance"),
		                onClick: () => void refreshBalance(),
		                children: [
		                  "◎ ",
		                  state.tokens.available,
		                  " Token",
		                  state.tokens.frozen > 0 ? t("community.balance.frozenNote", { count: state.tokens.frozen }) : ""
		                ]
		              }
		            ) : null,
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { flex: "1 1 auto" } }),
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		              "button",
		              {
		                type: "button",
		                style: { ...S.ghostBtn, opacity: busy ? 0.55 : 1 },
		                disabled: busy,
		                onClick: () => void verify(),
		                children: busy ? t("community.action.reverifying") : t("community.action.reverify")
		              }
		            ),
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		              "button",
		              {
		                type: "button",
		                style: { ...S.ghostBtn, opacity: busy || fromEnv ? 0.55 : 1 },
		                disabled: busy || fromEnv,
		                title: fromEnv ? t("community.tip.envKey") : void 0,
		                onClick: () => void logout(),
		                children: t("community.action.signOut")
		              }
		            )
		          ] })
		        ) : (
		          /* 未登录：默认只展示**一条**登录路径 */
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.inlineRow, children: [
		              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: S.label, children: t("community.login.keyLabel") }),
		              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		                "input",
		                {
		                  style: S.compactInput,
		                  type: "password",
		                  autoComplete: "off",
		                  spellCheck: false,
		                  value: apiKey,
		                  placeholder: "cf_live_…",
		                  title: t("community.tip.keyPrivacy"),
		                  onChange: (e) => setApiKey(e.target.value),
		                  onKeyDown: (e) => {
		                    if (e.key === "Enter") void login();
		                  }
		                }
		              ),
		              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		                "button",
		                {
		                  type: "button",
		                  style: { ...S.primaryBtn, opacity: apiKey.trim() && !busy ? 1 : 0.55 },
		                  disabled: !apiKey.trim() || busy,
		                  onClick: () => void login(),
		                  children: busy ? t("community.action.signingIn") : t("community.action.signIn")
		                }
		              ),
		              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		                "button",
		                {
		                  type: "button",
		                  style: S.linkBtn,
		                  onClick: () => setInviteOpen((v) => !v),
		                  "aria-expanded": inviteOpen,
		                  children: inviteOpen ? t("community.action.inviteHide") : t("community.action.inviteShow")
		                }
		              )
		            ] }),
		            inviteOpen ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
		              /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.inlineRow, children: [
		                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		                  "input",
		                  {
		                    style: S.compactInput,
		                    type: "password",
		                    autoComplete: "off",
		                    spellCheck: false,
		                    value: invite.code,
		                    placeholder: t("community.placeholder.invitation"),
		                    onChange: (e) => setInvite({ ...invite, code: e.target.value })
		                  }
		                ),
		                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		                  "input",
		                  {
		                    style: S.compactInput,
		                    type: "text",
		                    autoComplete: "off",
		                    spellCheck: false,
		                    value: invite.email,
		                    placeholder: t("community.placeholder.email"),
		                    onChange: (e) => setInvite({ ...invite, email: e.target.value })
		                  }
		                ),
		                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		                  "input",
		                  {
		                    style: S.compactInput,
		                    type: "text",
		                    autoComplete: "off",
		                    spellCheck: false,
		                    value: invite.displayName,
		                    placeholder: t("community.placeholder.displayName"),
		                    onChange: (e) => setInvite({ ...invite, displayName: e.target.value })
		                  }
		                ),
		                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		                  "button",
		                  {
		                    type: "button",
		                    style: {
		                      ...S.primaryBtn,
		                      opacity: invite.code.trim() && invite.email.trim() && invite.displayName.trim() && !busy ? 1 : 0.55
		                    },
		                    disabled: !invite.code.trim() || !invite.email.trim() || !invite.displayName.trim() || busy,
		                    onClick: () => void register(),
		                    children: busy ? t("community.action.registering") : t("community.action.register")
		                  }
		                )
		              ] }),
		              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.hint, children: t("community.hint.inviteRule") })
		            ] }) : null
		          ] })
		        ) : (
		          /* 服务器设置：地址来自环境配置（开发 = 本机服务器，生产 = 线上） */
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.inlineRow, children: [
		              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: S.label, children: t("community.server.address") }),
		              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		                "input",
		                {
		                  style: S.compactInput,
		                  type: "text",
		                  spellCheck: false,
		                  autoComplete: "off",
		                  value: serverDraft,
		                  placeholder: state?.defaultServerUrl ?? "",
		                  title: t("community.server.title", { url: state?.defaultServerUrl ?? "" }),
		                  onChange: (e) => setServerDraft(e.target.value)
		                }
		              )
		            ] }),
		            serverChanged ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.inlineRow, children: [
		              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: "warn", children: t("community.badge.addressChanged") }),
		              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: S.hint, children: t("community.hint.addressChanged") })
		            ] }) : null,
		            state?.serverUrlMismatch ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { fontSize: 11.5, lineHeight: 1.6, color: "var(--dsw-alias-state-warn-primary)" }, children: state.environment === "production" ? t("community.hint.mismatchProduction") : t("community.hint.mismatchDevelopment") }) : null
		          ] })
		        ),
		        failure ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.inlineRow, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: "error", children: failure.code }),
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
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
		          configured ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		            "button",
		            {
		              type: "button",
		              style: { ...S.ghostBtn, opacity: busy ? 0.55 : 1 },
		              disabled: busy,
		              onClick: () => void verify(),
		              children: t("community.action.retryVerify")
		            }
		          ) : null
		        ] }) : null
		      ] })
		    ] }),
		    dialog ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		      PublishDialog,
		      {
		        t,
		        data: dialog.data,
		        selection: dialog.selection,
		        remember: dialog.remember,
		        expanded: dialog.expanded,
		        busy: publishing !== null,
		        onToggleCategory: (categoryId, files, next) => setDialog((d) => {
		          if (!d) return d;
		          const sel = new Set(d.selection);
		          for (const f of files) {
		            if (next) sel.add(f);
		            else sel.delete(f);
		          }
		          return { ...d, selection: sel };
		        }),
		        onToggleFile: (relPath, next) => setDialog((d) => {
		          if (!d) return d;
		          const sel = new Set(d.selection);
		          if (next) sel.add(relPath);
		          else sel.delete(relPath);
		          return { ...d, selection: sel };
		        }),
		        onToggleExpand: (categoryId) => setDialog((d) => {
		          if (!d) return d;
		          const ex = new Set(d.expanded);
		          if (ex.has(categoryId)) ex.delete(categoryId);
		          else ex.add(categoryId);
		          return { ...d, expanded: ex };
		        }),
		        onRemember: (next) => setDialog((d) => d ? { ...d, remember: next } : d),
		        onCancel: () => setDialog(null),
		        onConfirm: () => {
		          if (!dialog) return;
		          void doPublish(dialog.work, [...dialog.selection], dialog.remember);
		        }
		      }
		    ) : null,
		    briefConfirm ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		      BriefConfirmDialog,
		      {
		        t,
		        title: briefConfirm.title,
		        balance: state?.tokens?.available ?? null,
		        onCancel: () => setBriefConfirm(null),
		        onConfirm: () => {
		          const target = briefConfirm;
		          setBriefConfirm(null);
		          void toggleBrief(target);
		        }
		      }
		    ) : null,
		    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.card, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.cardHead, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { marginRight: 4 }, children: t("community.work.title") }),
		        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(MiniTab, { active: workTab === "mine", onClick: () => setWorkTab("mine"), children: t("community.tab.mine") }),
		        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(MiniTab, { active: workTab === "mentor", onClick: () => setWorkTab("mentor"), children: t("community.tab.mentor") }),
		        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { flex: "1 1 auto" } }),
		        workTab === "mine" ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		          "button",
		          {
		            type: "button",
		            style: { ...S.ghostBtn, opacity: mineLoading ? 0.55 : 1 },
		            disabled: mineLoading,
		            onClick: () => void loadMine(),
		            children: mineLoading ? t("community.action.loading") : t("community.action.refresh")
		          }
		        ) : null,
		        workTab === "mentor" && account ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		          "button",
		          {
		            type: "button",
		            style: { ...S.ghostBtn, opacity: worksLoading ? 0.55 : 1 },
		            disabled: worksLoading,
		            onClick: () => void loadWorks(),
		            children: worksLoading ? t("community.action.loading") : t("community.action.refresh")
		          }
		        ) : null,
		        workTab === "mentor" && !account ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: "neutral", children: t("community.badge.sample") }) : null
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.cardBody, children: [
		        publishNotice ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.inlineRow, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: publishNotice.tone === "success" ? "success" : "error", children: publishNotice.tone === "success" ? t("community.badge.published") : publishNotice.code ?? t("community.badge.published") }),
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
		            "span",
		            {
		              style: {
		                color: publishNotice.tone === "success" ? "var(--dsw-alias-label-secondary)" : "var(--dsw-alias-state-error-primary)",
		                fontSize: 12,
		                lineHeight: 1.6,
		                flex: "1 1 320px",
		                minWidth: 0
		              },
		              children: [
		                publishNotice.text,
		                publishNotice.missing && publishNotice.missing.length ? ` ${t("community.hint.publishMissing", { fields: publishNotice.missing.join(" / ") })}` : ""
		              ]
		            }
		          )
		        ] }) : null,
		        chargeNotice ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.inlineRow, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: "brand", children: t("community.badge.charged") }),
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: S.hint, children: chargeNotice })
		        ] }) : null,
		        worksError ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.inlineRow, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: "error", children: worksError.code }),
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
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
		          mineError ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.inlineRow, children: [
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: "error", children: mineError.code }),
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
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
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", style: S.ghostBtn, onClick: () => void loadMine(), children: t("community.action.retry") })
		          ] }) : mineRegistry && !mineRegistry.available ? (
		            // 注册表读不到（≠ 没有研究项目）：把原因原样说出来，便于定位
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.inlineRow, children: [
		              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: "warn", children: t("community.badge.registryUnavailable") }),
		              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: S.hint, children: mineRegistry.reason ?? t("community.hint.registryUnavailable") })
		            ] })
		          ) : mine === null ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.hint, children: mineLoading ? t("community.hint.loading") : t("community.hint.noData") }) : mine.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.hint, children: t("community.hint.mineEmpty") }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.list, children: mine.map((w, i) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		            "div",
		            {
		              style: i === 0 ? void 0 : { borderTop: "1px solid var(--dsw-alias-border-l1)" },
		              children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { ...S.listRow, alignItems: "flex-start" }, children: [
		                /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { minWidth: 0, flex: "1 1 auto", display: "flex", flexDirection: "column", gap: 4 }, children: [
		                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.listTitle, children: w.title }),
		                  /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { ...S.hint, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }, children: [
		                    w.stage ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: translateOr(t, `progress.stage.${w.stage.id}`, w.stage.label) }) : null,
		                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ProgressBar, { value: w.overall }),
		                    w.paper ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: t("community.hint.paper") }) : null,
		                    w.counts.filter((c) => c.value > 0).slice(0, 4).map((c) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { children: [
		                      translateOr(t, `progress.count.${c.key}`, c.key),
		                      " ",
		                      c.value
		                    ] }, c.key))
		                  ] }),
		                  w.counts.some((c) => c.value > 0 && c.detail) ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { ...S.hint, display: "flex", gap: 10, flexWrap: "wrap" }, children: w.counts.filter((c) => c.value > 0 && c.detail).slice(0, 4).map((c) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: t(`progress.count.${c.detail.code}`, { count: c.detail.count }) }, `d-${c.key}`)) }) : null,
		                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { ...S.mono, color: "var(--dsw-alias-label-tertiary)" }, title: w.researchRoot, children: w.path })
		                ] }),
		                /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 6, flex: "0 0 auto" }, children: [
		                  w.published ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: "success", children: t("community.badge.inNetwork") }) : null,
		                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		                    "button",
		                    {
		                      type: "button",
		                      style: {
		                        ...S.ghostBtn,
		                        opacity: account && publishing !== w.id ? 1 : 0.55
		                      },
		                      disabled: !account || publishing !== null || dialogLoading !== null,
		                      title: account ? t("community.tip.publish") : t("community.tip.publishNeedSignIn"),
		                      onClick: () => void openPublish(w),
		                      children: publishing === w.id ? t("community.action.publishing") : dialogLoading === w.id ? t("community.action.loading") : w.published ? t("community.action.republish") : t("community.action.seekMentor")
		                    }
		                  )
		                ] })
		              ] })
		            },
		            w.id
		          )) })
		        ) : !account ? (
		          /* ── 可指导 · 未登录：示例数据（不可操作）── */
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.list, children: SAMPLE_WORKS.map((w, i) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		              "div",
		              {
		                style: i === 0 ? void 0 : { borderTop: "1px solid var(--dsw-alias-border-l1)" },
		                children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		                  WorkRow,
		                  {
		                    t,
		                    title: t(w.titleKey),
		                    fields: [t(w.fieldsKey)],
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
		              w.titleKey
		            )) }),
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.hint, children: t("community.hint.sampleFootnote") })
		          ] })
		        ) : !canMentor ? (
		          /* ── 可指导 · 已登录但没有导师角色：如实说明这一层需要什么 ── */
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.inlineRow, children: [
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: "warn", children: t("community.badge.mentorRequired") }),
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: S.hint, children: t("community.hint.mentorRequiresRole", { roles: roleText(t, account.roles) }) })
		          ] })
		        ) : works === null ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.hint, children: worksLoading ? t("community.hint.loadingWork") : t("community.hint.noData") }) : works.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.hint, children: t("community.hint.noDiscoverable") }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.list, children: works.map((w, i) => {
		          const expanded = open?.projectId === w.projectId;
		          const busyKind = detailBusy?.projectId === w.projectId ? detailBusy.kind : null;
		          return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
		            "div",
		            {
		              style: i === 0 ? void 0 : { borderTop: "1px solid var(--dsw-alias-border-l1)" },
		              children: [
		                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		                  WorkRow,
		                  {
		                    t,
		                    title: w.title,
		                    fields: w.researchFields,
		                    stage: w.stage,
		                    progress: w.progress,
		                    updatedAt: w.updatedAt,
		                    disabled: false,
		                    busy: busyKind,
		                    expanded,
		                    briefFree: briefFree(w),
		                    onSummary: () => void toggleSummary(w),
		                    onBrief: () => requestBrief(w)
		                  }
		                ),
		                expanded && detail?.projectId === w.projectId ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(WorkDetail, { t, work: detail.work, brief: detail.brief }) : null
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
		  onNotice,
		  t
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
		      onNotice({ tone: "success", text: t("system.retrieval.saved") });
		    } catch (e) {
		      onNotice({
		        tone: "error",
		        text: t("system.retrieval.saveFailed", { detail: e instanceof Error ? e.message : String(e) })
		      });
		    } finally {
		      setBusy(false);
		    }
		  };
		  const clear = async () => {
		    setBusy(true);
		    try {
		      await scope.unset("openalexApiKey");
		      setDraft("");
		      onNotice({ tone: "success", text: t("system.retrieval.cleared") });
		    } catch (e) {
		      onNotice({
		        tone: "error",
		        text: t("system.retrieval.clearFailed", { detail: e instanceof Error ? e.message : String(e) })
		      });
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
		        onNotice({
		          tone: "success",
		          text: t("system.dependency.available", { version: next.version ? `: ${next.version}` : "" })
		        });
		      } else {
		        onNotice({ tone: "error", text: t("system.dependency.missing") });
		      }
		    } finally {
		      setChecking(false);
		    }
		  };
		  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.card, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.cardHead, children: [
		        "🧩 ",
		        t("system.dependency.title"),
		        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { flex: "1 1 auto" } }),
		        dep === null ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: "neutral", children: t("system.status.unknown") }) : dep.available ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: "success", children: t("system.status.installed") }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: "warn", children: t("system.status.notInstalled") })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.cardBody, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: S.mono, children: "tectonic" }),
		          dep?.version ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: S.hint, children: dep.version }) : null,
		          dep?.path ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { ...S.hint, opacity: 0.7 }, children: dep.path }) : null,
		          dep?.viaEnv ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: S.hint, children: t("system.dependency.viaEnv", { envVar: dep.envVar }) }) : null,
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { flex: "1 1 auto" } }),
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		            "button",
		            {
		              type: "button",
		              style: { ...S.ghostBtn, opacity: checking ? 0.55 : 1 },
		              disabled: checking,
		              onClick: () => void recheck(),
		              children: checking ? t("system.dependency.checking") : t("system.dependency.recheck")
		            }
		          )
		        ] }),
		        dep && !dep.available ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { ...S.hint, lineHeight: 2, marginTop: 8 }, children: [
		          t("system.dependency.installIntro"),
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("br", {}),
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: S.mono, children: "brew install tectonic" }),
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("br", {}),
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: S.mono, children: "mamba install -c conda-forge tectonic" }),
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("br", {}),
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: S.mono, children: "cargo install tectonic" }),
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("br", {}),
		          t("system.dependency.installOutro", { envVar: dep.envVar || "CONVFUSION_TECTONIC" })
		        ] }) : null
		      ] })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.card, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.cardHead, children: [
		        "⌕ ",
		        t("system.retrieval.title"),
		        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { flex: "1 1 auto" } }),
		        configured ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: "success", children: t("system.status.configured") }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Badge, { tone: "warn", children: t("system.status.notConfigured") })
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.cardBody, children: [
		        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.field, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.label, children: "OpenAlex API Key" }),
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		            "input",
		            {
		              style: S.input,
		              type: "password",
		              autoComplete: "off",
		              spellCheck: false,
		              value: draft,
		              placeholder: configured ? t("system.retrieval.placeholderReplace") : t("system.retrieval.placeholderPaste"),
		              title: t("system.retrieval.secretHint"),
		              onChange: (e) => setDraft(e.target.value)
		            }
		          ),
		          !configured ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.hint, children: [
		            t("system.retrieval.notConfigured"),
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: S.mono, children: "openalex.org" }),
		            "  ",
		            t("system.retrieval.notConfiguredAction")
		          ] }) : source === "env" ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.hint, children: [
		            t("system.retrieval.envFrom"),
		            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: S.mono, children: envVar }),
		            "  ",
		            t("system.retrieval.envFromAction")
		          ] }) : null
		        ] }),
		        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.footer, children: [
		          source === "settings" ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		            "button",
		            {
		              type: "button",
		              style: { ...S.ghostBtn, opacity: busy ? 0.55 : 1 },
		              disabled: busy,
		              onClick: () => void clear(),
		              children: t("system.retrieval.clear")
		            }
		          ) : null,
		          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		            "button",
		            {
		              type: "button",
		              style: { ...S.primaryBtn, opacity: draft.trim() && !busy ? 1 : 0.55 },
		              disabled: !draft.trim() || busy,
		              onClick: () => void save(),
		              children: busy ? t("settings.editor.saving") : t("settings.editor.save")
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
		var import_jsx_runtime4 = require("react/jsx-runtime");
		function readProgressValue(res) {
		  const envelope = res;
		  if (envelope?.ok !== true) return { kind: "hidden" };
		  const value = envelope.value ?? {};
		  if (value.protocol !== 12) return { kind: "hidden" };
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
		  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("svg", { width: "16", height: "16", viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("rect", { x: "3.2", y: "8.4", width: "2.3", height: "4.4", rx: "0.6", fill: "currentColor" }),
		    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("rect", { x: "6.85", y: "5.4", width: "2.3", height: "7.4", rx: "0.6", fill: "currentColor" }),
		    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("rect", { x: "10.5", y: "2.4", width: "2.3", height: "10.4", rx: "0.6", fill: "currentColor" })
		  ] });
		}
		var pct = (v) => `${Math.round(v * 100)}%`;
		var PROGRESS_REFRESH_MS = 6e4;
		function Bar({ scale }) {
		  const width = `${Math.max(0, Math.min(1, scale)) * 100}%`;
		  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
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
		      children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
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
		function clarityText(t, clarity) {
		  return t(`progress.clarity.${clarity}`);
		}
		function stageText(t, stage) {
		  return translateOr(t, `progress.stage.${stage.id}`, stage.label);
		}
		function gapText(t, gap) {
		  switch (gap.code) {
		    case "stagePending":
		      return t("progress.gap.stagePending", { stage: stageText(t, gap.stage) });
		    case "processComplete":
		      return t("progress.gap.processComplete");
		    case "unsupportedClaims":
		      return t("progress.gap.unsupportedClaims", { count: gap.count });
		    case "missingArtifacts":
		      return t("progress.gap.missingArtifacts", { count: gap.count });
		    case "openQuestions":
		      return t("progress.gap.openQuestions", { count: gap.count });
		  }
		}
		function basisText(t, need, stage) {
		  if (!need.basisCode) return need.basis;
		  const params = { ...need.basisParams ?? {} };
		  if (need.basisCode === "stagePending" && stage) {
		    params.stage = stageText(t, stage);
		    params.evidence = translateOr(
		      t,
		      `progress.stageEvidence.${stage.id}`,
		      String(need.basisParams?.evidence ?? "")
		    );
		  }
		  return translateOr(t, `progress.basis.${need.basisCode}`, need.basis).replace(
		    /\{(\w+)\}/g,
		    (match, name) => name in params ? String(params[name]) : match
		  );
		}
		function nextStepText(t, text, stage) {
		  return stage ? translateOr(t, `progress.stageOutput.${stage.id}`, text) : text;
		}
		function decisionText(t, need) {
		  if (need.decisionCode) {
		    return translateOr(t, `progress.decision.${need.decisionCode}`, need.needsUserDecision ?? "");
		  }
		  return need.needsUserDecision;
		}
		function ResearchProgressButton({ sessionId, t }) {
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
		  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { ref: anchorRef, style: { display: "inline-flex", alignItems: "center" }, "data-convfusion-progress-button": "1", children: [
		    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
		      "button",
		      {
		        type: "button",
		        "aria-label": report ? t("progress.button.ariaWithPercent", { percent: pct(report.overall) }) : t("progress.name"),
		        "aria-haspopup": "dialog",
		        "aria-expanded": open,
		        title: report ? t("progress.button.titleWithPercent", { percent: pct(report.overall) }) : t("progress.button.title"),
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
		          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(ProgressGlyph, {}),
		          report ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
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
		    open ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
		      "div",
		      {
		        ref: panelRef,
		        role: "dialog",
		        "aria-label": t("progress.name"),
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
		          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }, children: [
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("strong", { children: t("progress.name") }),
		            report ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { style: { color: muted, ...mono }, children: [
		              t("progress.summary", { percent: pct(report.overall) }),
		              report.progress.stage ? t("progress.currentStage", { stage: stageText(t, report.progress.stage) }) : ""
		            ] }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { color: muted }, children: t("progress.noData") }),
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { style: { marginLeft: "auto", display: "inline-flex", gap: "2px" }, children: [
		              busy ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { color: muted, ...mono }, children: t("progress.reading") }) : null,
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
		                "button",
		                {
		                  type: "button",
		                  style: { ...iconButton, opacity: busy ? 0.5 : 1 },
		                  "aria-label": t("progress.refresh"),
		                  title: t("progress.refresh"),
		                  disabled: busy,
		                  onClick: () => void load(),
		                  children: "⟳"
		                }
		              ),
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
		                "button",
		                {
		                  type: "button",
		                  style: iconButton,
		                  "aria-label": t("progress.close"),
		                  title: t("progress.close"),
		                  onClick: () => setOpen(false),
		                  children: "✕"
		                }
		              )
		            ] })
		          ] }),
		          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { color: muted, ...mono }, children: shortenPath(probe.workspace) }),
		          report ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: section, children: [
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: sectionTitle, children: t("progress.section.maturity") }),
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "2px 16px" }, children: report.progress.dimensions.map((d) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "8px" }, children: [
		                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { minWidth: "92px", ...mono }, children: maturityDimensionText(t, d.dimension) }),
		                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Bar, { scale: d.scale }),
		                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { color: muted, ...mono }, children: maturityLevelText(t, d.level) })
		              ] }, d.dimension)) })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: section, children: [
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: sectionTitle, children: t("progress.section.assets") }),
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "2px 16px" }, children: [
		                report.counts.map((row) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { display: "flex", gap: "8px" }, children: [
		                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { minWidth: "92px", ...mono }, children: progressCountText(t, row.key) }),
		                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: mono, children: row.value }),
		                  row.detail ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { color: muted }, children: t(`progress.count.${row.detail.code}`, { count: row.detail.count }) }) : null
		                ] }, row.key)),
		                /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { display: "flex", gap: "8px" }, children: [
		                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { minWidth: "92px", ...mono }, children: t("progress.paper") }),
		                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { color: muted }, children: report.paper ? t("progress.paper.present") : t("progress.paper.absent") })
		                ] })
		              ] }),
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { color: muted }, children: t("progress.stateVersion", { version: report.stateVersion }) })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: section, children: [
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: sectionTitle, children: t("progress.section.turn") }),
		              lastTurn ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
		                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { color: muted, ...mono }, children: t("progress.turn.summary", {
		                  turn: lastTurn.turn,
		                  before: pct(lastTurn.overall.before),
		                  after: pct(lastTurn.overall.after),
		                  assetChange: lastTurn.changes.counts.length > 0 ? t("progress.turn.assetChange", { count: lastTurn.changes.counts.length }) : t("progress.turn.noAssetChange")
		                }) }),
		                lastTurn.changes.changed ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("ul", { style: { margin: "2px 0 0", paddingLeft: "18px" }, children: [
		                  lastTurn.changes.maturity.map((m) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("li", { children: t("progress.turn.maturityChange", {
		                    dimension: maturityDimensionText(t, m.dimension),
		                    from: maturityLevelText(t, m.from),
		                    to: maturityLevelText(t, m.to)
		                  }) }, `m-${m.dimension}`)),
		                  lastTurn.changes.counts.map((c) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("li", { children: t("progress.turn.countChange", {
		                    label: progressCountText(t, c.key),
		                    from: c.from,
		                    to: c.to,
		                    delta: `${c.to - c.from > 0 ? "+" : ""}${c.to - c.from}`
		                  }) }, `c-${c.key}`))
		                ] }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { color: muted }, children: t("progress.turn.noChange") })
		              ] }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { color: muted }, children: t("progress.turn.unavailable") })
		            ] }),
		            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: section, children: [
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: sectionTitle, children: t("progress.section.need") }),
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("ul", { style: { margin: "2px 0 0", paddingLeft: "18px" }, children: report.need.gaps.map((g, index) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("li", { children: gapText(t, g) }, `${g.code}-${index}`)) }),
		              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { marginTop: "2px" }, children: [
		                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { color: muted }, children: t("progress.need.assessment") }),
		                clarityText(t, report.need.clarity),
		                report.need.basis ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { color: muted }, children: t("progress.need.basis", { basis: basisText(t, report.need, report.progress.stage) }) }) : null
		              ] }),
		              report.need.nextStep ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { children: t("progress.need.nextStep", {
		                text: nextStepText(t, report.need.nextStep, report.progress.stage)
		              }) }) : null,
		              decisionText(t, report.need) ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { children: t("progress.need.decision", { text: decisionText(t, report.need) }) }) : null
		            ] })
		          ] }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { marginTop: "8px", color: muted }, children: t("progress.noReport") }),
		          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { marginTop: "10px", color: muted, fontSize: "11.5px" }, children: t("progress.footnote") })
		        ]
		      }
		    ) : null
		  ] });
		}

		// src/client/index.tsx
		var inject = ["slots", "settingsScope", "locale"];
		var SECTION_ORDER = 60;
		function apply(ctx) {
		  ctx.effect(
		    () => ctx.locale.register(CONVFUSION_LOCALE_NS, dictionaries),
		    "convfusion: browser dictionaries"
		  );
		  const t = ctx.locale.bind(CONVFUSION_LOCALE_NS);
		  const scope = ctx.settingsScope.bind({ namespace: "convfusion" });
		  ctx.slots.inject(
		    "settings.section",
		    () => ctx.slots.register(
		      {
		        name: "settings.section",
		        id: "convfusion",
		        order: SECTION_ORDER,
		        label: () => t("settings.nav"),
		        locale: CONVFUSION_LOCALE_NS,
		        inject: () => ({ scope })
		      },
		      ConvFusionProjectSettings
		    )
		  );
		  ctx.slots.inject(
		    "conversation.session.header.utilities",
		    () => ctx.slots.register(
		      {
		        name: "conversation.session.header.utilities",
		        id: "convfusion-progress",
		        order: 20,
		        locale: CONVFUSION_LOCALE_NS
		      },
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
