<p align="center">
  <img src="./assets/favicon.svg" width="200" alt="ConvFusion Logo">
</p>

<h1 align="center">ConvFusion for DeepSeek Harness</h1>

<p align="center"><strong>专为 DeepSeek Harness 打造的科研操作系统插件</strong></p>

<p align="center">
  <img src="https://img.shields.io/badge/version-v0.3.0-4a43ea" alt="Version 0.3.0">
  <img src="https://img.shields.io/badge/DeepSeek_Harness-plugin-4a43ea" alt="DeepSeek Harness Plugin">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-22c55e" alt="Apache-2.0 License"></a>
</p>

<p align="center">
  <strong>简体中文</strong> · <a href="./README_EN.md">English</a>
</p>

---

ConvFusion 是专为 DeepSeek Harness 打造的科研操作系统插件，为 AI 研究助手提供系统化的研究方法论、工作流管理和资产追踪能力。

> ConvFusion 完全基于 DeepSeek Harness 原生扩展机制构建，不额外实现 Agent 运行时、不封装工具系统，只专注于提供科研领域的专业能力。

## ✨ 核心功能

- **科研上下文注入**：自动维护研究项目状态，动态注入系统提示，让 AI 助手始终了解研究进展
- **专业技能库**：内置 49 个经过验证的研究方法技能，覆盖文献综述、实验设计（含硬件不足时先出仿真结果）、结果分析、论文写作等科研全流程
- **研究资产追踪**：原生支持证据（Evidence）、主张（Claim）、决策（Decision）的结构化记录与追溯
- **计划管理系统**：自然语言驱动的研究计划生命周期管理，支持草稿、评审、执行状态流转
- **论文演化支持**：论文作为持续演化实体，支持修订提案、缺口分析、版本管理
- **多类型成果输出**：统一管理学术论文、专利、技术报告、演示文稿等多种研究产出
- **原生 UI 集成**：提供可视化设置页面，支持技能个性化定制

## 🚀 安装

使用 [DSH-Launcher](https://github.com/ConvFusion/DSH-Launcher) 安装并启动 DeepSeek Harness，然后在 DSH-Launcher 的插件管理页面中输入以下命令进行安装：

```text
github:ConvFusion/ConvFusion-dsh
```

## 📖 快速开始

安装完成后，你只需要一个命令即可开始使用：

```text
/research 你的研究主题或需求
```

例如：

- `/research 我想做一个关于无人机视觉-LiDAR 跨模态定位的研究`
- `/research 帮我设计一个实验验证我的假设`
- `/research 现在研究到哪一步了，接下来应该做什么？`

ConvFusion 会自动：

1. 为你创建规范的研究工作区结构
2. 根据当前研究阶段推荐合适的方法
3. 追踪所有研究资产和决策过程
4. 引导你完成从选题到成果输出的完整科研流程

## 📂 工作区结构

ConvFusion 使用标准化的研究工作区布局：

```text
<your-research-project>/
├── project.md          # 研究定义与范围
├── plans/              # 各阶段研究计划
├── experiments/        # 实验代码、数据与结果
├── research/           # 证据、主张、决策等结构化资产
├── papers/             # 论文草稿与演化记录
└── outputs/            # 专利、报告、演示文稿等成果
```

## 🔌 接入 ConvFusion.com（可选）

> **ConvFusion-dsh 执行研究，ConvFusion.com 连接研究。**
> 你的研究方法与提示词**始终只留在本机**，上网络的只有研究进展（Research State）。

【设置】-【ConvFusion】里有两个 Tab：**本地研究方法**（仅本机）与 **ConvFusion.com**（研究网络）。
后者是社区 / 商业功能入口：登录账号、配置服务器、浏览网络上的研究工作。

### 登录

ConvFusion.com 采用**邀请制**，账号没有口令 —— 凭据是一份 API Key（`cf_live_…`），两条入口：

1. **已有 API Key** → 粘贴后由本机宿主验证身份并保存；
2. **有邀请码**（`cf_inv_…`）→ 填邀请码 + 邮箱 + 显示名，注册成功后 Key 直接保存在本机。

凭据只保存在**本机**（DSH 设置用户层），**不会**回传到浏览器，也不会进入对话内容。
不登录不影响任何本地功能；未登录时研究工作列表显示**标注清楚的示例数据**且不可操作。
登录后账号行会显示当前 **Token 余额**（点一下可刷新；读完简报这类花钱的操作会自动刷新）。

### 把研究发布到网络（「寻找指导」）

【研究工作 · 我的】列出本机的研究项目（DSH 工作区里含有效 research workspace 的那些）。
点某一项的 **寻找指导**，才会把**这一项**的研究状态发布到 ConvFusion.com
（建项目 → 传 Research State → 发布）；再点一次只更新内容，不会重复建项目。
已发布的项目显示 **已在网络中**，这个标记以**服务器**为准：刷新列表时会向服务器核对，
服务器删项目或取消发布后标记随即消失（对应的本地映射被丢弃或记为未发布）。
**只有研究进展会被上传**：提示词、Skill 定制、工作流与个人经验始终留在本机。

### 研究工作与两级披露

网络上公开的是**研究工作**（Research Project）的 Research State。列表按服务器的渐进披露给出两级：

| 操作 | 费用 | 内容 |
|---|---|---|
| 摘要 | 免费 | 研究问题 / 摘要 / 阶段 / 进度（**不含**核心想法与方法） |
| 简报 | 非作者 1 Token | 动机 / 核心想法 / 假设 / 方法概览 / 关键证据 / 待解问题 |
| 完整研究状态 | 需与作者建立导师关系 | 本轮尚未接入 |

简报的重试使用**同一个请求标识**，因此因余额不足失败后充值再试**不会重复扣费**。

### 环境配置（开发 / 生产）

服务器地址**不写死在代码里**：开发是 `http://localhost:8000`、生产是 `https://convfusion.apibrowser.com:4747`
（试运行期地址，正式域名 `convfusion.com` 尚未启用），由环境配置文件按环境给出。
开发机上复制模板并按需修改：

```bash
cp convfusion.env.example.json convfusion.env.json
```

```jsonc
{
  "environment": "development",          // 或用 CONVFUSION_ENV / NODE_ENV 指定
  "environments": {
    "development": { "serverUrl": "http://localhost:8000" },
    "production":  { "serverUrl": "https://convfusion.apibrowser.com:4747" }
  },
  "dev": {                               // 只有开发流程（验证脚本）会读这段
    "serverDir": "../ConvFusion-server",
    "python": "python3"
  }
}
```

生效地址的优先级：**DSH 设置文档 > `CONVFUSION_SERVER_URL` > 环境配置文件 > 内置兜底**。
`convfusion.env.json` 含机器相关路径，已被 `.gitignore`；提交进仓库的是模板
`convfusion.env.example.json`。设置页会显示当前环境（开发 / 生产），地址与环境明显矛盾时会提示。

## 📝 许可证

[Apache License 2.0](./LICENSE)
