# Project.md — 2026年福建省大学生信息素养大赛模拟竞赛平台

> 本文档为项目唯一设计依据，供代码生成工具使用。所有约束必须严格遵守，不得擅自增减功能或修改设计规范。

---

## 一、项目概述

### 1.1 项目定位

面向福建省高职组信息素养大赛的**校内模拟竞赛平台**，由学校管理员统一管理，学生通过学号登录参与各环节模拟答题，系统实时展示排行榜并提供错题回顾。

### 1.2 目标用户

| 角色 | 说明 | 登录方式 |
|---|---|---|
| 管理员 | 学校赛事负责人 | 账号 admin / 密码 admin123 |
| 队长 | 每队第1人，可见全部环节 | 学号 / 密码=学号 |
| 队员 | 每队第2、3人，默认仅可见个人环节 | 学号 / 密码=学号 |

### 1.3 核心功能清单

1. 赛事管理（可新建赛事、新建环节、复制环节、启用/停用）
2. 题库管理（增删改查、Excel/CSV批量导入、组卷策略）
3. 队伍管理（增删改查、CSV/Excel批量导入、账号自动生成）
4. 答题系统（七种环节类型、防复制、切屏检测、计时、接力、抢答速度排名）
5. 实时排行榜（SSE推送、Redis ZSET、同分按用时排序）
6. 错题本（管理员开关控制是否显示答案）
7. 数据统计（成绩分布、题目正确率、知识模块分析）
8. 管理后台（仪表盘、预警记录、系统日志）

---

## 二、技术架构

### 2.1 技术栈

| 层级 | 技术选型 | 版本要求 |
|---|---|---|
| 前端 | Vue 3 + Vite + Element Plus | Vue 3.4+ |
| 状态管理 | Pinia | 2.x |
| 路由 | Vue Router | 4.x |
| HTTP请求 | Axios | 1.x |
| 后端 | Node.js + Express | Node 20 LTS |
| 数据库 | MySQL | 8.0 |
| 缓存/排行榜 | Redis | 7.x |
| 实时通信 | SSE (Server-Sent Events) | 原生 |
| 进程管理 | PM2 | 最新版 |
| 反向代理 | Nginx | 最新稳定版 |

### 2.2 部署方案

**本地开发阶段**：
- 前端：`localhost:5173`
- 后端：`localhost:3000`
- MySQL：`localhost:3306`
- Redis：`localhost:6379`

**云端部署阶段**：
- 服务器：阿里云美国硅谷轻量服务器
- 规格：通用型 2vCPU / 1.5GiB内存（实测 1613MB）/ ESSD云盘 40GiB / Ubuntu 24.04.2 LTS
- 登录方式：SSH免密登录（部署时提供公钥）
- 域名：用户自有域名，托管于Cloudflare
- 部署流程：**先在本地确认效果 → 用户提供服务器IP → 执行部署**

**已占用端口说明**：服务器 443 端口由已有的 xray（VLESS + REALITY）服务占用，
本平台不得修改该服务，Nginx 仅监听 80 端口对外提供服务。

**内存分配方案（1.5GiB 实际内存，已收紧）**：

| 服务 | 内存限制 | 说明 |
|---|---|---|
| MySQL | 256MB | 配置 `innodb_buffer_pool_size=128M` |
| Redis | 64MB | 配置 `maxmemory 64mb`，策略 `allkeys-lru` |
| Node.js后端 | 384MB | PM2配置 `max_memory_restart: 384M`，`--max-old-space-size=340` |
| Nginx | 64MB | 静态文件+反向代理 |
| 系统预留 | 800MB | 操作系统+SSH+其他 |
| Swap | 2GB | 兜底，防止 OOM 直接杀进程 |

**注意**：服务器实际内存为 1613MB（低于原计划的 2GiB）且默认无 swap，
因此上述内存参数已在原方案基础上进一步收紧，并额外配置 2GB swap 作为兜底。
部署时需关闭不必要的系统服务（snapd / apparmor / bluetooth 等），
MySQL 和 Redis 的内存配置必须严格限制。

### 2.3 目录结构

```
project/
├── frontend/                 # Vue 3 前端
│   ├── src/
│   │   ├── api/             # Axios封装
│   │   ├── assets/          # 静态资源
│   │   ├── components/      # 公共组件
│   │   ├── layouts/         # 布局组件
│   │   ├── router/          # 路由配置
│   │   ├── stores/          # Pinia状态
│   │   ├── styles/          # 全局样式
│   │   ├── utils/           # 工具函数
│   │   └── views/           # 页面
│   ├── public/
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── backend/                  # Node.js 后端
│   ├── src/
│   │   ├── config/          # 配置
│   │   ├── controllers/     # 控制器
│   │   ├── middlewares/     # 中间件
│   │   ├── models/          # 数据模型
│   │   ├── routes/          # 路由
│   │   ├── services/        # 业务逻辑
│   │   ├── utils/           # 工具函数
│   │   └── app.js           # 入口
│   ├── package.json
│   └── .env.example
├── database/
│   └── init.sql             # 建表语句
├── deploy/
│   ├── nginx.conf           # Nginx配置模板
│   ├── ecosystem.config.js  # PM2配置
│   └── deploy.sh            # 部署脚本
└── README.md
```

---

## 三、数据库设计

### 3.1 表结构

**events（赛事表）**

| 字段 | 类型 | 说明 |
|---|---|---|
| id | INT PK AUTO_INCREMENT | 主键 |
| name | VARCHAR(100) | 赛事名称 |
| description | TEXT | 赛事描述 |
| status | TINYINT | 0=停用 1=启用 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

**stages（环节表）**

| 字段 | 类型 | 说明 |
|---|---|---|
| id | INT PK AUTO_INCREMENT | 主键 |
| event_id | INT FK | 所属赛事 |
| name | VARCHAR(100) | 环节名称 |
| sort_order | INT | 排序序号 |
| config | JSON | 环节配置（见3.2） |
| status | TINYINT | 0=未开启 1=已开启 2=已结束 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

**questions（题目表）**

| 字段 | 类型 | 说明 |
|---|---|---|
| id | INT PK AUTO_INCREMENT | 主键 |
| type | TINYINT | 1=单选 2=多选 3=判断 |
| content | TEXT | 题干 |
| option_a | VARCHAR(500) | 选项A |
| option_b | VARCHAR(500) | 选项B |
| option_c | VARCHAR(500) | 选项C |
| option_d | VARCHAR(500) | 选项D |
| option_e | VARCHAR(500) | 选项E（可空） |
| option_f | VARCHAR(500) | 选项F（可空） |
| answer | VARCHAR(10) | 正确答案（如"A"或"ABC"） |
| analysis | TEXT | 解析 |
| module | VARCHAR(50) | 知识模块 |
| difficulty | TINYINT | 难度1-5 |
| source | VARCHAR(50) | 来源 |
| tags | VARCHAR(200) | 标签（逗号分隔） |
| created_at | DATETIME | 创建时间 |

**teams（队伍表）**

| 字段 | 类型 | 说明 |
|---|---|---|
| id | INT PK AUTO_INCREMENT | 主键 |
| name | VARCHAR(100) | 队伍名称 |
| leader_name | VARCHAR(50) | 队长姓名 |
| leader_id | VARCHAR(50) UNIQUE | 队长学号（团队赛登录账号） |
| leader_phone | VARCHAR(20) | 队长联系电话 |
| member1_name | VARCHAR(50) | 队员1姓名 |
| member1_id | VARCHAR(50) | 队员1学号（个人赛登录账号） |
| member2_name | VARCHAR(50) | 队员2姓名 |
| member2_id | VARCHAR(50) | 队员2学号（个人赛登录账号） |
| status | TINYINT | 0=禁用 1=启用 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

**answers（答题记录表）**

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT PK AUTO_INCREMENT | 主键 |
| stage_id | INT | 环节ID |
| team_id | INT | 队伍ID |
| student_id | VARCHAR(50) | 答题学生学号 |
| question_id | INT | 题目ID |
| user_answer | VARCHAR(10) | 学生答案 |
| is_correct | TINYINT | 0=错 1=对 2=未答 |
| score_delta | DECIMAL(5,2) | 本题得分变化 |
| time_spent | INT | 用时（秒） |
| submit_order | INT | 提交顺序（用于速度排名） |
| created_at | DATETIME | 答题时间 |

**stage_scores（环节成绩表）**

