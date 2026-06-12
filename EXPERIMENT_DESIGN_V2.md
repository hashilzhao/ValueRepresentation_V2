# Study 1 — 实验程序设计文档 V2

> 最后更新: 2026-06-12
>
> 本文档反映当前代码实际实现。阶段顺序、校准逻辑、反馈机制均与 [stages.ts](src/lib/stages.ts) 和实际 API/组件代码一致。

---

## 一、技术架构

| 层 | 技术 |
|---|---|
| 框架 | Next.js 16.2.6 (App Router, Turbopack) |
| 语言 | TypeScript |
| 样式 | Tailwind CSS v4 |
| 数据库 | better-sqlite3 (本地文件 `study1.db`, WAL 模式) |
| 认证 | JWT (jose) + bcryptjs, cookie-based |
| 图片 | 80 张抽象图形 (A1-A20, B1-B20, C1-C20, D1-D20), 本地 `/storage/stimuli/` 目录 |

**Admin 凭据**: `admin@study1.local` / `zxzx123456`  
**被试入口密码**: `zxzx123456` (默认, 通过 `PARTICIPANT_ENTRY_PASSWORD` 环境变量控制)  
**DEV_TEST_MODE**: 通过 `.env.local` 中 `NEXT_PUBLIC_DEV_TEST_MODE=true` 控制, 大幅缩减试次数量

---

## 二、被试流程

### 2.1 入口与鉴权

```
首页 "/"  →  [被试入口 "/start"] 或 [主试登录 "/login"]
                  ↓
    EntryPasswordGate (密码验证 → JWT cookie "participant_access", 12h)
                  ↓
    ParticipantForm (被试信息登记)
                  ↓
    POST /api/participants/register → 自动跳转 "/experiment?code=&session="
```

**注册时服务端处理** ([register/route.ts](src/app/api/participants/register/route.ts)):
1. 验证 JWT cookie `participant_access`
2. 创建 `participants` 行 (自动 consent=1)
3. **平衡分组**: `assignGroup()` — 查询当前 `in_progress` 会话较少的组, 分配至 `scarcity` 或 `abundance`
4. 创建 `experiment_sessions` 行, 初始阶段 = `baseline_questionnaire`
5. 记录 `participant.registered` 事件

### 2.2 注册表单字段

| 字段 | 必填 | 格式 |
|---|---|---|
| 被试编号 | ✅ | 字母/数字/下划线/短横线 |
| 年龄 | ✅ | 18-99 |
| 性别 | ✅ | 男 / 女 / 其他 / 不愿透露 |
| 专业/研究领域 | ✅ | 文本 |
| 知情同意 | ✅ | checkbox |

### 2.3 续做机制

被试可直接通过 URL `/experiment?code=P001&session=<UUID>` 续做。实验页面服务端根据 `experiment_sessions.current_stage` 自动恢复到当前阶段。

---

## 三、实验阶段（共 10 个阶段）

