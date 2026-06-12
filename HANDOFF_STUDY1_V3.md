# HANDOFF_STUDY1_V3.md — Study 1 V3 实验系统交接文档

**文档创建日期**: 2026-06-12
**项目根目录**: `/Users/hczhao/Documents/ClaudeCode/ValueRepresentation_V2`

> 本文档基于对代码的全面扫描和 2026-06-12 的多项修复编写，所有描述以当前代码实际实现为准。本文档取代旧的 `HANDOFF_STUDY1_V2.md`，为权威交接文件。

---

## 1. 项目启动方式

### 1.1 项目路径

```bash
cd /Users/hczhao/Documents/ClaudeCode/ValueRepresentation_V2
```

### 1.2 安装依赖

```bash
npm install
```

> ⚠ 若切换 Node.js 版本后出现 `better-sqlite3` 原生模块不兼容错误，运行 `npm rebuild better-sqlite3` 即可。

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

配置在 `.env.local` 中的 `ADMIN_EMAIL` 和 `ADMIN_PASSWORD`（或使用默认值）。

### 1.6 被试进入密码

当前密码: `zxzx123456`（配置在 `.env.local` 的 `PARTICIPANT_ENTRY_PASSWORD`，或使用默认值）。

### 1.7 关闭终端后服务

**会中断。** 当前没有使用进程管理器。如需长期运行，建议使用 `screen` 或 `tmux`：

```bash
screen -S study1
cd /Users/hczhao/Documents/ClaudeCode/ValueRepresentation_V2
npm run dev
# Ctrl+A, D 分离
```

### 1.8 DEV_TEST_MODE

在 `.env.local` 中取消注释 `NEXT_PUBLIC_DEV_TEST_MODE=true` 可开启快速测试模式（大幅减少试次数）。修改后需要**重启 dev server**（Next.js 不热重载环境变量）。当前为注释状态 = 完整实验模式。

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
| 图片 | 80 张抽象图形 PNG，`storage/stimuli/` 和 `public/stimuli/` 双副本 |

### 2.2 顶层文件/目录一览

```
ValueRepresentation_V2/
├── .env.local              # 环境变量
├── package.json            # 依赖和脚本
├── study1.db               # SQLite 数据库文件
├── study1.db-shm           # SQLite WAL 共享内存（勿手动删除）
├── study1.db-wal           # SQLite WAL 日志（勿手动删除）
├── src/                    # 全部源代码
├── public/stimuli/         # 刺激图片（Next.js 直接 serve）
├── storage/stimuli/        # 原始刺激图片存储
├── scripts/                # 检查/种子脚本
├── backups/                # 数据库备份
└── node_modules/           # 依赖
```

### 2.3 src/ 目录结构

