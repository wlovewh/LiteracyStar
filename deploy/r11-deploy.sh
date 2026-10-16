#!/usr/bin/env bash
set -e
cd /root
rm -rf /root/r11 && mkdir -p /root/r11
tar xzf /root/r11.tgz -C /root/r11

echo "=== 备份当前线上代码 ==="
tar czf /root/pre_r11_$(date +%Y%m%d%H%M%S).tar.gz   -C /var/www competition-platform/backend/src integrated-platform/backend/src 2>/dev/null || true
ls -1 /root/pre_r11_*.tar.gz | tail -1

echo "=== 部署竞赛平台 ==="
cp -r /root/r11/comp-src/. /var/www/competition-platform/backend/src/
cp -r /root/r11/comp-scripts/. /var/www/competition-platform/backend/scripts/
rm -rf /var/www/competition-platform/frontend/dist/*
cp -r /root/r11/comp-dist/. /var/www/competition-platform/frontend/dist/

echo "=== 部署综合平台 ==="
cp -r /root/r11/int-src/. /var/www/integrated-platform/backend/src/
cp -r /root/r11/int-scripts/. /var/www/integrated-platform/backend/scripts/
rm -rf /var/www/integrated-platform/frontend/dist/*
cp -r /root/r11/int-dist/. /var/www/integrated-platform/frontend/dist/

echo "=== 重启服务 ==="
pm2 restart competition-api platform-api >/dev/null 2>&1
sleep 6
pm2 list | grep -E "competition-api|platform-api" | sed 's/[│|]/ /g' | awk '{print $2, $10, $12}'

echo ""
echo "=== 健康检查 ==="
printf "  竞赛 %s\n" "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/health)"
printf "  综合 %s\n" "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/platform-api/health)"
