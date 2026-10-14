# 2026年福建省大学生信息素养大赛模拟竞赛平台

面向福建省高职组信息素养大赛的**校内模拟竞赛平台**。管理员统一管理赛事、题库与队伍，学生通过学号登录参与各环节模拟答题，系统实时展示排行榜并提供错题回顾。

> 本项目的功能与设计严格依据 `project.md`，未擅自增减功能。

---

## 一、技术栈

| 层级 | 技术 | 版本 |
|---|---|---|
| 前端 | Vue 3 + Vite + Element Plus | Vue 3.5 |
| 状态管理 | Pinia | 2.x |
| 路由 | Vue Router | 4.x |
| HTTP | Axios | 1.x |
| 图表 | ECharts | 5.x |
| 后端 | Node.js + Express | Node 20+ |
| 数据库 | MySQL | 8.0 |
| 缓存/排行榜 | Redis | 7.x |
| 实时通信 | SSE (Server-Sent Events) | 原生 |
| 进程管理 | PM2 | 最新版 |
| 反向代理 | Nginx | 最新稳定版 |

---

## 二、目录结构

```
LiteracyStar/
├── frontend/                 # Vue 3 前端
│   ├── src/
│   │   ├── api/             # Axios 封装与接口定义
│   │   ├── components/      # 公共组件（底部版权等）
│   │   ├── layouts/         # 学生端 / 管理端布局
│   │   ├── router/          # 路由配置（含权限守卫）
│   │   ├── stores/          # Pinia 状态
│   │   ├── styles/          # 全局主题（严格遵循 UI 规范）
│   │   ├── utils/           # 格式化工具、防作弊 Hook
│   │   └── views/           # 页面（student/ 与 admin/）
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── backend/                  # Node.js 后端
│   ├── src/
│   │   ├── config/          # 配置、数据库连接池、Redis 客户端
│   │   ├── controllers/     # 控制器
│   │   ├── middlewares/     # 鉴权、错误处理、文件上传
│   │   ├── routes/          # 路由
│   │   ├── services/        # 业务逻辑（赛事引擎、排行榜、统计等）
│   │   ├── utils/           # JWT、日志、响应封装、表格解析
│   │   └── app.js           # 入口
│   ├── scripts/             # 单元测试与端到端冒烟测试
│   ├── package.json
│   └── .env.example
├── database/
│   ├── init.sql             # 建表语句
│   └── seed.sql             # 管理员、演示赛事、7 个预置环节、示例题目与队伍
├── deploy/
│   ├── nginx.conf           # Nginx 配置模板
│   ├── ecosystem.config.js  # PM2 配置
│   ├── deploy.sh            # 云端部署脚本
│   ├── dev.ps1              # 本地一键启动
│   └── setup-local.bat      # 本地初始化
├── project.md               # 项目设计文档（唯一设计依据）
└── README.md
```

---

## 三、本地开发

### 3.1 环境要求

- Node.js 20 LTS（实测 24.x 亦可）
- MySQL 8.0
- Redis 7.x（**可选**，见下文说明）

### 3.2 初始化数据库

```bash
# 创建数据库、表结构与初始数据
mysql -u root -p < database/init.sql
mysql -u root -p info_literacy < database/seed.sql
```

`seed.sql` 会自动创建：

- 管理员账号：**admin / admin123**
- 演示赛事：2026年福建省大学生信息素养大赛（校内模拟）
- **7 个预置环节**（严格对应 project.md 4.2 的配置）
- 20 道示例题目（覆盖各知识模块）
- 3 支演示队伍（学号 2026001 ~ 2026009，密码 = 学号）

### 3.3 配置环境变量

```bash
cd backend
cp .env.example .env
# 编辑 .env，填写 DB_PASSWORD 等信息
```

### 3.4 启动服务

```bash
# 后端 (http://localhost:3000)
cd backend && npm install && npm run dev

# 前端 (http://localhost:5173)
cd frontend && npm install && npm run dev
```

或使用一键脚本：

```powershell
pwsh -File deploy/dev.ps1
```

访问 <http://localhost:5173>：

- 学生登录：学号 `2026001`，密码 `2026001`
- 管理员登录：<http://localhost:5173/admin/login>，账号 `admin`，密码 `admin123`

### 3.5 关于 Redis

排行榜按 project.md 8.2 使用 **Redis ZSET**。为便于本地无 Redis 环境直接运行，后端实现了**自动降级**：

| 场景 | 行为 |
|---|---|
| Redis 可用 | 使用 Redis ZSET，键名 `stage:{stageId}:rank` |
| Redis 不可用 | 自动降级为内存实现，**功能完全一致**，但服务重启后排名丢失 |

降级状态可在「管理后台 → 系统设置」查看，并提供**重建排行榜**功能。

生产部署请确保 Redis 正常运行。

---

## 四、核心功能

### 4.1 七个预置环节

| # | 环节 | 模式 | 题目 | 分值 | 时限 | 特殊规则 |
|---|---|---|---|---|---|---|
| 1 | 省级初赛-个人对抗 | 个人 | 6单选+2多选+2判断 | 2/2/2 | 600s | 三人试题不同、选项乱序、答错扣1 |
| 2 | 省级初赛-团队对抗 | 团队 | 6单选+2多选+2判断 | 4/4/4 | 900s | 答错扣1 |
| 3 | 省级决赛晋级赛-必答题 | 团队 | 12单选+4多选+4判断 | 3/5/1 | 1080s | 答错扣1 |
| 4 | 省级决赛晋级赛-抢答题 | 团队 | 6单选+2多选+2判断 | 4/6/2 | 每题90s | 候时5s、速度排名前50%、答错扣2 |
| 5 | 省级决赛排位赛-个人接力 | 个人(接力) | 5+5+10 题 | 2.5/4/1 | 1080s | 时间累加、前段不扣分、每人6分钟 |
| 6 | 省级决赛排位赛-团队抢答 | 团队 | 4单选+3多选+3判断 | 2.5/4/1 | 每题60s | 速度排名前50%、奇数进位 |
| 7 | 省级决赛排位赛-AI专项 | 团队 | 4单选+3多选+3判断 | 2.5/4/1 | 600s | 跳题扣分、已打开未提交扣分 |

