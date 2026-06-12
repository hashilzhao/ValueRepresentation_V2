# HANDOFF_STUDY1_V2.md — Study 1 V2 实验系统交接文档

**文档创建日期**: 2026-06-11
**最后更新**: 2026-06-11（新增 formal choice 重复 pair 追踪 + validation 重试规则强化）
**项目根目录**: `/Users/zhongxin/Desktop/study1_V2`

> 本文档基于对代码的全面扫描编写，所有描述以当前代码实际实现为准。标记「当前实现」表示代码真实情况，可能与旧文档描述不一致。本文档为权威交接文件，取代旧的 `HANDOFF_CURRENT.md`、`HANDOFF.md`、`CURRENT_HANDOFF.md`。

---

## 1. 项目启动方式

### 1.1 项目路径

```bash
cd /Users/zhongxin/Desktop/study1_V2
```

### 1.2 安装依赖

```bash
npm install
```

> 依赖已安装在 `node_modules/` 中，除非 `package.json` 有变动，否则无需重新安装。

### 1.3 启动服务

```bash
# 开发模式（Turbopack，推荐日常使用）
npm run dev

# 生产构建
npm run build
npm start
```

### 1.4 本地访问地址

| 角色 | URL | 说明 |
|---|---|---|
| 被试入口 | `http://localhost:3000/start` | 需先输入实验进入密码 |
| 实验页面 | `http://localhost:3000/experiment?code=<被试编号>&session=<sessionId>` | 被试注册后自动跳转 |
| Admin 登录 | `http://localhost:3000/login` | 管理员登录页 |
| Admin 后台 | `http://localhost:3000/admin` | 登录后访问 |
| 首页 | `http://localhost:3000/` | 公开着陆页 |

### 1.5 Admin 登录凭据

| 字段 | 值 |
|---|---|
| Email | `admin@study1.local` |
| Password | `zxzx123456` |

配置在 `.env.local` 中的 `ADMIN_EMAIL` 和 `ADMIN_PASSWORD`。

### 1.6 被试进入密码

当前密码: `zxzx123456`（配置在 `.env.local` 的 `PARTICIPANT_ENTRY_PASSWORD`）

### 1.7 关闭终端后服务

**会中断。** 当前没有使用 `nohup`、`screen`、`tmux` 或进程管理器（如 PM2）。关闭终端窗口后 `npm run dev` 进程会终止。如需长期运行，建议使用 `screen` 或 `tmux`：

```bash
# 使用 screen 保持运行
screen -S study1
cd /Users/zhongxin/Desktop/study1_V2
npm run dev
# Ctrl+A, D 分离
```

### 1.8 DEV_TEST_MODE

在 `.env.local` 中取消注释 `NEXT_PUBLIC_DEV_TEST_MODE=true` 可开启快速测试模式（减少试次数）。修改后需要**重启 dev server**（Next.js 不热重载环境变量）。当前为注释状态 = 完整实验模式。

---

## 2. 项目结构

### 2.1 技术栈

| 层级 | 技术 |
|---|---|
| 框架 | Next.js 16.2.6 (App Router, Turbopack) |
| 语言 | TypeScript 5 |
| 样式 | Tailwind CSS v4 |
| 数据库 | better-sqlite3 → `study1.db`（WAL 模式，项目根目录本地文件） |
| 认证 | JWT (jose) + bcryptjs，基于 Cookie（admin + 被试入口门禁） |
| 图片 | 69 个 PNG 文件，同时存在于 `storage/stimuli/` 和 `public/stimuli/`（两处是副本，非符号链接） |

### 2.2 顶层文件/目录一览

```
study1_V2/
├── .env.local              # 环境变量（密钥、密码、DEV_TEST_MODE）
├── package.json            # 依赖和脚本
├── study1.db               # SQLite 数据库文件（主数据存储）
├── study1.db-shm           # SQLite WAL 共享内存文件（不要手动删除）
├── study1.db-wal           # SQLite WAL 日志文件（不要手动删除）
├── src/                    # 全部源代码
├── public/                 # Next.js 静态资源（图片通过 /stimuli/ 访问）
│   └── stimuli/            # 刺激图片副本（69 个 PNG）
├── storage/                # 原始刺激图片存储
│   ├── stimuli/            # 69 个 PNG 刺激图片
│   └── stimuli_legacy_backup_20260527_235016/  # 旧版 80 张图片备份
├── scripts/                # 检查/种子脚本
├── backups/                # 数据库备份
├── supabase/               # 早期 Supabase 迁移文件（当前未使用）
└── node_modules/           # 依赖
```

### 2.3 src/ 目录结构

