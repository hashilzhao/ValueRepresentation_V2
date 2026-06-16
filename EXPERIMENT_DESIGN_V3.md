# Study 1 — 实验程序设计文档 V3

> 最后更新: 2026-06-12
>
> 本文档反映当前代码实际实现。阶段顺序、反馈逻辑、Elo系统均与代码一致。

---

## 一、技术架构

| 层 | 技术 |
|---|---|
| 框架 | Next.js 16.2.6 (App Router, Turbopack) |
| 语言 | TypeScript 5 |
| 样式 | Tailwind CSS v4 |
| 数据库 | better-sqlite3 (本地 `study1.db`, WAL 模式) |
| 认证 | JWT (jose) + bcryptjs, cookie-based |
| 图片 | 80 张抽象图形 (A1-A20, B1-B20, C1-C20, D1-D20) |

**Admin 凭据**: `admin@study1.local` / `zxzx123456`
**被试入口密码**: `zxzx123456`
**DEV_TEST_MODE**: `.env.local` 中 `NEXT_PUBLIC_DEV_TEST_MODE=true`

---

## 二、被试流程

### 2.1 入口

- `/start` → EntryPasswordGate → ParticipantForm → 注册 → 自动跳转实验
- 续做: `/experiment?code=P001&session=<UUID>`
- 注册时自动平衡分组（scarcity/abundance）

### 2.2 注册表单

| 字段 | 必填 |
|---|---|
| 被试编号 | ✅ |
| 年龄 | ✅ |
| 性别 | ✅ |
| 专业/研究领域 | ✅ |
| 知情同意 | ✅ |

---

## 三、实验阶段（11 个阶段）

```
0. baseline_questionnaire      任务操作说明 (视觉偏好练习)
1. study1_liking_ranking       视觉偏好任务 ★
2. study1_liking_validation    视觉偏好确认
3. relative_resource_feedback  任务信息
4. resource_task_practice      任务操作说明 (资源任务练习)
5. scarcity_manipulation       资源账户任务 ★
6. manipulation_check          任务体验问卷
7. study1_value_assignment     任务操作说明 (价值说明+练习)
8. study1_formal_choice        图像选择任务 ★★
9. post_experiment_check       实验后问题
10. complete                   实验完成
```

**设计逻辑**: 先纯净测量喜好 → 操纵资源感知 → 紧接操纵检验 → 价值说明 → 核心DV 喜好×价值选择。

---

### 阶段 0 — 任务操作说明（视觉偏好练习）

**参与者标题**: 任务操作说明

**组件**: `BaselinePractice(image_preference)` → `ImageChoicePractice(showValues=false)`

**内容**: 4 次图像偏好练习（2 对 × 左右交换）
- F(选左) / J(选右)，按主观喜好第一感觉选择
- 反馈: "你选择了左侧/右侧图形"，600ms 后推进
- 完成后自动进入阶段 1

---

### 阶段 1 — 视觉偏好任务 ★

**参与者标题**: 视觉偏好任务

**组件**: `PreferenceTask`

**目的**: 通过成对比较推断被试对 25 张抽象图形的主观喜好排序

#### 刺激采样

- 从 80 张池中抽取 25 张（配额轮换 4 模式）
- 5 个隐藏 set × 5 张图
- 硬约束: 每 set 含全部 4 个视觉类别 (1/1/1/2)
- 软优化: 500 次随机搜索最优 diversity

#### 校准子阶段

```
4A: within_full_pair (50 trials)
    每 set C(5,2)=10 对, 5×10=50
    Elo K=32, 初始 1500
    ↓ win-count 排名推断

4B-R1: within_adjacent_retest (20 trials)
    每 set 4 相邻对 (1v2,2v3,3v4,4v5) ×1 次
    Elo K=24
    ↓ 检测不一致（chosen ≠ hiRank）
    ├─ 无不一致 → 构建 within_set_stable → 生成 4C
    └─ 有不一致 → 4B-R2 (不一致对+邻居 ×2 次)

构建 within_set_stable 表
    original_within_rank (4A win-count, 审计追溯)
    final_stable_rank (Elo 综合排名)
    elo_score, adjacent_consistency, ambiguity_flag
    ↓

4C-a: cross_set_anchor_mid (20 trials)
    rank-3 跨 set ×2 重复, C(5,2)×2=20
    ↓

4C-b: cross_set_anchor_low + high (20 trials)
    rank-1+5 跨 set, 各 10 试次
    ↓

[异常检测] → 4C-c: cross_set_adaptive (0-15 trials)
    4 种检测器: test-retest / cross-level / high-volatility / low-Kendall-W
    ↓

finalize():
    stimulus_elo (25 条)
    cross_set_orthogonalized (calibrated_liking_rank)
    liking_map (final_liking_rank = calibrated)
    5 维稳定性验证 → Grade A/B/C
```