### 4.2 赛事引擎

- **组卷策略**：随机抽题（按题型/知识模块/难度筛选）与固定试卷
- **选项乱序**：每次抽题随机打乱，答案映射双向可逆
- **接力模式**：第 3 名队员可用时间 = 基础时间 + 第 1、2 名节余
- **扣分规则**：答错 / 不答 / 已打开未提交，支持「扣对应分值」
- **速度排名**：按答对队伍提交时间排序，前 N% 加分，支持奇数进位

### 4.3 实时排行榜

- Redis ZSET 存储，复合 score：`score * 1000000 - timeSpent`（分数高在前，同分用时少在前）
- SSE 推送：`GET /api/rank/stream?stageId=xxx`，服务端每 3 秒检查变化后才推送
- 前端 EventSource 订阅，行有淡入动画，前三名金/银/铜高亮

### 4.4 防作弊

- **防复制**：禁用 copy / cut / contextmenu / dragstart / selectstart
- **切屏检测**：监听 `visibilitychange` 与 `blur`，超过阈值（3 次或累计 30 秒）写入 `cheat_logs`
- 管理后台预警面板实时展示，支持导出 CSV

### 4.5 账号规则

| 角色 | 登录账号 | 默认密码 | 可见环节 |
|---|---|---|---|
| 队长 | 队长学号 | 学号 | 全部环节 |
| 队员1 / 队员2 | 各自学号 | 学号 | 仅个人环节 |

---

## 五、测试

```bash
cd backend

# 1. 业务逻辑单元测试（计分、速度排名、接力时间池、配置校验）
node scripts/_test_logic.js

# 2. 端到端接口冒烟测试（需先启动后端）
node src/app.js          # 另开终端
node scripts/smoke-test.js
```

冒烟测试覆盖：健康检查、鉴权与权限、赛事/环节管理、题库 CRUD 与校验、队伍管理与唯一性、完整答题流程（抽题→作答→判分→交卷）、排行榜、错题本、统计与预警。

---

## 六、云端部署

### 6.1 前置条件

- 阿里云美国硅谷轻量服务器：2vCPU / 2GiB / 40GiB ESSD / Ubuntu 22.04
- SSH 免密登录已配置
- 已开放 80 / 443 端口

### 6.2 部署步骤

```bash
# 本地执行，自动上传并部署
bash deploy/deploy.sh <服务器IP> [SSH用户]
```

脚本会自动完成：

1. 安装 Node.js 20、MySQL 8.0、Redis、Nginx、PM2
2. **限制内存占用**（MySQL `innodb_buffer_pool_size=256M`、Redis `maxmemory 128mb`）
3. 创建数据库并导入表结构与初始数据
4. 构建前端、配置 Nginx 反向代理（含 SSE 专项配置）
5. 使用 PM2 启动后端并设置开机自启

### 6.3 内存分配（2GiB 服务器）

| 服务 | 内存限制 |
|---|---|
| MySQL | 512MB（buffer pool 256M） |
| Redis | 128MB（allkeys-lru） |
| Node.js 后端 | 512MB（PM2 max_memory_restart + --max-old-space-size=460） |
| Nginx | 64MB |
| 系统预留 | 800MB |

### 6.4 域名绑定

将用户自有域名（托管于 Cloudflare）解析到服务器 IP，并修改 `deploy/nginx.conf` 中的 `server_name`。

---

## 七、API 概览

| 模块 | 路径前缀 | 说明 |
|---|---|---|
| 鉴权 | `/api/auth` | 管理员/学生登录、当前用户 |
| 赛事 | `/api/events` | 赛事 CRUD、环节列表、当前赛事 |
| 环节 | `/api/stages` | 环节 CRUD、复制、启停、排序、编辑 |
| 答题 | `/api/stages/:id` | 准备、开始、答题、交卷、成绩、错题本 |
| 题库 | `/api/questions` | CRUD、筛选、导入、导出、模板 |
| 队伍 | `/api/teams` | CRUD、导入、导出、模板 |
| 排行榜 | `/api/rank` | 快照查询、SSE 流 |
| 预警 | `/api/cheat` | 学生上报 |
| 后台 | `/api/admin` | 仪表盘、统计、预警、日志、设置、重建排行 |

所有接口统一响应体：

```json
{ "code": 0, "message": "ok", "data": {} }
```

---

## 八、UI/UX 规范

- 主基调白色 `#FFFFFF`，辅助背景 `#F5F7FA`
- 主强调色深蓝 `#1A3A5C`，次强调色中蓝 `#2B5EA7`
- 选中态 `#E8EEF5`，文字主色 `#2C3E50`，次色 `#7F8C8D`，边框 `#E0E6ED`
- 危险色 `#E74C3C`，警告色 `#F39C12`
- **禁止绿色系**、**禁止深色背景**、**禁止 emoji**
- 圆角：卡片 12px / 按钮 8px / 输入框 6px / 标签 4px
- 每个页面底部固定显示：`© 2026 空城星梦筏 · All Rights Reserved`

---

## 九、版权声明

```
© 2026 空城星梦筏 · All Rights Reserved
```