```
src/
├── app/                          # Next.js App Router 页面 + API 路由
│   ├── page.tsx                  # 着陆页（含英文残留）
│   ├── layout.tsx                # 根布局
│   ├── globals.css               # Tailwind 入口
│   ├── start/page.tsx            # 被试入口（密码门禁 + 注册表单）
│   ├── experiment/page.tsx       # ★ 主阶段路由（~500 行，核心文件）
│   ├── login/page.tsx            # Admin 登录页（英文）
│   ├── complete/page.tsx         # 实验完成页
│   ├── admin/                    # Admin 后台页面（8 个子页面）
│   │   ├── page.tsx              # Dashboard
│   │   ├── participants/page.tsx # 被试列表
│   │   ├── sessions/page.tsx     # 会话列表
│   │   ├── stimuli/page.tsx      # 刺激管理 + 上传
│   │   ├── study1/page.tsx       # Study1 会话列表
│   │   ├── study1/[sessionId]/page.tsx  # 单个会话详情
│   │   ├── audit/page.tsx        # 完整性审计
│   │   └── results/page.tsx      # 行为指标 + 导出
│   └── api/                      # ★ API 路由（~21 个）
│       ├── auth/login/route.ts
│       ├── auth/logout/route.ts
│       ├── participants/register/route.ts
│       ├── participants/verify-entry-password/route.ts
│       ├── sessions/advance/route.ts           # 阶段推进
│       ├── stage-game/init/route.ts            # 资源任务初始化
│       ├── stage-game/submit-response/route.ts # 资源任务提交
│       ├── stage-game/block-check/route.ts     # Block检查（V2连续版可能闲置）
│       ├── study1/init-assignment/route.ts     # 刺激抽样+建集
│       ├── study1/calibration/init/route.ts    # 校准阶段初始化
│       ├── study1/calibration/submit/route.ts  # 校准响应提交
│       ├── study1/validation/init/route.ts     # 验证阶段初始化
│       ├── study1/validation/submit/route.ts   # 验证响应提交
│       ├── study1/value-assignment/init/route.ts
│       ├── study1/comprehension-check/route.ts
│       ├── study1/formal-trials/init/route.ts
│       ├── study1/formal-choice/submit/route.ts
│       ├── study1/post-experiment-check/route.ts
│       ├── manipulation-check/submit/route.ts
│       └── admin/                              # Admin API
│           ├── delete-participant/route.ts
│           ├── delete-session/route.ts
│           ├── export/route.ts                 # CSV 导出
│           └── stimuli/upload/route.ts
│           └── stimuli/update/route.ts
├── components/                   # ★ React 组件（14 个）
│   ├── StageGameTask.tsx          # 资源账户任务（~670 行，最大组件）
│   ├── PreferenceTask.tsx         # 图形偏好校准任务（3 阶段合一）
│   ├── ValidationTask.tsx         # 喜爱验证任务
│   ├── FormalChoiceTask.tsx       # 二维价值决策任务
│   ├── ValueInstructionTask.tsx   # 价值点数说明 + 理解检查
│   ├── BaselinePractice.tsx       # 练习试次
│   ├── PostExperimentCheck.tsx    # 实验后检查
│   ├── TaskSurvey.tsx             # 操纵检查问卷
│   ├── ExperimentControls.tsx     # 阶段推进按钮（用于纯文本阶段）
│   ├── EntryPasswordGate.tsx      # 被试密码门禁
│   ├── ParticipantForm.tsx        # 被试注册表单
│   ├── PracticeTrials.tsx         # 练习试次组件
│   ├── AdminNav.tsx               # Admin 导航栏
│   ├── DeleteButton.tsx           # 删除按钮
│   └── StatCard.tsx               # 统计卡片
├── lib/                           # ★ 核心业务逻辑库
│   ├── stages.ts                  # ★ 阶段定义、标签、组别、推进逻辑
│   ├── auth/index.ts              # JWT 签发/验证、密码哈希、Cookie
│   ├── db/
│   │   ├── index.ts               # ★ SQLite 初始化、Schema、迁移、自动播种
│   │   └── event-log.ts           # 事件日志 helper
│   ├── stimulus-seed.ts           # 扫描 storage/stimuli/ 播种 stimulus_pool
│   ├── stimulus/dots.ts           # 点数位置生成（防重叠算法）
│   ├── types/database.ts          # TypeScript 类型定义
│   ├── manipulation-check/
│   │   ├── items.ts               # 14 道中文 Likert 题目
│   │   └── scoring.ts             # 计算/保存 construct means
│   ├── stage-game/
│   │   ├── config.ts              # ★ 资源任务配置（试次、时间、组别参数）
│   │   ├── types.ts               # 资源任务类型定义
│   │   ├── trial-generator.ts     # ★ 生成 90 试次 + 预设反馈
│   │   ├── response.ts            # 保存响应 + 更新余额
│   │   └── progress.ts            # 计算进度
│   └── study1/
│       ├── sampling.ts            # ★ 刺激抽样 25→5 集（配额轮换）
│       ├── calibration-generator.ts  # ★ 校准阶段 4A/4B/4C 试次生成
│       ├── calibration-scoring.ts # 校准评分 + 建表
│       ├── calibration-types.ts   # 校准类型定义
│       ├── value-assignment.ts    # 价值分配（Latin-square 轮换）
│       ├── formal-trial-generator.ts # ★ 正式选择 162 试次生成
│       └── formal-response.ts     # 正式选择响应编码
└── proxy.ts                       # Admin 路由 JWT 保护中间件
```

### 2.4 数据库文件

- **`study1.db`**：主数据库文件，位于项目根目录
- **`study1.db-shm`** 和 **`study1.db-wal`**：SQLite WAL 模式的共享内存和日志文件，**不要手动删除**（服务器运行时存在）
- **备份**：`backups/study1_before_stimulus_versioning_20260519_153358.db`

### 2.5 刺激图片/材料文件

- **`storage/stimuli/`**：69 个 PNG 文件，命名格式 `{Category}{Number}_V1.png`（如 `A1_V1.png`）
- **`public/stimuli/`**：`storage/stimuli/` 的**文件副本**（非符号链接），由 Next.js 直接 serve
- **旧版备份**：`storage/stimuli_legacy_backup_20260527_235016/` 和 `public/stimuli_legacy_backup_20260527_235016/`（80 张旧图）
- **类别分布**：A=16, B=19, C=18, D=16
- **图片替换时注意**：需要**同时更新** `storage/stimuli/` 和 `public/stimuli/` 两个目录

---

## 3. 当前实验流程总览（按被试实际经历顺序）

### 阶段定义（`src/lib/stages.ts` — 权威来源）

| 序号 | Stage Key | 被试看到的中文标题 | UI 组件 | 说明 |
|---|---|---|---|---|
| 1 | `baseline_questionnaire` | 任务操作说明 | `BaselinePractice` | 练习试次（点数比较 + 图形匹配 + 点数估计） |
| 2 | `relative_resource_feedback` | 任务信息 | `ExperimentControls` + 文本 | 显示组别反馈文本（稀缺组 10 点 / 充裕组 100 点） |
| 3 | `scarcity_manipulation` | 资源账户任务 | `StageGameTask` | 连续 90 试次知觉任务，预设反馈 |
| 4 | `manipulation_check` | 任务体验问卷 | `TaskSurvey` | 14 道中文 Likert 题（1-7） |
| 5 | `study1_liking_ranking` | 视觉偏好任务 | `PreferenceTask` | 配对比较校准 4A→4B→4C（约 150 试次） |
| 6 | `study1_liking_validation` | 视觉偏好确认 | `ValidationTask` | 喜爱验证（30 diff + 15 same = 45 试次） |
| 7 | `study1_value_assignment` | 价值点数说明 | `ValueInstructionTask` | 价值分配说明 + 理解检查 MCQ |
| 8 | `study1_formal_choice` | 图像选择任务 | `FormalChoiceTask` | 二维价值决策（162 试次） |
| 9 | `post_experiment_check` | 实验后问题 | `PostExperimentCheck` | 怀疑检查 + 自由文本 |
| 10 | `complete` | 实验完成 | 完成页 | — |