| 字段 | 类型 | 说明 |
|---|---|---|
| id | INT PK AUTO_INCREMENT | 主键 |
| stage_id | INT | 环节ID |
| team_id | INT | 队伍ID |
| student_id | VARCHAR(50) | 学号（个人环节用） |
| total_score | DECIMAL(8,2) | 总分 |
| total_time | INT | 总用时（秒） |
| rank | INT | 排名 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

**cheat_logs（预警记录表）**

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT PK AUTO_INCREMENT | 主键 |
| stage_id | INT | 环节ID |
| team_id | INT | 队伍ID |
| student_id | VARCHAR(50) | 学号 |
| event_type | VARCHAR(50) | 事件类型（切屏/退出全屏） |
| duration | INT | 持续时间（秒） |
| created_at | DATETIME | 记录时间 |

### 3.2 环节配置JSON结构

```json
{
  "mode": "individual",        // individual=个人 independent, team=团队协作
  "questionConfig": {
    "single": 6,               // 单选题数量
    "multiple": 2,             // 多选题数量
    "judge": 2,                // 判断题数量
    "shuffleOptions": true     // 选项乱序
  },
  "scoreConfig": {
    "singleScore": 2,          // 单选每题分值
    "multipleScore": 4,        // 多选每题分值
    "judgeScore": 1,           // 判断每题分值
    "wrongDeduct": true,       // 答错扣分
    "wrongDeductScore": 1,     // 答错扣几分
    "unansweredDeduct": false, // 不答是否扣分
    "unansweredDeductScore": 0,// 不答扣几分
    "openedNotSubmitDeduct": false, // 已打开未提交是否扣分
    "openedNotSubmitDeductScore": 0 // 已打开未提交扣几分
  },
  "timeConfig": {
    "totalTime": 600,          // 总时限（秒）
    "perQuestionTime": 0,      // 单题时限（秒），0=不限
    "speedRanking": false,     // 是否启用速度排名得分
    "speedRankingPercent": 50, // 速度前百分之多少得分
    "speedRankingRoundUp": false // 是否奇数进位取整
  },
  "specialConfig": {
    "timeAccumulate": false,   // 是否启用时间累加（接力）
    "firstPlayersNoDeduct": false, // 前段队员不扣分
    "allowSkip": true,         // 是否允许跳题
    "allowReturn": false,      // 是否允许返回
    "questionDifferent": false // 是否每人试题不同
  },
  "paperStrategy": "random",   // random=随机抽题 fixed=固定试卷
  "moduleFilter": [],          // 知识模块筛选（空=不限）
  "difficultyFilter": []       // 难度筛选（空=不限）
}
```

---

## 四、赛事引擎设计

### 4.1 赛事与环节管理

**赛事列表页**：
- 显示所有赛事卡片，包含赛事名称、描述、环节数量、状态
- 按钮：新建赛事、编辑、删除、进入管理

**环节管理页**（赛事详情内）：
- 显示该赛事下所有环节，按 sort_order 排序
- 每行显示：环节名称、答题模式、题目数量、总分、时限、状态
- 按钮：新建环节、编辑、复制、启用/停用、删除、上下移动排序

**新建/编辑环节表单**：
- 基本信息：环节名称、答题模式（个人/团队）
- 题目配置：单选数量、多选数量、判断数量、选项乱序开关
- 分值配置：每种题型分值、答错扣分开关及分值、不答扣分开关及分值、已打开未提交扣分开关及分值
- 时间配置：总时限、单题时限、速度排名开关、速度排名百分比、奇数进位开关
- 特殊配置：时间累加开关、前段队员不扣分开关、允许跳题开关、允许返回开关、每人试题不同开关
- 组卷策略：随机抽题/固定试卷、知识模块筛选、难度筛选

### 4.2 七个预置环节配置

**环节1：省级初赛-个人对抗**

| 配置项 | 值 |
|---|---|
| 答题模式 | 个人独立 |
| 题目 | 单选6 + 多选2 + 判断2，每人10题，三人试题不同 |
| 分值 | 单选2分、多选2分、判断2分 |
| 答错扣分 | 开启，扣1分 |
| 不答扣分 | 关闭 |
| 已打开未提交扣分 | 关闭 |
| 总时限 | 600秒（10分钟） |
| 速度排名 | 关闭 |
| 时间累加 | 关闭 |
| 前段队员不扣分 | 关闭 |
| 允许跳题 | 开启 |
| 允许返回 | 关闭 |
| 选项乱序 | 开启 |

**环节2：省级初赛-团队对抗**

| 配置项 | 值 |
|---|---|
| 答题模式 | 团队协作 |
| 题目 | 单选6 + 多选2 + 判断2，共10题 |
| 分值 | 单选4分、多选4分、判断4分 |
| 答错扣分 | 开启，扣1分 |
| 不答扣分 | 关闭 |
| 已打开未提交扣分 | 关闭 |
| 总时限 | 900秒（15分钟） |
| 速度排名 | 关闭 |
| 时间累加 | 关闭 |
| 允许跳题 | 开启 |
| 允许返回 | 关闭 |
| 选项乱序 | 开启 |

**环节3：省级决赛晋级赛-必答题**

| 配置项 | 值 |
|---|---|
| 答题模式 | 团队协作 |
| 题目 | 单选12 + 多选4 + 判断4，共20题 |
| 分值 | 单选3分、多选5分、判断1分 |
| 答错扣分 | 开启，扣1分 |
| 不答扣分 | 关闭 |
| 已打开未提交扣分 | 关闭 |
| 总时限 | 1080秒（18分钟） |
| 速度排名 | 关闭 |
| 时间累加 | 关闭 |
| 允许跳题 | 开启 |
| 允许返回 | 关闭 |
| 选项乱序 | 开启 |

**环节4：省级决赛晋级赛-抢答题**

| 配置项 | 值 |
|---|---|
| 答题模式 | 团队协作 |
| 题目 | 单选6 + 多选2 + 判断2，共10题 |
| 分值 | 单选4分、多选6分、判断2分 |
| 答错扣分 | 开启，扣2分 |
| 不答扣分 | 关闭 |
| 已打开未提交扣分 | 关闭 |
| 总时限 | 每题90秒 |
| 单题候时 | 5秒 |
| 速度排名 | 开启，前50%得分，四舍五入 |
| 时间累加 | 关闭 |
| 允许跳题 | 关闭（不答即不提交） |
| 允许返回 | 关闭 |
| 选项乱序 | 开启 |

**环节5：省级决赛排位赛-个人接力**

| 配置项 | 值 |
|---|---|
| 答题模式 | 个人独立（接力） |
| 题目 | 第1、2名各5题（1多选+3单选+1判断），第3名10题（3多选+4单选+3判断） |
| 分值 | 单选2.5分、多选4分、判断1分 |
| 答错扣分 | 第1、2名关闭，第3名开启 |
| 不答扣分 | 第1、2名关闭，第3名开启 |
| 已打开未提交扣分 | 第1、2名关闭，第3名开启 |
| 总时限 | 1080秒（18分钟），每人基础6分钟 |
| 时间累加 | 开启 |
| 前段队员不扣分 | 开启 |
| 允许跳题 | 开启 |
| 允许返回 | 关闭 |
| 选项乱序 | 开启 |

**环节6：省级决赛排位赛-团队抢答**

| 配置项 | 值 |
|---|---|
| 答题模式 | 团队协作 |
| 题目 | 单选4 + 多选3 + 判断3，共10题 |
| 分值 | 单选2.5分、多选4分、判断1分 |
| 答错扣分 | 开启，扣对应分值 |
| 不答扣分 | 关闭 |
| 已打开未提交扣分 | 关闭 |
| 总时限 | 每题60秒 |
| 速度排名 | 开启，前50%得分，奇数进位取整 |
| 时间累加 | 关闭 |
| 允许跳题 | 关闭 |
| 允许返回 | 关闭 |
| 选项乱序 | 开启 |

**环节7：省级决赛排位赛-AI专项**

| 配置项 | 值 |
|---|---|
| 答题模式 | 团队协作 |
| 题目 | 单选4 + 多选3 + 判断3，共10题 |
| 分值 | 单选2.5分、多选4分、判断1分 |
| 答错扣分 | 开启，扣对应分值 |
| 不答扣分 | 开启（跳题扣分） |
| 已打开未提交扣分 | 开启，扣对应分值 |
| 总时限 | 600秒（10分钟） |
| 速度排名 | 关闭 |
| 时间累加 | 关闭 |
| 允许跳题 | 开启（但跳题扣分） |
| 允许返回 | 关闭 |
| 选项乱序 | 开启 |