阶段顺序由 [stages.ts](src/lib/stages.ts#L3-L14) 定义：

```typescript
STAGES = [
  "baseline_questionnaire",     // 0. 任务操作说明 (练习)
  "study1_liking_ranking",      // 1. 视觉偏好任务 ★
  "study1_liking_validation",   // 2. 视觉偏好确认
  "relative_resource_feedback",  // 3. 任务信息
  "scarcity_manipulation",      // 4. 资源账户任务 ★
  "manipulation_check",         // 5. 任务体验问卷
  "study1_value_assignment",    // 6. 价值点数说明
  "study1_formal_choice",       // 7. 图像选择任务 ★★
  "post_experiment_check",      // 8. 实验后问题
  "complete",                   // 9. 实验完成
]
```

**设计逻辑**: 先纯净测量喜好 (阶段 1-2, 无价值干扰) → 再操纵资源感知 (阶段 4) → 紧接操纵检验 (阶段 5) → 然后说明外部价值 (阶段 6) → 核心 DV: 喜好×价值冲突选择 (阶段 7)。资源任务诱发的心理状态紧邻核心因变量, 最大化操纵效应。

### 阶段推进机制

两种推进方式混合使用:

**方式 A — `ExperimentControls` "继续"按钮**:
```
客户端 → POST /api/sessions/advance → 服务端更新 current_stage → window.location.href 整页刷新
```
用于: `relative_resource_feedback` 和所有未特殊处理的阶段。

**方式 B — 组件/API 内部自动推进** (特殊阶段):

| 阶段 | 推进触发点 | 方式 |
|---|---|---|
| 0→1 | `PracticeTrials.onComplete` → advance API | window.location.href |
| 1→2 | `calibration/submit` → orchestrator.finalize() | 直接 SQL UPDATE |
| 2→3 | `validation/submit` (一致性通过或 max retry) | 直接 SQL UPDATE |
| 3→4 | `ExperimentControls` "继续" → advance API | window.location.href |
| 4→5 | `StageGameTask.finishStage` → advance API | router.push |
| 5→6 | `manipulation-check/submit` | 直接 SQL UPDATE |
| 6→7 | `comprehension-check` API | 直接 SQL UPDATE |
| 7→8 | `formal-choice/submit` API | 直接 SQL UPDATE |
| 8→9 | `post-experiment-check` API | 直接标记 session completed |

---

### 阶段 0：任务操作说明 (`baseline_questionnaire`)

**参与者标题**: 任务操作说明

**组件**: [BaselinePractice](src/components/BaselinePractice.tsx) → [PracticeTrials](src/components/PracticeTrials.tsx)

**指导语**: "请先完成练习，熟悉按键操作。准备好后请点击下方按钮开始。" ([page.tsx:490-495](src/app/experiment/page.tsx#L490-L495))

**内容**: 6 个练习试次, F/J 键操作熟悉
- 4 个点数比较 (35-45 midpoint per side, diff 1-3, 真实反馈 ✓/✗)
- 2 个图形匹配 (1 match, 1 non-match, 圆/方/三角/菱形)
- 试次顺序交叉: DC-DC-SM-DC-DC-SM

**操作**: F(选择左侧) / J(选择右侧)。600ms 反馈后自动推进。

**点分布参数**: `panelWidth:45, panelHeight:90, minDistance:7, padding:5`

---

### 阶段 1：视觉偏好任务 (`study1_liking_ranking`) ★

**参与者标题**: 视觉偏好任务

**组件**: [PreferenceTask](src/components/PreferenceTask.tsx)

**目的**: 通过成对比较推断被试对 25 张抽象图形的主观喜好排序, 建立 within-set 和 cross-set 的量化喜好度量。此时被试**不知道任何价值信息**, 喜好的测量是"干净"的基线。

**指导语** ([page.tsx:342-347](src/app/experiment/page.tsx#L342-L347)):
> 你将看到一系列由两个抽象图形组成的选择题。请根据你的主观喜爱程度，选择你更喜欢的图形。
> 本任务没有客观正确答案，但请认真作答，并尽量保持一致的判断标准。后续任务会根据你的选择来匹配图形，如果前后选择差异过大，系统可能需要你重新完成一轮简短确认。请按照第一感觉选择，不需要过度思考，也不需要刻意记住每一道题。

#### 刺激材料采样

**来源**: `stimulus_pool` 表 (usable=1, semantic_risk≠'high')  
**配额**: 4 种轮换模式 (按被试序号 mod 4, [sampling.ts:55-60](src/lib/study1/sampling.ts#L55-L60)):

| 模式 | A | B | C | D |
|:---:|:--:|:--:|:--:|:--:|
| 0 | 7 | 6 | 6 | 6 |
| 1 | 6 | 7 | 6 | 6 |
| 2 | 6 | 6 | 7 | 6 |
| 3 | 6 | 6 | 6 | 7 |

**Set 构建** ([sampling.ts](src/lib/study1/sampling.ts)):
- 5 个隐藏 set × 5 张图 = 25 张
- **硬约束**: 每个 set 包含全部 4 个视觉类别 (1/1/1/2 结构)
- **软优化**: 500 次随机分配, 优化 complexity/regularity/semantic_risk 的 set 内多样性
- 使用 session 级 seeded RNG (mulberry32) 保证可复现

#### 校准总流程

```
阶段 4A: within_full_pair          (50 trials)
    每 set 内 C(5,2)=10 对, 5×10=50, 随机顺序
    expected_choice=null (无先验排名)
    ↓ 完成 → inferWithinSetRanks (win-count)

阶段 4B-R1: within_adjacent_retest  (20 trials)
    每 set 4 相邻对 (1v2,2v3,3v4,4v5) ×1 次复测
    expected_choice="right" (高 rank 在右侧)
    ↓ Elo 更新 (K=24)
    ├─ 无不一致 → 跳过 R2, 构建 within_set_stable
    └─ 有不一致 → 4B-R2

阶段 4B-R2: within_adjacent_retest_r2 (条件触发, ≤40 trials)
    不一致对 + 受影响邻居 (传播), 每对 ×2 次重复
    不一致对: 4A(1次) + R1(1次) + R2(2次) = 共 4 次比较 → Elo
    ↓ Elo 更新 (K=24)
    ↓ 构建 within_set_stable → 生成 4C-a

构建 within_set_stable 表
    original_within_rank ← 4A win-count 排名 (审计追溯)
    stable_within_rank   ← Elo (4A+4B) 调整后排名
    final_stable_rank    ← = stable_within_rank (别名)
    elo_score            ← Elo 连续分数
    adjacent_consistency ← 0.0-1.0 (一致 retest 比例)
    ambiguity_flag       ← consistency < 0.5 → 1
    ↓
阶段 4C-a: cross_set_anchor_mid    (20 trials)
    rank-3 跨 set 锚定, C(5,2)=10 对 ×2 次重复
    expected_choice="none" (跨 set 无先验)
    ↓
阶段 4C-b: cross_set_anchor_low + cross_set_anchor_high (20 trials)
    rank-1 跨 set: C(5,2)=10 trials
    rank-5 跨 set: C(5,2)=10 trials
    ↓
[异常检测] → 如有异常 → 4C-c: cross_set_adaptive (0-15 trials)
    4 种检测器:
    - Test-Retest Inconsistent: 4C-a 两次重复选择不同
    - Cross-Level Contradiction: 不同 rank 水平的 set 排序差 ≥2 位
    - High Elo Uncertainty: volatility > 120
    - Low Kendall's W: W < 0.6
    ↓
finalize():
    ├─ saveEloScores → stimulus_elo (25 条, 含 volatility + comparisons)
    ├─ buildCrossSetOrthogonalizedTable → cross_set_orthogonalized (25 条)
    │    original_liking_rank  ← within_set_stable
    │    calibrated_liking_rank ← 综合 4A+4B+4C 的 Elo 排名
    │    shift_direction/rate/confidence ← 跨 set 校准后的偏移量化
    ├─ syncLikingMapFromElo → liking_map (25 条, final_liking_rank = calibrated)
    ├─ computeStability → 5 维稳定性验证 → Grade A/B/C
    └─ advance stage → study1_liking_validation
```

#### Elo 评分系统

**核心模块**: [elo.ts](src/lib/study1/elo.ts)

| 参数 | 4A | 4B-R1 | 4B-R2 | 4C 各阶段 |
|------|:--:|:-----:|:-----:|:--------:|
| K 值 | 32 | 24 | 24 | 20 |
| 初始分 | 1500 | 继承 | 继承 | 继承 |
| 范围 | [1100, 1900] | ← | ← | ← |

**顺序处理** (`computeAllPhaseElo`): 按阶段顺序依次更新同一 Elo 池 — 后处理阶段的 trial 覆盖修正前面结果。

**波动率衰减**: `volatility_new = max(50, 200 / sqrt(1 + comparisons))`

**K 值递减含义**: 4A 全配对"粗排" (高响应度) → 4B 复测"精调" (中等) → 4C 跨 set"微调" (低响应度)。

#### 5 维稳定性验证

| 维度 | 数据来源 | 理想值 | 权重 |
|---|---|---|---|
| Cycle Consistency | 4A 组内 3-cycle 比例 | ≤10% | 20% |
| Test-Retest Agreement | 4C-a 重复对一致率 | ≥90% | 25% |
| Cross-Level Kendall's W | rank-1/3/5 set 排序 | ≥0.9 | 25% |
| Elo Model RMSE | 全局 Elo 回测 | ≤0.35 | 20% |
| Timeout Rate | 全部校准试次 | ≤20% | 10% |

→ 综合分 ≥0.80 = **A** / ≥0.55 = **B** / <0.55 = **C**

#### 操作方式

- 注视点 `+` 500ms → 两张图形并排 → **F**选左 / **J**选右 / 鼠标点击 → 空白 300ms
- 超时 180s (覆盖思考时间)
- 图片预加载 (15s 超时保护)

#### 典型试次数

| 子阶段 | 试次 |
|---|---|
| 4A | 50 |
| 4B-R1 | 20 |
| 4B-R2 | 0-40 |
| 4C-a | 20 |
| 4C-b | 20 |
| 4C-c | 0-15 |
| **合计** | **110-165** |

---

### 阶段 2：视觉偏好确认 (`study1_liking_validation`)

**参与者标题**: 视觉偏好确认

**组件**: [ValidationTask](src/components/ValidationTask.tsx)

**内容**: 45 个验证试次, 使用校准后的 `calibrated_liking_rank` 生成:

| 类型 | 数量 | 设计 | expected_choice |
|---|---|---|---|
| different_rank | 30 | 不同 rank 间比较 | 高 rank 侧 |
| same_rank | 15 | 相同 rank 间比较 | "none" |

**different_rank 配对方案**: [1v3, 2v4, 3v5, 1v4, 2v5, 1v5] — 跨越不同等级差距。

**质量控制** ([validation/submit/route.ts](src/app/api/study1/validation/submit/route.ts)):

**一致性阈值**: 85%

- **通过** (≥85%): advance to `relative_resource_feedback`
- **未通过** (<85%): **触发校准全量重试**:
  - `calibration_attempt_index += 1`
  - 清空所有校准/验证/排名相关表 (12 张)
  - **保留** `subject_selected_stimuli` 和 `subject_set_assignment` (原始 25 张图不变)
  - reset stage → `study1_liking_ranking` (重新从 4A 开始)

---

### 阶段 3：任务信息 (`relative_resource_feedback`)

**参与者标题**: 任务信息

**渲染**: `FEEDBACK_TEXT[group]` 纯文本 + `ExperimentControls` "继续"按钮

**上下文**: 前面已完成喜好校准和验证。FEEDBACK_TEXT 以"上一阶段已完成。接下来，你将进入正式的资源账户任务。"开头。

| 稀缺组 ([stages.ts:63-64](src/lib/stages.ts#L63-L64)) | 充裕组 ([stages.ts:65-66](src/lib/stages.ts#L65-L66)) |
|---|---|
| 初始余额 **10 点** | 初始余额 **100 点** |
| 通过阈值 10 点 | 通过阈值 10 点 |
| "尽量保持账户点数达到后续任务要求" | "拥有较充足的账户空间，但仍需要认真完成任务" |

**操作**: "继续"按钮 → `POST /api/sessions/advance` (带 `event_type="relative_resource_feedback_completed"`)

---

### 阶段 4：资源账户任务 (`scarcity_manipulation`) ★

**参与者标题**: 资源账户任务

**组件**: [StageGameTask](src/components/StageGameTask.tsx)

**目的**: 通过预设操纵反馈, 诱发被试的资源稀缺感或充裕感。

#### 试次构成 (90 个)

| 类型 | 数量 | 参数 | 反馈模式 | `is_manipulated_feedback` |
|---|---|---|---|---|
| 真实点比较 | 18 | 15-25 点/侧, diff 1-3 | **真实** (±2) | 0 |
| 操纵点比较 | 54 | 30-50 点/侧, diff 2-4 | **预设操纵** | 1 |
| 图形匹配 | 18 | 圆/方/三角/菱形, 50% match | **真实** (±2) | 0 |

**试次顺序约束**: 图形匹配不邻接 (间隔 ≥3), 随机分布。由 `generateConstrainedTrialOrder()` 生成。

#### 操纵反馈逻辑 — 稀缺组 ([trial-generator.ts:157-183](src/lib/stage-game/trial-generator.ts#L157-L183))

```
余额 > 10:   85% loss (1-3 点), 15% gain (1 点)   → 拉回阈值下
余额 7-10:   60% loss (1-2 点), 40% gain (1-2 点) → 温和紧张
余额 4-6:    50% gain (1-2 点), 50% loss (1-2 点) → 维持紧张
余额 < 4:    80% gain (1-3 点), 20% loss (1 点)   → 防止崩盘

预期体验: 余额 4-12 波动, 经常低于 10
```

#### 操纵反馈逻辑 — 充裕组 ([trial-generator.ts:185-289](src/lib/stage-game/trial-generator.ts#L185-L289))

```
前期 (trialIndex < 30):
  100-110: 60% gain, 25% loss → 稳步攀升
  <100: 80% gain (1-3) → 恢复
  >118: 60% loss → 防过快攀升

中期 (trialIndex ≥ 30, remaining > 20):
  105-120: 45% gain, 40% loss → 温和波动
  120-128: 35% gain, 45% loss → 偏下行
  >128: 25% gain, 55% loss → 拉回

后期 (remaining ≤ 20):
  110-125: 温和浮动, 微偏 gain
  125+: 下行偏压

末期 (remaining ≤ 5):
  确保 ≥110, 微偏 gain

预期体验: 余额 100-130 波动, 始终充裕
```

#### 反馈生成与处理

**预计算**: 操纵点比较的反馈在 trial 生成时, 从初始余额出发, 逐 trial 模拟余额变化并存储在 `stage_game_trials.preset_feedback_direction/points`。

**响应时** (`POST /api/stage-game/submit-response`):
1. 读取 `stage_game_trials.is_manipulated_feedback` → 区分真实/操纵
2. 读取 `experiment_sessions.resource_balance` → **服务端权威余额** (不信任客户端)
3. `is_manipulated_feedback=0`: accuracy-based (±2)
4. `is_manipulated_feedback=1`: 使用预设值; timeout → loss 2
5. `saveStageGameResponse` → 保存 + 更新余额

#### 操作方式

- 注视点 `+` 500ms → 刺激 max 3000ms → 反馈 800ms → 空白 300ms
- 点数比较: **F**(左侧更多) / **J**(右侧更多)
- 图形匹配: **F**(匹配/是) / **J**(不匹配/否)
- 进度显示: "试次 X / {totalTrials}", "当前账户: Y 点"
- 试次数量动态显示 (从 API 返回的 `trials.length` 获取)

#### 点分布参数

- 面板: `panelWidth:90, panelHeight:90, minDistance:5, padding:8`
- Rejection sampling + 渐进放松, 最终回退确定性网格

---

### 阶段 5：任务体验问卷 (`manipulation_check`)

**参与者标题**: 任务体验问卷

**组件**: [TaskSurvey](src/components/TaskSurvey.tsx)

**说明**: "请根据你在上一项任务中的真实感受回答以下问题。"

**内容**: 14 题 Likert 7 点量表 (1=非常不同意, 7=非常同意), 测量 4 个构念:

| 构念 | 题号 | 内部名称 |
|---|---|---|
| 资源不足感 | 1-5 | `resource_insufficiency` |
| 资源信心 | 6-7 | `resource_confidence` |
| 压力/负性情绪 | 8-10 | `stress_negative_affect` |
| 任务投入度 | 11-14 | `task_engagement` |

**完成**: `POST /api/manipulation-check/submit` → transaction 写入 + 计算 4 构念均值 + advance → `study1_value_assignment`

---

### 阶段 6：价值点数说明 (`study1_value_assignment`)

**参与者标题**: 价值点数说明

**组件**: [ValueInstructionTask](src/components/ValueInstructionTask.tsx)

#### 质量门 ([page.tsx:213-249](src/app/experiment/page.tsx#L213-L249))

在页面渲染前检查 4 项:
- `liking_map = 25` 条 — 校准数据完整
- `validation_passed=1` 且 `needs_rerank=0` — 验证通过
- 校准超时率 ≤ 20%
- 验证超时率 ≤ 20%

任一未通过 → "请联系实验员"

#### 价值分配 ([value-assignment.ts](src/lib/study1/value-assignment.ts))

- 5 个 set 各分配唯一价值 {5, 10, 15, 20, 25}
- 使用轮转拉丁方: `patternIndex = COUNT(value_assignment)`, set_i 获得 `VALUES[(pattern + i) % 5]`
- 同一 set 内 5 张图获得相同价值
- `buildStimulusValueMap()`: liking_map × value → `stimulus_value_map` (25 行, 含 elo_score)

#### 理解检测

- MCQ: "图形旁边的价值点数表示什么？"
  - A. 选择这个图形需要消耗的资源点数 ❌
  - B. 这个图形在任务中的兑换价值（收益价值） ✅
  - C. 这个图形有多好看 ❌
- 正确 → advance to `study1_formal_choice`
- 错误且 <2 次 → 提示, 重试
- 错误且 =2 次 → flag + advance (不阻塞)

**指导语**: ⚠ 加大加粗 (`text-lg font-bold text-gray-900`)

---

### 阶段 7：图像选择任务 (`study1_formal_choice`) ★★

**参与者标题**: 图像选择任务

**组件**: [FormalChoiceTask](src/components/FormalChoiceTask.tsx)

**目的**: 核心因变量 — 在喜好和价值两个维度上做综合选择。

**指导语** ([page.tsx:170-175](src/app/experiment/page.tsx#L170-L175)):
> 接下来你会看到两张抽象图形。每张图形旁边会显示一个价值点数。价值点数表示该图形在任务中的兑换价值（收益价值），不是价格，选择图形不会消耗你的资源点数。
> ⚠ 请综合你对图形的喜爱程度和图形旁边显示的价值点数，选择你更愿意获得的一个。请认真作答，保持一致的判断标准。

#### 试次生成

**来源**: `cross_set_orthogonalized` (25 stims, calibrated_liking_rank 1-5) × `value_assignment` (5 个 value)

**分类** (`classifyPair`, [formal-trial-generator.ts:269-277](src/lib/study1/formal-trial-generator.ts#L269-L277)):

```
dLiking = right.liking - left.liking
dValue  = right.value - left.value

dValue=0, dLiking≠0 → liking_only
dLiking=0, dValue≠0 → value_only
dLiking × dValue > 0 → congruent (喜好方向 = 价值方向)
否则                 → conflict  (喜好方向 ≠ 价值方向)
```

**采样** ([formal-trial-generator.ts](src/lib/study1/formal-trial-generator.ts)):

| 类型 | 潜在唯一对 | 目标 | 采样率 |
|---|---|---|---|
| liking_only | 50 | 32 | 64% |
| value_only | 50 | 32 | 64% |
| congruent | 100 | 32 | 32% |
| **conflict** | **100** | **80** | **80%** |
| **合计** | **300** | **176** | 59% |

**采样策略**:
1. liking_only / value_only / congruent: 随机采样, MAX_STIM_APPEARANCES=20 上限
2. Conflict Round 1: 取唯一对 (尊重上限)
3. Conflict Round 2: 不足时允许有限重复 (标记 `repeated_pair_flag=1`, `repeat_index`, `original_pair_key`)
4. 位置平衡: 每种 type 内左右交替

#### 记录的因变量

`saveChoiceResponse` ([formal-response.ts](src/lib/study1/formal-response.ts)) 计算:

| 字段 | 含义 |
|---|---|
| `chose_high_liking` | 选了喜好更高的 (通用) |
| `chose_high_value` | 选了价值更高的 (通用) |
| `chose_congruent_advantage` | congruent 中选了双重优势的 |
| `chose_high_liking_low_value` | conflict 中选了高喜好低价值 |
| `chose_low_liking_high_value` | conflict 中选了低喜好高价值 |
| `rt_ms` | 反应时 |
| `timeout` | 超时 |

#### 核心分析框架: 5×5 正交矩阵

```
          5点    10点   15点   20点   25点
Like 5  [stim]  [stim]  [stim]  [stim]  [stim]  ← 最喜欢
Like 4  [stim]  [stim]  [stim]  [stim]  [stim]
Like 3  [stim]  [stim]  [stim]  [stim]  [stim]
Like 2  [stim]  [stim]  [stim]  [stim]  [stim]
Like 1  [stim]  [stim]  [stim]  [stim]  [stim]  ← 最不喜欢
```

行 = calibrated_liking_rank (1-5), 列 = external_value (5-25)。每格对应唯一的 stimulus。

#### 操作方式

- 与阶段 1 相同 (注视点 + F左/J右 + 鼠标点击)
- 每张图下方显示 **"价值点数: XX"** (`text-xl font-bold`)
- 超时 180s

---

### 阶段 8：实验后问题 (`post_experiment_check`)

**参与者标题**: 实验后问题

**组件**: [PostExperimentCheck](src/components/PostExperimentCheck.tsx)

**内容**: 6 道题 (怀疑度/欺骗检测):

| 题号 | 类型 | 问题 |
|:---:|------|------|
| 1 | Likert 7pt | 资源点数反馈在多大程度上反映了真实任务表现？ |
| 2 | Likert 7pt | 是否怀疑资源点数变化是程序预设的？ |
| 3 | Likert 7pt | 资源任务是否影响了你后面图像选择任务中的判断？ |
| 4 | 自由文本 | 本研究真正想考察什么？ |
| 5 | 单选 (5选项) | 在图像选择任务中, 你主要根据什么做选择？ |
| 6 | 自由文本 | 实验过程中有没有发现奇怪或不真实的地方？ |

**怀疑检测**: 关键词匹配 (预设/假/操纵/scarcity/abundance 等) 或评分 ≥6 → `suspicion_flag=1`

**完成**: `POST /api/study1/post-experiment-check` → **直接标记 session 为 completed** → `router.push("/complete")`

---

### 阶段 9：实验完成 (`complete`)

**参与者标题**: 实验完成

感谢页面: "感谢你的参与！你可以关闭本页面了。" + 返回首页链接。

---

## 四、整体实验逻辑

```
阶段0 练习 → 熟悉按键操作
    ↓
阶段1 喜好校准 ★ → 成对比较推断主观喜好
    │              (4A→4B→4C→Elo, 110-165 试次)
    │              此时无价值信息干扰, 纯喜好测量
    ↓
阶段2 喜好验证 → 确认排名一致性 (45 试次, 85% 阈值)
    │              未通过 → 全量重试 (保留原始 stimulus 采样)
    ↓
阶段3 资源信息 → 告知初始余额和通过要求
    ↓
阶段4 资源任务 ★ → 操纵资源感知 (稀缺/充裕, 90 试次)
    │              预设操纵反馈
    ↓
阶段5 MC问卷 → 测量操纵效果 (14 题 Likert, 4 构念)
    ↓
阶段6 价值说明 → 分配外部价值 + 理解检测 (拉丁方轮转)
    ↓
阶段7 正式选择 ★★ → 核心DV: 喜好×价值综合选择
    │               (176 试次, 4 类型, conflict 80%)
    ↓
阶段8 实验后 → 怀疑度检测
    ↓
阶段9 完成
```

**设计逻辑**:
1. **喜好先行**: 在资源操纵之前测量喜好, 确保喜好排名不受资源状态污染
2. **操纵紧邻**: 资源任务 (4) → MC (5) → 价值说明 (6) → 正式选择 (7), 操纵效应最大化
3. **Conflict 超额**: 80/100 conflict 对 = 80% 采样率, 核心假设检验有足够统计效力
4. **多维度验证**: Elo 连续性 + 5 维稳定性 + liking validation 85% 阈值 + suspicion 检测

---

## 五、组间操纵

| | 稀缺组 (scarcity) | 充裕组 (abundance) |
|---|---|---|
| 初始余额 | 10 点 | 100 点 |
| 余额范围 | 4-12 | 80-135 |
| 通过阈值 | 10 点 | 10 点 |
| 阈值压力 | 余额经常接近/低于阈值 | 余额始终远高于阈值 |
| 预期心理状态 | 持续紧张, 资源焦虑 | 感到安全, 富足 |
| 假设偏好 | 更看重价值 (补偿性) | 更看重喜好 (享乐性) |

**分组方式**: `assignGroup()` — 查询当前 in_progress 会话较少的组, 保持组间平衡。

---

## 六、跨阶段一致性守卫

[page.tsx:81-94](src/app/experiment/page.tsx#L81-L94):

```typescript
const calibrationStages = [
  "study1_liking_ranking", "study1_liking_validation",
  "study1_value_assignment", "study1_formal_choice"
];

// 如果处于校准后期但 cross_set_orthogonalized 为空 → 回退
if (calibrationStages.includes(stage) &&
    stage !== "study1_liking_ranking" &&
    hasOrtho === 0) {
  db.prepare("UPDATE ... SET current_stage = 'study1_liking_ranking'").run(...)
}
```

**覆盖范围**: 喜好验证、价值分配、正式选择 — 任何阶段如果校准数据不完整 (cross_set_orthogonalized 不存在), 自动回退到喜好校准起点。

---

## 七、Admin 管理页面

| 路由 | 功能 |
|---|---|
| `/admin` | Dashboard: 被试数、组分布、MC 组间汇总 |
| `/admin/participants` | 被试列表 |
| `/admin/sessions` | Session 列表: 进度/准确率/RT/MC均值, 可删除 |
| `/admin/study1` | 刺激分配概览 |
| `/admin/study1/[sessionId]` | **核心详情页** (8 个 Section) |
| `/admin/results` | 群体指标 + 逐被试指标 + CSV 导出 |
| `/admin/stimuli` | 刺激池管理: 上传/编辑/版本 |
| `/admin/audit` | 完整性审计 checklist |

### Session 详情页 8 个 Section

1. **Session Overview** — 被试信息 + 状态
2. **任务材料状态** — 刺激采样/分配诊断
3. **Resource Task** — 资源任务试次数据
4. **组内稳定建模表** (5×5) — 每 set 内每 rank 的 stimulus (含 elo_score)
5. **组间正交化表** (5×5) — 跨 set 校准排名 (含 shift direction/rate/confidence)
6. **🎯 正交喜好-价值矩阵** (5×5) — **最终输出** (含 Elo 分数/volatility/comparisons)
7. **Liking Calibration & Validation** — 校准/验证试次详情
8. **Formal Choice** — 正式选择试次数据 (含 delta_elo)

### CSV 导出 (3 种 + 字典)

| 类型 | 内容 |
|---|---|
| `choice_responses` | 每个正式选择试次的应答 (含 HL/HV/conflict 指标, pair_key, repeated_flag) |
| `participant_summary` | 每个被试的汇总指标 (含 tradeoff_index, 各组内选择率) |
| `stimulus_value_map` | 每个被试的 25 个 stimulus 映射 (含 elo, elo_live, elo_sigma, elo_n) |
| `data_dictionary` | 字段说明词典 |

---

## 八、数据库核心表

| 表 | 用途 |
|---|---|
| `participants` | 被试信息 (编号/年龄/性别/专业) |
| `experiment_sessions` | 会话 (组别/阶段/状态/资源余额/随机种子/校准尝试次数) |
| `event_logs` | 不可变事件审计日志 |
| `stimulus_pool` | 80 张刺激素材 (含 usable/version/category/complexity/regularity 等元数据) |
| `stimulus_versions` | 刺激图片版本管理 |
| `subject_selected_stimuli` | 每 session 抽中的 25 张图 |
| `subject_set_assignment` | 5 个隐藏 set × 5 张图 (含 category 约束) |
| `calibration_trials` | 所有校准试次 (phase: 4A / 4B-R1 / 4B-R2 / 4C-a / 4C-b / 4C-c) |
| `calibration_responses` | 校准选择记录 (含 chosen_stim_id / rt / timeout / consistent) |
| `stimulus_elo` | Elo 连续喜好分数 (含 elo_volatility, comparisons_count) |
| `within_set_stable` | 组内稳定排名表 (含 original/stable/final rank + elo_score) |
| `cross_set_orthogonalized` | 跨 set 正交排名表 (含 shift_direction/rate/confidence + elo_score) |
| `calibration_stability` | 5 维稳定性报告 (Grade A/B/C) |
| `liking_map` | 最终喜好排名字典 (final_liking_rank = calibrated, 含 elo_score) |
| `liking_validation_trials` | 喜好验证试次 (different_rank + same_rank) |
| `liking_validation_responses` | 喜好验证应答 |
| `liking_validation_quality` | 喜好验证质量 (consistency_rate, needs_rerank) |
| `stage_game_trials` | 资源任务试次 (含 is_manipulated_feedback, preset_feedback) |
| `stage_game_responses` | 资源任务应答 (含 feedback_mode, dot_count_left/right, correct_side) |
| `manipulation_check_responses` | MC 问卷 14 题 |
| `manipulation_check_summary` | MC 4 构念均值 |
| `value_assignment` | Set→Value 分配 (含 assignment_pattern_index) |
| `stimulus_value_map` | 喜好×价值正交映射 (含 elo_score) |
| `value_comprehension_checks` | 价值理解检测记录 |
| `formal_trials` | 正式选择试次 (含 delta_liking/value/elo, 4 类冲突标记) |
| `choice_responses` | 正式选择记录 (含 chose_high_liking/value/conflict 指标) |
| `post_experiment_checks` | 实验后检测 (含 suspicion_flag) |
| `calibration_quality` | (legacy) 校准质量 |

---

## 九、关键 API 路由

### 参与者流

| 路由 | 方法 | 功能 |
|---|---|---|
| `/api/participants/verify-entry-password` | POST | 验证被试入口密码, 签发 JWT cookie |
| `/api/participants/register` | POST | 创建被试+会话, 平衡分组 |

### 会话推进

| 路由 | 方法 | 功能 |
|---|---|---|
| `/api/sessions/advance` | POST | 推进到下一阶段, 记录事件日志 |

### 资源任务

| 路由 | 方法 | 功能 |
|---|---|---|
| `/api/stage-game/init` | POST | 幂等生成 90 个资源任务试次 |
| `/api/stage-game/submit-response` | POST | 保存试次响应, 服务端计算反馈和余额 |
| `/api/stage-game/block-check` | POST | (legacy) Block 级 MC 检查 |

### 喜好校准

| 路由 | 方法 | 功能 |
|---|---|---|
| `/api/study1/init-assignment` | POST | 初始化刺激采样 (幂等) |
| `/api/study1/calibration/init` | POST | 幂等初始化校准阶段 (orchestrator) |
| `/api/study1/calibration/submit` | POST | 提交校准响应, 触发阶段转换 |

### 喜好验证

| 路由 | 方法 | 功能 |
|---|---|---|
| `/api/study1/validation/init` | POST | 生成 45 个验证试次 |
| `/api/study1/validation/submit` | POST | 提交验证响应, 计算质量, 决定 retry/advance |

### 价值与正式选择

| 路由 | 方法 | 功能 |
|---|---|---|
| `/api/study1/comprehension-check` | POST | 价值理解检测 |
| `/api/study1/formal-trials/init` | POST | 生成正式选择试次 (幂等) |
| `/api/study1/formal-choice/submit` | POST | 提交正式选择响应 |
| `/api/study1/post-experiment-check` | POST | 提交实验后问卷 |

### 其他

| 路由 | 方法 | 功能 |
|---|---|---|
| `/api/manipulation-check/submit` | POST | 提交 MC 问卷 + 计算构念均值 |
| `/api/auth/login` | POST | 主试登录 |
| `/api/auth/logout` | POST | 主试登出 |
| `/api/admin/export` | GET | CSV 导出 (3 种 + 字典) |
| `/api/admin/delete-participant` | POST | 删除被试 |
| `/api/admin/delete-session` | POST | 删除会话 |
| `/api/admin/stimuli/upload` | POST | 上传刺激图片 |
| `/api/admin/stimuli/update` | POST | 更新刺激元数据 |

---

## 十、关键设计决策

1. **喜好测量先于资源操纵** — 喜好排名不受资源状态污染, 作为干净的基线
2. **Elo 替代胜场数** — 连续度量, 解决平局, 支持跨 set 可比性, 提供 uncertainty
3. **4B 分 Round 设计** — R1 单次复测发现不稳定, R2 双次复测充分验证, 不一致对共 4 次比较 (4A+R1+R2×2)
4. **K 值递减** (32→24→20) — 后期精细调整, 不过度反应个别 trial
5. **双轨排名保留** (original + final_stable) — 审计追溯, 量化 shift
6. **4C 三层锚定** (rank 1/3/5) — 完整覆盖跨 set 对齐
7. **5 维稳定性** — 多维度连续指标综合评定, 不二值判断
8. **Conflict 超额采样** (80/100=80%) — 核心因变量需要足够统计效力
9. **资源任务→正式选择紧邻** — 操纵效应不衰减 (仅隔 MC 问卷)
10. **理解检测不阻塞** — 确保被试理解价值含义, 但不过滤数据
11. **被试可续做** — URL 参数直接恢复当前阶段
12. **`is_manipulated_feedback` 列** — 替代脆弱的 null 检查, 可靠区分真实/操纵反馈
13. **服务端余额权威** — submit-response 从 DB 读取 balance, 不信任客户端
14. **`calibration_attempt_index`** — 隔离每次重试, 保留完整审计链
15. **重试保留 stimulus 采样** — validation retry 不清空 `subject_set_assignment`, 确保同一被试每次尝试使用相同的 25 张图

---

## 十一、文件索引

### 核心库 (`src/lib/`)

| 文件 | 职责 |
|---|---|
| `stages.ts` | 阶段定义/顺序/标题/反馈文字 |
| `db/index.ts` | 数据库初始化/表创建/迁移 |
| `db/event-log.ts` | 事件日志写入 |
| `auth/index.ts` | JWT 认证 (主试) |
| `stage-game/config.ts` | 资源任务参数 (试次数/余额/难度) |
| `stage-game/types.ts` | 资源任务类型定义 |
| `stage-game/trial-generator.ts` | 资源任务试次生成 + 操纵反馈预计算 |
| `stage-game/response.ts` | 资源任务响应保存 |
| `stage-game/progress.ts` | 资源任务进度计算 |
| `stimulus/dots.ts` | 点数位置生成算法 |
| `stimulus-seed.ts` | 刺激池初始化 (扫描 storage/stimuli/) |
| `study1/sampling.ts` | 25 张刺激采样 + set 构建 (硬约束+软优化) |
| `study1/calibration-types.ts` | 校准相关类型定义 |
| `study1/calibration-generator.ts` | 校准试次生成 (4A/4B/4C) + 排名推断 |
| `study1/calibration-scoring.ts` | 校准响应保存 + 表构建 |
| `study1/calibration-orchestrator.ts` | 校准阶段编排器 (phase 生成+转换) |
| `study1/elo.ts` | Elo 评分系统 |
| `study1/anomaly-detection.ts` | 4C 异常检测 (4 种检测器) |
| `study1/stability-validation.ts` | 5 维稳定性验证 |
| `study1/value-assignment.ts` | 价值分配 + stimulus_value_map |
| `study1/formal-trial-generator.ts` | 正式选择试次生成 + 分类 + 采样 |
| `study1/formal-response.ts` | 正式选择响应保存 + DV 计算 |
| `manipulation-check/items.ts` | MC 问卷题目 (14 题) |
| `manipulation-check/scoring.ts` | MC 评分 |

### 核心组件 (`src/components/`)

| 组件 | 对应阶段 |
|---|---|
| `ExperimentControls.tsx` | 通用阶段推进按钮 |
| `BaselinePractice.tsx` / `PracticeTrials.tsx` | 阶段 0 |
| `PreferenceTask.tsx` | 阶段 1 (喜好校准) |
| `ValidationTask.tsx` | 阶段 2 (喜好验证) |
| `StageGameTask.tsx` | 阶段 4 (资源任务) |
| `TaskSurvey.tsx` | 阶段 5 (MC 问卷) |
| `ValueInstructionTask.tsx` | 阶段 6 (价值说明) |
| `FormalChoiceTask.tsx` | 阶段 7 (正式选择) |
| `PostExperimentCheck.tsx` | 阶段 8 (实验后) |
| `EntryPasswordGate.tsx` | 被试入口密码门 |
| `ParticipantForm.tsx` | 被试注册表单 |
| `AdminNav.tsx` | 主试导航栏 |
| `StatCard.tsx` | 统计卡片 |
| `DeleteButton.tsx` | 删除按钮 |