> ⚠️ **注意**：`manipulation_check`（操纵检查）位于阶段 4，**紧接在资源账户任务之后**，而不是在所有任务之后。这与旧文档 `HANDOFF_CURRENT.md` 的描述不同。这是当前代码的真实顺序。

### 详细流程描述

#### 3.1 被试入口 (`/start`)

1. 被试访问 `/start`
2. `EntryPasswordGate` 组件提示输入实验进入密码
3. `POST /api/participants/verify-entry-password` 验证密码
4. 成功后服务端设置 `participant_access` JWT Cookie
5. 被试填写注册表单（被试编号、年龄、性别、专业）
6. `POST /api/participants/register` 创建 participant + session，**平衡分配组别**（稀缺组/充裕组中活跃会话数较少的组）
7. 返回 `session_id`，跳转到 `/experiment?code=X&session=Y`

#### 3.2 阶段 1 — 练习（baseline_questionnaire）

- 组件：`BaselinePractice`
- 内容：练习试次，帮助被试熟悉按键操作（F/J 键）
- 被试点击"开始"按钮进入练习，完成后点击"继续"按钮推进

#### 3.3 阶段 2 — 任务信息（relative_resource_feedback）

- 显示组别特定的反馈文本
- **稀缺组**："系统已为你生成本轮任务的初始资源账户：10 点…账户余额需要达到 10 点"
- **充裕组**："系统已为你生成本轮任务的初始资源账户：100 点…账户余额需要达到 10 点"
- 被试阅读后点击"继续"

#### 3.4 阶段 3 — 资源账户任务（scarcity_manipulation）

- 组件：`StageGameTask`（~670 行，最大组件）
- **连续模式**（V2，无 Block 结构）：90 个试次
  - 72 个 dot_comparison（点数比较："哪一侧包含更多点？"）
  - 18 个 shape_matching（图形匹配："这两个图形是否匹配？"）
  - shape_matching 均匀分布，间隔 ≥3 个试次
- 每个试次：注视点 500ms → 刺激 3000ms → 反馈 800ms → 空白 300ms
- **点数比较反馈是预设/操纵的**（`feedback_mode = "manipulated"`），不基于真实正确率
- **图形匹配反馈是真实的**（`feedback_mode = "true"`），基于实际正确率：正确 +2，错误 -2
- 超时/未响应：一律扣 2 点
- RT 测量：`performance.now()` + `requestAnimationFrame()`
- 屏幕显示当前试次进度和余额
- 完成后自动调用 `/api/sessions/advance`

#### 3.5 阶段 4 — 操纵检查（manipulation_check）

- 组件：`TaskSurvey`
- 14 道中文 Likert 题，4 个构念：
  1. resource_insufficiency（题 1-5）
  2. resource_confidence（题 6-7）
  3. stress_negative_affect（题 8-10）
  4. task_engagement（题 11-14）
- 回答尺度：1-7
- 提交后自动计算 construct means 并推进阶段

#### 3.6 阶段 5 — 视觉偏好任务（study1_liking_ranking）

- 组件：`PreferenceTask`
- **V2 校准流程包含 3 个子阶段**（不是旧文档说的 2 个阶段）：
  - **Phase 4A — within_full_pair**：50 试次（5 个 set × 每组 5 张图全配对 = 10 对）
  - **Phase 4B — within_adjacent_retest**：20 试次（5 个 set × 4 对相邻 rank 1v2, 2v3, 3v4, 4v5）
  - **Phase 4C — cross_set_boundary**：80 试次（跨 set 相邻 rank 比较）
  - **总计约 150 试次**
- 每个试次左右各显示一张抽象图形，按 F（选左）或 J（选右）
- 4A 完成后自动生成 4B；4B 完成后先建 `within_set_stable` 表，再生成 4C
- 4C 完成后建 `cross_set_orthogonalized` 表，同步到 `liking_map`，自动推进
- RT timeout：180 秒（极长，适合被试思考）
- 可点击图片选择（鼠标）或按键（键盘）

#### 3.7 阶段 6 — 视觉偏好确认（study1_liking_validation）

- 组件：`ValidationTask`
- 45 试次：30 个 different_rank + 15 个 same_rank
- 如果 `different_rank_consistency_rate < 85%`：
  - 触发重来（清空校准数据，增加 attempt index，回到 study1_liking_ranking）
- 如果通过：自动推进到价值分配阶段

#### 3.8 阶段 7 — 价值点数说明（study1_value_assignment）

- 组件：`ValueInstructionTask`
- **质量门禁**（在显示前检查）：
  - liking_map 必须有 25 条记录
  - 验证必须通过（validation_passed = 1, needs_rerank = 0）
  - 校准超时率 ≤ 20%
  - 验证超时率 ≤ 20%
  - 如不满足 → 显示"本部分还需要实验员确认"
- 价值分配：Latin-square 轮换，5 个 set 分别分配 5/10/15/20/25
- 被试看到每个 set 的价值分配表
- 理解检查 MCQ（正确答案为 B），最多 2 次尝试
- 如 2 次都错 → 标记 `comprehension_flag`

#### 3.9 阶段 8 — 图像选择任务（study1_formal_choice）

- 组件：`FormalChoiceTask`
- **162 试次**（不是旧文档说的 144）：
  - liking_only: 32（价值相同、喜爱不同）
  - value_only: 32（喜爱相同、价值不同）
  - congruent: 32（喜爱和价值方向一致）
  - conflict: 66（48 基础 + 18 额外，喜爱和价值方向冲突）
- 每个试次显示两张图形 + 各自价值点数
- F/J 选择，RT timeout：180 秒
- 记录：chose_high_liking, chose_high_value, chose_congruent_advantage, chose_high_liking_low_value, chose_low_liking_high_value
- 完成后自动推进