#### Elo 评分系统

| 阶段 | K 值 | 说明 |
|---|---|---|
| 4A | 32 | 粗排，高响应度 |
| 4B-R1/R2 | 24 | 精调，中等响应 |
| 4C-a/b/c | 20 | 微调，低响应度 |

- 初始 1500，范围 [1100, 1900]
- 波动率衰减: `volatility = max(50, 200/sqrt(1+comparisons))`
- 顺序处理（computeAllPhaseElo）: 各阶段依次更新同一 Elo 池

#### 5 维稳定性验证

| 维度 | 权重 | 理想值 |
|---|---|---|
| Cycle Consistency | 20% | ≤10% |
| Test-Retest Agreement | 25% | ≥90% |
| Cross-Level Kendall's W | 25% | ≥0.9 |
| Elo Model RMSE | 20% | ≤0.35 |
| Timeout Rate | 10% | ≤20% |

→ 综合分 ≥0.80=A / ≥0.55=B / <0.55=C

#### 操作方式

- 注视点 `+` 500ms → 两张图形 → F选左/J选右/鼠标点击 → 空白 300ms
- 超时 180s
- 图片预加载 15s 超时保护

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

### 阶段 2 — 视觉偏好确认

**参与者标题**: 视觉偏好确认

**组件**: `ValidationTask`

- 45 试次: 30 different_rank + 15 same_rank
- 质量控制: different_rank 一致性 < 85% → 清空校准数据，calibration_attempt_index+1，回退阶段 1
- 通过 → advance to 阶段 3

---

### 阶段 3 — 任务信息

**参与者标题**: 任务信息

**内容**: 显示组别特定的反馈文字，按段落拆分渲染。

**两组共同内容**:
- "上一阶段已完成。接下来，你将先完成资源账户任务的练习，然后进入正式任务。"
- "系统已为你生成本轮任务的初始资源账户：**10 点**。"
- ⚠ **"本任务设有进入后续环节的账户要求：账户余额需要达到 10 点。若任务未达成，将受到惩罚，扣除一定额度的被试费。"**（红色粗体加边框突出显示）

**稀缺组特有**: "请你留意当前账户余额，并尽量保持账户点数达到后续任务要求。"

**充裕组特有**: "你当前拥有较充足的账户空间，但仍需要认真完成任务并留意账户变化。"

---

### 阶段 4 — 任务操作说明（资源任务练习）

**参与者标题**: 任务操作说明

**组件**: `BaselinePractice(resource_task)` → `PracticeTrials`

- 6 试次: 4 点数比较 + 2 图形匹配 (DC-DC-SM-DC-DC-SM)
- 真实反馈 ✓/✗，不计入正式任务
- 说明: F(选左)/J(选右)，尽快作答
- 完成后自动进入阶段 5

---

### 阶段 5 — 资源账户任务 ★

**参与者标题**: 资源账户任务

**组件**: `StageGameTask`

**目的**: 通过预设操纵反馈，诱发被试的资源稀缺感或充裕感。

#### 试次构成（90 个）

| 类型 | 数量 | 点数参数 | 反馈模式 | `is_manipulated_feedback` |
|---|---|---|---|---|
| 操纵点比较 | 54 | 30-50 点, diff 2-4 | 自适应操纵 | 1 |
| 真实点比较 | 18 | 15-25 点, diff 1-3 | 真实 (±2) | 0 |
| 图形匹配 | 18 | — | 真实 (±2) | 0 |

**反馈机制**: `POST /api/stage-game/submit-response` 时**实时自适应计算**：
1. 读取 `is_manipulated_feedback` → 判断真实/操纵
2. 读取 `experiment_sessions.resource_balance` → **服务端权威余额**
3. 操纵试次: 调用 `computeDotComparisonFeedback(group, balance, trialIndex, totalTrials)`
4. 真实试次: accuracy-based ±2
5. `saveStageGameResponse` → 保存 + 更新 balance

#### 稀缺组反馈逻辑

**配置**: initial=10, range=4-12, pass_threshold=10

**目标**: ≥75% 试次余额 <10，最终余额 ∈ [10,12]

