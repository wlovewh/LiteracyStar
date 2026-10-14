#!/usr/bin/env bash
# =============================================================
#  部署脚本  deploy/deploy.sh
#  信息素养大赛模拟竞赛平台 —— 阿里云 Ubuntu 22.04 (2vCPU/2GiB)
#
#  用法:
#    本地执行(推荐):  bash deploy/deploy.sh <服务器IP> [SSH用户]
#    服务器上执行:    bash deploy/deploy.sh --server
#
#  前置条件:
#    - 已配置 SSH 免密登录
#    - 服务器已开放 80/443 端口
# =============================================================
set -euo pipefail

APP_DIR="/var/www/info-literacy"
DB_NAME="info_literacy"
DB_USER="root"
NODE_VERSION="20"

log()  { echo -e "\033[1;34m[$(date '+%H:%M:%S')]\033[0m $*"; }
warn() { echo -e "\033[1;33m[WARN]\033[0m $*"; }
die()  { echo -e "\033[1;31m[ERROR]\033[0m $*" >&2; exit 1; }

# -------------------------------------------------------------
# 服务器端初始化：安装依赖环境
# -------------------------------------------------------------
setup_server() {
  log "更新系统软件包..."
  sudo apt-get update -qq
  sudo apt-get install -y -qq curl git nginx mysql-server redis-server

  # Node.js 20 LTS
  if ! command -v node >/dev/null || [[ "$(node -v)" != v${NODE_VERSION}* ]]; then
    log "安装 Node.js ${NODE_VERSION} LTS..."
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | sudo -E bash -
    sudo apt-get install -y -qq nodejs
  fi

  # PM2
  command -v pm2 >/dev/null || sudo npm install -g pm2

  # ---------------- 内存限制（2GiB 服务器关键配置） ----------------
  log "配置 MySQL 内存限制 (innodb_buffer_pool_size=256M)..."
  sudo tee /etc/mysql/mysql.conf.d/memory.cnf >/dev/null <<'MYSQLCONF'
[mysqld]
innodb_buffer_pool_size = 256M
innodb_log_buffer_size  = 16M
max_connections         = 100
performance_schema      = OFF
table_open_cache        = 400
MYSQLCONF

  log "配置 Redis 内存限制 (maxmemory 128mb)..."
  sudo sed -i 's/^# *maxmemory .*/maxmemory 128mb/'       /etc/redis/redis.conf || true
  sudo sed -i 's/^# *maxmemory-policy .*/maxmemory-policy allkeys-lru/' /etc/redis/redis.conf || true
  grep -q '^maxmemory ' /etc/redis/redis.conf || echo 'maxmemory 128mb' | sudo tee -a /etc/redis/redis.conf >/dev/null
  grep -q '^maxmemory-policy ' /etc/redis/redis.conf || echo 'maxmemory-policy allkeys-lru' | sudo tee -a /etc/redis/redis.conf >/dev/null

  sudo systemctl enable --now mysql redis-server nginx
  sudo systemctl restart mysql redis-server

  # 关闭不必要的服务以释放内存
  for svc in snapd apparmor bluetooth; do
    sudo systemctl disable --now "$svc" 2>/dev/null || true
  done

  log "服务器环境准备完成"
}

# -------------------------------------------------------------
# 初始化数据库
# -------------------------------------------------------------
init_database() {
  local pw="$1"
  log "创建数据库并导入表结构与初始数据..."
  sudo mysql -u ${DB_USER} ${pw:+-p$pw} < "${APP_DIR}/database/init.sql"
  sudo mysql -u ${DB_USER} ${pw:+-p$pw} ${DB_NAME} < "${APP_DIR}/database/seed.sql"
  log "数据库初始化完成（默认管理员 admin / admin123，请尽快修改）"
}

# -------------------------------------------------------------
# 构建并部署应用
# -------------------------------------------------------------
deploy_app() {
  log "安装后端依赖..."
  cd "${APP_DIR}/backend"
  npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund

  if [[ ! -f .env ]]; then
    warn "未找到 backend/.env，正在从 .env.example 生成，请务必修改数据库密码与 JWT_SECRET"
    cp .env.example .env
    sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" .env
  fi

  log "构建前端..."
  cd "${APP_DIR}/frontend"
  npm ci --no-audit --no-fund || npm install --no-audit --no-fund
  npm run build

  log "配置 Nginx..."
  sudo cp "${APP_DIR}/deploy/nginx.conf" /etc/nginx/sites-available/info-literacy
  sudo ln -sf /etc/nginx/sites-available/info-literacy /etc/nginx/sites-enabled/info-literacy
  sudo rm -f /etc/nginx/sites-enabled/default
  sudo nginx -t && sudo systemctl reload nginx

  log "启动后端服务 (PM2)..."
  cd "${APP_DIR}/backend"
  pm2 delete info-literacy-api 2>/dev/null || true
  pm2 start "${APP_DIR}/deploy/ecosystem.config.js"
  pm2 save
  sudo env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$USER" --hp "$HOME" >/dev/null 2>&1 || true

  log "部署完成"
}

# -------------------------------------------------------------
# 主流程
# -------------------------------------------------------------
main() {
  if [[ "${1:-}" == "--server" ]]; then
    # 在服务器上执行
    setup_server
    read -rsp "请输入 MySQL root 密码（无密码直接回车）: " DB_PW
    echo
    init_database "$DB_PW"
    deploy_app
    log "访问 http://<服务器IP>/ 进行验证"
    log "管理员账号: admin / admin123"
    return
  fi

  local SERVER_IP="${1:-}"
  local SSH_USER="${2:-root}"
  [[ -z "$SERVER_IP" ]] && die "用法: bash deploy/deploy.sh <服务器IP> [SSH用户]"

  log "目标服务器: ${SSH_USER}@${SERVER_IP}"

  log "创建远程目录..."
  ssh "${SSH_USER}@${SERVER_IP}" "sudo mkdir -p ${APP_DIR} && sudo chown -R \$USER ${APP_DIR}"

  log "上传项目文件..."
  rsync -az --delete \
    --exclude 'node_modules' \
    --exclude 'frontend/dist' \
    --exclude '.git' \
    --exclude '.env' \
    ./ "${SSH_USER}@${SERVER_IP}:${APP_DIR}/"

  log "在服务器上执行部署..."
  ssh -t "${SSH_USER}@${SERVER_IP}" "cd ${APP_DIR} && bash deploy/deploy.sh --server"
}

main "$@"