#### 3.10 阶段 9 — 实验后检查（post_experiment_check）

- 组件：`PostExperimentCheck`
- 内容：
  - 表现反馈信念（1-7）
  - 预设反馈怀疑度（1-7）
  - 资源任务影响信念（1-7）
  - 感知研究目的（自由文本）
  - 主要选择策略（自由文本）
  - 异常/不真实感知（自由文本）
- 自动关键词检测怀疑（中文：预设/程序控制/假的/虚假/伪造/操纵/故意/欺骗 等）
- 提交后自动标记 session 为 `completed`

#### 3.11 阶段 10 — 完成（complete）

- 显示完成页

---

## 4. 当前关键实验参数

### 4.1 组别配置（`src/lib/stage-game/config.ts`）

| 参数 | 稀缺组 | 充裕组 |
|---|---|---|
| 初始余额 `initial_balance` | 10 | 100 |
| 通过阈值 `pass_threshold` | 10 | 10 |
| 余额下限 `balance_min` | 4 | 80 |
| 余额上限 `balance_max` | 12 | 135 |

### 4.2 资源账户任务（Stage Game）

| 参数 | 全模式 | DEV_TEST_MODE |
|---|---|---|
| 点数比较试次数 | 72 | 8 |
| 图形匹配试次数 | 18 | 4 |
| 总试次数 | 90 | ~12 |
| 点数范围（每侧） | 30–50 | 同 |
| 点数差异范围 | 1–3 | 同 |
| 刺激呈现时间 | 3000ms | 同 |
| 注视点时间 | 500ms | 同 |
| 反馈显示时间 | 800ms | 同 |
| ITI 空白 | 300ms | 同 |
| 按键 | F（左）/ J（右） | 同 |
| 图形匹配正确奖励 | +2 点 | 同 |
| 图形匹配错误惩罚 | -2 点 | 同 |
| 超时惩罚 | -2 点 | 同 |
| 余额可为负 | 是 | 同 |

### 4.3 反馈生成逻辑（当前实现）

**点数比较（dot_comparison）**：预设/操纵反馈（`feedback_mode = "manipulated"`）

- **稀缺组反馈规则**（`computeScarcityFeedback`）：
  - balance > 10：85% 概率 loss 1-3 点
  - balance 7-10：60% 概率 loss 1-2 点
  - balance 4-6：50/50 随机 gain/loss 1-2 点
  - balance < 4：80% 概率 gain 1-3 点（防崩溃）

- **充裕组反馈规则**（`computeAbundanceFeedback`）：
  - 早期（前 30 试次）：从 100 向 110+ 爬升，gain bias
  - 中期（30-70）：稳定在 105-120 区间
  - 晚期（最后 20 试次）：维持 110-128
  - 最终阶段（最后 5 试次）：确保 ≥110
  - 各区间有详细的概率分布控制

**图形匹配（shape_matching）**：真实反馈（`feedback_mode = "true"`），基于实际正确率

### 4.4 校准/喜爱等级参数（V2 当前实现）

| 参数 | 值 |
|---|---|
| Phase 4A 试次（within_full_pair） | 50（5 集 × 10 全配对） |
| Phase 4B 试次（within_adjacent_retest） | 20（5 集 × 4 相邻对） |
| Phase 4C 试次（cross_set_boundary） | 80 |
| 校准总试次 | ~150 |
| 喜爱 Rank 范围 | 1-5（1 = 最不喜欢，5 = 最喜欢） |
| Rank 推断方式 | Phase 4A win-count → 4B 相邻重测调整 → 4C 跨集边界证据 |
| V2 建模表 | `within_set_stable`（第一表）→ `cross_set_orthogonalized`（第二表） |
| 跨集移动规则 | 50% 证据阈值，up/down 各方向 0.50→low, 0.75→high |
| 重测 calibration_attempt_index 递增 | 是 |

### 4.5 验证阶段参数

| 参数 | 全模式 | DEV_TEST_MODE |
|---|---|---|
| different_rank 试次 | 30 | 6 |
| same_rank 试次 | 15 | 4 |
| 总试次 | 45 | ~10 |
| 信度阈值 `VALIDATION_CONSISTENCY_THRESHOLD` | 0.85 | 同 |
| 不通过行为 | 清空校准数据，increment attempt，回到 study1_liking_ranking | 同 |

### 4.6 价值分配参数

| 参数 | 值 |
|---|---|
| 外部分值 | 5, 10, 15, 20, 25 |
| 分配方式 | Latin-square 轮换（session N % 5） |
| 理解检查 MCQ 正确答案 | B |
| 理解检查最大尝试次数 | 2（2 次都错 → 标记 flagged） |

### 4.7 正式选择参数

| 参数 | 全模式 | DEV_TEST_MODE |
|---|---|---|
| liking_only | 32 | 4 |
| value_only | 32 | 4 |
| congruent | 32 | 4 |
| conflict | 66（48 基础 + 18 额外） | 8 |
| 总试次 | **162** | ~20 |
| 每个刺激最多出现次数 | 18 | 同 |
| 刺激呈现时间 | 180000ms（3 分钟） | 同 |

### 4.8 刺激抽样参数

| 参数 | 值 |
|---|---|
| 每 session 抽样数 | 25 张（从 ~69 张池中） |
| 配额轮换模式 | 4 种（A=7/B=6/C=6/D=6, A=6/B=7/C=6/D=6, 等），按 subjectIndex % 4 |
| 隐藏集 | 5 个 set × 5 张图 |
| 集约束 | 每集必须包含全部 4 个类别（1/1/1/2 结构） |
| 软平衡优化 | 500 次随机尝试，最小化风险集中 + 最大化多样性 |

---

## 5. 当前数据记录逻辑

### 5.1 数据库总览

- 数据库文件：`study1.db`（SQLite, WAL 模式）
- Schema 在 `src/lib/db/index.ts` 的 `initSchema()` 中定义
- 26 张表（含 1 张 legacy `liking_rankings`）
- 数据写入在服务端 API routes 中进行，**不是客户端直接写入**

### 5.2 各阶段记录字段

#### 被试注册（`participants` + `experiment_sessions` + `event_logs`）