**决策层级**（优先级从高到低）:

```
Layer 0: 紧急越界
  b > 18 → loss 4 (100%)
  b > 15 → loss 3-4 (100%)
  b < 1  → gain 4 (100%)
  b < 3  → gain 3-4 (100%)

Layer 1: 最终收敛 — remaining ≤ 12 (试次 78-89)
  target = 11
  gap = 11 - balance
  perTrial = clamp(round(|gap| / remainingManip), 1, 4)
  大偏差时 +1 过冲

Layer 2: 核心规则 — balance ≥ 10 (最高优先级)
  100% 确定性 loss = min(4, balance - 8)
  推至 ~8，确保余量

Layer 3: 预收敛 — remaining ≤ 20
  b<8: 75% gain, b=8-9: 55% gain

Layer 4: 主振荡
  b 7-9: 80% loss 1-2
  b 4-6: 50/50 gain/loss 1-2

Layer 5: 崩盘保护
  b<4: 85% gain 1-4, 15% loss 1
```

**操纵点数范围**: 1-4

#### 充裕组反馈逻辑

**配置**: initial=10, range=8-40, pass_threshold=10

**目标**: ≥75% 试次余额 >10，最后 10% 试次全部 >12

**决策层级**:

```
Layer 0: 紧急
  b < 8 → gain 3-4
  b > 38 → 85% loss 2-4

Layer 1: 末期 — remaining ≤ 9 (最后 10%)
  100% 试次 >12
  b<10: gain 3-4, b<13: gain 1-3
  b 13-30: 温和振荡微偏 gain

Layer 2: 早期攀升 — trialIndex < 25
  从 10 推至 15+
  b<12: 85% gain 1-3
  b 12-20: 60% gain
  b>28: 60% loss（防过快）

Layer 3: 主阶段 — 15-30 波动
  b<12: 80% gain 1-3
  b 12-20: 60% gain
  b 21-28: 温和振荡
  b>32: 下行偏压
```

**操纵点数范围**: 1-3（主阶段）/ 2-4（紧急）

#### UI 增强

| 元素 | 样式 |
|---|---|
| 余额显示 | `text-2xl font-extrabold text-red-600 bg-red-50 border-2 border-red-300 rounded-lg px-4 py-1.5` |
| 收益反馈 | 绿色卡片 `+N` 6xl 超粗体 |
| 损失反馈 | 红色卡片 `−N` 6xl 超粗体 |
| 反馈后余额 | `text-2xl font-extrabold text-red-600 bg-red-50 border-2 border-red-300` |

#### 操作方式

- 注视点 500ms → 刺激 max 3000ms → 反馈 800ms → 空白 300ms
- 点数比较: F(左侧更多) / J(右侧更多)
- 图形匹配: F(匹配) / J(不匹配)
- 进度显示: "试次 X / Y  当前账户: Z 点"
- 试次数量动态显示

---

### 阶段 6 — 任务体验问卷

**参与者标题**: 任务体验问卷

**组件**: `TaskSurvey`

- 14 题 Likert 7 点量表
- 4 个构念: 资源不足感(5题) / 资源信心(2题) / 压力(3题) / 投入度(4题)
- 提交后自动计算 means 并 advance

---

### 阶段 7 — 价值说明与图像选择练习

**参与者标题**: 任务操作说明

**组件**: `ValueAssignmentWithPractice`

**Phase 1 — 价值说明 + 练习**:
- 价值说明文字
- 4 次带价值点数的正式选择练习（F/J 键）
- 模拟价值: 5/10/15/20/25 轮换

**Phase 2 — 理解检测**:
- MCQ: "价值点数表示什么？" A(消耗)/B(收益✅)/C(好看)
- 正确 → advance; 错误 ≤2 次 → 重试; 2 次全错 → flagged + advance

**质量门禁**:
- liking_map = 25 条
- validation_passed=1, needs_rerank=0
- 校准超时率 ≤ 20%
- 验证超时率 ≤ 20%

#### 价值分配

- 5 个 set 各分配唯一价值 {5,10,15,20,25}
- 拉丁方轮转: patternIndex = COUNT(value_assignment)

---

### 阶段 8 — 图像选择任务 ★★

**参与者标题**: 图像选择任务

**组件**: `FormalChoiceTask`

**目的**: 核心因变量——在喜好和价值两个维度上做综合选择。

#### 试次构成（176 个）

