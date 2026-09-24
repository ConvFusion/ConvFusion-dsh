<p align="center">
  <img src="./assets/favicon.svg" width="200" alt="ConvFusion Logo">
</p>

<h1 align="center">ConvFusion for DeepSeek Harness</h1>

<p align="center"><strong>A research operating system plugin built for DeepSeek Harness</strong></p>

<p align="center">
  <img src="https://img.shields.io/badge/version-v0.3.0-4a43ea" alt="Version 0.3.0">
  <img src="https://img.shields.io/badge/DeepSeek_Harness-plugin-4a43ea" alt="DeepSeek Harness Plugin">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-22c55e" alt="Apache-2.0 License"></a>
</p>

<p align="center">
  <a href="./README.md">简体中文</a> · <strong>English</strong>
</p>

---

ConvFusion is a research operating system plugin built for DeepSeek Harness. It provides AI research assistants with systematic research methodologies, workflow management, and research asset tracking.

> ConvFusion is built entirely on the native DeepSeek Harness extension mechanism. It does not implement an additional agent runtime or wrap the tool system, and focuses solely on professional capabilities for research.

## ✨ Core Features

- **Research context injection**: Automatically maintains research project state and dynamically injects system prompts so the AI assistant always understands the current research progress
- **Professional skill library**: Includes 55 validated research methodology skills in 9 categories (Research Understanding · Literature · Innovation · Research Planning · Resource Estimation · Research Decision · Experiment · Academic Writing · Review), covering the full research workflow, including literature reviews, experiment design (with simulation-first results when hardware is insufficient), result analysis, and academic writing
- **Research asset tracking**: Native structured recording and traceability for Evidence, Claims, and Decisions
- **Plan management system**: Natural-language-driven research plan lifecycle management with draft, review, and execution state transitions
- **Paper evolution support**: Treats papers as continuously evolving entities, with revision proposals, gap analysis, and version management
- **Multiple output types**: Unified management of academic papers, patents, technical reports, presentations, and other research outputs
- **Native UI integration**: Provides a visual settings page with personalized skill customization

## 🚀 Installation

Use [DSH-Launcher](https://github.com/ConvFusion/DSH-Launcher) to install and start DeepSeek Harness, then enter the following command on the DSH-Launcher plugin management page:

```text
github:ConvFusion/ConvFusion-dsh
```

## 📖 Quick Start

Once installation is complete, start with a single command:

```text
/research your research topic or request
```

For example:

- `/research I want to study cross-modal UAV vision-LiDAR localization`
- `/research Help me design an experiment to validate my hypothesis`
- `/research Where is the research now, and what should I do next?`

ConvFusion will automatically:

1. Create a standardized research workspace structure
2. Recommend suitable methods based on the current research stage
3. Track all research assets and decisions
4. Guide you through the complete research workflow, from topic selection to final outputs

## 📂 Workspace Structure

ConvFusion uses a standardized research workspace layout:

```text
<your-research-project>/
├── project.md          # Research definition and scope
├── plans/              # Research plans for each stage
├── experiments/        # Experiment code, data, and results
├── research/           # Structured assets: evidence, claims, and decisions
├── papers/             # Paper drafts and evolution records
└── outputs/            # Patents, reports, presentations, and other outputs
```

## 🔌 Connecting to ConvFusion.com (optional)

> **ConvFusion-dsh executes research. ConvFusion.com connects research.**
> Your research methods and prompts **always stay on this machine**; only research
> progress (Research State) goes to the network.

The ConvFusion settings section has two tabs: **Local Methodology** (this machine only)
and **ConvFusion.com** (the research network). The latter is the community / commercial
entry point: sign in, configure the server, browse research work from the network.

### Signing in

ConvFusion.com is **invitation-only** and has no passwords — the credential is an API key
(`cf_live_…`), and there are two entry points:

1. **You already have an API key** → paste it; the local host verifies the identity and stores it.
2. **You have an invitation** (`cf_inv_…`) → enter the invitation code, email and display name;
   the key issued on registration is stored on this machine automatically.

The credential is stored **locally** (DSH settings user layer). It is never returned to the
browser and never written into the conversation. Not signing in does not affect any local
feature; while signed out the research-work list shows clearly labelled **sample data** and
cannot be acted on. Once signed in, the account row shows the current **Token balance**
(click to refresh; paid reads such as a brief refresh it automatically).

### Publishing research to the network ("Find a mentor")

**Research work → Mine** lists the research projects on this machine (those DSH workspaces that
contain a valid research workspace). Clicking **Find a mentor** on one of them is what publishes
*that* project's research state to ConvFusion.com (create project → upload research state →
publish); clicking again only updates the content and never creates a duplicate project.
Published projects show **In the network**, and that badge follows the **server**: refreshing a
list re-checks the server, so deleting a project or unpublishing it on the server clears the
badge immediately (the matching local mapping is dropped or marked unpublished).
**Only research progress is uploaded**: prompts, skill customizations, workflows and personal
expertise always stay on this machine.

### Research work and two-level disclosure

What is published on the network is the Research State of **research projects**. The list
follows the server's progressive disclosure and offers two levels:

| Action | Cost | Contents |
|---|---|---|
| Summary | free | research question / summary / stage / progress (**no** core idea or method) |
| Brief | 1 Token for non-authors | motivation / core idea / hypothesis / method overview / key evidence / open problems |
| Full research state | requires a mentor relationship with the author | not implemented yet |

A brief retry reuses the **same request identifier**, so a retry after topping up tokens is
never charged twice.

### Environment configuration (development / production)

The server address is **not hard-coded**: development uses `http://localhost:8000` and
production uses `https://convfusion.apibrowser.com:4747` (a trial address; the official domain `convfusion.com` is not
live yet), supplied per environment by a config file. On a development machine, copy the
template and edit it:

```bash
cp convfusion.env.example.json convfusion.env.json
```

```jsonc
{
  "environment": "development",          // or set CONVFUSION_ENV / NODE_ENV
  "environments": {
    "development": { "serverUrl": "http://localhost:8000" },
    "production":  { "serverUrl": "https://convfusion.apibrowser.com:4747" }
  },
  "dev": {                               // read only by development tooling (verification scripts)
    "serverDir": "../ConvFusion-server",
    "python": "python3"
  }
}
```

Effective address precedence: **DSH settings document > `CONVFUSION_SERVER_URL` > environment
config file > built-in fallback**. `convfusion.env.json` contains machine-specific paths and is
git-ignored; the committed template is `convfusion.env.example.json`. The settings page shows the
current environment (development / production) and warns when the address clearly contradicts it.

## 📝 License

[Apache License 2.0](./LICENSE)
