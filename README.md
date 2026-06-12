# ValueRepresentation V2 — 价值表征实验研究平台

一项关于资源稀缺条件下价值表征的行为实验研究系统。参与者完成 11 个阶段的实验任务，包含 Elo 校准的视觉偏好测量、资源账户操纵、以及喜好×价值的综合选择任务。数据存储于本地 SQLite 数据库。

> **V2 核心升级**：Elo 连续喜好度量系统、本地 SQLite 数据库（无需 Supabase）、三段式练习设计、增强的余额/反馈 UI。

---

## 技术架构

| 层级 | 技术 |
|---|---|
| 前端框架 | Next.js 16.2.6 (App Router, Turbopack) |
| 语言 | TypeScript 5 |
| 样式 | Tailwind CSS v4 |
| 数据库 | better-sqlite3（本地文件 `study1.db`，WAL 模式） |
| 认证 | JWT（jose + bcryptjs），Cookie-based |
| 图片 | 80 张抽象图形 PNG（A/B/C/D 各 20 张） |

---

## 本地运行

### 1. 克隆仓库

```bash
git clone https://github.com/hashilzhao/ValueRepresentation_V2.git
cd ValueRepresentation_V2
```

### 2. 安装依赖

```bash
npm install
```

> ⚠️ 若切换 Node.js 版本后出现 `better-sqlite3` 原生模块不兼容，运行 `npm rebuild better-sqlite3`。

### 3. 配置环境变量

复制 `.env.local.example` 为 `.env.local`（如存在），或直接创建 `.env.local`：

```env
# 管理员账号（可选，有默认值）
ADMIN_EMAIL=admin@study1.local
ADMIN_PASSWORD=zxzx123456

# 参与者入口密码（可选，有默认值）
PARTICIPANT_ENTRY_PASSWORD=zxzx123456

# JWT 密钥（可选，有默认值）
JWT_SECRET=your-jwt-secret
PARTICIPANT_ACCESS_SECRET=your-access-secret

# 测试模式：true 大幅减少试验次数用于调试
NEXT_PUBLIC_DEV_TEST_MODE=true
```

所有环境变量均有默认值，不配置 `.env.local` 也可直接运行。

### 4. 播种刺激材料

```bash
npm run seed-stimuli
```

此命令扫描 `storage/stimuli/` 目录，将 80 张 PNG 图片注册到 `stimulus_pool` 表中。

### 5. 启动开发服务器

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

---

## 使用手册

### 在线访问

| 身份 | 入口 | 说明 |
|---|---|---|
| 主试（管理员） | `/login` | `admin@study1.local` / `zxzx123456` |
| 被试（参与者） | `/start` | 需输入实验进入密码 `zxzx123456` |

### 参与者（被试）完整流程 — 11 阶段

| # | 阶段 | 被试看到 | 内容 | 试次 |
|:--:|---|---|---|---|
| 0 | `baseline_questionnaire` | 任务操作说明 | 图像偏好练习（F/J 键选择偏好） | 4 |
| 1 | `study1_liking_ranking` | 视觉偏好任务 | ★ Elo 校准（4A 全配对→4B 复测→4C 跨集锚定） | 110–165 |
| 2 | `study1_liking_validation` | 视觉偏好确认 | 喜好排名验证（85% 一致性阈值） | 45 |
| 3 | `relative_resource_feedback` | 任务信息 | 组别反馈文本（稀缺 10 点 / 充裕 100 点） | — |
| 4 | `resource_task_practice` | 任务操作说明 | 资源任务练习（点数比较 + 图形匹配） | 6 |
| 5 | `scarcity_manipulation` | 资源账户任务 | ★ 操纵资源感知（90 试次，预设反馈） | 90 |
| 6 | `manipulation_check` | 任务体验问卷 | 14 题 Likert 量表（4 构念） | 14 题 |
| 7 | `study1_value_assignment` | 任务操作说明 | 价值说明 + 正式选择练习 + 理解检测 | 4+1 题 |
| 8 | `study1_formal_choice` | 图像选择任务 | ★★ 核心 DV：喜好×价值综合选择 | 176 |
| 9 | `post_experiment_check` | 实验后问题 | 怀疑度检测（6 题） | 6 题 |
| 10 | `complete` | 实验完成 | 感谢页面 | — |

**设计逻辑**：先练习图像选择→纯净测量喜好→告知资源信息→练习资源任务→操纵资源感知→操纵检验→价值说明+练习→核心 DV。三个练习阶段（0/4/7）分别针对三种任务类型的操作熟悉。

### 管理员（主试）操作

#### 管理面板

| 页面 | 路径 | 功能 |
|---|---|---|
| 仪表盘 | `/admin` | 参与者/会话统计、MC 组间汇总 |
| 参与者 | `/admin/participants` | 查看/删除参与者 |
| 会话管理 | `/admin/sessions` | 各组会话进度、余额、准确率、反应时 |
| 刺激材料 | `/admin/stimuli` | 80 张刺激图片管理、上传替换 |
| Study 1 | `/admin/study1` | 每位被试的刺激材料分配概览 |
| Study 1 详情 | `/admin/study1/[sessionId]` | ★ 核心详情页：5×5 矩阵、Elo 分数、校准/验证/正式选择 |
| 审计 | `/admin/audit` | 会话完整性检查 |
| 结果 | `/admin/results` | 分组指标、个人指标、CSV 导出 |

#### CSV 导出（`/admin/results`）