- `participants`: id, participant_code, age, gender, major, consented, status
- `experiment_sessions`: id, participant_id, **group_label**（scarcity/abundance）, current_stage, status, resource_balance, random_seed, calibration_attempt_index
- `event_logs`: participant.registered（含 age, gender, major, group, initial_stage）

#### 资源账户任务（`stage_game_trials` + `stage_game_responses`）

- `stage_game_trials`: 预生成 90 条，含 task_type, stimulus_payload (JSON), correct_answer, preset_feedback_direction, preset_feedback_points
- `stage_game_responses`: 每条记录包含：
  - response（F/J/null）, accuracy（1/0/null）, rt_ms
  - missed_response, timeout
  - **feedback_mode**（"true" 或 "manipulated"）★ 可区分真实反馈和虚假反馈
  - preset_feedback_direction, preset_feedback_points
  - **balance_before, balance_after** ★ 余额变化
  - dot_count_left, dot_count_right, correct_side

#### 操纵检查（`manipulation_check_responses` + `manipulation_check_summary`）

- 14 条 response 记录，含 item_id, construct（内部）, response_value（1-7）
- summary 含 4 个 construct means

#### 刺激分配（`subject_selected_stimuli` + `subject_set_assignment`）

- 25 条 selected + 25 条 set_assignment
- 含 stim_id, visual_category, set_id, position_in_set, image_url

#### 校准阶段（`calibration_trials` + `calibration_responses`）

- trials: phase, left/right stim_id + image_url, boundary_type, expected_choice
- responses: response_side, chosen_stim_id, rt_ms, timeout, consistent, response_method

#### V2 建模表（`within_set_stable` + `cross_set_orthogonalized`）

- `within_set_stable`: original_within_rank, stable_within_rank, win_count, adjacent_retest_result, adjacent_consistency, tie_flag, ambiguity_flag, final_stable_rank
- `cross_set_orthogonalized`: original_liking_rank, calibrated_liking_rank, shift_direction, shift_rate, shift_threshold_met, shift_confidence, evidence_summary

#### 喜爱验证（`liking_validation_trials` + `liking_validation_responses` + `liking_validation_quality`）

- responses: response_side, chosen_stim_id, rt_ms, timeout, consistent_with_ranking
- quality: different_rank_consistency_rate, validation_passed, needs_rerank

#### 价值分配（`value_assignment` + `stimulus_value_map` + `value_comprehension_checks`）

- value_assignment: set_id, external_value, assignment_pattern_index
- stimulus_value_map: 每条 stim 对应 final_liking_rank + external_value
- comprehension: attempt, selected_answer, correct

#### 正式选择（`formal_trials` + `choice_responses`）

- trials: trial_type, delta_liking, delta_value, high_liking_side, high_value_side, item_pair_key
- responses: response_side, chosen_stim_id, rt_ms, timeout, **chose_high_liking, chose_high_value, chose_congruent_advantage**, chose_high_liking_low_value, chose_low_liking_high_value

#### 实验后检查（`post_experiment_checks`）

- performance_feedback_belief, preset_feedback_suspicion, resource_task_influence_belief
- perceived_study_purpose_text, main_choice_strategy, unusual_or_unrealistic_text
- suspicion_flag

### 5.3 关键数据问题解答

| 问题 | 答案 |
|---|---|
| 是否可以区分真实反馈和虚假反馈？ | **是。** `stage_game_responses.feedback_mode` 字段区分 "true"（图形匹配）和 "manipulated"（点数比较） |
| 是否可以区分稀缺组和充裕组？ | **是。** `experiment_sessions.group_label` 字段存 "scarcity" 或 "abundance" |
| 是否记录 RT？ | **是。** 所有任务阶段都记录 `rt_ms`（使用 `performance.now()`） |
| 是否记录选择？ | **是。** 各阶段记录 response_side + chosen_stim_id |
| 是否记录正确率？ | 资源任务记录 accuracy；正式选择通过 chose_high_liking/value 等编码字段分析 |
| 是否记录余额变化？ | **是。** `stage_game_responses` 记录 balance_before 和 balance_after |
| 是否记录刺激 ID？ | **是。** 所有涉及刺激的阶段都记录 stim_id |

### 5.4 目前可能缺失的数据字段

- `block_manipulation_checks` 表存在但 V2 连续版资源任务不触发 block 检查（无 block 结构），该表**当前闲置**
- `calibration_quality` 表中 `cross_set_anchor_consistency` 和 `cross_set_near_rank_consistency` 字段始终为 `null`（`computeCalibrationQuality` 函数未填充这些值）
- `liking_validation_quality` 表中 `mean_rt_ms` 始终为 `NULL`（插入时写死为 NULL）
- `liking_rankings` 表存在但**当前未使用**（legacy，被 `liking_map` 替代）
- 资源任务阶段**没有记录每试次的正确率与组别的交叉引用**到 event_logs（但有 `stage_game_responses` 表可以 JOIN）
- `manipulation_check` 阶段没有记录单个 item 的 `reverse_scored` 生效值（所有 item 当前 reverse_scored = false）

---

## 6. 当前已知问题 / 潜在风险

### 6.1 阶段跳转失败风险

- **校准阶段重试逻辑**：如果 liking_validation 不通过（<85%），会清空所有 calibration 和 validation 数据回到 study1_liking_ranking。如果被试多次不通过，`calibration_attempt_index` 会递增。需要关注多次重试后的表现。
- **质量门禁卡住**：value_assignment 阶段前的质量门禁如果检测到 liking_map 不完整、验证未通过或超时率高，会显示"请联系实验员"但**不给被试任何可操作提示**。被试无法自行恢复。
- **实验页刷新**：`experiment/page.tsx` 在加载时会检查校准数据完整性，如果 `calTotal < 150 && hasOrtho === 0` 会自动回退到 `study1_liking_ranking`。这在正常使用中是保护机制，但如果被试已完成校准但因 bug 数据不完整，可能导致意外的阶段回退。

### 6.2 图片不显示问题

- **`public/stimuli/` 是副本而非符号链接**：上传替换图片后需要手动同步到 `storage/stimuli/` 和 `public/stimuli/` 两个目录。如果只更新一处，图片将不显示。
- **PreferenceTask 会检测缺失的 image_url**：如果 `calibration_trials` 中 `left_image_url` 或 `right_image_url` 为空字符串，会在控制台警告并可能触发错误提示"图片加载失败"。
- **PreferenceTask 图片预加载有 15 秒超时**：超时后显示"图片加载超时，请刷新页面重试"。

