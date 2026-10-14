#!/usr/bin/env bash
set -e
cd /root
rm -rf /root/r9b && mkdir -p /root/r9b
tar xzf /root/round9b.tgz -C /root/r9b

echo "=== 部署竞赛平台 ==="
cp -r /root/r9b/comp-src/. /var/www/competition-platform/backend/src/
cp -r /root/r9b/comp-scripts/. /var/www/competition-platform/backend/scripts/
rm -rf /var/www/competition-platform/frontend/dist/*
cp -r /root/r9b/comp-dist/. /var/www/competition-platform/frontend/dist/
mkdir -p /var/www/competition-platform/database
cp /root/r9b/comp-init.sql /var/www/competition-platform/database/init.sql

echo "=== 部署综合平台 ==="
cp -r /root/r9b/int-src/. /var/www/integrated-platform/backend/src/
cp -r /root/r9b/int-scripts/. /var/www/integrated-platform/backend/scripts/
rm -rf /var/www/integrated-platform/frontend/dist/*
cp -r /root/r9b/int-dist/. /var/www/integrated-platform/frontend/dist/
mkdir -p /var/www/integrated-platform/database
cp /root/r9b/int-init.sql /var/www/integrated-platform/database/init.sql

echo "=== 清理本地测试残留赛事（名称 R9/DBG 开头） ==="
cd /var/www/competition-platform/backend && node scripts/purge-r9-events.js

echo "=== 重启服务 ==="
pm2 restart competition-api platform-api >/dev/null 2>&1
sleep 5
pm2 list | grep -E "competition-api|platform-api"
echo ""
echo "=== 健康检查 ==="
curl -s -o /dev/null -w "竞赛 %{http_code}\n" http://127.0.0.1:3000/api/health
curl -s -o /dev/null -w "综合 %{http_code}\n" http://127.0.0.1:3001/platform-api/health