```
src/
├── app/
│   ├── page.tsx                  # 着陆页
│   ├── layout.tsx                # 根布局
│   ├── globals.css               # Tailwind 入口
│   ├── start/page.tsx            # 被试入口（密码门禁 + 注册）
│   ├── experiment/page.tsx       # ★ 主阶段路由（~550 行，核心）
│   ├── login/page.tsx            # Admin 登录
│   ├── complete/page.tsx         # 实验完成页
│   ├── admin/                    # Admin 后台（8 个子页面）
│   │   ├── page.tsx              # Dashboard
│   │   ├── layout.tsx            # Admin 布局 + auth guard
│   │   ├── participants/page.tsx # 被试列表
│   │   ├── sessions/page.tsx     # 会话列表
│   │   ├── stimuli/page.tsx      # 刺激管理
│   │   ├── study1/page.tsx       # Study1 概览
│   │   ├── study1/[sessionId]/page.tsx  # 会话详情
│   │   ├── audit/page.tsx        # 审计
│   │   └── results/page.tsx      # 结果 + 导出
│   └── api/                      # ★ API 路由（~21 个）
│       ├── auth/login/route.ts
│       ├── auth/logout/route.ts
│       ├── participants/register/route.ts
│       ├── participants/verify-entry-password/route.ts
│       ├── sessions/advance/route.ts
│       ├── stage-game/init/route.ts
│       ├── stage-game/submit-response/route.ts
│       ├── stage-game/block-check/route.ts
│       ├── manipulation-check/submit/route.ts
│       ├── study1/init-assignment/route.ts
│       ├── study1/calibration/init/route.ts
│       ├── study1/calibration/submit/route.ts
│       ├── study1/validation/init/route.ts
│       ├── study1/validation/submit/route.ts
│       ├── study1/comprehension-check/route.ts
│       ├── study1/formal-trials/init/route.ts
│       ├── study1/formal-choice/submit/route.ts
│       ├── study1/post-experiment-check/route.ts
│       └── admin/
├── components/                   # ★ React 组件（15 个）
│   ├── StageGameTask.tsx          # 资源账户任务（~600 行）
│   ├── PreferenceTask.tsx         # 图形偏好校准（含图片预加载）
│   ├── ValidationTask.tsx         # 喜爱验证
│   ├── FormalChoiceTask.tsx       # 二维价值决策
│   ├── ValueInstructionTask.tsx   # 价值点数说明
│   ├── BaselinePractice.tsx       # 练习入口
│   ├── PracticeTrials.tsx         # 练习试次
│   ├── PostExperimentCheck.tsx    # 实验后检查
│   ├── TaskSurvey.tsx             # 操纵检查问卷
│   ├── ExperimentControls.tsx     # 阶段推进按钮
│   ├── EntryPasswordGate.tsx      # 被试密码门禁
│   ├── ParticipantForm.tsx        # 被试注册表单
│   ├── AdminNav.tsx               # Admin 导航栏
│   ├── DeleteButton.tsx           # 删除按钮
│   └── StatCard.tsx               # 统计卡片
├── lib/                           # ★ 核心业务逻辑库
│   ├── stages.ts                  # ★ 阶段定义/顺序/标题/反馈文字
│   ├── auth/index.ts              # JWT 认证
│   ├── db/index.ts                # ★ SQLite Schema + 迁移
│   ├── db/event-log.ts            # 事件日志
│   ├── stimulus-seed.ts           # 刺激池播种
│   ├── stimulus/dots.ts           # 点数位置生成
│   ├── manipulation-check/
│   │   ├── items.ts               # 14 道 MC 题
│   │   └── scoring.ts             # MC 评分
│   ├── stage-game/
│   │   ├── config.ts              # ★ 资源任务配置
│   │   ├── types.ts               # 类型定义
│   │   ├── trial-generator.ts     # ★ 90 试次 + 操纵反馈
│   │   ├── response.ts            # 响应保存
│   │   └── progress.ts            # 进度计算
│   └── study1/
│       ├── sampling.ts            # ★ 刺激抽样 + set 构建
│       ├── calibration-types.ts   # 校准类型
│       ├── calibration-generator.ts  # ★ 4A/4B/4C 生成 + Elo
│       ├── calibration-scoring.ts # 校准评分 + 表构建
│       ├── calibration-orchestrator.ts # ★ 校准编排器
│       ├── elo.ts                 # ★ Elo 评分系统
│       ├── anomaly-detection.ts   # 异常检测
│       ├── stability-validation.ts # 5 维稳定性
│       ├── value-assignment.ts    # 价值分配
│       ├── formal-trial-generator.ts # ★ 正式选择生成
│       └── formal-response.ts     # 正式选择响应
└── proxy.ts                       # Admin 路由保护
```

### 2.4 数据库文件

- **`study1.db`**：主数据库文件，位于项目根目录
- **`study1.db-shm`** 和 **`study1.db-wal`**：SQLite WAL 文件，**勿手动删除**

### 2.5 刺激图片

