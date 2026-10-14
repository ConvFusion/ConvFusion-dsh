# 版本记录

## v0.6.1

**Research State 自进化（产物自动同步 + 主题/研究定义收敛）**，并修掉一轮实测中暴露的 Bug。

### 新能力

- **产物自动汇总进 Research State**：`research_decision` / `research_claim` / `research_evidence`
  写入后，自动把 `Decisions` / `Claims` / `Evidence` / `Literature` / `Experiments` 五个维度
  汇总进 `research-state.md`（也可用 `research_state_propose action=sync` 手动补）。
  只写 `### Auto-synced artifacts` 段落，**绝不覆盖人手写的内容**；内容没变不写盘；
  写入前归档旧版本到 `research/state-history/`（可回退）。
- **阶段 → 状态维度**：研究过程定义的每一阶段可以声明 `state=<维度>`（第 6 段，可选），
  注入的上下文据此说明"本阶段的结论该写回哪些维度"，不再只停在对话里。
- **项目主题与研究定义自动收敛**：`project.md` 的 `topic` 跟随论文标题；
  `## Research Statement` 跟随当前主题；`## Research Questions` / `## Motivation`
  在仍是空占位时从 Research State 补上。**人手写过就永不覆盖。**
- **`research_project action=set`**：显式写 `statement` / `questions` / `scope` / `domain` /
  `motivation`（判断类字段如 Scope、Domain 由研究者或方法技能给出，插件不猜），
  每次写入带 reason 记入 `research/topic-history.json`，`force` 才覆盖已有内容。
- **`research_state_propose` 的 `propose` 默认直接写入**（传 `apply: false` 才留成待处置提案）；
  `research_state_read` 新增**产物 ↔ 状态对账**（有产物未反映进状态时会明说）。
- **上送内容 Envelope 新增 `topic` / `initial_topic`**，供服务器在 `work_name` 缺省时兜底取名；
  服务端的名字解析链补上 `paper.title` 并与本机取名规则同序
  （见 `dev-notes/v0.6.0-work-name-api.md`）。

### Bug 修复

1. **注入给模型的研究状态路径错误（写回落到孤儿文件）**：上下文里给的是
   `research/research-state.md`，而真实文件与读取端都是 `<研究根>/research-state.md`
   —— 按上下文写回会写到一个**永远读不到**的文件上。现两者一致，
   并加了自检断言（注入路径必须等于读取端路径）防再次漂移。
2. **研究定义的章节正则吞掉下一节（数据丢失）**：标题后的空白用 `\s*` 会连**标题后的空行**
   一起吃掉，正文因此从 `## 下一节` 开头，而前瞻 `\n##` 又匹配不上 → **整节被并进上一节，
   随后被覆写时整段删除**（实测把 `## Motivation` 吃掉了）。改为标题尾 `[ \t]*` +
   行首锚定的 `^##` 前瞻。
3. **`## Motivation` 插入位置错误**：插到了 `## Research Statement` 的标题与正文之间，
   导致 Statement 的正文被挤进 Motivation、下一次写 Statement 时一起丢失。
   改为插在**下一个 `## 章节` 之前**。
4. **研究陈述的"上一版"取自错误来源**：`Research Statement` 的现值读了 frontmatter 的
   `topic` 而不是正文那一段，于是永远判定"没变化"，正文一直停在开题时那句话。
5. **多行字段被压成一行**：`Scope` / `Motivation` 曾复用单行字段的空白折叠，
   三行范围被压成一句。现在只有 `statement` / `domain` 折叠空白。
6. **名字重复上送**：主题收敛到论文标题后，标题 / 摘要 / 研究问题会变成**同一句话**
   （卡片上重复三次）。现在与名字逐字相同的**展示字段**不再上送
   （`topic` / `initial_topic` 这类供服务端兜底的事实仍照送）。
7. **`## Scope` 无处可写**：渲染端把它写死成占位注释，创建时都填不进去；现在支持读写。

### 兼容性

- 宿主协议仍为 **26**（无破坏性变更）。
- `research/topic-history.json` 的旧记录没有 `field` 键，读作 `topic` —— 向后兼容。
- 缺失字段一律退回旧行为（老客户端 / 老服务端不受影响）。

## v0.6.0

**出题模式（导师出题）+ 网络里显示研究工作自己的名字**

- 新增第二个市场方向：**导师发布研究选题 → 学生出价 → 导师接受**（`SEEK_STUDENT`），
  与既有的「学生发布研究工作 → 导师出价」并存；资金方向不变（始终由学生出资、学生是论文主体）。
- 【我的】列表升级为双按钮【寻找指导】/【寻找学生】（按角色排序），
  新增【可加入】Tab（角色可见性：研究者 = 我的/可加入/指导中；导师 = 我的/可指导/可加入/指导中）。
- 三个列表与【指导中】显示的研究工作名称 = **这项工作自己的名字**
  （论文标题 > 已采纳主题 > 本机工作区名），随内容上送，不再显示本机目录名。
- 同步水位按**侧**区分（`owner` / `mentor`），方向 B 下"学生已交付"等信号不再互相遮盖。
