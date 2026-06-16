# HANDOFF_STUDY1_V5.md — Study 1 V5 实验系统交接文档

**文档创建日期**: 2026-06-12
**项目根目录**: `/Users/hczhao/Documents/ClaudeCode/ValueRepresentation_V2`

> 本文档基于对代码的全面扫描和 2026-06-12 的多轮迭代编写。所有描述以当前代码实际实现为准。本文档取代旧的 `HANDOFF_STUDY1_V4.md`，为权威交接文件。

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

> ⚠ 若切换 Node.js 版本后出现 `better-sqlite3` 原生模块不兼容，运行 `npm rebuild better-sqlite3`。

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

### 2.2 关键组件清单

| 组件 | 用途 |
|---|---|
| `BaselinePractice.tsx` | 通用练习包装器（3 种模式） |
| `ImageChoicePractice.tsx` | 图像选择练习（F/J 键，支持 showValues） |
| `ValueAssignmentWithPractice.tsx` | 价值说明 + 正式选择练习 + MCQ |
| `PracticeTrials.tsx` | 资源任务练习（点数+图形匹配） |
| `StageGameTask.tsx` | 资源账户任务（余额/反馈增强 UI） |
| `PreferenceTask.tsx` | 视觉偏好校准 |
| `ValidationTask.tsx` | 喜爱验证 |
| `FormalChoiceTask.tsx` | 正式选择 |
| `TaskSurvey.tsx` | MC 问卷 |
| `PostExperimentCheck.tsx` | 实验后检测 |
| `ExperimentControls.tsx` | 阶段推进按钮 |
| `EntryPasswordGate.tsx` | 被试密码门禁 |
| `ParticipantForm.tsx` | 被试注册表单 |

---

## 3. 当前实验流程总览（11 个阶段）

### 阶段定义（`src/lib/stages.ts` — 权威来源）

```typescript
STAGES = [
  "baseline_questionnaire",       // 0. 视觉偏好操作说明与练习
  "study1_liking_ranking",        // 1. 视觉偏好任务 ★
  "study1_liking_validation",     // 2. 视觉偏好确认
  "relative_resource_feedback",   // 3. 任务信息
  "resource_task_practice",       // 4. 资源账户操作说明与练习
  "scarcity_manipulation",        // 5. 资源账户任务 ★
  "manipulation_check",           // 6. 任务体验问卷
  "study1_value_assignment",      // 7. 价值说明与图像选择练习
  "study1_formal_choice",         // 8. 图像选择任务 ★★
  "post_experiment_check",        // 9. 实验后问题
  "complete",                     // 10. 实验完成
]
```

**设计逻辑**: 先练习图像选择 (阶段 0) → 纯净测量喜好 (阶段 1-2) → 告知资源信息 (阶段 3) → 练习资源任务 (阶段 4) → 操纵资源感知 (阶段 5) → 操纵检验 (阶段 6) → 价值说明+练习 (阶段 7) → 核心 DV (阶段 8)。

### 阶段总览表

| # | Stage Key | 被试看到 | 组件 | 试次 |
|:--:|---|---|---|---|
| 0 | `baseline_questionnaire` | 任务操作说明 | `BaselinePractice(image_preference)` → `ImageChoicePractice` | 4 |
| 1 | `study1_liking_ranking` | 视觉偏好任务 | `PreferenceTask` | 110-165 |
| 2 | `study1_liking_validation` | 视觉偏好确认 | `ValidationTask` | 45 |
| 3 | `relative_resource_feedback` | 任务信息 | `ExperimentControls` + FEEDBACK_TEXT | — |
| 4 | `resource_task_practice` | 任务操作说明 | `BaselinePractice(resource_task)` → `PracticeTrials` | 6 |
| 5 | `scarcity_manipulation` | 资源账户任务 | `StageGameTask` | 90 |
| 6 | `manipulation_check` | 任务体验问卷 | `TaskSurvey` | 14 题 |
| 7 | `study1_value_assignment` | 任务操作说明 | `ValueAssignmentWithPractice` | 4+1 |
| 8 | `study1_formal_choice` | 图像选择任务 | `FormalChoiceTask` | 176 |
| 9 | `post_experiment_check` | 实验后问题 | `PostExperimentCheck` | 6 题 |
| 10 | `complete` | 实验完成 | 完成页 | — |

