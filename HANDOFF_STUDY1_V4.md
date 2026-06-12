# HANDOFF_STUDY1_V4.md — Study 1 V4 实验系统交接文档

**文档创建日期**: 2026-06-12
**项目根目录**: `/Users/hczhao/Documents/ClaudeCode/ValueRepresentation_V2`

> 本文档基于对代码的全面扫描和 2026-06-12 的多项修复与功能更新编写。所有描述以当前代码实际实现为准。本文档取代旧的 `HANDOFF_STUDY1_V3.md`，为权威交接文件。

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
npm run dev      # 开发模式（Turbopack）
npm run build    # 生产构建
npm start        # 生产运行
```

### 1.4 本地访问地址

| 角色 | URL |
|---|---|
| 被试入口 | `http://localhost:3000/start` |
| 实验页面 | `http://localhost:3000/experiment?code=<编号>&session=<UUID>` |
| Admin 登录 | `http://localhost:3000/login` |
| Admin 后台 | `http://localhost:3000/admin` |
| 首页 | `http://localhost:3000/` |

### 1.5 凭据

| 用途 | 账号/密码 |
|---|---|
| Admin 登录 | `admin@study1.local` / `zxzx123456` |
| 被试入口密码 | `zxzx123456` |

均可在 `.env.local` 中通过环境变量覆盖。

### 1.6 DEV_TEST_MODE

`.env.local` 中取消注释 `NEXT_PUBLIC_DEV_TEST_MODE=true` → 大幅缩减试次。修改后**必须重启 dev server**。

---

## 2. 项目结构

### 2.1 技术栈

| 层级 | 技术 |
|---|---|
| 框架 | Next.js 16.2.6 (App Router, Turbopack) |
| 语言 | TypeScript 5 |
| 样式 | Tailwind CSS v4 |
| 数据库 | better-sqlite3 → `study1.db`（WAL 模式） |
| 认证 | JWT (jose) + bcryptjs，Cookie-based |
| 图片 | 80 张抽象图形 PNG，`storage/stimuli/` 和 `public/stimuli/` 双副本 |

### 2.2 顶层文件

```
ValueRepresentation_V2/
├── .env.local
├── package.json
├── study1.db / study1.db-shm / study1.db-wal
├── src/
│   ├── app/
│   │   ├── page.tsx                  # 着陆页
│   │   ├── layout.tsx                # 根布局
│   │   ├── start/page.tsx            # 被试入口
│   │   ├── experiment/page.tsx       # ★ 主阶段路由（~570 行）
│   │   ├── login/page.tsx            # Admin 登录
│   │   ├── complete/page.tsx         # 完成页
│   │   ├── admin/                    # 8 个后台页面
│   │   └── api/                      # ~21 个 API 路由
│   ├── components/                   # 17 个组件
│   ├── lib/                          # 核心业务逻辑
│   │   ├── stages.ts                 # ★ 阶段定义（权威来源）
│   │   ├── auth/index.ts
│   │   ├── db/index.ts               # ★ Schema + 迁移
│   │   ├── db/event-log.ts
│   │   ├── stimulus-seed.ts
│   │   ├── stimulus/dots.ts
│   │   ├── manipulation-check/
│   │   ├── stage-game/               # 资源任务逻辑
│   │   └── study1/                   # 校准/价值/正式选择逻辑
│   └── proxy.ts                      # Admin 路由保护
├── public/stimuli/                   # 图片副本（80 PNG）
├── storage/stimuli/                  # 图片原始（80 PNG）
├── scripts/
└── backups/
```

### 2.3 关键组件清单

| 组件 | 用途 | 新增/修改 |
|---|---|---|
| `BaselinePractice.tsx` | 通用练习包装器（3 种模式） | **修改** |
| `ImageChoicePractice.tsx` | 图像选择练习（F/J 键） | **新增** |
| `ValueAssignmentWithPractice.tsx` | 价值说明 + 练习 + 理解检测 | **新增** |
| `PracticeTrials.tsx` | 资源任务练习（点数+图形匹配） | 不变 |
| `StageGameTask.tsx` | 资源账户任务（余额/反馈突出显示） | **修改** |
| `PreferenceTask.tsx` | 视觉偏好校准 | 不变 |
| `ValidationTask.tsx` | 喜爱验证 | 不变 |
| `FormalChoiceTask.tsx` | 正式选择 | 不变 |
| `TaskSurvey.tsx` | MC 问卷 | 不变 |
| `PostExperimentCheck.tsx` | 实验后检测 | 不变 |
| `ExperimentControls.tsx` | 阶段推进按钮 | 不变 |
| `EntryPasswordGate.tsx` | 被试密码门禁 | 不变 |
| `ParticipantForm.tsx` | 被试注册表单 | 不变 |

