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
- **Professional skill library**: Includes 49 validated research methodology skills covering the full research workflow, including literature reviews, experiment design (with simulation-first results when hardware is insufficient), result analysis, and academic writing
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

## 📝 License

[Apache License 2.0](./LICENSE)
