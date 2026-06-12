# Study 1 — 实验程序设计文档

> 最后更新: 2026-06-12

---

## 一、技术架构

| 层 | 技术 |
|---|---|
| 框架 | Next.js 16.2.6 (App Router, Turbopack) |
| 语言 | TypeScript |
| 样式 | Tailwind CSS v4 |
| 数据库 | better-sqlite3 (本地文件 `study1.db`, WAL 模式) |
| 认证 | JWT (jose) + bcryptjs, cookie-based |
| 图片 | 80 张抽象图形 (A1-A20, B1-B20, C1-C20, D1-D20), 本地存储 |

**Admin 凭据**: `admin@study1.local` / `zxzx123456`  
**DEV_TEST_MODE**: 通过 `.env.local` 中 `NEXT_PUBLIC_DEV_TEST_MODE=true` 控制

---

## 二、被试流程

### 2.1 入口

- **新被试**: `/start` → 填写注册表单 → 自动跳转实验
- **续做**: `/start` 底部"继续实验"输入编号 → 自动查找进行中 session → 跳转
- **直接续做**: `/experiment?code=P001&session=<UUID>`

### 2.2 注册表单字段

| 字段 | 必填 | 格式 |
|---|---|---|
| 被试编号 | ✅ | 字母/数字/下划线/短横线 |
| 姓名 | ✅ | 文本 |
| 出生日期 | ✅ | YYYY-MM-DD (date picker) |
| 性别 | ✅ | 男 / 女 |
| 年级 | 选填 | 文本 |
| 专业/研究领域 | 选填 | 文本 |
| 联系方式 | 选填 | 手机或邮箱 |
| 知情同意 | ✅ | checkbox |

注册时自动平衡分配组别（稀缺/充裕），取当前进行中 session 较少的组。

---

## 三、实验阶段（共 10 个阶段）

### 阶段 0：任务操作说明 (`baseline_questionnaire`)

**参与者标题**: 任务操作说明

**内容**: 6 个练习试次，F/J 键操作熟悉
- 2 个 easy 点比较 (15-25 点/侧, diff 1-3)
- 2 个 hard 点比较 (30-50 点/侧, diff 2-4)
- 2 个图形匹配 (1 match, 1 non-match)

**点分布参数**: `panelWidth:90, panelHeight:90, minDistance:5, padding:8`  
**反馈**: 真实反馈 (✓正确 / ✗错误)，不影响资源点数  
**操作**: 练习完成后点击"继续"进入下一阶段

---

### 阶段 1：视觉偏好任务 (`study1_liking_ranking`) ★

**参与者标题**: 视觉偏好任务

**目的**: 通过成对比较推断被试对 25 张抽象图形的主观喜好排序

#### 刺激材料
- 从 80 张图形池随机抽取 25 张
- 按视觉类别配额采样 (A/B/C/D, 各约 6-7 张, 轮换配额模式)
- 分配到 5 个隐藏 set × 5 张/set
- 硬约束: 每 set 包含全部 4 个类别 (1/1/1/2 结构)

#### 校准子阶段

```
4A: 组内全配对 (50 trials)
    每 set 内 C(5,2)=10 对, 5×10=50, 随机顺序
    ↓ 组内 Elo 初始化 (K=32)
    
4B-R1: 相邻排名重测 (20 trials)
    每 set 4 对 (1v2,2v3,3v4,4v5), 5×4=20
    ↓ 检测不一致 → 
    ├─ 全部一致 → 跳过 R2
    └─ 有不一致 → 4B-R2: 重测不一致对+受影响邻居 (≤20, 有界迭代 MAX_ROUNDS=2)
    ↓ 组内 Elo 收敛 (K=24)
    
构建 within_set_stable 表
    ↓
4C-a: rank-3 锚定 ×2 重复 (20 trials)
    C(5,2)×2=20, 中间排名跨 set 比较, 提供 test-retest 信度
    ↓
4C-b: rank-1 + rank-5 锚定 (20 trials)
    10+10=20, 极端排名跨 set 验证
    ↓
4C-c: 自适应补充 (0~15 trials, 仅异常时触发)
    检测: 重测不一致 / 跨层级矛盾 / 高 Elo 不确定性 / 低 Kendall's W
    ↓ 统一 Elo 评分 (K=20)
    
finalize():
  ├─ 保存 stimulus_elo (25 条)
  ├─ 构建 cross_set_orthogonalized (25 条)
  ├─ 同步 liking_map (25 条)
  ├─ 5 维稳定性验证 → Grade A/B/C
  └─ 推进阶段 → study1_liking_validation
```