| 类型 | 数量 | 定义 |
|---|---|---|
| liking_only | 32 | 价值相同，喜好不同 |
| value_only | 32 | 喜好相同，价值不同 |
| congruent | 32 | 喜好+价值方向一致 |
| **conflict** | **80** | **喜好+价值方向冲突** |

#### 5×5 正交矩阵

```
          5点   10点   15点   20点   25点
Like 5  [stim] [stim] [stim] [stim] [stim]
Like 4  [stim] [stim] [stim] [stim] [stim]
Like 3  [stim] [stim] [stim] [stim] [stim]
Like 2  [stim] [stim] [stim] [stim] [stim]
Like 1  [stim] [stim] [stim] [stim] [stim]
```

行 = calibrated_liking_rank (1=最不喜欢, 5=最喜欢), 列 = external_value (5-25)

#### 记录的因变量

- chose_high_liking, chose_high_value
- chose_congruent_advantage (congruent)
- chose_high_liking_low_value, chose_low_liking_high_value (conflict)
- RT, timeout

#### 操作方式

- F(选左) / J(选右) / 鼠标点击
- 每张图下方显示 "价值点数: XX" (text-xl font-bold)
- 超时 180s

---

### 阶段 9 — 实验后问题

**参与者标题**: 实验后问题

**组件**: `PostExperimentCheck`

- 6 题: 3 Likert + 1 单选 + 2 自由文本
- 关键词怀疑检测 → suspicion_flag
- 提交后直接标记 session completed

---

### 阶段 10 — 实验完成

**参与者标题**: 实验完成

感谢页面。

---

## 四、整体实验逻辑

```
阶段0 图像偏好练习 → F/J键熟悉
    ↓
阶段1 喜好校准 ★ → 成对比较 (4A→4B→4C→Elo)
    │              纯净测量，无价值干扰
阶段2 喜好验证 → 85%一致性
    ↓
阶段3 资源信息 → FEEDBACK_TEXT[group] + 惩罚警告
    ↓
阶段4 资源练习 → 点数比较+图形匹配
    ↓
阶段5 资源操纵 ★ → 自适应反馈 (稀缺/充裕)
    ↓
阶段6 MC问卷 → 4构念操纵检验
    ↓
阶段7 价值说明+练习 → 理解检测
    ↓
阶段8 正式选择 ★★ → 核心DV: 喜好×价值
    ↓
阶段9 实验后 → 怀疑检测
    ↓
阶段10 完成
```

---

## 五、组间操纵

| | 稀缺组 | 充裕组 |
|---|---|---|
| 初始余额 | 10 | 10 |
| 设计范围 | 4-12 | 8-40 |
| 通过阈值 | 10 | 10 |
| 反馈 bias | loss (80-100%) | gain (60-85%) |
| 核心规则 | b≥10→强制loss | b<12→强推gain |
| 目标 | ≥75%<10, final∈[10,12] | ≥75%>10, last10%>12 |
| 预期体验 | 余额经常不足 | 余额始终充裕 |
| 指导语差异 | "尽量保持达标" | "拥有充足空间" |

**分组方式**: `assignGroup()` — 查询当前 in_progress 较少的组，保持平衡。

---

## 六、Admin 管理页面

| 路由 | 功能 |
|---|---|
| `/admin` | Dashboard |
| `/admin/participants` | 被试列表 |
| `/admin/sessions` | 会话管理 |
| `/admin/study1` | 刺激分配概览 |
| `/admin/study1/[sessionId]` | **核心详情页** (8 Section) |
| `/admin/results` | 群体指标 + 6种CSV导出 |
| `/admin/stimuli` | 刺激池管理 |
| `/admin/audit` | 审计 |

### CSV 导出（6 种）

| 类型 | 内容 |
|---|---|
| `choice_responses` | 正式选择试次数据 |
| `participant_summary` | 被试摘要（含 stability_grade, avg_elo 等） |
| `stimulus_value_map` | 刺激-价值映射（含 elo, elo_sigma, elo_n） |
| `calibration_responses` | 校准试次响应 |
| `stimulus_elo` | Elo 分数+volatility+双轨排名+shift |
| `calibration_stability` | 5 维稳定性报告 |

---

## 七、数据库核心表