---

## 五、题库管理

### 5.1 题目列表页

- 表格显示：ID、题型、题干摘要（前50字）、知识模块、难度、来源、操作
- 筛选：按题型、知识模块、难度、来源筛选
- 搜索：按题干关键词搜索
- 按钮：新增题目、批量导入、导出、删除选中

### 5.2 新增/编辑题目

表单字段：题型（单选/多选/判断）、题干、选项A-F、正确答案、解析、知识模块、难度、来源、标签。

判断题自动生成“正确/错误”两个选项。

### 5.3 批量导入

**Excel/CSV模板表头**：
```
题型 | 题干 | 选项A | 选项B | 选项C | 选项D | 选项E | 选项F | 正确答案 | 解析 | 知识模块 | 难度 | 来源 | 标签
```

**导入规则**：
- 题型列填写“单选”“多选”“判断”
- 判断题只需填选项A=正确、选项B=错误，正确答案填“A”或“B”
- 多选题答案如“ABC”，无需分隔符
- 导入前自动校验：题干重复、选项缺失、答案与选项不匹配
- 导入后显示成功/失败数量及失败原因

### 5.4 组卷策略

每个环节创建时选择组卷策略：
- **随机抽题**：从题库中按题型/知识模块/难度筛选后随机抽取
- **固定试卷**：管理员手动指定题目ID列表

选项乱序在每次抽题时随机打乱选项顺序。

---

## 六、队伍管理

### 6.1 队伍列表页

- 表格显示：队伍名称、队长姓名、队长学号、队长电话、队员1、队员2、状态、操作
- 按钮：新增队伍、批量导入、导出、删除选中
- 搜索：按队伍名称或学号搜索

### 6.2 新增/编辑队伍

表单字段：队伍名称、队长姓名、队长学号、队长联系电话、队员1姓名、队员1学号、队员2姓名、队员2学号。

学号唯一性校验：队长学号和队员学号不能与已有队伍重复。

### 6.3 批量导入

**CSV/Excel表头**：
```
*队伍名称 | *队长姓名 | *队长学号 | *队长联系电话 | 队员1姓名 | 队员1学号 | 队员2姓名 | 队员2学号
```

带 `*` 为必填。导入后自动为每个学号创建账号，密码默认与学号相同。

### 6.4 账号规则

| 角色 | 登录账号 | 默认密码 | 可见环节 |
|---|---|---|---|
| 队长 | 队长学号 | 学号 | 全部环节 |
| 队员1 | 队员1学号 | 学号 | 个人环节（个人对抗、个人接力） |
| 队员2 | 队员2学号 | 学号 | 个人环节（个人对抗、个人接力） |

管理员可在后台修改队员可见环节配置。

---

## 七、答题系统

### 7.1 答题流程

1. 学生登录后进入“赛事列表”，看到当前已开启的环节
2. 点击环节进入答题准备页，显示环节名称、题目数量、总分、时限
3. 点击“开始答题”后进入答题页
4. 答题页布局：
   - 顶部：环节名称、剩余时间（倒计时）、当前题号/总题数
   - 中部：题干、选项（单选/多选/判断）
   - 底部：上一题/下一题（如允许）、跳题按钮、提交按钮
5. 提交后立即显示本题对错（如管理员开启“允许查看答案”）
6. 全部完成后显示总分、用时、排名

### 7.2 个人接力模式

- 第1名队员先答题，答完点击“交卷并接力”
- 系统计算节余时间，累加到第3名队员的时间池
- 第2名队员开始答题，答完同样接力
- 第3名队员答题时间 = 基础6分钟 + 第1、2名节余时间
- 界面需清晰显示当前是哪位队员在答题

### 7.3 抢答题模式

- 主持人（管理员）点击“开始本题”后，所有队伍同时看到题目
- 5秒候时后自动进入答题
- 队伍提交答案后，系统记录提交时间
- 所有队伍提交后（或90秒倒计时结束），系统按答对队伍提交时间排序，前50%得分
- 答错扣2分，不答不扣分

### 7.4 防复制实现

```css
body {
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}
```

```javascript
document.addEventListener('copy', e => e.preventDefault());
document.addEventListener('cut', e => e.preventDefault());
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('dragstart', e => e.preventDefault());
document.addEventListener('selectstart', e => e.preventDefault());
```

### 7.5 切屏检测

- 监听 `visibilitychange` 事件，记录切出次数和时长
- 监听 `blur` 事件，记录窗口失焦
- 超过阈值（3次或累计30秒）时，写入 cheat_logs 表
- 管理后台预警面板实时显示

---

## 八、实时排行榜

### 8.1 排行榜维度

- **总榜**：当前环节所有队伍按总分排名
- **个人榜**：个人环节中每位选手独立排名

### 8.2 技术实现

- Redis ZSET 存储排名：`ZADD stage:{stageId}:rank {score} {teamId}`
- 复合score：`score * 1000000 - timeSpent`（分数高在前，同分用时少在前）
- SSE推送：`GET /api/rank/stream?stageId=xxx`
- 服务端每3秒检查一次数据变化，有变化才推送
- 前端使用 EventSource 订阅，收到数据后更新表格

### 8.3 排行榜页面

- 表格显示：排名、队伍名称、总分、用时
- 前三名高亮显示（金/银/铜色边框）
- 实时更新时，行有淡入动画

---

## 九、错题本

### 9.1 管理员控制

管理员在环节配置中开启“允许查看答案”后，学生完成该环节后可查看错题及解析。

### 9.2 学生端展示

- 完成环节后，如管理员开启“允许查看答案”，显示“查看错题”按钮
- 点击后进入错题列表，显示：题干、你的答案、正确答案、解析
- 未开启时，只显示总分和排名，不显示错题

---

## 十、管理后台

### 10.1 仪表盘

- 当前在线队伍数
- 当前进行中的环节
- 今日答题次数
- 预警记录数量
- 快捷入口：题库管理、队伍管理、赛事管理

### 10.2 数据统计

- 成绩分布柱状图
- 各题目正确率
- 知识模块正确率雷达图
- 队伍成绩对比

### 10.3 预警管理

- 表格显示：时间、队伍、学号、事件类型、持续时间
- 支持导出CSV

---

## 十一、UI/UX 设计规范

### 11.1 设计风格

- **主基调**：白色（#FFFFFF）
- **辅助背景**：浅灰（#F5F7FA）
- **主强调色**：深蓝（#1A3A5C）
- **次强调色**：中蓝（#2B5EA7）
- **选中态/标签**：浅蓝灰（#E8EEF5）
- **文字主色**：深灰（#2C3E50）
- **文字次色**：中灰（#7F8C8D）
- **边框色**：浅灰（#E0E6ED）
- **危险色**：红色（#E74C3C）
- **警告色**：橙色（#F39C12）

**禁止使用绿色系**（#00FF00、#4CAF50、#2E7D32、#27AE60 等）。

### 11.2 圆角规范

- 卡片：12px
- 按钮：8px
- 输入框：6px
- 标签/徽章：4px

### 11.3 字体

- 中文：PingFang SC、Microsoft YaHei、sans-serif
- 英文/数字：Inter、Roboto、sans-serif
- 标题：16-24px，字重600
- 正文：14px，字重400
- 辅助文字：12px，字重400

### 11.4 间距

- 页面内边距：24px
- 卡片内边距：20px
- 元素间距：16px
- 紧凑间距：8px

### 11.5 禁止事项

- 禁止使用任何 emoji
- 禁止使用绿色系
- 禁止使用深色背景
- 所有图标使用 SVG 或 Element Plus 内置图标

### 11.6 底部版权

每个页面底部固定显示：

```
© 2026 空城星梦筏 · All Rights Reserved
```

---

## 十二、页面结构

### 12.1 前台页面

| 页面 | 路径 | 说明 |
|---|---|---|
| 登录页 | /login | 学号+密码登录 |
| 首页 | / | 显示当前赛事和已开启环节 |
| 答题准备页 | /stage/:id/ready | 显示环节信息 |
| 答题页 | /stage/:id/answer | 答题界面 |
| 成绩页 | /stage/:id/result | 显示总分、排名 |
| 错题本 | /stage/:id/wrong | 错题列表 |
| 排行榜 | /stage/:id/rank | 实时排行榜 |

### 12.2 后台页面

