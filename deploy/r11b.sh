#!/usr/bin/env bash
set -e
cd /root
rm -rf /root/r11b && mkdir -p /root/r11b
tar xzf /root/r11b.tgz -C /root/r11b

echo "=== 备份 ==="
tar czf /root/pre_r11b_$(date +%Y%m%d%H%M%S).tar.gz   -C /var/www competition-platform/backend/src integrated-platform/backend/src 2>/dev/null || true

echo "=== 部署 ==="
cp -r /root/r11b/comp-src/. /var/www/competition-platform/backend/src/
cp -r /root/r11b/comp-scripts/. /var/www/competition-platform/backend/scripts/
rm -rf /var/www/competition-platform/frontend/dist/*
cp -r /root/r11b/comp-dist/. /var/www/competition-platform/frontend/dist/

cp -r /root/r11b/int-src/. /var/www/integrated-platform/backend/src/
cp -r /root/r11b/int-scripts/. /var/www/integrated-platform/backend/scripts/
rm -rf /var/www/integrated-platform/frontend/dist/*
cp -r /root/r11b/int-dist/. /var/www/integrated-platform/frontend/dist/

pm2 restart competition-api platform-api >/dev/null 2>&1
sleep 6

echo ""
echo "=== 健康检查 ==="
printf "  竞赛 %s\n" "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/health)"
printf "  综合 %s\n" "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/platform-api/health)"

echo ""
echo "=== 准入校验 ==="
printf "  匿名检索(应401): %s\n" "$(curl -s -o /dev/null -w '%{http_code}' 'http://127.0.0.1:3001/platform-api/questions/search?keyword=x')"
