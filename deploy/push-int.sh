#!/usr/bin/env bash
set -e
cd /root
rm -rf /root/intdist && mkdir -p /root/intdist
tar xzf /root/intdist.tgz -C /root/intdist --strip-components=1
echo "解包内容: $(ls /root/intdist | tr '\n' ' ')"
echo "=== 部署综合平台前端 ==="
rm -rf /var/www/integrated-platform/frontend/dist/*
cp -r /root/intdist/. /var/www/integrated-platform/frontend/dist/
echo "=== 校验 ==="
grep -o 'index-[A-Za-z0-9_-]*\.js' /var/www/integrated-platform/frontend/dist/index.html
F=$(ls /var/www/integrated-platform/frontend/dist/assets/ | grep -iE '^Questions.*\.js$' | head -1)
echo "Questions 分块: $F"
echo -n "  需要先登录 文案: "; grep -c "题库检索需要先登录" "/var/www/integrated-platform/frontend/dist/assets/$F"
echo -n "  isLoggedIn 判断: "; grep -c "isLoggedIn" "/var/www/integrated-platform/frontend/dist/assets/$F"
echo -n "  健康检查: "; curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/platform-api/health
echo ""
