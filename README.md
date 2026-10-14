# 信息素养大赛 双平台

2026年福建省大学生信息素养大赛 校内模拟与备赛工具，包含两个相互独立、可同时运行的平台。

## 目录结构

```
LiteracyStar/
├── project.md                  需求规格说明书（含追加设计文档）
├── deploy/
│   └── deploy.sh               双平台一键部署脚本
├── competition-platform/       模拟竞赛平台
│   ├── backend/                Node.js + Express（端口 3000）
│   ├── frontend/               Vue 3 + Vite
│   ├── database/               init.sql + seed.sql
│   └── deploy/                 PM2 与 Nginx 配置
└── integrated-platform/        综合平台
    ├── backend/                Node.js + Express + WebSocket（端口 3001）
    ├── frontend/               Vue 3 + Vite
    ├── database/               init.sql + seed.sql
    └── deploy/                 PM2 配置
```

## 模拟竞赛平台

面向校内模拟竞赛的答题系统，支持个人赛与团队赛、实时排行榜、防作弊日志与成绩统计。

- 访问路径：`/`
- 后端端口：3000
- 数据库：`info_literacy`
- PM2 进程：`competition-api`

主要功能：赛事与环节管理、题库导入导出、队伍管理、答题与交卷、SSE 实时排行榜、成绩统计与对比、防作弊日志、清空队伍答题数据。

## 综合平台

面向备赛的辅助工具平台，提供资源收录、题库检索与团队协作聊天室。

- 访问路径：`/platform/`
- 后端端口：3001
- 数据库：`integrated_platform`（共用 `info_literacy.questions` 题库）
- PM2 进程：`platform-api`
- WebSocket：`/platform-ws`

主要功能：

| 模块 | 说明 |
| --- | --- |
| 访问密钥 | 管理员/用户两类密钥，支持有效期与启用状态 |
| 资源收录 | 九大分类、32 个预置资源网站，管理员可增删改 |
| 题库检索 | 按题干、模块、题型、难度、来源检索，支持 CSV 导出 |
| 团队协作 | 三人聊天室，WebSocket 实时通信，题目卡片与答案冲突提醒 |
| 管理后台 | 密钥管理、分类维护、聊天室配置、快速短语、数据统计 |

## 本地开发

```bash
# 模拟竞赛平台
cd competition-platform/backend && npm install && npm run dev    # 端口 3000
cd competition-platform/frontend && npm install && npm run dev   # 端口 5173

# 综合平台
cd integrated-platform/backend && npm install && npm run dev     # 端口 3001
cd integrated-platform/frontend && npm install && npm run dev    # 端口 5174
```

## 数据库初始化

```bash
# 模拟竞赛平台
mysql -u root < competition-platform/database/init.sql
mysql -u root info_literacy < competition-platform/database/seed.sql

# 综合平台
mysql -u root < integrated-platform/database/init.sql
mysql -u root integrated_platform < integrated-platform/database/seed.sql
```

## 测试

```bash
cd competition-platform/backend
npm run test:logic     # 核心逻辑单元测试
npm run test:audit     # 需求规格符合性审计
npm run test:smoke     # 端到端接口测试

cd integrated-platform/backend
npm run test:smoke       # 综合平台接口测试
node scripts/ws-test.js  # WebSocket 实时通信测试
```

## 部署

服务器环境：Ubuntu 24.04 / Node 20 / MySQL 8.0 / Redis 7 / Nginx / PM2。

```bash
bash deploy/deploy.sh
```

注意事项：

- 服务器 443 端口由 xray（VLESS+REALITY）占用，两个平台均只使用 80 端口。
- 内存共 1613MB：模拟平台限 384MB、综合平台限 256MB，均已通过 PM2 与 `--max-old-space-size` 限制。
- 每个平台需在 `backend/.env` 中配置数据库凭据与 JWT 密钥，权限设为 600。

---

© 2026 空城星梦筏 · All Rights Reserved