| 表 | 用途 |
|---|---|
| `participants` | 被试信息 |
| `experiment_sessions` | 会话（组别/阶段/余额/种子/校准次数） |
| `event_logs` | 审计日志 |
| `subject_selected_stimuli` | 25 张抽样 |
| `subject_set_assignment` | 5 个隐藏 set |
| `calibration_trials` / `_responses` | 校准试次与响应 |
| `stimulus_elo` | ★ Elo 分数 (volatility, comparisons) |
| `within_set_stable` | 组内排名 (双轨: original + final) |
| `cross_set_orthogonalized` | 跨 set 排名 (shift direction/rate/confidence) |
| `calibration_stability` | 5 维稳定性 (Grade A/B/C) |
| `liking_map` | 最终喜好排名 (含 elo) |
| `stage_game_trials` / `_responses` | 资源任务试次与响应 |
| `manipulation_check_responses` / `_summary` | MC 问卷 |
| `value_assignment` / `stimulus_value_map` | 价值分配 |
| `formal_trials` / `choice_responses` | 正式选择 |
| `post_experiment_checks` | 实验后检测 |

---

## 八、关键 API 路由

| 路由 | 功能 |
|---|---|
| `/api/participants/register` | 被试注册+平衡分组 |
| `/api/sessions/advance` | 阶段推进 |
| `/api/stage-game/init` | 资源任务初始化 |
| `/api/stage-game/submit-response` | 资源任务响应（自适应反馈） |
| `/api/study1/calibration/init` | 校准初始化 |
| `/api/study1/calibration/submit` | 校准响应（阶段转换） |
| `/api/study1/validation/init` | 验证初始化 |
| `/api/study1/validation/submit` | 验证响应（retry/advance） |
| `/api/study1/comprehension-check` | 理解检测 |
| `/api/study1/formal-choice/submit` | 正式选择响应 |
| `/api/manipulation-check/submit` | MC 提交 |
| `/api/admin/export` | CSV 导出（6 种） |

---

## 九、关键设计决策

1. **喜好测量先于资源操纵** — 纯净基线，不受资源状态污染
2. **Elo 替代胜场数** — 连续度量，支持跨 set 可比性
3. **4B 分 Round 设计** — R1 发现不稳定，R2 充分验证
4. **K 值递减** (32→24→20) — 后期精细调整
5. **双轨排名** — original + final_stable 审计追溯
6. **稀缺 100% 确定性 loss** — 绝对保证 ≥75% below10
7. **充裕与稀缺同起点** (10点) — 仅反馈方向不同，控制单一变量
8. **自适应反馈** — 不依赖预计算 preset，基于当前实际余额
9. **服务端余额权威** — 不信任客户端
10. **is_manipulated_feedback 列** — 可靠区分真实/操纵
11. **Conflict 超额采样 (80%)** — 核心 DV 统计效力
12. **三段练习设计** — 阶段 0/4/7 分别针对三种任务类型
13. **惩罚警告红色粗体** — 两组均醒目显示
14. **calibration_attempt_index** — 重试隔离，保留完整链

---

## 十、文件索引

### 核心库 (`src/lib/`)

| 文件 | 职责 |
|---|---|
| `stages.ts` | ★ 阶段定义/顺序/标题/反馈文字 |
| `db/index.ts` | ★ SQLite Schema + 迁移 |
| `stage-game/config.ts` | 资源任务配置 |
| `stage-game/trial-generator.ts` | ★ 试次生成 + 操纵反馈 |
| `stage-game/response.ts` | 响应保存 |
| `study1/sampling.ts` | 刺激抽样 + set 构建 |
| `study1/calibration-generator.ts` | 校准试次生成 + 排名推断 |
| `study1/calibration-orchestrator.ts` | ★ 校准编排器 |
| `study1/elo.ts` | ★ Elo 评分系统 |
| `study1/anomaly-detection.ts` | 异常检测 |
| `study1/stability-validation.ts` | 5 维稳定性 |
| `study1/value-assignment.ts` | 价值分配 |
| `study1/formal-trial-generator.ts` | 正式选择生成 |
| `study1/formal-response.ts` | 正式选择响应编码 |

### 核心组件 (`src/components/`)

| 组件 | 阶段 |
|---|---|
| `ImageChoicePractice.tsx` | 0, 7 |
| `PracticeTrials.tsx` | 4 |
| `PreferenceTask.tsx` | 1 |
| `ValidationTask.tsx` | 2 |
| `StageGameTask.tsx` | 5 |
| `TaskSurvey.tsx` | 6 |
| `ValueAssignmentWithPractice.tsx` | 7 |
| `FormalChoiceTask.tsx` | 8 |
| `PostExperimentCheck.tsx` | 9 |