- `storage/stimuli/`：80 张 PNG，命名格式 `{Category}{Number}.png`（如 `A1.png`）
- `public/stimuli/`：`storage/stimuli/` 的**文件副本**（非符号链接），由 Next.js 直接 serve
- 类别分布：A=20, B=20, C=20, D=20
- **替换图片需同时更新两个目录**

---

## 3. 当前实验流程总览（按被试实际经历顺序）

### 阶段定义（`src/lib/stages.ts` — 权威来源）

```typescript
STAGES = [
  "baseline_questionnaire",      // 0. 任务操作说明
  "study1_liking_ranking",       // 1. 视觉偏好任务 ★
  "study1_liking_validation",    // 2. 视觉偏好确认
  "relative_resource_feedback",   // 3. 任务信息
  "scarcity_manipulation",       // 4. 资源账户任务 ★
  "manipulation_check",          // 5. 任务体验问卷
  "study1_value_assignment",     // 6. 价值点数说明
  "study1_formal_choice",        // 7. 图像选择任务 ★★
  "post_experiment_check",       // 8. 实验后问题
  "complete",                    // 9. 实验完成
]
```

**设计逻辑**: 先纯净测量喜好（阶段 1-2, 无价值干扰）→ 再操纵资源感知（阶段 4）→ 紧接操纵检验（阶段 5）→ 然后说明外部价值（阶段 6）→ 核心 DV: 喜好×价值冲突选择（阶段 7）。

| 序号 | Stage Key | 被试看到的中文标题 | UI 组件 | 试次数 |
|:---:|---|---|---|---|
| 0 | `baseline_questionnaire` | 任务操作说明 | `BaselinePractice` → `PracticeTrials` | 6 |
| 1 | `study1_liking_ranking` | 视觉偏好任务 | `PreferenceTask` | 110-165 |
| 2 | `study1_liking_validation` | 视觉偏好确认 | `ValidationTask` | 45 |
| 3 | `relative_resource_feedback` | 任务信息 | `ExperimentControls` + 文本 | — |
| 4 | `scarcity_manipulation` | 资源账户任务 | `StageGameTask` | 90 |
| 5 | `manipulation_check` | 任务体验问卷 | `TaskSurvey` | 14 题 |
| 6 | `study1_value_assignment` | 价值点数说明 | `ValueInstructionTask` | 1-2 题 |
| 7 | `study1_formal_choice` | 图像选择任务 | `FormalChoiceTask` | 176 |
| 8 | `post_experiment_check` | 实验后问题 | `PostExperimentCheck` | 6 题 |
| 9 | `complete` | 实验完成 | 完成页 | — |

### 阶段推进机制

| 阶段转换 | 推进触发点 | 方式 |
|---|---|---|
| 0→1 | `PracticeTrials.onComplete` → advance API | `window.location.href` |
| 1→2 | `calibration/submit` → orchestrator.finalize() | 直接 SQL UPDATE |
| 2→3 | `validation/submit`（通过或 max retry） | 直接 SQL UPDATE |
| 3→4 | `ExperimentControls` "继续" → advance API | `window.location.href` |
| 4→5 | `StageGameTask.finishStage` → advance API | `router.push` |
| 5→6 | `manipulation-check/submit` API | 直接 SQL UPDATE |
| 6→7 | `comprehension-check` API | 直接 SQL UPDATE |
| 7→8 | `formal-choice/submit` API | 直接 SQL UPDATE |
| 8→9 | `post-experiment-check` API | 直接标记 session completed |

### 详细流程描述

#### 3.0 被试入口 (`/start`)

1. 被试访问 `/start`
2. `EntryPasswordGate` 提示输入实验进入密码
3. `POST /api/participants/verify-entry-password` 验证 → 签发 12h JWT cookie `participant_access`
4. 被试填写注册表单（编号、年龄、性别、专业、知情同意）
5. `POST /api/participants/register`:
   - 验证 JWT
   - `assignGroup()`: 平衡分组（取 in_progress 较少的组）
   - 创建 `participants` + `experiment_sessions`
   - 初始阶段 = `baseline_questionnaire`