| 页面 | 路径 | 说明 |
|---|---|---|
| 仪表盘 | /admin | 数据概览 |
| 赛事管理 | /admin/events | 赛事列表 |
| 环节管理 | /admin/events/:id/stages | 环节列表 |
| 环节编辑 | /admin/stages/:id/edit | 编辑环节配置 |
| 题库管理 | /admin/questions | 题目列表 |
| 题目编辑 | /admin/questions/:id/edit | 编辑题目 |
| 批量导入 | /admin/questions/import | 导入题目 |
| 队伍管理 | /admin/teams | 队伍列表 |
| 队伍编辑 | /admin/teams/:id/edit | 编辑队伍 |
| 批量导入 | /admin/teams/import | 导入队伍 |
| 数据统计 | /admin/stats | 统计图表 |
| 预警管理 | /admin/cheat-logs | 预警记录 |
| 系统设置 | /admin/settings | 系统配置 |

---

## 十三、开发与部署流程

### 13.1 本地开发阶段

1. 安装 Node.js 20 LTS、MySQL 8.0、Redis 7.x
2. 创建数据库 `info_literacy`，执行 `database/init.sql`
3. 后端：`cd backend && npm install && npm run dev`
4. 前端：`cd frontend && npm install && npm run dev`
5. 访问 `http://localhost:5173`，使用 admin/admin123 登录
6. 导入测试题目和队伍，验证各环节答题流程
7. **确认效果后，再进入部署阶段**

### 13.2 云端部署阶段

**前置条件**：用户提供服务器IP和SSH公钥

**部署步骤**：
1. SSH免密登录服务器
2. 安装 Node.js 20、MySQL 8.0、Redis、Nginx、PM2
3. 创建数据库，导入 `init.sql`
4. 上传后端代码，配置 `.env`，执行 `npm install`
5. 上传前端代码，执行 `npm run build`
6. 配置 Nginx 反向代理
7. 使用 PM2 启动后端：`pm2 start ecosystem.config.js`
8. 配置防火墙，开放 80/443 端口
9. 绑定域名（用户自有域名，托管于Cloudflare）
10. 验证访问