### 阶段推进机制

| 转换 | 推进方式 | 触发点 |
|---|---|---|
| 0→1 | `BaselinePractice` → advance API | `handleComplete()` |
| 1→2 | CalibrationOrchestrator.finalize() | 直接 SQL UPDATE |
| 2→3 | validation/submit API | 直接 SQL UPDATE |
| 3→4 | ExperimentControls "继续" → advance API | window.location.href |
| 4→5 | `BaselinePractice` → advance API | `handleComplete()` |
| 5→6 | `StageGameTask.finishStage` → advance API | router.push |
| 6→7 | manipulation-check/submit API | 直接 SQL UPDATE |
| 7→8 | ValueAssignmentWithPractice → comprehension API | router.push |
| 8→9 | formal-choice/submit API | 直接 SQL UPDATE |
| 9→10 | post-experiment-check API | 直接标记 completed |

---

## 4. 各阶段详细设计

### 阶段 0 — 视觉偏好练习

**组件**: `BaselinePractice(practiceType="image_preference")` → `ImageChoicePractice(showValues=false)`

- 4 张样本图 → 2 对 × 左右交换 = 4 次练习
- F(选左) / J(选右)，按主观喜好选择
- 反馈："你选择了左侧/右侧图形"，600ms 后推进
- 完成 → advance API → 阶段 1

### 阶段 1 — 视觉偏好任务 ★

**组件**: `PreferenceTask`

| Phase | 试次 | K | 重复 |
|---|---|---|---|
| 4A within_full_pair | 50 | 32 | — |
| 4B-R1 within_adjacent_retest | 20 | 24 | ×1 |
| 4B-R2 within_adjacent_retest_r2 | 0-40 | 24 | ×2 |
| 4C-a cross_set_anchor_mid | 20 | 20 | ×2 |
| 4C-b cross_set_anchor_low/high | 20 | 20 | — |
| 4C-c cross_set_adaptive | 0-15 | 20 | — |

- Elo: 初始1500, [1100,1900], K=32→24→20
- 5维稳定性 → Grade A/B/C
- 双轨排名: original + final_stable

### 阶段 2 — 视觉偏好确认

- 45试次: 30 different_rank + 15 same_rank
- 一致性阈值 85%
- 未通过 → retry（保留stimulus采样）

### 阶段 3 — 任务信息

- FEEDBACK_TEXT[group] 按段落渲染
- 阈值警告段落：**红色粗体加边框**
- 两组均显示初始 10 点、阈值 10 点、未达标扣被试费

**稀缺组额外**: "请你留意当前账户余额，并尽量保持账户点数达到后续任务要求"
**充裕组额外**: "你当前拥有较充足的账户空间，但仍需要认真完成任务"

### 阶段 4 — 资源任务练习

- 6试次: 4点数比较 + 2图形匹配
- DC-DC-SM-DC-DC-SM
- 真实反馈 ✓/✗
- F(左) / J(右)，尽快作答

### 阶段 5 — 资源账户任务 ★

**试次构成（90个）**:

| 类型 | 数量 | 点数 | 反馈 |
|---|---|---|---|
| manipulated_dot | 54 | 30-50, diff 2-4 | 自适应操纵 |
| real_dot | 18 | 15-25, diff 1-3 | 真实 ±2 |
| shape_matching | 18 | — | 真实 ±2 |

**关键机制**：
- `is_manipulated_feedback` 列区分真实/操纵
- 服务端权威余额（不信任客户端）
- **响应时自适应计算**（不依赖预计算preset）

#### 稀缺组反馈（最高优先级）

```
紧急: b>18→loss4, b>15→loss3-4, b<3→gain3-4, b<1→gain4

核心规则: b≥10 → 100%确定性loss = min(4, b-8)

最终收敛 (rem≤12): target=11, gap=11-b
  确定式计算 perTrial = round(|gap|/remainingManip)

预收敛 (rem≤20): 向10-12靠拢
主振荡: 7-9→80%loss, 4-6→50/50, <4→85%gain1-4
```

- 目标: ≥75%试次 <10, 最终∈[10,12]
- 操纵点数: 1-4

