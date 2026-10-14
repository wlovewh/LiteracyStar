#!/usr/bin/env bash
# =============================================================
#  信息素养大赛 双平台一键部署脚本
#  用法: bash deploy.sh
#
#  目录约定（服务器）:
#    /var/www/competition-platform/   模拟竞赛平台 (端口 3000)
#    /var/www/integrated-platform/    综合平台     (端口 3001)
#
#  重要: 服务器 443 端口被 xray (VLESS+REALITY) 占用，本脚本不得改动 xray。
# =============================================================
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMP_DIR="/var/www/competition-platform"
INTG_DIR="/var/www/integrated-platform"
LOG_DIR="/var/log/pm2"

echo "==> 仓库目录: $REPO_DIR"

# ---------- 1. 目录准备 ----------
echo "==> [1/7] 准备目录"
mkdir -p "$COMP_DIR" "$INTG_DIR" "$LOG_DIR"

# ---------- 2. 同步后端代码 ----------
echo "==> [2/7] 同步后端代码"
rsync -a --delete \
  --exclude node_modules --exclude .env --exclude 'scripts/_*' \
  "$REPO_DIR/competition-platform/backend/" "$COMP_DIR/backend/"
rsync -a --delete \
  --exclude node_modules --exclude .env \
  "$REPO_DIR/integrated-platform/backend/" "$INTG_DIR/backend/"

# ---------- 3. 同步前端构建产物 ----------
echo "==> [3/7] 同步前端构建产物"
mkdir -p "$COMP_DIR/frontend/dist" "$INTG_DIR/frontend/dist"
rsync -a --delete "$REPO_DIR/competition-platform/frontend/dist/" "$COMP_DIR/frontend/dist/"
rsync -a --delete "$REPO_DIR/integrated-platform/frontend/dist/" "$INTG_DIR/frontend/dist/"

# ---------- 4. 安装后端依赖 ----------
echo "==> [4/7] 安装后端依赖（生产模式）"
(cd "$COMP_DIR/backend" && npm install --omit=dev --no-audit --no-fund)
(cd "$INTG_DIR/backend" && npm install --omit=dev --no-audit --no-fund)

# ---------- 5. 环境变量检查 ----------
echo "==> [5/7] 检查环境变量"
for f in "$COMP_DIR/backend/.env" "$INTG_DIR/backend/.env"; do
  if [ ! -f "$f" ]; then
    echo "    [警告] 缺少 $f，请参照 .env.example 创建后再启动服务"
  else
    chmod 600 "$f"
    echo "    [OK] $f"
  fi
done

# ---------- 6. 数据库 ----------
echo "==> [6/7] 数据库"
echo "    模拟竞赛平台: 若未初始化，请执行"
echo "      mysql -u root < $REPO_DIR/competition-platform/database/init.sql"
echo "    综合平台: 若未初始化，请执行"
echo "      mysql -u root < $REPO_DIR/integrated-platform/database/init.sql"
echo "      mysql -u root integrated_platform < $REPO_DIR/integrated-platform/database/seed.sql"

# ---------- 7. PM2 ----------
echo "==> [7/7] 启动 / 重载 PM2 进程"
if pm2 describe competition-api >/dev/null 2>&1; then
  pm2 reload "$REPO_DIR/competition-platform/deploy/ecosystem.config.js" --update-env
else
  pm2 start "$REPO_DIR/competition-platform/deploy/ecosystem.config.js"
fi

if pm2 describe platform-api >/dev/null 2>&1; then
  pm2 reload "$REPO_DIR/integrated-platform/deploy/ecosystem.config.js" --update-env
else
  pm2 start "$REPO_DIR/integrated-platform/deploy/ecosystem.config.js"
fi

pm2 save
pm2 list

echo ""
echo "==> 部署完成"
echo "    模拟竞赛平台: http://<服务器IP>/"
echo "    综合平台:     http://<服务器IP>/platform/"
