/**
 * ConvFusion 2.0 — 宿主 ↔ 浏览器 的协议版本
 *
 * ## 为什么需要这个常量
 *
 * 客户端 bundle 由浏览器**刷新即更新**（`dsh-client-hmr` 按 mtime/size 轮询），
 * 但宿主半边的模块是 **DSH 启动时加载进内存的** —— 改了 `lib/**` 之后不重启 DSH，
 * 页面拿到的仍是旧代码算出来的数据。
 *
 * 这个不对称已经造成过一次真实误判：解析器修好了（`lib/` 里 47 个 Skill 名字全对），
 * 但浏览器仍显示旧的坏名字，看起来像"修了没用"。刷新页面在这件事上**没有任何作用**。
 *
 * 所以两边各带一份版本号：客户端 bundle 在构建时**内联**当前值，宿主在响应里带上
 * 它内存中的值。两者不一致 = 宿主是旧的 → 设置页直接把这件事说出来。
 *
 * ## 什么时候要改这个数字
 *
 * **任何会改变 `/dsh-convfusion/state` 返回形状或语义的宿主改动**都必须 +1。
 * 纯界面改动不用改。
 *
 * ### 版本历史
 *
 * - `2`：初版（类别 → Skill → 章节 + retrieval）。
 * - `3`：state 增加 `dependencies`（本地依赖 tectonic 检测）、
 *   类别与技能增加 `code`/`label`（编号 `CxxPyy` 与中文名）、
 *   类别与技能改为按编号排序。**这两批改动都动了 state 形状** ——
 *   当时没升版本号的后果是：旧宿主返回的 state 里没有 `code`，界面看不到编号，
 *   而设置页也**不会**提示"宿主需重启"，看起来就像"改了没用"。
 * - `4`：类别名统一为 4 字（`文献` → `文献调研`、`写作` → `论文写作` 等），研究阶段名同步。
 *   这是**取值语义**变化而非形状变化 —— 界面不会出错，但会安静地显示旧名字；
 *   升号才能让"宿主需重启"提示生效（v3 的教训：别指望用户自己发现）。
 * - `5`：浏览器国际化（上游 PR）。依赖用途改为稳定 `purposeCode`，进展报告改为稳定 code、
 *   数值与 `{ id, label }` 阶段对象；固定展示文案由客户端通过 DSH locale 翻译。
 * - `6`：`/dsh-convfusion/state` 增加 **`account`**（【ConvFusion.com】的登录状态：
 *   服务器地址、是否有凭据、已验证账号），并新增 `account/*` 端点（登录 / 注册 /
 *   验证 / 登出）。旧宿主返回的 state 里没有 `account`，新界面只能当成"未登录"。
 * - `7`：`AccountState` 增加 **`tokens`**（Token 余额），并新增 `account/tokens` 端点。
 *   旧宿主不返回 `tokens` 时新界面只会"不显示余额"——不升号会让人以为功能没做。
 * - `8`：新增 **`work/mine`** 端点（【研究工作 · 我的】：本机研究项目，来自 DSH 工作区
 *   注册表），研究工作卡片改为「我的 / 可指导」两个视图。
 * - `9`：`work/mine` 的响应增加 **`registry`**（注册表是否可读 + 原因），界面据此区分
 *   「读不到」与「真的没有」；并与 `5`（浏览器国际化）**合并** —— 新增界面文案全部走
 *   locale 字典，`settings.tsx` 不再有硬编码中文。
 *
 * - `10`：【研究工作 · 我的】新增「寻找指导」—— 新增 **`work/publish`** 端点
 *   （建项目 → 传 Research State → 发布），且 `work/mine` 的条目多出 **`published`**
 *   （本地映射：这个工作区已发布到哪个服务器项目）。又是形状变化：旧宿主下按钮会
 *   报"未知端点"，故必须升号让设置页提示重启。
 *
 * - `11`：`published` 的**判据变了**（本地记录 → 服务器）：刷新【我的】会按记录回查
 *   `GET /projects/{id}`（服务器删项目/取消发布后标记立刻消失，并回写/丢弃本地映射），
 *   刷新【可指导】顺带用服务器列表对齐命中的记录；`work/publish` 遇到死掉的
 *   `project_id` 会改为新建项目。客户端代码没变，但**旧宿主会继续显示过期的标记**——
 *   正是"同号却行为不同"的坑，所以照旧升号，让设置页提示重启。
 *
 * - `12`：【可指导】的条目多出 **`briefPaid`**（服务器 `brief_paid`：打开这项简报会不会
 *   再扣 Token，判据是支付记录 / owner）与 **`briefOpened`**（宿主本地记忆，仅在旧服务器
 *   没有 `brief_paid` 时兜底）；简报条目多出 **`chargedTokens`**（本次实际扣费）。
 *   界面据此**只在真会扣费时才弹确认框**。旧宿主不返回这些字段 → 界面每次都提醒
 *   （保守但安全），而"已买过还反复提醒"正是本次要修的问题，故照旧升号。
 *
 * - `13`：新增**指导关系**端点 `mentor/fee-suggestion` / `mentor/propose` / `mentor/list` /
 *   `mentor/accept` / `mentor/reject`，并新增第三个视图「指导中」（我发起的 + 我收到的
 *   指导提案）。旧宿主没有这些端点 → `unknown-endpoint`，界面会提示"宿主侧需要重启"。
 *
 * - `14`：指导闭环的文件交换 —— `mentor/downloadState` / `mentor/download`
 *   （【下载】= 把服务器的工作区 **ZIP 存进用户选的 DSH 工作区**：目标只认注册表 id、
 *   **不解压、同名加序号不覆盖**，因此任何工作区都能选）、`mentor/scanReview` /
 *   `mentor/upload`（按原路径回传 `review/`）、`mentor/pickDirectory`（选目录）。
 *   旧宿主没有这些端点 → `unknown-endpoint`，界面提示重启。
 *
 * - `15`：【服务器设置】的账号状态多出 **`serverPresets`**（`{ development, production }`
 *   两个环境的地址，由宿主按配置文件 / 内置兜底解析）。界面用它做**两个快捷图标按钮**
 *   （本机调试 ↔ 线上），因此客户端不写死任何域名。旧宿主不返回该字段 → 按钮不显示
 *   （界面按"拿不到就不显示"处理，不假装有），升号以便旧宿主提示重启。
 *
 * - `16`：`/dsh-convfusion/state` 增加 **`version`**（插件版本，package.json 单一来源），
 *   并新增 **`version/check`** 端点（GitHub Releases 更新检查）。旧宿主不返回 `version`
 *   时界面只显示"没有版本号"、没有更新提醒 —— 升号让旧宿主提示重启。
 *
 * - `17`：`mentor/list` 的指导进展（`reviewFiles`）**改由服务器直接给出**
 *   （`review_files`，见 ConvFusion-server `docs/mentorship-list-performance.md` §3）：
 *   宿主不再对每个 ACCEPTED 提案逐个项目读一次 `/files` 自己数 `review/` 前缀，
 *   刷新【指导中】由 1 + N 次请求降为 **1** 次（旧路径里那一次是 482 KB / 好几秒）。
 *   响应形状**没变**（`reviewFiles` 本来就有），变的是它与服务器的关系 —— 即
 *   `11` 那类"同号却行为不同"：旧宿主不会坏，只是仍然慢，所以照旧升号，
 *   让设置页把"宿主需重启"说出来（不升号的话性能修复看起来像没生效）。
 *
 * ⚠️ `5` 与 `6`–`18` 来自两条**并行开发线**（上游 PR 的国际化 + 本地接入 ConvFusion.com），
 * 合并后统一编号。宿主与客户端必须同号，否则设置页会提示重启。
 *
 * - `18`：【下载】改成**流式落盘 + 实时进度**：新增端点 **`mentor/downloadProgress`**
 *   （`{ projectId }` → `{ received, running }`，本地读、不触网），`mentor/download`
 *   边收边写 `.part`、校验 ZIP 完整后才改名，正文改用"卡死超时"（不再只盖住响应头）。
 *   旧宿主没有新端点 → 界面拿不到进度（退回一句「读取中…」），故照旧升号提示重启。
 *
 * - `19`：【上传】从"手选磁盘目录 + 只扫 `review/`"换成**"选 DSH 工作区 + 研究根全量清单"**：
 *   新增 `mentor/uploadState`（本机可选工作区）、`mentor/uploadPlan`（所选工作区的文件清单，
 *   `mentor` 口径分类）、`mentor/uploadProgress`（{ doneFiles, totalFiles, sentBytes, totalBytes }），
 *   并**删除** `mentor/pickDirectory` 与 `mentor/scanReview`；`mentor/upload` 的入参由
 *   `{ dir, paths }` 改为 `{ workspaceId, paths }`（工作区按**注册表 id** 在宿主侧解析）。
 *   旧宿主没有新端点 → `unknown-endpoint`，界面提示"宿主侧需要重启"。
 *
 * - `20`：**分侧读**（服务器 2026-09 起项目文件空间有两侧：学生 `owner` / 导师 `mentor`，
 *   同一路径并存互不覆盖，读接口用 `?source=owner|mentor`，省略 = `owner`）。
 *   `mentor/downloadState` / `mentor/download` / `mentor/upload` 因此多一个 `source`：
 *   界面按**自己的角色**定侧 —— **比对自己那一侧，下载对方那一侧**
 *   （导师：上传比 `mentor` 侧、下载读 `owner` 侧；学生：上传比 `owner` 侧、
 *   下载读 `mentor` 侧）。宿主省略该字段时按 `owner` 处理（= 旧行为，不会出错，
 *   但学生读不到导师那份），故照旧升号让"宿主需重启"说出来。
 *
 * - `21`：**【指导中】提示"学生更新了工作区"**（服务器加了 `workspace_updated_at` /
 *   `workspace_files` 两个列表字段 + 归档水位头 `X-Source-Updated-At`）。
 *   `mentor/list` 的 ACCEPTED 行因此多出 **`sync`**（宿主与**本地存的水位**比对的结果：
 *   `{ changed, reason }` 或 `null` = 无从判断），`mentor/download` 成功后把这一版的
 *   水位存下来（只存 `owner` 侧）。旧宿主不返回 `sync` → 界面永远不提示（不是"没更新"），
 *   要的是**提示能力**本身，故照旧升号让设置页把"宿主需重启"说出来。
 *
 * - `22`：`sync` 从"`{ changed, reason } | null`"改成**判别联合**，多出
 *   `{ neverDownloaded: true }` —— **"从没下载过"必须与"无从判断"分开**
 *   （2026-10 用户指出：导师手里连副本都没有时，界面却一声不吭，而学生明明更新过了；
 *   `null` 仍表示旧服务器不给字段 / 服务器说不可知 / 判据不全，界面不编造）。
 *   形状变了 → 照旧升号提示重启。
 *
 * - `23`：**【下载】先校验目标工作区**（2026-10）。服务器给出**研究工作标识**
 *   `workspace_id`（`ws_<32 hex>`，全局唯一、跨项目生命周期不变，见
 *   `dev-notes/v3-Workspace-Identity-API.md`），插件据此回答"这个工作区里已有的
 *   `workspace/` 和我要下载的是不是同一项研究"：
 *   · `mentor/downloadState` 增加可选入参 **`sessionId`**，`items[]` 每项多出
 *     `exists` / `researchRoot` / `layout` / `status` / `localWorkspaceId`，
 *     响应顶层多出 `remoteWorkspaceId` / `currentWorkspaceId`；
 *   · `mentor/download` 在写盘前**重算一次**判定，冲突直接拒绝（`workspace-conflict`）。
 *   旧宿主不返回这些字段 → 界面**完全不显示状态**、退回今天的行为（不假装校验过），
 *   故照旧升号让"宿主需重启"说出来。
 *
 * - `24`：**出题模式**（v0.6.0）—— 一个工作区可以**在两个方向**上发布：
 *   `SEEK_MENTOR`（学生发布研究求指导，= 今天的行为）与 `SEEK_STUDENT`（导师发布选题
 *   招学生）。形状变化有三处，每处旧宿主都会**安静地做错事**，所以必须升号：
 *   · `work/mine` 的每个条目多出 `direction`（列表项）与 **`published` 由单对象改为
 *     数组**（一个方向一条记录）—— 旧宿主只给一个对象，新界面读不出"另一个方向发过没有"，
 *     会把已发布的选题显示成「寻找学生」并**再建一个项目**；
 *   · `work/uploadPlan` / `work/publish` 增加入参 **`direction`** —— 旧宿主会忽略它，
 *     于是【寻找学生】实际发布成"求指导"，网络里出现一个**方向错误**的卡片；
 *   · `work/list` 增加可选入参 **`direction`**（【可加入】用它）—— 旧宿主忽略它，
 *     列表退回【可指导】那一份（能看，但方向没分开）。
 *   故照旧升号，让设置页把"宿主需重启"说出来。
 *
 * - `25`：**下载提示改为按侧**（服务器 `counterpart_updated_at` 落地后）。
 *   服务器两侧各有自己的水位与计数 —— `workspace_updated_at` / `workspace_files` 跟
 *   **owner 侧**，`counterpart_updated_at` / `review_files` 跟**另一方那一侧**；
 *   而**方向决定我下载哪一侧**（方向 A 的导师下 owner 侧；方向 B 的导师下另一方那一侧，
 *   学生反过来）。所以：
 *   · `mentor/list` 的 `sync`（单个，含义是 owner 侧）改为 **`syncBySide`**
 *     （`{ owner, mentor }` 各一份，宿主两侧都算好，界面取自己 `otherSide` 那一份）——
 *     旧宿主只给一个 `sync`，界面为兼容仍认它（退回 owner 侧 = v24 的行为）；
 *   · 宿主的水位存储**按侧**记（`(服务器, 项目, 侧)`；旧键读作 owner 侧），
 *     否则方向 A / 方向 B 的水位会互相顶掉 —— 该提示时不提示、或误提示；
 *   · 提案响应多出 `counterpart_updated_at`（服务器字段，宿主据此算 `mentor` 侧）。
 *   不升号的后果是**安静地少提示 / 误提示**（界面不报错），所以照旧升号。
 *
 * - `26`：**研究工作的名字**（v0.6.0）。网络里那三个列表（【可指导】/【可加入】/
 *   【指导中】）该显示的是**这项工作自己的名字**（有论文用论文标题，否则用工作确定的
 *   主题），而不是"发布方本机工作区的名字"：
 *   · `work/publish` 用**工作名**当项目标题（并在名字变化时 `PUT /projects/{id}` 改名），
 *     回执多出 `published.title`（这次网络里用的名字）；
 *   · `work/uploadPlan` 的 `title` **语义变了**（本机工作区名 → 要发布的名字），
 *     并新增 `workspaceTitle`（本机工作区名）与 `workNameSource`；
 *   · 提案 / 发现列表多出 `workName`（服务器的 `work_name`，列表显示优先用它，
 *     缺字段 = 旧服务器 → 退回 `title` / `project_title`）。
 *   旧宿主下对话框标题会继续显示"本机工作区名"、列表继续显示旧名字（能看，但名字不对），
 *   故照旧升号让设置页把"宿主需重启"说出来。
 *
 * - `27`：新增 **`account/usage`** 端点（用量与配额：存储空间已用 / 总额、项目阶梯、
 *   下次发布花费），供【账号】卡片新加的**仪表板**画"存储空间"那一块。
 *   旧宿主没有这个端点 → 界面那一块显示"未知"（**不是** 0），并提示宿主需重启，
 *   故照旧升号。
 *
 * - `28`：**论文等级定价 + Token 分池**（服务器 v0.6.3）。三处形状/语义变化，每一处
 *   旧宿主都会**安静地做错事**，所以必须升号：
 *   · `state.tokens` 增加 **`grant` / `funded`**（两池；`null` = 旧服务器不分开说）——
 *     旧宿主只有"可用"一个数，新界面读不到两池就**不会**在【接受】前按资金池拦截，
 *     用户会直接撞 402；反过来若把缺失读成 0，又会把本来能接受的账号挡住；
 *   · `mentor/fee-suggestion` 增加入参 **`jcrLevel` / `ccfLevel`**（论文等级 → 价格）——
 *     旧宿主忽略它，界面选了"JCR 2区"却拿回兜底价 100，用户按错价发起提案；
 *   · `mentor/propose` 的 `successCondition` 增加 **`jcrLevel` / `ccfLevel`**，且论文类
 *     条件（`PAPER_ACCEPTED` / `PAPER_PUBLISHED`）**必须**带等级（服务器缺等级直接 400
 *     `INVALID_PROPOSAL`）—— 旧宿主会把这个字段丢掉，于是论文类提案一律发不出去。
 *   故照旧升号，让设置页把"宿主需重启"说出来。
 */
export const HOST_PROTOCOL = 28

/** 状态响应里的协议字段名（两边共用，避免拼错）。 */
export const HOST_PROTOCOL_FIELD = 'protocol'