6. 跳转 `/experiment?code=X&session=Y`

#### 3.1 阶段 0 — 任务操作说明（baseline_questionnaire）

- 组件：`BaselinePractice` → `PracticeTrials`
- 6 个练习试次（4 点数比较 + 2 图形匹配）, DC-DC-SM-DC-DC-SM
- 真实反馈（✓/✗）, 600ms 后自动推进
- F(选左) / J(选右)
- 完成后自动 advance → `study1_liking_ranking`

#### 3.2 阶段 1 — 视觉偏好任务（study1_liking_ranking）★

- 组件：`PreferenceTask`
- 25 张图 → 5 个隐藏 set × 5 张
- **Elo 评分系统** (K=32→24→20 递减) + **CalibrationOrchestrator** 编排

**校准子阶段**:

| Phase | 名称 | 试次 | 说明 |
|---|---|---|---|
| 4A | within_full_pair | 50 | 每 set C(5,2)=10 对全配对, K=32 |
| 4B-R1 | within_adjacent_retest | 20 | 每 set 4 相邻对 ×1 次复测, K=24 |
| 4B-R2 | within_adjacent_retest_r2 | 0-40 | 条件触发: 不一致对+邻居 ×2 次, K=24 |
| 4C-a | cross_set_anchor_mid | 20 | rank-3 跨 set ×2 重复, K=20 |
| 4C-b | cross_set_anchor_low/high | 20 | rank-1+5 跨 set, K=20 |
| 4C-c | cross_set_adaptive | 0-15 | 条件触发: 异常检测 |

**不一致对信息来源**: 4A(1次) + R1(1次) + R2(2次) = 共 4 次比较 → Elo

**5 维稳定性验证** (finalize 时):
- Cycle Consistency (20%) + Test-Retest (25%) + Kendall's W (25%) + Elo RMSE (20%) + Timeout (10%)
- → Grade A (≥0.80) / B (≥0.55) / C (<0.55)

**双轨排名**: `original_within_rank` (4A win-count) + `final_stable_rank` (Elo 综合), 均保留供审计

#### 3.3 阶段 2 — 视觉偏好确认（study1_liking_validation）

- 组件：`ValidationTask`
- 45 试次: 30 different_rank + 15 same_rank
- 一致性阈值 85%:
  - 通过 → advance to `relative_resource_feedback`
  - 未通过 → calibration_attempt_index+1, 清空 12 张校准/验证表, **保留 subject_set_assignment**, 回退到 `study1_liking_ranking`

#### 3.4 阶段 3 — 任务信息（relative_resource_feedback）

- 显示组别反馈文本（FEEDBACK_TEXT）
- 稀缺组: 初始 10 点 / 充裕组: 初始 100 点，通过阈值均为 10 点
- "继续"按钮 → advance API

#### 3.5 阶段 4 — 资源账户任务（scarcity_manipulation）★

- 组件：`StageGameTask`
- 90 试次: 18 real_dot (15-25点, 真实反馈) + 54 manipulated_dot (30-50点, 操纵反馈) + 18 shape_matching (真实反馈)
- `is_manipulated_feedback` 列区分真实/操纵反馈
- 注视点 500ms → 刺激 3000ms → 反馈 800ms → 空白 300ms
- **服务端权威余额**: submit-response 从 DB 读取 balance, 不信任客户端

**稀缺组反馈规则**:
```
balance > 10:  85% loss (1-3) / 15% gain (1)
balance 7-10:  60% loss (1-2) / 40% gain (1-2)
balance 4-6:   50% gain (1-2) / 50% loss (1-2)
balance < 4:   80% gain (1-3) / 20% loss (1)
```

**充裕组反馈规则**: 前期(<30)攀升 → 中期(≥30)温和波动 → 后期(≤20rem)稳定高位 → 末期(≤5rem)确保≥110

