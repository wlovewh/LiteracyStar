#!/bin/bash
set -e
TS=$(date +%Y%m%d-%H%M%S)
BK=/root/backups/$TS
mkdir -p "$BK"
echo "== 备份到 $BK =="

# 数据库（root 走 auth_socket，--no-tablespaces 规避 PROCESS 权限）
mysqldump --no-tablespaces info_literacy > "$BK/db_competition.sql"
mysqldump --no-tablespaces integrated_platform > "$BK/db_integrated.sql"

# 源码
tar czf "$BK/competition-src.tar.gz" -C /var/www/competition-platform backend/src frontend/dist
tar czf "$BK/integrated-src.tar.gz"  -C /var/www/integrated-platform  backend/src frontend/dist

echo "$BK" > /root/.last_backup
ls -lh "$BK"
echo "== 备份完成 =="