#### 充裕组反馈（最高优先级）

```
早期 (trialIndex<25): 10→15+, b<12→85%gain1-3, b12-20→60%gain
主阶段: 15-30波动, b<12→80%gain, b12-20→60%gain
末期 (rem≤9): 100%试次>12, b<10→gain3-4, b<13→gain1-3
紧急: b<8→gain3-4, b>38→85%loss2-4
```

- 目标: ≥75%试次 >10, 最后10%全部>12
- 操纵点数: 1-3（主阶段）/ 2-4（紧急）

#### UI 增强

- 余额: 红色粗体高亮(`text-2xl font-extrabold text-red-600 bg-red-50 border-red-300`)
- 收益: 绿色卡片 `+N` 6xl 超粗体
- 损失: 红色卡片 `−N` 6xl 超粗体
- 试次数量动态显示

### 阶段 6 — 任务体验问卷

- 14题 Likert 7点: 资源不足感(5)+信心(2)+压力(3)+投入度(4)
- 提交后自动计算4构念均值 → advance

### 阶段 7 — 价值说明+正式选择练习

- Phase 1: 价值说明 + 4次带价值点数的图像选择练习
- Phase 2: 理解检测 MCQ (A消耗/B收益✅/C好看), 最多2次
- 质量门禁: liking_map=25, validation_passed, 超时率≤20%

### 阶段 8 — 图像选择任务 ★★

- 176试次: liking_only(32)+value_only(32)+congruent(32)+conflict(80)
- 5×5正交矩阵
- DV: chose_high_liking/value/congruent_advantage/high_liking_low_value/low_liking_high_value

### 阶段 9 — 实验后问题

- 6题: 3 Likert + 1单选 + 2自由文本
- 关键词怀疑检测 → suspicion_flag
- 提交 → 直接标记session completed

### 阶段 10 — 实验完成

- 静态感谢页

### 跨阶段一致性守卫

[page.tsx:84-94] — `cross_set_orthogonalized`为空 → 自动回退阶段1

---

## 5. 当前关键实验参数

### 5.1 组别配置

| 参数 | 稀缺组 | 充裕组 |
|---|---|---|
| initial_balance | 10 | 10 |
| pass_threshold | 10 | 10 |
| balance_min | 4 | 8 |
| balance_max | 12 | 40 |

### 5.2 资源账户任务

| 参数 | 全模式 | DEV_TEST_MODE |
|---|---|---|
| real_dot/manipulated_dot/shape_matching | 18/54/18 | 2/4/4 |
| 总试次 | 90 | ~10 |
| 操纵点 | 30-50, diff 2-4 | 同 |
| 真实点 | 15-25, diff 1-3 | 同 |
| 反馈模式 | 自适应（响应时计算） | 同 |
| 稀缺目标 | ≥75%<10, final∈[10,12] | 同 |
| 充裕目标 | ≥75%>10, last10%>12 | 同 |

### 5.3 校准参数

| Phase | 试次 | K |
|---|---|---|
| 4A | 50 | 32 |
| 4B-R1 | 20 | 24 |
| 4B-R2 | 0-40 | 24 |
| 4C-a/b/c | 40-55 | 20 |
| 总计 | 110-165 | |

### 5.4 练习阶段

| 阶段 | 类型 | 试次 | 内容 |
|---|---|---|---|
| 0 | 图像偏好 | 4 | 2对×左右交换, F/J选偏好 |
| 4 | 资源任务 | 6 | 4点数比较+2图形匹配 |
| 7 | 正式选择 | 4 | 2对×左右交换, 带价值点数 |

### 5.5 正式选择参数

| 类型 | 全模式 |
|---|---|
| liking_only/value_only/congruent | 各32 |
| conflict | 80 |
| 总试次 | 176 |

---

## 6. V5 与 V4 的关键变更

### 6.1 充裕组配置重设

| 项目 | V4 | V5 |
|---|---|---|
| 初始余额 | 100 | **10**（与稀缺组相同起点） |
| 设计范围 | 80-135 | **8-40** |
| 早期目标 | 推至110+ | **推至15+** |
| 主阶段范围 | 105-130 | **15-30** |
| 末期目标 | >110 | **>12** |
| FEEDBACK显示 | "100点" | **"10点"**（与稀缺组相同） |