#### 3.6 阶段 5 — 操纵检查（manipulation_check）

- 组件：`TaskSurvey`
- 14 题 Likert 7 点: 资源不足感(5题) + 资源信心(2题) + 压力(3题) + 投入度(4题)
- 提交后自动计算 4 构念均值并 advance

#### 3.7 阶段 6 — 价值点数说明（study1_value_assignment）

- 组件：`ValueInstructionTask`
- **质量门禁**: liking_map=25, validation_passed=1, needs_rerank=0, 超时率各≤20%
- 价值分配: 拉丁方轮转 {5,10,15,20,25} → 5 个 set
- 理解检测 MCQ: "价值点数是什么？" (A消耗/B收益✅/C好看), 最多 2 次, 错不阻塞

#### 3.8 阶段 7 — 图像选择任务（study1_formal_choice）★★

- 组件：`FormalChoiceTask`
- 176 试次: liking_only(32) + value_only(32) + congruent(32) + **conflict(80)**
- 25 stims × 5 values → 300 唯一对池 → 分类采样
- 每张图显示价值点数
- Conflict 优先唯一对, 不足时允许重复 (标记 repeated_pair_flag)
- 记录: chose_high_liking/value/congruent_advantage/high_liking_low_value/low_liking_high_value

#### 3.9 阶段 8 — 实验后问题（post_experiment_check）

- 组件：`PostExperimentCheck`
- 3 Likert + 1 单选策略 + 2 自由文本
- 关键词怀疑检测（预设/假/操纵/scarcity/abundance 等）→ suspicion_flag
- 提交后直接标记 session completed → `/complete`

#### 3.10 阶段 9 — 完成（complete）

- 感谢页面

### 跨阶段一致性守卫

[page.tsx:81-94](src/app/experiment/page.tsx#L81-L94):
- 覆盖范围: `study1_liking_validation`, `study1_value_assignment`, `study1_formal_choice`
- 如果 `cross_set_orthogonalized` 为空且不在 `study1_liking_ranking` → 自动回退到喜好校准起点

---

## 4. 当前关键实验参数

### 4.1 组别配置（`src/lib/stage-game/config.ts`）

| 参数 | 稀缺组 | 充裕组 |
|---|---|---|
| initial_balance | 10 | 100 |
| pass_threshold | 10 | 10 |
| balance_min | 4 | 80 |
| balance_max | 12 | 135 |

### 4.2 资源账户任务

| 参数 | 全模式 | DEV_TEST_MODE |
|---|---|---|
| real_dot 试次 | 18 | 2 |
| manipulated_dot 试次 | 54 | 4 |
| shape_matching 试次 | 18 | 4 |
| 总试次 | 90 | ~10 |
| 操纵点数范围 | 30-50, diff 2-4 | 同 |
| 真实点数范围 | 15-25, diff 1-3 | 同 |
| 刺激呈现 | 3000ms | 同 |
| 按键 | F(左) / J(右) | 同 |

### 4.3 校准/喜爱等级参数（V3 Elo 系统）

| 参数 | 值 |
|---|---|
| Phase 4A (within_full_pair) | 50 试次, K=32 |
| Phase 4B-R1 (within_adjacent_retest) | 20 试次, K=24, 每对 1 次 |
| Phase 4B-R2 (within_adjacent_retest_r2) | 0-40 试次, K=24, 每对 2 次 |
| Phase 4C-a (cross_set_anchor_mid) | 20 试次, K=20 |
| Phase 4C-b (cross_set_anchor_low/high) | 20 试次, K=20 |
| Phase 4C-c (cross_set_adaptive) | 0-15 试次, K=20 |
| 校准总试次 | 110-165 |
| Elo 初始值 | 1500, 范围 [1100, 1900] |
| Elo 波动率衰减 | `max(50, 200/sqrt(1+n))` |
| Rank 推断 | Elo 降序, rank 5=最喜欢 |
| 双轨排名 | original (4A win-count) + final_stable (Elo) |

### 4.4 验证阶段参数

| 参数 | 全模式 | DEV_TEST_MODE |
|---|---|---|
| different_rank | 30 | 6 |
| same_rank | 15 | 4 |
| 总试次 | 45 | ~10 |
| 一致性阈值 | 0.85 | 同 |
| 不通过行为 | 清空校准数据, increment attempt, 回退到 liking_ranking | 同 |

### 4.5 价值分配参数

| 参数 | 值 |
|---|---|
| 外部价值 | 5, 10, 15, 20, 25 |
| 分配方式 | Latin-square 轮换 (patternIndex % 5) |
| 理解检查 MCQ 正确答案 | B |
| 最大尝试次数 | 2 |

### 4.6 正式选择参数

| 参数 | 全模式 | DEV_TEST_MODE |
|---|---|---|
| liking_only | 32 | 4 |
| value_only | 32 | 4 |
| congruent | 32 | 4 |
| conflict | 80 | 8 |
| 总试次 | 176 | ~20 |
| 每 stimulus 最多出现 | 20 | 同 |
| stimulus 呈现 | 180000ms (3min) | 同 |

### 4.7 刺激抽样参数

| 参数 | 值 |
|---|---|
| 每 session 抽样 | 25 张（从 80 张池, usable=1, semantic_risk≠'high') |
| 配额轮换 | 4 种模式 (A/B/C/D 各 6-7 张), subjectIndex % 4 |
| 隐藏 set | 5 × 5, 硬约束 1/1/1/2 (每 set 含全部 4 类) |
| 软优化 | 500 次随机搜索, 最大化 set 内多样性 |