### 6.3 英文残留

| 位置 | 英文文本 |
|---|---|
| `src/app/page.tsx` | "Study 1", "Psychology Experiment Research Platform", "Admin Login", "Participant Entrance" |
| `src/lib/stages.ts:42-43` | "Final Questions"（应为"实验后问题"），"Complete"（应为"实验完成"）— 注意 `PARTICIPANT_STAGE_TITLES` 已经是中文，`STAGE_LABELS` 是 admin 用 |
| `src/app/login/page.tsx` | 整个 Admin 登录页是英文 |
| `src/app/admin/page.tsx` | "Dashboard", "Overview of the study progress.", "Total Participants", "In Progress", 等 |
| `src/app/experiment/page.tsx` | "TODO: Insert real experiment stage UIs here."（遗留注释） |

### 6.4 点数重合 / 位置重叠

- `src/lib/stimulus/dots.ts` 使用**拒绝采样**生成不重叠的点位置
- 参数：minDistance=8%（面板百分比），经过四级渐进放松（1.0→0.85→0.70→0.55）
- 绝对最小距离：5%（`ABSOLUTE_MIN_DIST`）
- 如果拒绝采样仍失败，有**确定性网格回退**方案
- **潜在风险**：点数较多时（如 50 个点），即使网格回退也可能出现视觉拥挤。当前 `minDistance` 对 trial-generator 设为 7%（`src/lib/stage-game/trial-generator.ts:379`），panelWidth=45, panelHeight=90。

### 6.5 数据字段不完整

见 5.4 节。

### 6.6 余额轨迹不符合实验操纵

- 稀缺组和充裕组的反馈逻辑使用 `Math.random()`（非种子随机），这意味着：
  - **每次生成试次时余额轨迹可能不同**（如果重新生成）
  - 但实际使用中，试次在 `/api/stage-game/init` 时生成一次并持久化到 `stage_game_trials`，后续不会重新生成
  - 反馈在 `submit-response` 时由 `computeDotComparisonFeedback` **实时计算**（基于当前 `balanceBefore`），不是从预生成的 trial 中读取
  - 这意味着实际的反馈方向和金额在**响应时动态确定**，依赖当前余额状态
- **潜在问题**：如果被试跳过某些试次（如刷新页面），余额状态可能与预设计划不一致

### 6.7 喜爱等级表出现空格 / 并列

- `inferWithinSetRanks` 函数通过 win-count 推断 rank
- 平局处理：按 stim_id 字母顺序打破（`a.stim_id.localeCompare(b.stim_id)`）
- 这可能导致原本 win-count 相同的两个刺激被强制分出"假"的 rank 顺序
- `tie_flag` 字段标记了平局情况，可以在分析时识别

### 6.8 信度检查逻辑

- 验证阶段信度阈值：`VALIDATION_CONSISTENCY_THRESHOLD = 0.85`
- 仅对 `different_rank` 类型计算 consistency（`same_rank` 没有 expected choice）
- 如果阈值为 null（所有响应 timeout），`needs_rerank` 为 false，`validation_passed` 为 0
- **这意味着如果被试全部超时，会直接卡在质量门禁**（因为 `validation_passed = 0`）

### 6.9 Admin 导出稳定性

- CSV 导出在 `src/app/api/admin/export/route.ts`，4 种类型
- 导出使用简单的字符串拼接，**不做流式处理**。如果数据量很大，可能内存占用较高（但单 session 数据量很小，当前不太可能是问题）
- `participant_summary` SQL 较复杂（嵌套子查询），大数据量时可能较慢
- 仅导出 `status = 'completed'` 的 session

### 6.10 其他注意事项

- **Supabase 依赖残留**：`@supabase/ssr` 和 `@supabase/supabase-js` 在 `package.json` 中但未使用（项目已切换到 better-sqlite3）
- **数据库当前为空**（0 被试），之前已清理
- **WAL 文件**：`study1.db-shm` 和 `study1.db-wal` 是 SQLite WAL 文件，服务器运行期间存在，关闭后会合并到主数据库
- **`proxy.ts`** 是 admin 路由保护中间件，修改 matcher 会影响 admin 安全

---

## 7. 后续大改建议入口（修改指南）

### 7.1 修改资源账户任务逻辑

| 改什么 | 改哪里 |
|---|---|
| 试次数量 | `src/lib/stage-game/config.ts` — `DOT_COMPARISON_COUNT`, `SHAPE_MATCHING_COUNT` |
| 试次顺序约束 | `src/lib/stage-game/trial-generator.ts` — `placeShapeMatching()` |
| 时序参数 | `src/lib/stage-game/config.ts` — `STIMULUS_DURATION_MS`, `FIXATION_DURATION_MS` 等 |
| UI 显示（余额、进度、反馈文字） | `src/components/StageGameTask.tsx` |
| 指令文字 | `src/components/StageGameTask.tsx` — `phase === "instruction"` 部分 |

### 7.2 修改余额生成 / 虚假反馈

| 改什么 | 改哪里 |
|---|---|
| 组别初始余额和范围 | `src/lib/stage-game/config.ts` — `RESOURCE_TASK_CONFIG` |
| 稀缺组反馈策略 | `src/lib/stage-game/trial-generator.ts` — `computeScarcityFeedback()` |
| 充裕组反馈策略 | `src/lib/stage-game/trial-generator.ts` — `computeAbundanceFeedback()` |
| 反馈反馈模式（真/假） | `src/app/api/stage-game/submit-response/route.ts` — 决定 `feedbackMode` 的逻辑 |
| 超时惩罚 | `src/lib/stage-game/response.ts` — `saveStageGameResponse()` 中超时处理 |
| 组别反馈文本（被试看到的） | `src/lib/stages.ts` — `FEEDBACK_TEXT[scarcity/abundance]` |

### 7.3 修改点的位置和防重叠