---

## 3. 当前实验流程总览（11 个阶段）

### 阶段定义（`src/lib/stages.ts` — 权威来源）

```typescript
STAGES = [
  "baseline_questionnaire",       // 0. 视觉偏好任务操作说明与练习
  "study1_liking_ranking",        // 1. 视觉偏好任务 ★
  "study1_liking_validation",     // 2. 视觉偏好确认
  "relative_resource_feedback",   // 3. 任务信息
  "resource_task_practice",       // 4. 资源账户任务操作说明与练习
  "scarcity_manipulation",        // 5. 资源账户任务 ★
  "manipulation_check",           // 6. 任务体验问卷
  "study1_value_assignment",      // 7. 价值说明与图像选择练习
  "study1_formal_choice",         // 8. 图像选择任务 ★★
  "post_experiment_check",        // 9. 实验后问题
  "complete",                     // 10. 实验完成
]
```

**设计逻辑**: 先练习图像选择操作 (阶段 0) → 纯净测量喜好 (阶段 1-2) → 告知资源信息 (阶段 3) → 练习资源任务操作 (阶段 4) → 操纵资源感知 (阶段 5) → 操纵检验 (阶段 6) → 价值说明+练习 (阶段 7) → 核心 DV (阶段 8)。

### 阶段总览表

| # | Stage Key | 被试看到 | 组件 | 试次 |
|:--:|---|---|---|---|
| 0 | `baseline_questionnaire` | 任务操作说明 | `BaselinePractice` (image_preference) | 4 |
| 1 | `study1_liking_ranking` | 视觉偏好任务 | `PreferenceTask` | 110-165 |
| 2 | `study1_liking_validation` | 视觉偏好确认 | `ValidationTask` | 45 |
| 3 | `relative_resource_feedback` | 任务信息 | `ExperimentControls` + 文本 | — |
| 4 | `resource_task_practice` | 任务操作说明 | `BaselinePractice` (resource_task) | 6 |
| 5 | `scarcity_manipulation` | 资源账户任务 | `StageGameTask` | 90 |
| 6 | `manipulation_check` | 任务体验问卷 | `TaskSurvey` | 14 题 |
| 7 | `study1_value_assignment` | 任务操作说明 | `ValueAssignmentWithPractice` | 4+1 |
| 8 | `study1_formal_choice` | 图像选择任务 | `FormalChoiceTask` | 176 |
| 9 | `post_experiment_check` | 实验后问题 | `PostExperimentCheck` | 6 题 |
| 10 | `complete` | 实验完成 | 完成页 | — |

### 阶段推进机制

| 转换 | 推进方式 | 触发点 |
|---|---|---|
| 0→1 | `BaselinePractice` → advance API | `handleComplete()` → `window.location.href` |
| 1→2 | CalibrationOrchestrator.finalize() | 直接 SQL UPDATE |
| 2→3 | validation/submit API | 直接 SQL UPDATE |
| 3→4 | ExperimentControls "继续" → advance API | `window.location.href` |
| 4→5 | `BaselinePractice` → advance API | `handleComplete()` → `window.location.href` |
| 5→6 | `StageGameTask.finishStage` → advance API | `router.push` |
| 6→7 | manipulation-check/submit API | 直接 SQL UPDATE |
| 7→8 | ValueAssignmentWithPractice → comprehension-check API | `router.push` |
| 8→9 | formal-choice/submit API | 直接 SQL UPDATE |
| 9→10 | post-experiment-check API | 直接标记 session completed |

### 跨阶段一致性守卫