---

## 5. 当前数据记录逻辑

### 5.1 数据库总览

- 数据库文件：`study1.db`（SQLite, WAL 模式）
- Schema 在 `src/lib/db/index.ts` 的 `initSchema()` 中定义
- 25+ 张表
- 数据写入在服务端 API routes 中进行

### 5.2 各阶段记录字段

#### 资源账户任务（`stage_game_trials` + `stage_game_responses`）

- `stage_game_trials`: 新增 `is_manipulated_feedback` (INTEGER, 0=真实反馈, 1=操纵反馈), 可靠区分反馈模式
- `stage_game_responses`: feedback_mode ("true"/"manipulated"), balance_before/after, dot_count_left/right, correct_side

#### 校准阶段 — V3 Elo 系统

- `stimulus_elo`: Elo 连续分数 (elo_score, elo_volatility, comparisons_count, calibration_attempt_index)
- `within_set_stable`: original_within_rank, stable_within_rank, final_stable_rank, elo_score, adjacent_consistency, ambiguity_flag
- `cross_set_orthogonalized`: original_liking_rank, calibrated_liking_rank, shift_direction/rate/confidence, elo_score
- `calibration_stability`: 5 维指标 + stability_grade (A/B/C)
- `liking_map`: final_liking_rank = calibrated_liking_rank, 含 elo_score

#### 正式选择（`formal_trials` + `choice_responses`）

- `formal_trials`: 含 delta_elo (连续 Elo 差异), item_pair_key, repeated_pair_flag, repeat_index, original_pair_key
- `choice_responses`: chose_high_liking, chose_high_value, chose_congruent_advantage, chose_high_liking_low_value, chose_low_liking_high_value

### 5.3 关键数据问题解答

| 问题 | 答案 |
|---|---|
| 是否可以区分真实反馈和操纵反馈？ | **是。** `stage_game_trials.is_manipulated_feedback` + `stage_game_responses.feedback_mode` |
| 是否可以区分稀缺组和充裕组？ | **是。** `experiment_sessions.group_label` |
| 是否记录 RT？ | **是。** 所有阶段使用 `performance.now()` |
| 余额来源是否可靠？ | **是。** submit-response 从 DB 读取 `resource_balance`, 不信任客户端 |
| 是否有连续喜好度量？ | **是。** `stimulus_elo.elo_score`（1100-1900 连续值） |
| 是否保留原始排名？ | **是。** `original_within_rank` + `final_stable_rank` 双轨 |

