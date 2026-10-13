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