| 改什么 | 改哪里 |
|---|---|
| 点位置生成算法 | `src/lib/stimulus/dots.ts` — `generateDotPositions()` |
| 最小距离 | `src/lib/stage-game/trial-generator.ts:379` — `minDistance: 7` |
| 面板大小 | 同上 `panelWidth: 45, panelHeight: 90` |
| 点数范围 | `src/lib/stage-game/config.ts` — `DOT_MIN`, `DOT_MAX` |
| 点数差异范围 | `src/lib/stage-game/config.ts` — `DOT_DIFF_MIN`, `DOT_DIFF_MAX` |
| UI 渲染（点的大小、颜色） | `src/components/StageGameTask.tsx` — `DotComparisonStimulus` 子组件 |

### 7.4 修改喜爱等级建模

| 改什么 | 改哪里 |
|---|---|
| Phase 4A 全配对生成 | `src/lib/study1/calibration-generator.ts` — `generateWithinFullPairTrials()` |
| Phase 4B 相邻重测生成 | 同上 — `generateWithinAdjacentRetestTrials()` |
| Phase 4C 跨集边界生成 | 同上 — `generateCrossSetBoundaryTrials()` |
| Rank 推断（win-count） | 同上 — `inferWithinSetRanks()` |
| 第一稳定表构建 | 同上 — `buildWithinSetStableTable()` |
| 第二正交化表构建 | 同上 — `buildCrossSetOrthogonalizedTable()` |
| 移动阈值（50% 规则） | 同上 — `buildCrossSetOrthogonalizedTable()` 中 upRate/downRate 逻辑 |
| 校准响应保存 + 阶段推进 | `src/lib/study1/calibration-scoring.ts` + `src/app/api/study1/calibration/submit/route.ts` |
| Phase 间自动过渡 | `src/app/api/study1/calibration/submit/route.ts` — `phaseCompleted === "within_full_pair"` 等分支 |

### 7.5 修改图形选择再认和信度检查

| 改什么 | 改哪里 |
|---|---|
| 验证试次生成 | `src/app/api/study1/validation/init/route.ts` |
| 验证响应保存 + 质量计算 | `src/app/api/study1/validation/submit/route.ts` |
| 信度阈值 | `src/app/api/study1/validation/submit/route.ts` — `VALIDATION_CONSISTENCY_THRESHOLD = 0.85` |
| 不通过时的重试逻辑 | 同上 — `!passed` 分支（清空数据、increment attempt、回退 stage） |
| 验证 UI 组件 | `src/components/ValidationTask.tsx` |

### 7.6 修改二维价值决策任务

| 改什么 | 改哪里 |
|---|---|
| 试次数量和类型分布 | `src/lib/study1/formal-trial-generator.ts` — `FULL_TARGETS` / `DEV_TARGETS` |
| 试次分类逻辑 | 同上 — `classifyPair()` |
| 试次生成 + 位置平衡 | 同上 — `generateFormalChoiceTrials()` |
| 响应编码（chose_high_liking 等） | `src/lib/study1/formal-response.ts` — `saveChoiceResponse()` |
| 价值分配 Latin-square | `src/lib/study1/value-assignment.ts` — `assignExternalValues()` |
| 理解检查 | `src/lib/study1/value-assignment.ts` — `saveValueComprehensionAttempt()` |
| UI 组件（含价值点数显示） | `src/components/FormalChoiceTask.tsx` |
| 指令文字 | `src/app/experiment/page.tsx` — `stage === "study1_formal_choice"` 部分的 `<p>` 标签 |

### 7.7 修改数据记录字段

| 改什么 | 改哪里 |
|---|---|
| 数据库 Schema（加表/加列） | `src/lib/db/index.ts` — `initSchema()` + try/catch ALTER TABLE migrations |
| 资源任务响应字段 | `src/lib/stage-game/response.ts` — `saveStageGameResponse()` |
| 校准响应字段 | `src/lib/study1/calibration-scoring.ts` — `saveCalibrationResponse()` |
| 正式选择响应字段 | `src/lib/study1/formal-response.ts` — `saveChoiceResponse()` |
| 事件日志字段 | `src/lib/db/event-log.ts` — `logEvent()` |
| Admin CSV 导出字段 | `src/app/api/admin/export/route.ts` — 各个 SQL 函数 |
| TypeScript 类型 | `src/lib/types/database.ts` |

### 7.8 修改指导语

| 改什么 | 改哪里 |
|---|---|
| 阶段标题（被试看到的中文名） | `src/lib/stages.ts` — `PARTICIPANT_STAGE_TITLES` |
| 组别反馈文本 | `src/lib/stages.ts` — `FEEDBACK_TEXT` |
| 资源任务说明 | `src/components/StageGameTask.tsx` — `phase === "instruction"` 部分 |
| 校准任务说明 | `src/app/experiment/page.tsx` — `stage === "study1_liking_ranking"` 的 `<p>` 标签 |
| 正式选择说明 | `src/app/experiment/page.tsx` — `stage === "study1_formal_choice"` 的 `<p>` 标签 |
| 价值点数说明 | `src/app/experiment/page.tsx` — `stage === "study1_value_assignment"` 的 `<p>` 标签 |
| 操纵检查说明 | `src/app/experiment/page.tsx` — `stage === "manipulation_check"` 的 `<p>` 标签 |
| 实验后检查说明 | `src/app/experiment/page.tsx` — `stage === "post_experiment_check"` 的 `<p>` 标签 |
| 各阶段纯文本内容 | `src/app/experiment/page.tsx` — `getStageContent()` 函数 |

### 7.9 修改阶段顺序

| 改什么 | 改哪里 |
|---|---|
| 阶段定义和顺序 | `src/lib/stages.ts` — `STAGES` 数组（**这是唯一权威来源**） |
| 阶段标签（admin 用） | `src/lib/stages.ts` — `STAGE_LABELS` |
| 被试看到的标题 | `src/lib/stages.ts` — `PARTICIPANT_STAGE_TITLES` |

> ⚠️ 修改 `STAGES` 数组顺序后，需要检查所有依赖 `current_stage` 的代码，包括 `experiment/page.tsx` 中的 switch 语句和各 API route 中的自动推进逻辑。

---

## 9. 本轮新增/确认的关键程序约束（2026-06-11）