**Nginx 配置模板**：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        root /var/www/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api/rank/stream {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
    }
}
```

**PM2 配置**：

```javascript
module.exports = {
  apps: [{
    name: 'info-literacy-api',
    script: './src/app.js',
    instances: 1,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
```

### 13.3 环境变量

```env
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=info_literacy
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
JWT_SECRET=your_jwt_secret
```

---

## 十四、版权声明

```
© 2026 空城星梦筏 · All Rights Reserved
```

此声明需出现在每个页面的底部。

---

## 十五、GitHub仓库地址

```
https://github.com/wlovewh/LiteracyStar.git
```

每次完成一个小版本或者相关的改动，请及时提交，这是repo的地址。

---

**文档结束。**

# 信息素养大赛综合平台 — 追加设计文档

> 本文档为追加设计文档，仅包含综合平台的新增内容，不重复模拟竞赛平台已有内容。综合平台与模拟竞赛平台各自独立运行，仅题库数据双向同步。


## 一、本轮确认清单

| 编号 | 确认内容 |
|---|---|
| 1 | 无密钥队员身份持久化：B方案（localStorage记住） |
| 2 | 有密钥队员身份识别：A方案（自动从队伍信息读取） |
| 3 | 聊天记录删除粒度：C方案（可删单条+可清空整个聊天室） |
| 4 | 题目快速检索关键词提取：C方案（连续中文片段，长度>4，去重取前3） |
| 5 | 一键分享目标选择：相结合（多个聊天室才弹选择框，否则直接发送） |
| 6 | 快速短语：已确认，且后台允许管理员增删改 |
| 7 | 消息搜索范围：B方案（当前聊天室全部未过期消息，过期不可搜） |
| 8 | 聊天记录默认保留时间：30天（可配置为7/15/30/永久） |
| 9 | 题目去重相似度阈值：80% |
| 10 | 计时器：正计时（从0往上走），支持开始/暂停/结束/重置 |
| 11 | 采纳功能：答案提交卡片、计时器、在线状态、消息引用回复、题目去重提示 |
| 12 | 暂不采纳：题目收藏夹（后续需要再追加）、聊天室快捷跳转 |


## 二、综合平台概述

### 2.1 与模拟竞赛平台的关系

综合平台与模拟竞赛平台**各自独立运行**，拥有独立的前端、后端、数据库表结构和管理端。两者仅共享 `questions` 题库表（双向同步），其余数据互不继承。

**入口**：模拟竞赛平台登录页的图标（SVG）点击后，跳转到综合平台的密钥输入页。

### 2.2 用户角色

| 角色 | 进入方式 | 权限 |
|---|---|---|
| 管理员 | 管理员密钥 | 管理端全部功能 |
| 用户（有密钥） | 用户密钥 | 资源收录、题库检索、聊天室 |
| 用户（无密钥） | 首页邀请码 | 仅聊天室（需先设置姓名/学号） |

### 2.3 首页布局

首页分为**两个独立区域**：

**区域一：访问密钥登录**
- 输入框 + “访问”按钮
- 验证成功后跳转到对应界面（管理员端或用户端）

**区域二：加入聊天室**
- 输入框（6位邀请码）+ “加入”按钮
- 无密钥用户输入邀请码后，进入聊天室，首次需设置姓名/学号
- 有密钥用户登录后，也可在此输入邀请码加入其他队伍的聊天室（如被邀请）


## 三、系统架构与部署调整

### 3.1 内存分配调整（基于实际服务器1613MB）

| 服务 | 原方案 | 调整后 | 说明 |
|---|---|---|---|
| MySQL | 512MB | **128MB** | `innodb_buffer_pool_size=128M` |
| Redis | 128MB | **64MB** | `maxmemory 64mb`，策略 `allkeys-lru` |
| Node.js（模拟竞赛） | 512MB | **384MB** | PM2 `max_memory_restart: 384M` |
| Node.js（综合平台） | 256MB | **256MB** | 含WebSocket服务 |
| Nginx | 64MB | **64MB** | 静态文件+反向代理 |
| 系统预留 | 800MB | **约717MB** | 操作系统+SSH+其他 |
| **合计** | 2016MB | **1613MB** | 匹配服务器实际内存 |
| **Swap** | 无 | **1-2GB** | 兜底，防止OOM |

**Swap配置命令**（部署时执行）：

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

**注意**：两个Node.js进程合计640MB，加上MySQL和Redis，内存压力较大。如果实际运行中频繁触发swap，建议将综合平台的WebSocket服务与主API合并为同一进程，或进一步降低Node限制。

### 3.2 新增技术依赖

| 依赖 | 用途 |
|---|---|
| `ws` 或 `socket.io` | WebSocket服务，聊天室实时通信 |
| `ioredis` | Redis Pub/Sub消息广播 |
| `multer` | 网站图标上传 |
| `axios` | 获取网站favicon |

### 3.3 Nginx路由配置

```nginx
# 模拟竞赛平台
location / {
    root /var/www/competition/dist;
    try_files $uri $uri/ /index.html;
}

# 综合平台
location /platform {
    root /var/www/platform/dist;
    try_files $uri $uri/ /index.html;
}

# 综合平台API
location /platform-api {
    proxy_pass http://localhost:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
}

# WebSocket
location /ws {
    proxy_pass http://localhost:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

**PM2进程**：综合平台后端使用独立进程，端口3001，内存限制256MB。


## 四、访问密钥与登录机制

### 4.1 密钥类型

| 密钥类型 | 权限 | 访问范围 |
|---|---|---|
| 管理员密钥 | 管理端全部功能 | 资源管理、题库管理、密钥管理、聊天室管理、数据统计 |
| 用户密钥 | 仅用户端功能 | 资源浏览、题库检索、聊天室 |

### 4.2 密钥管理

管理员可在后台创建/编辑/删除密钥。密钥字段：
- 密钥值（自定义或随机生成）
- 权限类型（管理员/用户）
- 备注
- 有效期（可选，NULL=永久）
- 状态（启用/禁用）

**支持修改密钥权限**：将用户密钥升级为管理员密钥，或反之。

### 4.3 登录流程

1. 用户在综合平台首页输入密钥
2. 系统验证密钥有效性及权限类型
3. 验证通过后，跳转到对应界面（管理员端或用户端）


## 五、资源收录功能

### 5.1 分类设计（预置九大分类，管理员可自定义增删改）

**分类1：学术信息资源**
| 网站名称 | 网址 | 简短介绍 |
|---|---|---|
| 中国知网（CNKI） | https://www.cnki.net/ | 中文期刊、学位论文、会议论文检索 |
| 万方数据知识服务平台 | https://www.wanfangdata.com.cn/ | 学术期刊、学位论文、专利标准 |
| 维普中文期刊服务平台 | http://qikan.cqvip.com/ | 中文科技期刊全文检索 |
| 读秀学术搜索 | https://www.duxiu.com/ | 图书全文检索与文献传递 |
| 国家哲学社会科学文献中心 | http://www.ncpssd.org/ | 哲学社科文献免费开放获取 |

**分类2：政府开放信息资源**
| 网站名称 | 网址 | 简短介绍 |
|---|---|---|
| 中华人民共和国中央人民政府 | http://www.gov.cn/ | 国务院政策文件与政务信息 |
| 国家统计局 | http://www.stats.gov.cn/ | 国家统计数据查询 |
| 国家知识产权局 | https://www.cnipa.gov.cn/ | 专利检索与知识产权信息 |
| 国家标准全文公开系统 | https://openstd.samr.gov.cn/ | 国家标准全文在线阅读 |
| 中国互联网络信息中心（CNNIC） | http://www.cnnic.net.cn/ | 互联网发展统计报告 |

**分类3：信息检索系统**
| 网站名称 | 网址 | 简短介绍 |
|---|---|---|
| FULink文献提供系统 | https://www.fulink.edu.cn/ | 福建省高校数字图书馆一站式检索 |
| CALIS中国高等教育文献保障系统 | http://www.calis.edu.cn/ | 全国高校文献资源共建共享 |
| NSTL国家科技图书文献中心 | https://www.nstl.gov.cn/ | 国家科技文献资源保障平台 |
| CASHL开世览文 | http://www.cashl.edu.cn/ | 高校人文社科文献中心 |

**分类4：信息检索理论与技术**
| 网站名称 | 网址 | 简短介绍 |
|---|---|---|
| 高校信息素养教育数据库 | https://suyang.zxhnzq.com/ | 检索技术微视频案例教学 |
| 信息素养大赛学练测平台 | https://xlc.xxsuyang.com/ | 学练测评一站式备赛平台 |

**分类5：实用学习资源**
| 网站名称 | 网址 | 简短介绍 |
|---|---|---|
| 中国大学MOOC | https://www.icourse163.org/ | 高校课程在线学习平台 |
| 学堂在线 | https://www.xuetangx.com/ | 清华大学慕课平台 |
| 国家职业教育智慧教育平台 | https://vocational.smartedu.cn/ | 职业教育数字资源 |
| 网易公开课 | https://open.163.com/ | 国内外名校公开课 |

**分类6：AI素养与工具**
| 网站名称 | 网址 | 简短介绍 |
|---|---|---|
| AI素养与技能提升数据库 | https://ai.xxsuyang.com/ | AI常识、提示词、智能体学习 |
| DeepSeek | https://www.deepseek.com/ | 国产大模型对话与推理 |
| 豆包 | https://www.doubao.com/ | 字节跳动AI对话助手 |
| 腾讯元宝 | https://yuanbao.tencent.com/ | 腾讯AI对话与搜索助手 |

**分类7：科研工具与知识管理**
| 网站名称 | 网址 | 简短介绍 |
|---|---|---|
| 知网研学 | https://x.cnki.net/ | 文献管理与笔记工具 |
| 万方智研平台 | https://zhiyan.wanfangdata.com.cn/ | AI辅助科研全流程平台 |
| 悟空科研 | https://www.wukongkeyan.com/ | AI辅助阅读与写作平台 |

**分类8：学术写作与规范**
| 网站名称 | 网址 | 简短介绍 |
|---|---|---|
| 中国裁判文书网 | https://wenshu.court.gov.cn/ | 司法文书检索与学术引用 |
| 国家法律法规数据库 | https://flk.npc.gov.cn/ | 法律法规查询与引用 |
| 中国互联网联合辟谣平台 | http://www.piyao.org.cn/ | 信息真伪核验工具 |

**分类9：数据工具与商业信息**
| 网站名称 | 网址 | 简短介绍 |
|---|---|---|
| 天眼查 | https://www.tianyancha.com/ | 企业信息与商业数据查询 |
| 国家企业信用信息公示系统 | https://www.gsxt.gov.cn/ | 企业信用信息查询 |

### 5.2 图标获取规则

优先级从高到低：
1. 管理员手动上传的图标
2. 后端通过 `https://www.google.com/s2/favicons?domain={domain}&sz=64` 自动获取
3. 获取失败时，默认使用**网站名称的第一个字**作为文字图标（浅蓝灰背景 + 深蓝色文字，圆角正方形）

### 5.3 前端展示

**页面布局**：
- 顶部：综合平台名称 + 搜索框（可搜索网站名称/介绍）
- 左侧：竖向分类列表（可折叠）
- 右侧：网站卡片网格

**网站卡片**：
- 圆角矩形（12px圆角）
- 左侧正方形图标区（64x64px，圆角8px）
- 右侧上方标题（16px，深灰#2C3E50，600字重）
- 右侧下方介绍（12px，中灰#7F8C8D）
- 卡片悬停：边框变为中蓝（#2B5EA7），轻微上浮阴影
- 点击卡片：在新标签页打开网站

### 5.4 管理端功能

- 分类管理：新增/编辑/删除/排序分类
- 网站管理：在指定分类下新增/编辑/删除网站条目
- 网站字段：名称、网址、简短介绍、图标（上传或自动获取）、排序序号、是否启用


## 六、题库检索功能

### 6.1 数据来源

与模拟竞赛平台**共用同一个 `questions` 表**，双向实时同步。在综合平台管理端添加的题目，模拟竞赛平台立即可用；反之亦然。

### 6.2 检索功能

**检索维度**：
- 精确匹配：按题目ID精确查找；按题干全文精确匹配
- 模糊匹配：按题干关键词模糊搜索（`LIKE '%关键词%'`）；按知识模块、题型、难度、标签筛选

**检索结果展示**：
- 表格显示：ID、题型、题干（完整）、选项、正确答案、解析、知识模块、难度
- 支持分页（每页20条）
- 支持导出检索结果为CSV

### 6.3 权限控制

- 通过邀请码进入聊天室的用户**也可以使用题库检索功能**
- 此功能由管理员在后台**开关控制**，可随时开启或关闭
- 开放时，无密钥用户登录聊天室后，顶部导航栏显示“题库检索”入口

### 6.4 一键分享题目到聊天室

在题库检索页，每道题旁边增加“分享到聊天室”按钮：
- 如果用户**只有一个聊天室**（本队聊天室），直接发送
- 如果用户**有多个聊天室**（如被邀请加入其他队伍），弹出选择框选择目标聊天室
- 发送后，聊天室中显示题目卡片


## 七、网页聊天功能

### 7.1 技术架构

```
┌──────────┐     WebSocket      ┌──────────────┐
│  队长端   │ ◄────────────────► │              │
└──────────┘                    │  Node.js     │
                                │  WebSocket   │
┌──────────┐     WebSocket      │  Server      │
│  队员1端  │ ◄────────────────► │              │
└──────────┘                    │  + Redis     │
                                │  Pub/Sub     │
┌──────────┐     WebSocket      │              │
│  队员2端  │ ◄────────────────► │              │
└──────────┘                    └──────────────┘
```

**消息流程**：
1. 发送方通过WebSocket发送消息到服务端
2. 服务端将消息发布到Redis频道（`chat:room:{roomId}`）
3. 所有订阅了该频道的客户端收到消息
4. 服务端将消息持久化到数据库

### 7.2 聊天室设计

**房间规则**：
- 每个队伍一个独立聊天室，房间ID = 队伍ID
- 默认最多**3人**（队长+2队员），**后台可修改最大人数**
- 队长登录综合平台后，自动进入本队聊天室
- 队员通过邀请码加入聊天室

**邀请码机制**：
- 队长在聊天界面点击“生成邀请码”，系统生成6位数字邀请码
- 邀请码有效期：24小时（可续期）
- 队员在综合平台首页输入邀请码后加入聊天室

**两种进入路径**：
1. **有密钥的队员**：登录综合平台后，在首页“加入聊天室”区域输入邀请码，或直接在聊天室界面输入邀请码。身份自动从队伍信息读取（显示为“已登录”状态）。
2. **无密钥的队员**：直接从首页输入邀请码加入，首次需设置姓名/学号。身份通过**localStorage记住**，下次进入同一聊天室自动识别。

### 7.3 消息类型

| 类型 | 说明 | 显示样式 |
|---|---|---|
| `text` | 普通文本消息 | 气泡，左右区分发送者 |
| `question` | 题目内容（队长发送） | 卡片样式，含题干和选项 |
| `answer` | 答案提交卡片 | 高亮气泡，带“答案”标签 |
| `system` | 系统消息 | 居中小字灰色 |

### 7.4 答案提交卡片

队员在聊天室点击“提交答案”按钮后：
1. 弹出选项选择器（A/B/C/D/多选）
2. 队员选择后发送一条格式化的答案卡片
3. 卡片显示：题目ID、所选答案、提交者
4. **答案冲突提示**：如果两名队员提交的答案不一致，系统在聊天室中发送一条系统消息：“答案冲突：队员1选A，队员2选B，请队长确认”

### 7.5 题目快速检索按钮

队长发送题目后，题目卡片上自动显示“检索本题”按钮：
- 点击后，系统自动提取题干中的**连续中文片段（长度>4个字）** ，去重后取前3个作为关键词
- 跳转到题库检索页（**新标签页打开**，不打断聊天流程）
- 自动填入提取的关键词并执行搜索

### 7.6 快速短语

聊天室输入框上方预设快速短语按钮，管理员可在后台**增删改**：

```
这题选A
这题选B
这题选C
这题选D
我查到选A
我查到选B
确定选C
稍等，正在查
查到了，发你
这题不会
```

### 7.7 消息引用回复

队员可以点击某条消息右侧的“引用”图标：
- 输入框上方显示被引用的消息
- 发送后显示为引用卡片
- 形成清晰的问答对应关系

### 7.8 题目去重提示

当队长发送的题目在聊天室历史消息中已经出现过（**题干相似度>80%**），系统自动提示：“此题之前出现过，是否需要查看历史讨论？”

相似度算法：使用简单的文本相似度算法（如Jaccard相似度或Levenshtein距离）。

### 7.9 计时器

聊天室顶部显示一个**小小的圆角矩形**计时器：
- 正计时（从0往上走）
- 支持开始、暂停、结束、重置
- 仅作为辅助工具，不影响正式比赛

### 7.10 成员在线状态

成员列表中，每位成员的姓名旁显示一个小圆点：
- 蓝色（#2B5EA7）：在线
- 灰色（#B0BEC5）：离线

**心跳机制**：WebSocket每30秒发送一次心跳，超过60秒无心跳标记为离线。

### 7.11 消息搜索

- 搜索范围：**当前聊天室的所有未过期消息**（过期消息不可搜索）
- 搜索维度：按关键词搜索消息内容
- 搜索结果：显示消息列表，点击可跳转到该消息在聊天记录中的位置

### 7.12 消息持久化与保留

- 所有消息写入 `chat_messages` 表
- 默认保留时间：**30天**（后台可配置为7天/15天/30天/永久）
- 队员断线重连后，通过REST API拉取最近50条消息
- **删除功能**：
  - 管理员可删除单条消息
  - 管理员可清空整个聊天室的消息

### 7.13 前端界面

**布局**：
- 左侧：聊天室成员列表（显示在线状态）
- 中间：消息列表（按时间倒序，最新消息在底部）
- 顶部：计时器 + 消息搜索框
- 底部：输入框 + 发送按钮 + 快速短语 + “发送题目”按钮

**消息气泡**：
- 自己发送的消息：右对齐，浅蓝灰背景（#E8EEF5），深蓝文字
- 他人发送的消息：左对齐，白色背景，灰色边框
- 题目卡片：全宽卡片，包含题干和选项，右上角有“检索本题”按钮
- 答案卡片：高亮气泡，带“答案”标签


## 八、管理端设计

### 8.1 管理端功能清单

| 功能 | 说明 |
|---|---|
| 密钥管理 | 创建/编辑/删除密钥，设置权限和有效期 |
| 资源管理 | 分类管理、网站增删改、图标上传 |
| 题库管理 | 与模拟竞赛平台共享题库，支持完整的增删改查和批量导入 |
| 聊天室管理 | 修改最大人数、配置保留时间、删除单条消息、清空聊天室 |
| 快速短语管理 | 增删改快速短语 |
| 数据统计 | 资源访问次数、题库检索次数、聊天消息量 |

### 8.2 聊天室管理详情

- **最大人数修改**：管理员可修改每个聊天室的最大人数（默认3人）
- **保留时间配置**：可设置为7天/15天/30天/永久
- **消息删除**：可删除单条消息
- **聊天室清空**：可清空整个聊天室的消息


## 九、用户端设计

### 9.1 页面结构

| 页面 | 路径 | 说明 |
|---|---|---|
| 首页 | `/platform` | 两个区域：密钥登录 + 加入聊天室 |
| 资源收录页 | `/platform/resources` | 九大分类的网站卡片展示 |
| 题库检索页 | `/platform/questions` | 题目检索与浏览 |
| 聊天室页 | `/platform/chat` | 实时聊天界面 |
| 管理员登录页 | `/platform/admin` | 管理员密钥登录 |

### 9.2 导航设计

顶部导航栏（白色背景，底部浅灰边框）：
- 左侧：平台名称“信息素养大赛综合平台”
- 右侧：资源收录、题库检索、聊天室、退出登录

导航栏高度：56px，选中项底部显示2px中蓝下划线。


## 十、UI/UX 设计规范（追加）

### 10.1 继承模拟竞赛平台的设计规范

- 主基调：白色（#FFFFFF）
- 辅助背景：浅灰（#F5F7FA）
- 主强调色：深蓝（#1A3A5C）
- 次强调色：中蓝（#2B5EA7）
- 选中态/标签：浅蓝灰（#E8EEF5）
- 文字主色：深灰（#2C3E50）
- 文字次色：中灰（#7F8C8D）
- 边框色：浅灰（#E0E6ED）
- 危险色：红色（#E74C3C）
- 圆角：卡片12px、按钮8px、输入框6px
- 禁止使用绿色系、禁止emoji、禁止深色背景

### 10.2 聊天室特有样式

- 消息列表背景：浅灰（#F5F7FA）
- 消息气泡圆角：12px（左上角/右上角根据发送者方向调整）
- 消息时间戳：12px，中灰，显示在气泡下方
- 在线状态指示：小圆点，在线为蓝色（#2B5EA7），离线为灰色（#B0BEC5）
- 计时器：圆角矩形（8px圆角），浅蓝灰背景（#E8EEF5），深蓝文字

### 10.3 底部版权

每个页面底部固定显示：

```
© 2026 空城星梦筏 · All Rights Reserved
```


## 十一、数据库新增表

### 11.1 access_keys（访问密钥表）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | INT PK AUTO_INCREMENT | 主键 |
| key_value | VARCHAR(64) UNIQUE | 密钥值 |
| key_type | TINYINT | 1=管理员 2=用户 |
| remark | VARCHAR(200) | 备注 |
| expires_at | DATETIME | 有效期（NULL=永久） |
| status | TINYINT | 0=禁用 1=启用 |
| created_at | DATETIME | 创建时间 |

### 11.2 resource_categories（资源分类表）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | INT PK AUTO_INCREMENT | 主键 |
| name | VARCHAR(50) | 分类名称 |
| sort_order | INT | 排序 |
| status | TINYINT | 0=禁用 1=启用 |

### 11.3 resource_sites（资源网站表）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | INT PK AUTO_INCREMENT | 主键 |
| category_id | INT FK | 所属分类 |
| name | VARCHAR(100) | 网站名称 |
| url | VARCHAR(500) | 网址 |
| description | VARCHAR(200) | 简短介绍 |
| icon_url | VARCHAR(500) | 图标URL |
| sort_order | INT | 排序 |
| status | TINYINT | 0=禁用 1=启用 |
| created_at | DATETIME | 创建时间 |

### 11.4 chat_rooms（聊天室表）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | INT PK AUTO_INCREMENT | 主键 |
| team_id | INT | 关联队伍ID |
| invite_code | VARCHAR(6) UNIQUE | 邀请码 |
| invite_expires_at | DATETIME | 邀请码有效期 |
| max_members | INT | 最大人数（默认3） |
| retention_days | INT | 消息保留天数（默认30，0=永久） |
| created_at | DATETIME | 创建时间 |

### 11.5 chat_messages（聊天消息表）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT PK AUTO_INCREMENT | 主键 |
| room_id | INT FK | 聊天室ID |
| sender_role | VARCHAR(20) | leader/member1/member2 |
| sender_name | VARCHAR(50) | 发送者姓名 |
| message_type | VARCHAR(20) | text/question/answer/system |
| content | TEXT | 消息内容 |
| quoted_message_id | BIGINT | 引用的消息ID（可空） |
| created_at | DATETIME | 发送时间 |

### 11.6 quick_phrases（快速短语表）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | INT PK AUTO_INCREMENT | 主键 |
| content | VARCHAR(100) | 短语内容 |
| sort_order | INT | 排序 |
| status | TINYINT | 0=禁用 1=启用 |


## 十二、部署说明（追加）

### 12.1 部署步骤

1. SSH免密登录服务器
2. 安装 Node.js 20、MySQL 8.0、Redis、Nginx、PM2
3. 创建数据库，导入 `init.sql`
4. 配置Swap（1-2GB）
5. 调整MySQL buffer pool至128M
6. 调整Redis maxmemory至64M
7. 上传模拟竞赛平台代码，配置PM2，启动
8. 上传综合平台代码，配置PM2，启动
9. 配置Nginx反向代理
10. 绑定域名（用户自有域名，托管于Cloudflare）
11. 验证访问

### 12.2 PM2配置

**模拟竞赛平台**：
```javascript
module.exports = {
  apps: [{
    name: 'competition-api',
    script: './src/app.js',
    instances: 1,
    max_memory_restart: '384M',
    env: { NODE_ENV: 'production', PORT: 3000 }
  }]
};
```

**综合平台**：
```javascript
module.exports = {
  apps: [{
    name: 'platform-api',
    script: './src/app.js',
    instances: 1,
    max_memory_restart: '256M',
    env: { NODE_ENV: 'production', PORT: 3001 }
  }]
};
```

### 12.3 环境变量

**综合平台**：
```env
PORT=3001
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=info_literacy
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
JWT_SECRET=your_jwt_secret
```

## 十三、项目目录重构方案

### 13.1 重构目标

原有模拟竞赛平台的项目文件目前直接位于项目根目录下（如 `frontend/`、`backend/`、`database/` 等）。为清晰区分两个独立平台，需将原模拟平台整体移入 `competition-platform/` 目录，新综合平台放入 `integrated-platform/` 目录，形成并列结构。

### 13.2 推荐目录结构

```
项目根目录/
├── competition-platform/           # 原模拟竞赛平台（整体移入）
│   ├── frontend/
│   ├── backend/
│   ├── database/
│   ├── deploy/
│   └── README.md
│
├── integrated-platform/            # 新综合平台（全新项目）
│   ├── frontend/
│   ├── backend/
│   ├── database/
│   ├── deploy/
│   └── README.md
│
└── README.md                       # 项目总说明（可选）
```

### 13.3 需要同步调整的引用

将原模拟平台移入 `competition-platform/` 后，以下配置需对应修改：

| 位置 | 原内容 | 调整后 |
|---|---|---|
| PM2 配置文件 | `script: './src/app.js'` | 路径不变（在 `competition-platform/backend/` 下执行），但 PM2 启动时需 `cd competition-platform/backend` |
| Nginx 配置 | `root /var/www/frontend/dist;` | `root /var/www/competition-platform/frontend/dist;` |
| 后端 `.env` | 数据库连接、端口等 | 路径不变，但需确保从新目录执行 |
| 部署脚本 | 文件路径 | 更新为 `competition-platform/backend` 等新路径 |
| 前端构建输出 | `dist/` | 路径不变，但部署时复制到 `/var/www/competition-platform/frontend/dist` |
| 数据库初始化脚本 | `database/init.sql` | 移入 `competition-platform/database/init.sql` |

**注意**：如果原有代码中使用相对路径（如 `./src/app.js`、`../database/init.sql`），只要保持项目内部相对关系不变，则无需修改代码；仅需调整外部部署脚本和 Nginx 路径。

### 13.4 服务器部署路径建议

```
/var/www/
├── competition-platform/           # 模拟平台前端构建产物
│   └── frontend/dist/
├── integrated-platform/            # 综合平台前端构建产物
│   └── frontend/dist/
└── ...
```

PM2 进程分别从各自后端目录启动：

```bash
# 模拟竞赛平台
cd /var/www/competition-platform/backend
pm2 start ecosystem.config.js

# 综合平台
cd /var/www/integrated-platform/backend
pm2 start ecosystem.config.js
```

Nginx 按路径区分：

```nginx
# 模拟竞赛平台（根路径）
location / {
    root /var/www/competition-platform/frontend/dist;
    try_files $uri $uri/ /index.html;
}

# 综合平台（/platform 路径）
location /platform {
    root /var/www/integrated-platform/frontend/dist;
    try_files $uri $uri/ /index.html;
}
```

### 13.5 迁移操作步骤

1. 停止原模拟平台所有 PM2 进程：`pm2 stop competition-api`
2. 在项目根目录创建 `competition-platform/` 文件夹
3. 将原有 `frontend/`、`backend/`、`database/`、`deploy/` 等整体移入 `competition-platform/`
4. 更新部署脚本、Nginx 配置、PM2 启动路径中的目录引用
5. 重新启动模拟平台，验证功能正常
6. 新建 `integrated-platform/` 目录，按追加文档开发综合平台
7. 部署综合平台，配置独立的 PM2 进程和 Nginx 路由

### 13.6 综合平台独立性的再次强调

综合平台是**全新项目**，不在原模拟平台目录内新增文件。它拥有独立的前端、后端、管理端和数据库表结构，仅通过共用 `questions` 表与模拟平台实现题库双向同步。两个平台并列部署，互不干扰。

---

## 十四、实施记录（2026-10-14）

### 14.1 目录重构执行结果

按第十三章方案完成重构，项目根目录现为：

```
LiteracyStar/
├── project.md
├── README.md
├── .gitignore
├── deploy/
│   └── deploy.sh                  双平台一键部署脚本
├── competition-platform/          模拟竞赛平台
│   ├── backend/                   Node.js + Express（端口 3000）
│   ├── frontend/                  Vue 3 + Vite
│   ├── database/
│   └── deploy/                    ecosystem.config.js + nginx.conf
└── integrated-platform/           综合平台
    ├── backend/                   Node.js + Express + ws（端口 3001）
    ├── frontend/                  Vue 3 + Vite
    ├── database/
    └── deploy/                    ecosystem.config.js
```

原 `info-literacy` 部署已在服务器备份至 `/var/www/info-literacy.bak`。

### 14.2 模拟平台问题修复

| 编号 | 问题 | 根因 | 修复方式 |
| --- | --- | --- | --- |
| ① | 模板下载返回 401 | `window.open` 无法携带 Authorization 头 | 改为 axios blob 下载 + `downloadBlob` |
| ① | 错误账号提示"登录已过期" | 401 拦截器把所有 401 当作会话过期 | 登录接口路径跳过登出跳转，直接透出后端消息 |
| ② | 点击选项即自动提交 | `selectOption` 内直接调用提交 | 移除自动提交，改为点击「下一题」时提交当前题；仅在 `allowReturn=false` 的环节显示跳题确认框 |
| ③ | 筛选按钮与筛选栏贴得过近 | 全局 `.filter-card` 规则覆盖了局部样式 | 全局规则仅保留 `margin-bottom`；各页面局部设置按钮行左对齐 |
| ④ | 答题过程中排行榜不更新 | `stage_scores` 仅在交卷时写入，排行榜只读该表 | 排行榜改为以 `answers` 实时汇总为准（`GREATEST` 取正式分与实时分较大值），并在每次答题后刷新排名 |
| ⑤ | 队伍成绩对比各环节相同/为空 | `teamComparison` 固定按 `student_id IS NULL` 过滤，只匹配团队环节 | 按环节 `mode` 分支：团队环节取队伍记录，个人环节按队伍聚合队员成绩 |
| ⑦ | 需要清空队伍答题数据 | 功能缺失 | 新增 `POST /api/teams/:id/clear-answers`，清理 `answers`、`stage_scores`、`stage_papers`、`cheat_logs` 与 Redis 排行键 |

### 14.3 综合平台实现情况

数据库 `integrated_platform`，7 张表：`access_keys`、`resource_categories`、`resource_sites`、`chat_rooms`、`chat_messages`、`quick_phrases`、`platform_settings`。

预置数据：9 个资源分类、32 个资源网站、3 个访问密钥、10 条快速短语。

后端接口分组：`/platform-api/auth`、`/platform-api/resources`、`/platform-api/questions`、`/platform-api/chat`、`/platform-api/admin`；WebSocket 位于 `/platform-ws`。

题库共用说明：综合平台通过跨库查询读取 `info_literacy.questions`，题目选项存储于 `option_a`~`option_f` 六个列（非 JSON 字段），接口层统一转换为 `[{letter,text}]` 结构后返回。

### 14.4 服务器部署状态

| 项目 | 值 |
| --- | --- |
| 服务器 | `47.88.49.160`（Ubuntu 24.04.2 LTS / 2 vCPU / 1613MB 内存） |
| 模拟平台 | PM2 进程 `competition-api`，端口 3000，路径 `/var/www/competition-platform` |
| 综合平台 | PM2 进程 `platform-api`，端口 3001，路径 `/var/www/integrated-platform` |
| Nginx | 仅监听 80 端口；`/` 指向模拟平台，`/platform/` 指向综合平台 |
| 内存限制 | 模拟平台 384MB（`--max-old-space-size=340`），综合平台 256MB（`--max-old-space-size=220`） |
| xray | 443 端口 VLESS+REALITY 保持不变，未做任何改动 |

访问地址：

- 模拟竞赛平台：http://47.88.49.160/ （`/login`、`/admin/login`）
- 综合平台：http://47.88.49.160/platform/
- 综合平台默认密钥：管理员 `ADMIN2026KEY`、用户 `USER2026KEY`（部署后应立即修改）

### 14.5 验证结果

| 测试项 | 结果 |
| --- | --- |
| `test-logic.js` 核心逻辑 | 28 / 28 通过 |
| `audit-spec.js` 规格审计 | 68 / 68 通过 |
| `smoke-test.js` 模拟平台端到端 | 43 / 43 通过 |
| 综合平台 `smoke-test.js` | 31 / 31 通过 |
| 综合平台 `ws-test.js` WebSocket | 9 / 9 通过 |
| 公网双平台验证 | 19 / 19 通过 |

关键功能实测（服务器生产环境）：

- 模板下载：`/api/questions/import/template` 与 `/api/teams/import/template` 均返回 200 与 xlsx 文件流。
- 实时排行榜：答题过程中分数随每题变化（实测序列 `2 → 1 → 0 → 2 → 4 → 3`），无需交卷即可看到排名。
- 成绩对比：个人环节（星海队 3 分 / 1 人）与团队环节（逐光队 0 分）数据独立，不再相同或为空。
- 综合平台：九大分类、32 个网站、题库跨库检索 21 题、管理后台统计均正常。

---

## 十五、实施记录（2026-10-14 第二轮）

### 15.1 问题修复对照表

| 编号 | 问题 | 根因 | 修复方式 |
| --- | --- | --- | --- |
| ① | 综合平台入口以文字形式暴露 | 登录页与顶栏存在「需要备赛工具？进入综合平台」文案 | 移除全部文字入口；改为点击顶部 SVG 图标跳转，无任何提示（隐藏入口） |
| ② | 跳转综合平台即可访问全部资源 | 路由未做鉴权，所有模块默认开放 | 为 `/resources`、`/questions`、`/chat` 加 `requiresAuth`，`/admin` 加 `requiresAuth` + `requiresAdmin`；未登录跳回首页并自动弹出密钥登录框，登录后回到目标页 |
| ③ | 综合平台缺少 favicon | `public/` 目录不存在 | 新增 `public/favicon.svg`，与模拟平台一致 |
| ④ | 管理后台功能不全 | 仅有分类新增，无网站增删改/图标上传，题库管理整体缺失 | 新增「资源管理」与「题库管理」两个标签页（详见 15.2、15.3） |
| ⑤ | 查询/重置按钮位置不佳 | 按钮独占一行且贴得近 | 按钮与筛选项并排，靠右对齐；模拟平台三个管理页同步调整 |
| ⑥ | 实时排行榜始终 0 分、排名不变 | `GREATEST(COALESCE(ss.total_score,0), COALESCE(SUM(a.score_delta),0))`：未交卷时 `ss.total_score` 为 NULL，`COALESCE` 得 0，而 `GREATEST(0, 负数)` 恒为 0，答错一题后分数被永久钉死在 0 | 改为 `CASE WHEN ss.total_score IS NOT NULL THEN ss.total_score ELSE COALESCE(SUM(a.score_delta),0) END`；团队榜在正式成绩为空时回退到 `answers` 实时汇总 |

### 15.2 资源管理（project.md 8.1）

- **分类管理**：新增 / 编辑 / 删除，支持排序与启用状态。
- **网站增删改**：所属分类、名称、网址、简介、排序、启用状态完整增删改。
- **图标上传**：`POST /platform-api/resources/icons`（multer 内存存储，限 2MB，仅图片），支持 PNG / JPG / GIF / WEBP / SVG / ICO；文件落盘至 `backend/uploads/icons/`，通过 `/platform-api/uploads/icons/<file>` 静态访问。上传时可携带 `siteId` 直接绑定，也可在网站编辑弹窗内单独上传。
- **删除图标**：`DELETE /platform-api/resources/icons/:filename`，含路径穿越防护。

### 15.3 题库管理（project.md 8.1）

与模拟竞赛平台共用 `info_literacy.questions` 表，写操作通过跨库限定名执行，双方即时同步（已实测双向验证）。

| 接口 | 说明 |
| --- | --- |
| `GET /platform-api/questions/manage/template` | 导入模板（14 列表头 + 2 行示例） |
| `POST /platform-api/questions/manage` | 新增题目（题干查重） |
| `PUT /platform-api/questions/manage/:id` | 编辑题目 |
| `DELETE /platform-api/questions/manage/:id` | 删除题目 |
| `POST /platform-api/questions/manage/batch-remove` | 批量删除 |
| `POST /platform-api/questions/manage/import` | 批量导入，支持 CSV / Excel 文件或 JSON 行数组 |

导入特性：逐行校验，单行失败不中断整批；返回 `{ total, inserted, skipped, failed, errors[] }`，错误明细含行号（最多 20 条）；可勾选跳过题干重复项。

### 15.4 本轮修复的两个隐蔽缺陷

| 缺陷 | 现象 | 根因 | 修复 |
| --- | --- | --- | --- |
| 跨库 SQL 重复限定 | `DELETE ... FROM info_literacy.info_literacy.questions` 语法错误 | `queryCompetition` 用正则全局替换 `questions`，对已限定的 SQL 再次加前缀 | 新增 `qualifyQuestions()`，用负向后顾断言跳过已带库名前缀的情况，保证幂等 |
| `insertId` 为 undefined | 新增题目报「Bind parameters must not contain undefined」 | `pool.execute()` 返回 `[result, fields]` 元组，直接取 `res.insertId` 得到 undefined | 新增 `db.executeCompetition()` 统一解包元组，服务层 5 处调用全部替换 |

### 15.5 验证结果

| 测试项 | 结果 |
| --- | --- |
| `test-logic.js` 核心逻辑 | 28 / 28 通过 |
| `audit-spec.js` 规格审计 | 68 / 68 通过 |
| 模拟平台 `smoke-test.js` | 43 / 43 通过 |
| 综合平台 `smoke-test.js` | 31 / 31 通过 |
| 综合平台 `ws-test.js` WebSocket | 9 / 9 通过 |
| 综合平台 `admin-test.js` 管理端（新增） | 15 / 15 通过 |
| 公网六项问题验证 | 24 / 24 通过 |

关键功能实测（服务器生产环境）：

- **实时排行榜（⑥）**：逐题提交正确答案，榜单分数实测序列 `2 → 4 → 6 → 8 → 10 → 12 → 14 → 13 → 15 → 17`（第 8 题答错扣 1 分），每题提交后立即变化，无需交卷。排名交换实测：张伟答 3 题得 6 分列第 1，刘洋答 6 题得 12 分后反超至第 1，张伟退至第 2。
- **题库双向同步（④）**：综合平台新增题目后，模拟竞赛平台立即可见且选项一致；模拟平台修改难度后，综合平台读取到新值；综合平台删除后，模拟平台同步消失。
- **图标上传（④）**：上传后返回 `/platform-api/uploads/icons/<file>`，公网访问 200，并正确绑定到目标网站记录。
- **未登录鉴权（②）**：未登录访问 `/platform-api/auth/keys`、`POST /platform-api/questions/manage` 均返回 401；资源与分类接口仅返回启用项。
- **隐藏入口（①）**：登录页 HTML 中已不含「需要备赛工具」与「进入综合平台」文案。

**文档结束。**