---

## 6. V3 与 V2 的关键变更（2026-06-12）

### 6.1 阶段顺序修正

- **V2 错误顺序**: baseline → resource_feedback → scarcity → MC → liking_ranking...
- **V3 正确顺序**: baseline → liking_ranking → liking_validation → resource_feedback → scarcity → MC → value_assignment → formal_choice → post → complete
- 喜好校准在资源操纵**之前**, 确保喜好排名不受资源状态污染

### 6.2 校准系统升级

| 项目 | V2 | V3 |
|---|---|---|
| 排名算法 | win-count + 50% 阈值 | Elo (K=32→24→20 递减) |
| 4B 设计 | 单一 20 试次 | R1(20, ×1) + R2(条件, ×2) |
| 跨 set 方法 | 单一 cross_set_boundary | 三层锚定 (rank 1/3/5) + 自适应补充 |
| 稳定性 | 无 | 5 维综合评分 (A/B/C) |
| 编排 | 分散在 page.tsx / init / submit | CalibrationOrchestrator 统一编排 |
| 4C 试次数 | 80 | 40-55 |

### 6.3 资源任务可靠性增强

| 项目 | V2 | V3 |
|---|---|---|
| 真实/操纵区分 | 依赖 preset_feedback_direction 是否为 null | `is_manipulated_feedback` 列 |
| 余额来源 | 客户端状态 | 服务端 DB 权威值 |
| 试次数量显示 | 硬编码 "90" | 动态从 API 获取 |
| 点数比较细分 | 72 全部操纵 | 18 真实 + 54 操纵 |

### 6.4 正式选择试次数

| 项目 | V2 | V3 |
|---|---|---|
| conflict | 66 (48+18) | 80 (统一采样) |
| 总试次 | 162 | 176 |

### 6.5 FEEDBACK_TEXT 更新

"上一阶段已完成"（stage 3 承接 liking_validation）

---

## 7. 当前已知问题 / 潜在风险

### 7.1 阶段推进分散

- advance 在 advance API / orchestrator / 各阶段 submit API 三处执行
- 跨阶段一致性守卫仅覆盖校准阶段，不覆盖资源任务阶段
- comprehension-check API 直接操作 current_stage 而非通过 advance API

### 7.2 质量门禁卡住

- value_assignment 质量门禁不通过时只显示"请联系实验员", 被试无法自行恢复
- 如果全部验证试次超时 (consistency=null), `validation_passed=0`, 也会卡住

### 7.3 图片相关

- `public/stimuli/` 是副本而非符号链接, 替换需双目录同步
- PreferenceTask 图片预加载 15s 超时

### 7.4 数据字段不完整

- `calibration_quality` 的 cross_set 字段始终为 null (legacy)
- `liking_validation_quality.mean_rt_ms` 始终为 NULL
- `block_manipulation_checks` 表存在但 V2 连续版未使用

### 7.5 余额轨迹

- 操纵反馈使用 `Math.random()` 而非种子随机, 预计算的 `preset_feedback` 存储在 trial 中
- 但 submit-response 直接使用存储的 preset 值 (V3 修改), 不再实时计算

### 7.6 其他

- `experiment/page.tsx` 第 86 行 `calDone` 变量计算但未使用（dead code）
- 缺少 `error.tsx` / `loading.tsx` 错误边界
- `calibration_quality` 表存在但 `computeCalibrationQuality` 未填充 cross_set 字段

---

## 8. 后续修改指南

### 8.1 修改阶段顺序

| 改什么 | 改哪里 |
|---|---|
| 阶段定义和顺序 | `src/lib/stages.ts` — `STAGES` 数组（**唯一权威来源**） |