### 6.2 稀缺组反馈升级

| 项目 | V4 | V5 |
|---|---|---|
| 核心规则 | 95% loss when b≥10 | **100% 确定性 loss** = b-8 |
| 最终收敛 | target=9, rem≤15 | **target=11, rem≤12** |
| 点数范围 | 1-3 | **1-4** |
| 紧急上限 | b>15 | **b>18** |
| below10均值 | ~69% | **~75%** |

### 6.3 指导语增强

- 阶段3 FEEDBACK_TEXT 提及"先完成练习"
- 阈值警告：**红色粗体加边框** + "未达成扣除被试费"
- PracticeTrials完成页："进入正式的资源账户任务"

### 6.4 自适应反馈

- 操纵反馈在**响应时实时计算**（替代预计算preset值）
- 基于当前DB余额，不信任客户端

---

## 7. 数据记录逻辑

### 7.1 关键区分

| 问题 | 答案 |
|---|---|
| 真实/操纵反馈？ | `stage_game_trials.is_manipulated_feedback` |
| 组别？ | `experiment_sessions.group_label` |
| 余额来源？ | 服务端DB权威值 |
| 连续喜好？ | `stimulus_elo.elo_score` (1100-1900) |
| 原始排名？ | `original_within_rank` + `final_stable_rank` |

### 7.2 CSV导出（6种）

| 类型 | 内容 |
|---|---|
| `choice_responses` | 正式选择试次 |
| `participant_summary` | 被试摘要（含stability_grade, avg_elo） |
| `stimulus_value_map` | 刺激-价值映射（含elo） |
| `calibration_responses` | 校准试次响应 |
| `stimulus_elo` | Elo分数+volatility+双轨排名 |
| `calibration_stability` | 5维稳定性报告 |

---

## 8. 已知问题 / 潜在风险

- 阶段推进分散在3处执行
- 质量门禁不通过时仅显示"请联系实验员"
- `public/stimuli/` 是文件副本，替换需双目录同步
- `calDone` 变量计算但未使用（dead code）
- 缺少 error.tsx / loading.tsx
- `block_manipulation_checks` 表闲置

---

## 9. 后续修改指南

| 改什么 | 改哪里 |
|---|---|
| 阶段顺序 | `stages.ts` — `STAGES` 数组 |
| 稀缺组反馈 | `trial-generator.ts` — `computeScarcityFeedback()` |
| 充裕组反馈 | `trial-generator.ts` — `computeAbundanceFeedback()` |
| 组别配置 | `stage-game/config.ts` — `RESOURCE_TASK_CONFIG` |
| 试次数量 | `stage-game/config.ts` |
| 指导语 | `stages.ts` — `FEEDBACK_TEXT` + `PARTICIPANT_STAGE_TITLES` |
| 余额/反馈UI | `StageGameTask.tsx` |
| 练习内容 | `ImageChoicePractice.tsx` / `PracticeTrials.tsx` |
| Elo K值 | `elo.ts` — `K_VALUES` |
| 正式选择 | `formal-trial-generator.ts` — `FULL_TARGETS` |
| 数据库Schema | `db/index.ts` — `initSchema()` + ALTER TABLE |

---

## 10. 脚本工具

```bash
npm run seed-stimuli          # 播种刺激池
npm run check:calibration     # 检查校准流程
npm run check:value-assignment
npm run check:formal-choice
npm run check:dots-stagegame
```

---

## 11. 重要提醒

1. **勿删WAL文件** — `study1.db-shm/wal` 是SQLite正常文件
2. **阶段顺序以 `stages.ts` 为准** — 11个阶段
3. **被试勿见内部标签** — scarcity/abundance/group/set/Elo/calibration
4. **CalibrationOrchestrator 是校准唯一编排器**
5. **`is_manipulated_feedback` 是反馈模式权威标记**
6. **余额以服务端DB为准** — submit-response忽略客户端balance_before
7. **充裕组初始也是10点** — 与稀缺组相同起点
8. **操纵反馈在响应时实时计算** — 不依赖预计算preset值
9. **`experiment/page.tsx` 是核心文件**