#### Elo 评分系统

- 初始 Elo = 1500, 裁剪范围 [1100, 1900]
- K 值递减: 4A=32 → 4B=24 → 4C=20
- Timeout 试次不参与 Elo 更新
- 最终输出连续喜好度量 (替代离散 rank 1-5)

#### 5 维稳定性验证

| 维度 | 数据来源 | 阈值 | 权重 |
|---|---|---|---|
| 循环一致性 | 4A 组内锦标赛 | ≤10% | 20% |
| 重测信度 | 4C-a 重复对 | ≥70% | 25% |
| Kendall's W | rank 1/3/5 排序 | ≥0.6 | 25% |
| Elo RMSE | 全局回测 | ≤0.35 | 20% |
| 超时率 | 全部试次 | ≤20% | 10% |

→ 综合分 ≥0.80=A / ≥0.55=B / <0.55=C

#### 操作方式
- 注视点 `+` 500ms → 两张图形 → **F**选左/**J**选右 → 空白 300ms
- 超时 180s, 也可鼠标点击

#### 典型试次数
| 子阶段 | 试次 |
|---|---|
| 4A | 50 |
| 4B-R1 | 20 |
| 4B-R2 | 0~20 |
| 4C-a | 20 |
| 4C-b | 20 |
| 4C-c | 0~15 |
| **合计** | **~115-130** |

---

### 阶段 2：视觉偏好确认 (`study1_liking_validation`)

**参与者标题**: 视觉偏好确认

**内容**: ≥45 个验证试次 (different_rank + same_rank), F/J 二选一

**质量控制**: 一致性 < 85% → 清空校准数据, calibration_attempt_index+1, 重新从 4A 开始

---

### 阶段 3：任务信息 (`relative_resource_feedback`)

**参与者标题**: 任务信息

**内容**: 显示组别特定的反馈文字

| 稀缺组 | 充裕组 |
|---|---|
| 初始余额 **10 点** | 初始余额 **100 点** |
| 通过阈值 10 点 | 通过阈值 10 点 |
| 强调"尽量保持账户达到要求" | 强调"拥有较充足空间，但需认真对待" |

---

### 阶段 4：资源账户任务 (`scarcity_manipulation`)

**参与者标题**: 资源账户任务

**目的**: 通过预设反馈操纵被试的资源感知（稀缺 vs 充裕）

#### 试次构成 (90 个)

| 类型 | 数量 | 参数 | 反馈 |
|---|---|---|---|
| 真实点比较 | 18 | 15-25 点/侧, diff 1-3 | 真实 (±2, 对+2/错-2) |
| 操纵点比较 | 54 | 30-50 点/侧, diff 2-4 | 预设操纵 |
| 图形匹配 | 18 | 圆/方/三角/菱形 | 真实 (±2, 对+2/错-2) |

**试次顺序**: 图形匹配不邻接 (间隔 ≥3), 随机分布

#### 操纵反馈逻辑 (稀缺组)

```
余额 > 10:  85% loss (1-3点), 拉回阈值下
余额 7-10:  60% loss (1-2点), 温和紧张
余额 4-6:   50/50 gain/loss, 维持紧张
余额 < 4:   80% gain (1-3点), 防止崩盘
预期体验: 余额 4-12 波动, 经常低于 10
```

#### 操纵反馈逻辑 (充裕组)

```
前期 (<30):    100→110+, 稳步攀升
中期 (30-70):  105-130, 温和波动
后期 (≤20):    110-128, 稳定高位
末期 (≤5):     确保 ≥110, 充裕收官
预期体验: 余额 100-130 波动, 始终充裕
```

#### 操作方式
- 注视点 500ms → 刺激 3000ms → 反馈 800ms → 空白 300ms
- 点比较: F(左多) / J(右多)
- 图形匹配: F(相同) / J(不同)
- 每 n 试次后 mini block check (4 题 Likert)

#### 点分布参数
- 面板: `panelWidth:90, panelHeight:90, minDistance:5, padding:8`
- 使用 rejection sampling + 渐进放松, minDistance 从 4 开始
- 右下角不显示点数提示

---

### 阶段 5：任务体验问卷 (`manipulation_check`)

**参与者标题**: 任务体验问卷

**内容**: 14 题 Likert 量表 (1-7, 中文), 测量 4 个构念:
- 资源不足感 (Resource Insufficiency)
- 资源信心 (Resource Confidence)
- 压力/负性情绪 (Stress/Negative Affect)
- 任务投入度 (Task Engagement)

---

### 阶段 6：价值点数说明 (`study1_value_assignment`)

**参与者标题**: 价值点数说明

#### 价值分配
- 5 个 set 各分配唯一价值 {5, 10, 15, 20, 25}
- 使用轮转拉丁方设计 (按被试序号取模轮换)
- 同一 set 内 5 张图获得相同价值

#### 理解检测
- MCQ: "图形旁边的价值点数表示什么？"
  - A. 选择这个图形需要消耗的资源点数 ❌
  - B. 这个图形在任务中的兑换价值（收益价值） ✅
  - C. 这个图形有多好看 ❌
- 最多 2 次尝试, 2 次均错则标记 flagged 但继续

#### 质量门槛
- liking_map = 25 条
- validation_passed = 1, needs_rerank = 0
- 校准超时率 ≤ 20%
- 验证超时率 ≤ 20%

**指导语**: ⚠ 加大加粗 (`text-lg font-bold text-gray-900`)

---

### 阶段 7：图像选择任务 (`study1_formal_choice`) ★★

**参与者标题**: 图像选择任务

**目的**: 核心因变量——在喜好和价值两个维度上做综合选择

#### 试次构成 (176 个)

| 类型 | 数量 | 定义 |
|---|---|---|
| liking_only | 32 | 价值相同 (同 set), 喜好不同 |
| value_only | 32 | 喜好相同 (同 rank), 价值不同 |
| congruent | 32 | 喜好+价值方向一致 |
| **conflict** | **80** | **喜好+价值方向冲突** |

#### 各类型潜在备选池

| 类型 | 潜在池 | 实际使用 | 采样率 |
|---|---|---|---|
| liking_only | 50 | 32 | 64% |
| value_only | 50 | 32 | 64% |
| congruent | 100 | 32 | 32% |
| conflict | 100 | 80 | 80% |
| **合计** | **300** | **176** | 59% |

**Conflict 采样**: 先取唯一对 (尊重 20 次/stim 上限), 不够时允许有限重复 (标记 repeated_pair_flag)

#### 操作方式
- 与阶段 1 相同 (F 左/J 右)
- 每张图下方显示价值点数
- 指导语: ⚠ 加大加粗 (`text-xl font-bold text-gray-900`)
- "请综合你对图形的喜爱程度和图形旁边显示的价值点数，选择你更愿意获得的一个"

#### 记录的因变量
- `chose_high_liking`: 是否选了喜好更高的
- `chose_high_value`: 是否选了价值更高的
- `chose_congruent_advantage`: congruent 试次中是否双重优势
- `chose_high_liking_low_value`: conflict 中选中高喜好低价值
- `chose_low_liking_high_value`: conflict 中选中低喜好高价值
- RT, timeout

#### 核心分析框架: 5×5 正交矩阵

```
          5点    10点   15点   20点   25点
Like 1  [stim]  [stim]  [stim]  [stim]  [stim]
Like 2  [stim]  [stim]  [stim]  [stim]  [stim]
Like 3  [stim]  [stim]  [stim]  [stim]  [stim]
Like 4  [stim]  [stim]  [stim]  [stim]  [stim]
Like 5  [stim]  [stim]  [stim]  [stim]  [stim]
```

行 = 喜好排名 (1=最不喜欢, 5=最喜欢), 列 = 外部价值点数

---

### 阶段 8：实验后问题 (`post_experiment_check`)

**参与者标题**: 实验后问题

**内容**: 怀疑度/欺骗检测问卷
- 对资源反馈的相信程度
- 是否怀疑预设反馈
- 资源任务对选择的影响感知
- 实验目的猜测 (自由文本)
- 主要选择策略
- 异常/不真实感 (自由文本)

---

### 阶段 9：实验完成 (`complete`)

**参与者标题**: 实验完成

感谢页面, 实验结束。

---

## 四、整体实验逻辑

```
阶段0 练习 → 熟悉按键操作
    ↓
阶段1 喜好校准 → 通过成对比较推断主观喜好 (4A→4B→4C→Elo)
    ↓
阶段2 喜好验证 → 确认喜好排序的一致性
    ↓
阶段3 资源信息 → 告知初始余额和通过要求
    ↓
阶段4 资源任务 → 操纵资源感知 (稀缺/充裕)
    ↓
阶段5 MC问卷 → 测量操纵效果
    ↓
阶段6 价值说明 → 分配外部价值 + 理解检测
    ↓
阶段7 正式选择 → ★ 核心DV: 喜好×价值的综合选择
    ↓
阶段8 实验后 → 怀疑度检测
    ↓
阶段9 完成
```

**设计逻辑**: 先测喜好 (无价值干扰) → 操纵资源感知 → 紧接着测喜好×价值整合。资源任务诱发的状态紧邻核心因变量，减少中间环节的衰减。

---

## 五、组间操纵

| | 稀缺组 | 充裕组 |
|---|---|---|
| 初始余额 | 10 点 | 100 点 |
| 余额范围 | 4-12 | 80-135 |
| 通过阈值 | 10 点 | 10 点 |
| 心理状态 | 余额接近/低于阈值, 持续紧张 | 余额远高于阈值, 感到安全 |
| 预期效果 | 更看重价值 (安全需求) | 更看重喜好 (可任性选择) |

---

## 六、Admin 管理页面

| 路由 | 功能 |
|---|---|
| `/admin` | Dashboard: 被试数、组分布、MC 汇总 |
| `/admin/participants` | 被试列表: 编号/姓名/出生日期/性别/年级/专业/联系方式/组别/阶段 |
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
4. **组内稳定建模表** (5×5) — 每 set 内每 rank 的 stimulus
5. **组间正交化表** (5×5) — 跨 set 校准后的排名 (含 shift 方向和置信度)
6. **🎯 正交喜好-价值矩阵** (5×5) — **最终输出** (含 Elo 分数/不确定度/比较次数)
7. **Liking Calibration & Validation** — 校准/验证试次详情
8. **Formal Choice** — 正式选择试次数据 (含 delta_elo)

### CSV 导出 (3 种)

| 类型 | 内容 |
|---|---|
| `choice_responses` | 每个正式选择试次的应答 (含 HL/HV/conflict 指标) |
| `participant_summary` | 每个被试的汇总指标 |
| `stimulus_value_map` | 每个被试的 25 个 stimulus 映射 (含 **elo, elo_live, elo_sigma, elo_n**) |

---

## 七、数据库核心表

| 表 | 用途 |
|---|---|
| `participants` | 被试信息 (编号/姓名/出生日期/性别/年级/专业/联系方式) |
| `experiment_sessions` | 会话 (组别/阶段/状态/资源余额/随机种子/校准尝试次数) |
| `subject_selected_stimuli` | 每 session 抽中的 25 张图 |
| `subject_set_assignment` | 5 个隐藏 set × 5 张图 |
| `calibration_trials` | 所有校准试次 (含 phase: 4A/4B-R1/4B-R2/4C-a/4C-b/4C-c) |
| `calibration_responses` | 校准选择记录 |
| `within_set_stable` | 组内稳定排名 (第1张表, 含 elo_score) |
| `cross_set_orthogonalized` | 跨 set 正交排名 (第2张表, 含 elo_score) |
| `stimulus_elo` | Elo 连续喜好分数 (含 elo_volatility, comparisons_count) |
| `calibration_stability` | 5维稳定性报告 (Grade A/B/C) |
| `liking_map` | 最终喜好排名字典 (含 elo_score) |
| `stimulus_value_map` | 喜好×价值的正交映射 (含 elo_score) |
| `value_assignment` | Set→Value 分配 (含 assignment_pattern_index) |
| `formal_trials` | 正式选择试次 (含 delta_liking, delta_value, delta_elo) |
| `choice_responses` | 正式选择记录 (含 chose_high_liking/value/conflict 指标) |
| `stage_game_trials` | 资源任务试次 (含 preset_feedback_direction/points) |
| `stage_game_responses` | 资源任务应答 |
| `manipulation_check_responses` | MC 问卷 (14 题 Likert) |
| `manipulation_check_summary` | MC 4 构念均值 |
| `value_comprehension_checks` | 价值理解检测记录 |
| `post_experiment_checks` | 实验后检测 |
| `liking_validation_trials/responses/quality` | 喜好验证 |
| `calibration_quality` | (legacy) 校准质量 |

---

## 八、关键设计决策

1. **喜好排名由 Elo 推断**, 不让被试直接打分 — 通过成对比较间接测量, 避免量表偏差
2. **Elo 替代胜场数** — 提供连续度量, 解决平局和处理跨 set 可比性
3. **4C 多层锚定** — rank 1/3/5 三层级 + 重复测量, 提供稳定性量化
4. **5 维稳定性** — 不二值判断, 而是多维度连续指标综合评定
5. **Conflict 超额采样** (80/100=80%) — 核心因变量需要足够的统计效力
6. **资源任务→正式选择紧邻** — 操纵效应不衰减
7. **理解检测** — 确保被试理解价值点数含义, 但不阻塞流程
8. **被试可续做** — `/start` 支持注册和续做两种模式
