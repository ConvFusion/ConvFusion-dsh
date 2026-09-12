# ConvFusion for DeepSeek Harness

**v0.2.0**

ConvFusion 是专为 DeepSeek Harness 打造的科研操作系统插件，为AI研究助手提供系统化的研究方法论、工作流管理和资产追踪能力。

> ConvFusion 完全基于 DeepSeek Harness 原生扩展机制构建，不额外实现Agent运行时、不封装工具系统，只专注于提供科研领域的专业能力。

## ✨ 核心功能

- **科研上下文注入**：自动维护研究项目状态，动态注入系统提示，让AI助手始终了解研究进展
- **专业技能库**：内置49个经过验证的研究方法技能，覆盖文献综述、实验设计（含硬件不足时先出仿真结果）、结果分析、论文写作等科研全流程
- **研究资产追踪**：原生支持证据(Evidence)、主张(Claim)、决策(Decision)的结构化记录与追溯
- **计划管理系统**：自然语言驱动的研究计划生命周期管理，支持草稿、评审、执行状态流转
- **论文演化支持**：论文作为持续演化实体，支持修订提案、缺口分析、版本管理
- **多类型成果输出**：统一管理学术论文、专利、技术报告、演示文稿等多种研究产出
- **原生UI集成**：提供可视化设置页面，支持技能个性化定制

## 🚀 安装

使用 [DSH-Launcher](https://github.com/ConvFusion/DSH-Launcher) 安装并启动 DeepSeek Harness，然后在插件管理页面中输入以下命令进行安装：

```bash
npx @deepseek-ai/dsh plugin add https://github.com/ConvFusion/ConvFusion-dsh
```

## 📖 快速开始

安装完成后，你只需要一个命令即可开始使用：

```bash
/research 你的研究主题或需求
```

例如：
- `/research 我想做一个关于无人机视觉-LiDAR跨模态定位的研究`
- `/research 帮我设计一个实验验证我的假设`
- `/research 现在研究到哪一步了，接下来应该做什么？`

ConvFusion会自动：
1. 为你创建规范的研究工作区结构
2. 根据当前研究阶段推荐合适的方法
3. 追踪所有研究资产和决策过程
4. 引导你完成从选题到成果输出的完整科研流程

## 📂 工作区结构

ConvFusion使用标准化的研究工作区布局：
```
<your-research-project>/
├── project.md          # 研究定义与范围
├── plans/              # 各阶段研究计划
├── experiments/        # 实验代码、数据与结果
├── research/           # 证据、主张、决策等结构化资产
├── papers/             # 论文草稿与演化记录
└── outputs/            # 专利、报告、演示文稿等成果
```

## 📝 许可证

MIT