> ⚠ 修改后需检查 `experiment/page.tsx` 的 if-else 顺序、各 API 的 advance 逻辑、calibrationStages 守卫。

### 8.2 修改资源任务

| 改什么 | 改哪里 |
|---|---|
| 试次数量 | `src/lib/stage-game/config.ts` |
| 稀缺组反馈 | `src/lib/stage-game/trial-generator.ts` — `computeScarcityFeedback()` |
| 充裕组反馈 | 同上 — `computeAbundanceFeedback()` |
| UI 显示 | `src/components/StageGameTask.tsx` |
| 组别反馈文本 | `src/lib/stages.ts` — `FEEDBACK_TEXT` |

### 8.3 修改校准系统

| 改什么 | 改哪里 |
|---|---|
| Elo K 值 | `src/lib/study1/elo.ts` — `K_VALUES` |
| 4B retest 重复次数 | `src/lib/study1/calibration-generator.ts` — `R1_RETEST_REPETITIONS` / `R2_RETEST_REPETITIONS` |
| Phase 试次生成 | `src/lib/study1/calibration-generator.ts` |
| 阶段编排 | `src/lib/study1/calibration-orchestrator.ts` |
| 稳定性阈值 | `src/lib/study1/stability-validation.ts` |
| 异常检测 | `src/lib/study1/anomaly-detection.ts` |

### 8.4 修改正式选择

| 改什么 | 改哪里 |
|---|---|
| 试次数量/类型 | `src/lib/study1/formal-trial-generator.ts` — `FULL_TARGETS` |
| 分类逻辑 | 同上 — `classifyPair()` |
| 响应编码 | `src/lib/study1/formal-response.ts` |
| 价值分配 | `src/lib/study1/value-assignment.ts` — `assignExternalValues()` |

### 8.5 修改数据库 Schema

| 改什么 | 改哪里 |
|---|---|
| 加表/加列 | `src/lib/db/index.ts` — `initSchema()` + try/catch ALTER TABLE |
| CHECK 约束放宽 | 同上 — pattern: 测试插入 → 失败则 CREATE TABLE v2 → 迁移数据 → RENAME |

### 8.6 修改指导语

| 改什么 | 改哪里 |
|---|---|
| 阶段标题（被试可见） | `src/lib/stages.ts` — `PARTICIPANT_STAGE_TITLES` |
| 各阶段详细说明 | `src/app/experiment/page.tsx` — 各 stage if 块中的 `<p>` |
| 纯文本阶段内容 | 同上 — `getStageContent()` |

---

## 9. 脚本工具

```bash
npm run seed-stimuli          # 重新播种刺激池
npm run check:calibration     # 检查校准流程
npm run check:value-assignment # 检查价值分配
npm run check:formal-choice   # 检查正式选择
npm run check:dots-stagegame  # 检查点数生成
```

---

## 10. 重要提醒

1. **勿删 WAL 文件** — `study1.db-shm` 和 `study1.db-wal` 是 SQLite WAL 正常文件
2. **改 `.env.local` 后重启** — Next.js 不热重载环境变量
3. **public/stimuli/ 是副本** — 替换图片需双目录同步
4. **`DEV_TEST_MODE` 默认关闭** — 完整实验 ~400 试次, 耗时较长, 快速测试建议开启
5. **被试勿见内部标签** — scarcity/abundance/group/set_id/trial_type/calibration/Elo 等词绝不能出现在被试可见界面
6. **阶段顺序以 `stages.ts` 为准** — 所有旧文档可能有误
7. **`experiment/page.tsx` 是核心** — 修改时格外小心
8. **`CalibrationOrchestrator` 是校准唯一编排器** — 不要绕过它直接生成 phase
9. **`is_manipulated_feedback` 是反馈模式的权威标记** — 不要用 preset_feedback_direction 的 null 判断
10. **余额以服务端 DB 为准** — submit-response 忽略客户端 balance_before