| 类型 | 内容 |
|---|---|
| `choice_responses` | 所有正式选择试验（含 conflict/high_liking/high_value 指标） |
| `participant_summary` | 参与者摘要（含 tradeoff_index） |
| `stimulus_value_map` | 刺激-价值映射（含 elo、elo_sigma、elo_n） |
| `data_dictionary` | 数据字典 |

### 实验时长估算

- 完整模式（`DEV_TEST_MODE=false`）：约 35–45 分钟
- 测试模式（`DEV_TEST_MODE=true`）：约 5–8 分钟

---

## 项目结构

```
src/
├── app/
│   ├── page.tsx                  # 着陆页
│   ├── experiment/page.tsx       # ★ 主阶段路由（核心文件）
│   ├── start/page.tsx            # 被试入口
│   ├── login/page.tsx            # 管理员登录
│   ├── complete/page.tsx         # 完成页
│   ├── admin/                    # 8 个后台页面
│   └── api/                      # ~21 个 API 路由
├── components/                   # 17 个 React 组件
│   ├── StageGameTask.tsx          # 资源账户任务（含余额/反馈增强 UI）
│   ├── PreferenceTask.tsx         # 视觉偏好校准
│   ├── FormalChoiceTask.tsx       # 正式选择
│   ├── BaselinePractice.tsx       # 通用练习包装器（3 种模式）
│   ├── ImageChoicePractice.tsx    # 图像选择练习
│   ├── ValueAssignmentWithPractice.tsx  # 价值说明+练习
│   └── ...
└── lib/                           # 核心业务逻辑
    ├── stages.ts                  # ★ 阶段定义（权威来源）
    ├── db/index.ts                # ★ SQLite Schema + 迁移
    ├── stage-game/                # 资源任务（生成/反馈/响应）
    └── study1/                    # 校准/验证/价值/正式选择
        ├── calibration-orchestrator.ts  # ★ 校准编排器
        ├── calibration-generator.ts     # 4A/4B/4C 生成 + Elo
        ├── elo.ts                       # ★ Elo 评分系统
        ├── anomaly-detection.ts         # 异常检测
        ├── stability-validation.ts      # 5 维稳定性
        ├── formal-trial-generator.ts    # 正式选择生成
        └── ...
```

---

## 数据库

SQLite 单文件 `study1.db`，25+ 张表。Schema 自动创建（首次运行 `getDb()` 时），迁移通过 try/catch ALTER TABLE 实现。

### 核心表

| 表 | 用途 |
|---|---|
| `participants` | 参与者信息 |
| `experiment_sessions` | 实验会话（组别、阶段、余额、随机种子、校准尝试次数） |
| `event_logs` | 不可篡改审计日志 |
| `subject_selected_stimuli` | 每 session 抽中的 25 张图 |
| `subject_set_assignment` | 5 个隐藏 set × 5 张图 |
| `calibration_trials` / `_responses` | 校准试次与响应 |
| `stimulus_elo` | ★ Elo 连续喜好分数（含 volatility、comparisons） |
| `within_set_stable` | 组内稳定排名（双轨：original + final） |
| `cross_set_orthogonalized` | 跨 set 正交排名（含 shift direction/rate/confidence） |
| `calibration_stability` | 5 维稳定性报告（Grade A/B/C） |
| `liking_map` | 最终喜好排名 |
| `stage_game_trials` / `_responses` | 资源任务试次与响应 |
| `formal_trials` / `choice_responses` | 正式选择试次与响应 |
| `manipulation_check_responses` / `_summary` | MC 问卷 |
| `post_experiment_checks` | 实验后检测 |

---

## V2 vs V1 核心差异

| 特性 | V1 (ValueRepresentation) | V2 (本项目) |
|---|---|---|
| 数据库 | Supabase (PostgreSQL) | better-sqlite3 (本地 SQLite) |
| 部署 | Vercel | 本地运行 |
| 阶段数 | 10 | 11（新增 resource_task_practice） |
| 喜好校准 | win-count 排名 | ★ Elo 连续度量（K=32→24→20） |
| 稳定性验证 | 无 | ★ 5 维综合评分（A/B/C） |
| 反馈区分 | null 判断（脆弱） | ★ is_manipulated_feedback 列 |
| 余额来源 | 客户端传递 | 服务端 DB 权威值 |
| 练习设计 | 1 个阶段 | 3 个阶段（图像/资源/正式选择） |
| 正式选择 conflict | 66 | 80 |
| 余额/反馈 UI | 普通灰色文字 | ★ 红色粗体余额 + 绿/红 6xl 反馈卡片 |

---

## 脚本

| 脚本 | 用途 |
|---|---|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 构建生产版本 |
| `npm run seed-stimuli` | 播种刺激材料到 stimulus_pool |
| `npm run check:calibration` | 检查校准流程 |
| `npm run check:value-assignment` | 检查价值分配 |
| `npm run check:formal-choice` | 检查正式选择 |
| `npm run check:dots-stagegame` | 检查点数生成 |

---

## 安全提示

- ⚠️ 切勿向参与者泄露内部标签（稀缺/充裕、组别、set_id、Elo、calibration 等）
- ⚠️ `.env.local` 和 `study1.db*` 已在 `.gitignore` 中排除（`.env*`）
- ⚠️ 资源任务反馈为**预设操纵值**，非基于实际准确率
- ⚠️ 喜好排名从成对比较中**推断**（Elo 系统），非直接分配
- ⚠️ 余额以服务端 DB 为权威来源，不信任客户端传递值