[page.tsx:81-94](src/app/experiment/page.tsx#L81-L94):
- 覆盖范围: `study1_liking_validation`, `study1_value_assignment`, `study1_formal_choice`
- 条件: `cross_set_orthogonalized` 为空 且 不在 `study1_liking_ranking`
- 行为: 自动回退到 `study1_liking_ranking`

---

## 4. 各阶段详细设计

### 阶段 0 — 任务操作说明：视觉偏好练习

**组件**: `BaselinePractice` (practiceType=`"image_preference"`) → `ImageChoicePractice` (showValues=`false`)

**内容**:
- 从 stimulus_pool 取 4 张样本图 → 组成 2 对，每对呈现 2 次（左右交换）= 4 次练习
- 操作说明：F 选左、J 选右，按主观喜好第一感觉选择
- 反馈："你选择了左侧/右侧图形"，600ms 后自动推进
- 完成后调用 advance API → `study1_liking_ranking`

**指导语**:
> 在接下来的任务中，你会多次看到左右两个抽象图形。
> 如果你更偏好左侧的图形，请按 F；如果你更偏好右侧的图形，请按 J。
> 本任务没有客观正确答案，请根据你的主观喜爱程度，按照第一感觉进行选择。

---

### 阶段 1 — 视觉偏好任务 ★

**组件**: `PreferenceTask`

**设计**: 同 V3 版本。25 张图 → 5 个隐藏 set × 5 张。Elo 评分系统 (K=32→24→20 递减) + CalibrationOrchestrator 编排。

| Phase | 名称 | 试次 | K |
|---|---|---|---|
| 4A | within_full_pair | 50 | 32 |
| 4B-R1 | within_adjacent_retest | 20 | 24 |
| 4B-R2 | within_adjacent_retest_r2 | 0-40 | 24 |
| 4C-a | cross_set_anchor_mid | 20 | 20 |
| 4C-b | cross_set_anchor_low/high | 20 | 20 |
| 4C-c | cross_set_adaptive | 0-15 | 20 |

- 刺激: 配额轮换 (4 模式), Set 构建 (硬约束 1/1/1/2 + 软优化 500 次搜索)
- 5 维稳定性验证 (Cycle/Retest/Kendall/Elo RMSE/Timeout) → Grade A/B/C
- 双轨排名: original (4A win-count) + final_stable (Elo)
- 不一致对: 4A(1次) + R1(1次) + R2(2次) = 4 次比较

---

### 阶段 2 — 视觉偏好确认

**组件**: `ValidationTask`

- 45 试次: 30 different_rank + 15 same_rank
- 一致性阈值: 85%
- 未通过 → calibration_attempt_index+1, 清空 12 张表, 保留 stimulus 采样, 回退到 liking_ranking

---

### 阶段 3 — 任务信息

**组件**: `ExperimentControls` + `FEEDBACK_TEXT`

- 稀缺组: 初始 10 点 / 充裕组: 初始 100 点, 通过阈值均为 10 点
- "继续"按钮 → advance API (带 `event_type="relative_resource_feedback_completed"`)

---

### 阶段 4 — 任务操作说明：资源任务练习

**组件**: `BaselinePractice` (practiceType=`"resource_task"`) → `PracticeTrials`

**内容**: 6 个练习试次
- 4 个点数比较 (35-45 midpoint, diff 1-3, 真实反馈 ✓/✗)
- 2 个图形匹配 (1 match, 1 non-match)
- 试次顺序: DC-DC-SM-DC-DC-SM
- F(选左) / J(选右), 600ms 反馈
- 完成后调用 advance API → `scarcity_manipulation`

**指导语**:
> 在后续任务中，你会多次看到左右两个选项。如果你选择左侧，请按 F；如果你选择右侧，请按 J。
> 请在看清题目后尽快作答。
> 接下来你将完成 6 次练习，包含点数比较和图形匹配两种题型。练习结果不会计入正式任务，也不影响你的资源点数。

---

### 阶段 5 — 资源账户任务 ★

**组件**: `StageGameTask`

**试次**: 90 个 (18 real_dot + 54 manipulated_dot + 18 shape_matching)
- `is_manipulated_feedback` 列区分真实/操纵
- 服务端权威余额

**稀缺组反馈**: balance>10:85%loss / 7-10:60%loss / 4-6:50/50 / <4:80%gain

**充裕组反馈**: 前期(<30)攀升 / 中期(≥30)温和波动 / 后期(≤20rem)稳定高位 / 末期(≤5rem)确保≥110

**UI 增强** (V4):
- **余额显示**: `text-2xl font-extrabold text-red-600 bg-red-50 rounded-lg border-2 border-red-300`
- **收益反馈**: 绿色卡片 `+N` 6xl 超粗体
- **损失反馈**: 红色卡片 `−N` 6xl 超粗体

**操作**: 注视点 500ms → 刺激 max 3000ms → 反馈 800ms → 空白 300ms

---

### 阶段 6 — 任务体验问卷

**组件**: `TaskSurvey`

- 14 题 Likert 7 点: 资源不足感(5) + 资源信心(2) + 压力(3) + 投入度(4)
- 提交后自动计算 4 构念均值并 advance

---

### 阶段 7 — 任务操作说明：价值说明与正式选择练习

**组件**: `ValueAssignmentWithPractice`

**两阶段设计**:

**Phase 1 — 价值说明 + 练习** (`ImageChoicePractice` showValues=`true`):
- 价值说明文字（⚠ 加粗）
- 4 次带价值点数的图像选择练习（2 对 × 左右交换）
- 模拟价值: 5/10/15/20/25 轮换显示
- F(选左) / J(选右)，反馈后 600ms 推进

**Phase 2 — 理解检测**:
- MCQ: "价值点数表示什么？" A(消耗) / B(收益✅) / C(好看)
- 正确 → advance to `study1_formal_choice`
- 错误 <2 次 → 提示重试
- 错误 =2 次 → flag + advance

**质量门禁** (page.tsx 渲染前检查):
- liking_map = 25 条
- validation_passed=1, needs_rerank=0
- 校准超时率 ≤ 20%
- 验证超时率 ≤ 20%

---

### 阶段 8 — 图像选择任务 ★★

**组件**: `FormalChoiceTask`

- 176 试次: liking_only(32) + value_only(32) + congruent(32) + **conflict(80)**
- 25 stims × 5 values → 300 唯一对池 → 分类采样
- 记录: chose_high_liking/value/congruent_advantage/high_liking_low_value/low_liking_high_value
- Conflict 优先唯一对, 不足时重复 (标记 repeated_pair_flag)

---

### 阶段 9 — 实验后问题

**组件**: `PostExperimentCheck`

- 6 题: 3 Likert + 1 单选 + 2 自由文本
- 关键词怀疑检测 → suspicion_flag
- 提交后直接标记 session completed

---

### 阶段 10 — 实验完成

静态感谢页。

---

## 5. 当前关键实验参数

### 5.1 组别配置

| 参数 | 稀缺组 | 充裕组 |
|---|---|---|
| initial_balance | 10 | 100 |
| pass_threshold | 10 | 10 |
| balance_min | 4 | 80 |
| balance_max | 12 | 135 |

### 5.2 资源账户任务

| 参数 | 全模式 | DEV_TEST_MODE |
|---|---|---|
| real_dot / manipulated_dot / shape_matching | 18 / 54 / 18 | 2 / 4 / 4 |
| 总试次 | 90 | ~10 |
| 操纵点数 | 30-50, diff 2-4 | 同 |
| 真实点数 | 15-25, diff 1-3 | 同 |
| 刺激呈现 | 3000ms | 同 |
| 余额显示 | 红色粗体高亮 | 同 |
| 反馈显示 | 绿色/红色 6xl 卡片 | 同 |

### 5.3 校准参数

| Phase | 试次 | K | 重复 |
|---|---|---|---|
| 4A within_full_pair | 50 | 32 | — |
| 4B-R1 | 20 | 24 | ×1 |
| 4B-R2 | 0-40 | 24 | ×2 |
| 4C-a/b/c | 40-55 | 20 | — |
| 总计 | 110-165 | | |

### 5.4 练习阶段参数

| 阶段 | 练习类型 | 试次 | 内容 |
|---|---|---|---|
| 0 | 图像偏好 | 4 | 2 对 × 左右交换, F/J 选偏好 |
| 4 | 资源任务 | 6 | 4 点数比较 + 2 图形匹配 |
| 7 | 正式选择 | 4 | 2 对 × 左右交换, 带价值点数 |

### 5.5 正式选择参数

| 类型 | 全模式 | DEV_TEST_MODE |
|---|---|---|
| liking_only / value_only / congruent | 各 32 | 各 4 |
| conflict | 80 | 8 |
| 总试次 | 176 | ~20 |
| 每 stim 最大出现 | 20 | 同 |

### 5.6 验证参数

| 参数 | 值 |
|---|---|
| different_rank / same_rank | 30 / 15 |
| 一致性阈值 | 0.85 |
| 不通过行为 | 清空校准数据, retry |

---

## 6. V4 与 V3 的关键变更（2026-06-12）

### 6.1 阶段结构变化

| 项目 | V3 | V4 |
|---|---|---|
| 阶段总数 | 10 | **11** |
| 新增阶段 | — | `resource_task_practice` (阶段 4) |
| 阶段 0 | 图像偏好练习 | 图像偏好练习 (不变) |
| 阶段 7 | 价值说明 + 理解检测 | 价值说明 + **正式选择练习** + 理解检测 |

### 6.2 练习分布在三个阶段

| 阶段 | V3 | V4 |
|---|---|---|
| 阶段 0 | 视觉偏好练习 | 视觉偏好练习 (ImageChoicePractice, showValues=false) |
| 阶段 4 | — | **新增** 资源任务练习 (PracticeTrials, 原阶段 0 内容) |
| 阶段 7 | 价值说明 + MCQ | 价值说明 + **正式选择练习** + MCQ |

### 6.3 资源任务 UI 增强

| 项目 | V3 | V4 |
|---|---|---|
| 余额显示 | `text-xl text-gray-700` | **`text-2xl font-extrabold text-red-600 bg-red-50 border-2 border-red-300`** |
| 收益反馈 | 普通灰色文字 `获得 N 点` | **绿色卡片 `+N` 6xl 超粗体** |
| 损失反馈 | 普通灰色文字 `失去 N 点` | **红色卡片 `−N` 6xl 超粗体** |

### 6.4 新增/修改文件

| 文件 | 变更 |
|---|---|
| `stages.ts` | +`resource_task_practice`, LABELS/TITLES 更新 |
| `BaselinePractice.tsx` | 重构支持 3 种模式 (resource_task / image_preference / formal_choice) |
| `ImageChoicePractice.tsx` | **新建** — 通用图像选择练习 (支持 showValues) |
| `ValueAssignmentWithPractice.tsx` | **新建** — 阶段 7 组合组件 (练习 + 理解检测) |
| `experiment/page.tsx` | 阶段 0 改为图像练习; +阶段 4 渲染; 阶段 7 改为组合组件 |
| `StageGameTask.tsx` | 余额和反馈 UI 突出显示 |

---

## 7. 数据记录逻辑

### 7.1 数据库总览

- SQLite, WAL 模式, `study1.db`
- 25+ 张表, Schema 在 `src/lib/db/index.ts`

### 7.2 关键数据区分

| 问题 | 答案 |
|---|---|
| 区分真实/操纵反馈？ | `stage_game_trials.is_manipulated_feedback` + `stage_game_responses.feedback_mode` |
| 区分组别？ | `experiment_sessions.group_label` |
| RT 记录？ | 所有阶段, `performance.now()` |
| 余额来源可靠？ | 服务端 DB 权威值 (不信任客户端) |
| 连续喜好度量？ | `stimulus_elo.elo_score` (1100-1900) |
| 原始排名保留？ | `original_within_rank` + `final_stable_rank` 双轨 |
| 练习/正式区分？ | 练习阶段不写入持久化数据; 正式阶段写对应表 |

### 7.3 Elo 相关表

| 表 | 用途 |
|---|---|
| `stimulus_elo` | Elo 分数 + volatility + comparisons_count |
| `within_set_stable` | 组内排名 (original + stable + elo) |
| `cross_set_orthogonalized` | 跨 set 排名 (shift direction/rate/confidence) |
| `calibration_stability` | 5 维稳定性 (Grade A/B/C) |
| `liking_map` | 最终喜好 (final_liking_rank = calibrated) |

---

## 8. 已知问题 / 潜在风险

### 8.1 阶段推进分散

- advance 在 advance API / orchestrator / 各 submit API 三处执行
- 跨阶段一致性守卫仅覆盖校准阶段
- comprehension-check API 直接操作 current_stage

### 8.2 质量门禁

- value_assignment 门禁不通过时只显示"请联系实验员"
- 全部验证超时 → consistency=null → validation_passed=0 → 卡住

### 8.3 图片

- `public/stimuli/` 是文件副本, 替换需双目录同步
- PreferenceTask 图片预加载 15s 超时
- ImageChoicePractice 图片不足 4 张时显示错误

### 8.4 数据字段

- `calibration_quality` 的 cross_set 字段始终 null (legacy)
- `liking_validation_quality.mean_rt_ms` 始终 NULL
- `block_manipulation_checks` 表闲置 (V2 连续版无 block)
- `experiment/page.tsx:86` calDone 计算但未使用 (dead code)

### 8.5 其他

- 缺少 error.tsx / loading.tsx
- 操纵反馈使用 Math.random() 而非种子随机（但反馈预计算存储在 trial 中）

---

## 9. 后续修改指南

### 阶段顺序

| 改什么 | 改哪里 |
|---|---|
| 阶段定义 | `src/lib/stages.ts` — `STAGES` 数组 |

### 练习内容

| 改什么 | 改哪里 |
|---|---|
| 图像偏好练习 (阶段 0) | `ImageChoicePractice.tsx` + `experiment/page.tsx` (practiceImages 查询) |
| 资源任务练习 (阶段 4) | `PracticeTrials.tsx` + `experiment/page.tsx` |
| 正式选择练习 (阶段 7) | `ValueAssignmentWithPractice.tsx` |

### 资源任务

| 改什么 | 改哪里 |
|---|---|
| 试次数量 | `stage-game/config.ts` |
| 反馈策略 | `stage-game/trial-generator.ts` — computeScarcity/AbundanceFeedback |
| UI 余额/反馈 | `StageGameTask.tsx` — 进度条 + FeedbackDisplay |

### 校准系统

| 改什么 | 改哪里 |
|---|---|
| Elo K 值 | `elo.ts` — K_VALUES |
| 4B 重复次数 | `calibration-generator.ts` — R1/R2_RETEST_REPETITIONS |
| Phase 编排 | `calibration-orchestrator.ts` |
| 稳定性阈值 | `stability-validation.ts` |

### 正式选择

| 改什么 | 改哪里 |
|---|---|
| 试次数量/类型 | `formal-trial-generator.ts` — FULL_TARGETS |
| 分类逻辑 | 同上 — classifyPair() |
| 响应编码 | `formal-response.ts` |

### 数据库

| 改什么 | 改哪里 |
|---|---|
| 加表/加列 | `db/index.ts` — initSchema() + ALTER TABLE migrations |

### 指导语/标题

| 改什么 | 改哪里 |
|---|---|
| 被试可见标题 | `stages.ts` — PARTICIPANT_STAGE_TITLES |
| 各阶段指导语 | `experiment/page.tsx` — 各 stage if 块中的 `<p>` |
| 练习指导语 | `ImageChoicePractice.tsx` / `PracticeTrials.tsx` |
| 组别反馈文本 | `stages.ts` — FEEDBACK_TEXT |

---

## 10. 脚本工具

```bash
npm run seed-stimuli          # 播种刺激池
npm run check:calibration     # 检查校准流程
npm run check:value-assignment # 检查价值分配
npm run check:formal-choice   # 检查正式选择
npm run check:dots-stagegame  # 检查点数生成
```

---

## 11. 重要提醒

1. **勿删 WAL 文件** — `study1.db-shm/wal` 是 SQLite 正常文件
2. **改 `.env.local` 后重启** — Next.js 不热重载环境变量
3. **public/stimuli/ 是副本** — 替换图片需双目录同步
4. **阶段顺序以 `stages.ts` 为准** — 11 个阶段, 含 resource_task_practice
5. **被试勿见内部标签** — scarcity/abundance/group/set/Elo/calibration 等词绝不能暴露
6. **`CalibrationOrchestrator` 是校准唯一编排器**
7. **`is_manipulated_feedback` 是反馈模式权威标记**
8. **余额以服务端 DB 为准** — submit-response 忽略客户端 balance_before
9. **练习阶段不写数据库** — 阶段 0/4/7 的练习试次不持久化
10. **`experiment/page.tsx` 是核心文件** — 修改时格外小心