### 9.1 Formal Choice — Conflict Trial 重复规则

#### 规则
- **优先保证不重复**：同一对刺激（无论左右顺序）视为同一个 item pair（normalized pair key: `stimA|stimB`，字母序排列）。
- **Conflict trial（66 个）优先不重复**：前 48 个基础 conflict + 前 18 个额外 conflict 均从唯一 pair 池中抽取。
- **仅在候选池不足时允许重复**：如果剩余 conflict 候选池无法提供足够的唯一 pair（实际测试中从未发生 — 25 个刺激可生成足够多的 conflict pair），则进入 fallback 模式：
  - 允许重复使用之前出现过的 pair_key
  - 每个重复 pair 记录 `repeated_pair_flag = 1`、`repeat_index`（该 pair 第几次重复）、`original_pair_key`（首次出现的 pair_key）
  - 仍保留每个刺激最大出现 18 次的约束
  - 左右位置尽量平衡

#### 记录字段

`formal_trials` 表新增/使用以下字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `item_pair_key` | TEXT | 归一化 pair 标识（已存在，之前已使用） |
| `repeated_pair_flag` | INTEGER | 1 = 该试次复用了之前出现过的 pair（已存在，之前始终为 0） |
| `repeat_index` | INTEGER | **新增**。该 pair 第几次重复（1 = 首次重复，2 = 第二次重复...），NULL = 非重复 |
| `original_pair_key` | TEXT | **新增**。首次出现的 item_pair_key 值，NULL = 非重复 |

#### Admin 导出

`/api/admin/export?type=choice_responses` CSV 中新增以下列（通过 `LEFT JOIN formal_trials` 获取）：
- `item_pair_key`
- `repeated_pair_flag`
- `repeat_index`
- `original_pair_key`

分析师可使用 `WHERE repeated_pair_flag = 0` 过滤仅保留唯一 pair 的数据，或用 `repeated_pair_flag = 1` 做敏感性分析。

#### 修改文件
- `src/lib/db/index.ts` — ALTER TABLE 新增 `repeat_index`、`original_pair_key` 列
- `src/lib/study1/formal-trial-generator.ts` — 新增 fallback 逻辑 + `buildTrialRow` 读取 repeat 元数据 + `trialSummary` 新增 `repeatedPairs` 计数
- `src/app/api/admin/export/route.ts` — choice_responses 导出新增 4 个列 + data dictionary 更新
- `scripts/check-formal-choice.ts` — 新增 2 个 check

### 9.2 Validation 重试规则（< 85% consistency）

#### 规则

**保留不变的数据（绝对不能清空或重建）**：
- `subject_selected_stimuli` — 最开始抽取的 25 张图
- `subject_set_assignment` — 5 个隐藏集（每集 5 张图）

**清空并重建的数据**（验证失败时）：
- `calibration_trials` — Phase 4A/4B/4C 试次
- `calibration_responses` — 所有配对比较响应
- `within_set_stable` — V2 第一稳定表
- `cross_set_orthogonalized` — V2 第二正交化表
- `liking_map` — 喜爱等级映射
- `liking_validation_trials` — 验证试次
- `liking_validation_responses` — 验证响应
- `liking_validation_quality` — 验证质量
- `calibration_quality` — 校准质量

**重试流程**：
1. `calibration_attempt_index += 1`（隔离本次重试数据）
2. 清空上述所有喜爱建模数据
3. Stage 重置为 `study1_liking_ranking`
4. 前端自动刷新后重新从 Phase 4A 开始（使用相同的 `subject_set_assignment`）
5. 事件日志记录 `calibration_retry_triggered`（含 attempt、previous_consistency、reason、preserved/cleared table 列表）

**被试看到的提示**："为了让后续任务更准确地匹配你的个人偏好，请你再完成一轮简短的图形偏好确认。"

**不包含任何技术词**（calibration、validation、rank、consistency、85%、failed 等词不会出现在被试界面）。

**边缘情况处理**：
- 全部超时（rate = null）→ `passed = false`，触发重试（行为正确）
- 多次重试后仍不通过 → 每次重试都会递增 `calibration_attempt_index`，数据用 attempt_index 隔离，不会覆盖前一次尝试的数据

#### 修改文件
- `src/app/api/study1/validation/submit/route.ts` — 新增显式清空 `within_set_stable`、`cross_set_orthogonalized`、`liking_map`、`liking_validation_quality`、`calibration_quality`；新增详细注释说明保留/清空逻辑；事件日志新增完整字段

---

## 10. 脚本工具

```bash
# 重新播种刺激池（扫描 storage/stimuli/ 目录）
npm run seed-stimuli

# 检查校准流程
npm run check:calibration

# 检查价值分配
npm run check:value-assignment

# 检查正式选择
npm run check:formal-choice

# 检查点数生成和防重叠
npm run check:dots-stagegame
```

---

## 11. 重要提醒

1. **不要删除 `study1.db-shm` 和 `study1.db-wal`** — 这是 SQLite WAL 模式的正常文件，服务器运行时存在。
2. **修改 `.env.local` 后必须重启 dev server** — Next.js 不热重载环境变量。
3. **`public/stimuli/` 是文件副本** — 替换图片需要同时更新 `storage/stimuli/` 和 `public/stimuli/` 两个位置。
4. **数据库当前为空**（0 被试）— 测试前需要先通过 `/start` 注册被试。
5. **`DEV_TEST_MODE` 当前为关闭状态** — 完整实验需要完成 90 资源试次 + 150 校准试次 + 162 正式选择试次，耗时较长。快速测试时建议临时开启。
6. **被试切勿看到内部标签** — `scarcity`、`abundance`、`group`、`set_id`、`trial_type`、`delta_liking`、`calibration` 等词**绝对不能**出现在被试可见的 HTML 或 API 响应中。
7. **旧文档不再权威** — `HANDOFF_CURRENT.md`、`HANDOFF.md`、`CURRENT_HANDOFF.md` 均包含过时信息（如阶段顺序、试次数、Block 结构等），以本文档和实际代码为准。
8. **`src/app/experiment/page.tsx` 是核心文件** — 修改时需格外小心，它包含服务端数据库查询、阶段路由、质量门禁等关键逻辑。
