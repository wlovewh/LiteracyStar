#!/bin/bash
set -e
TS=$(date +%Y%m%d-%H%M%S)
BK=/root/backups/$TS
mkdir -p $BK
echo "=== 备份到 $BK ==="

mysqldump --single-transaction --quick --no-tablespaces info_literacy > $BK/db_competition.sql
mysqldump --single-transaction --quick --no-tablespaces integrated_platform > $BK/db_integrated.sql
ls -lh $BK/*.sql
echo "competition 表数: $(grep -c 'CREATE TABLE' $BK/db_competition.sql)"
echo "integrated 表数: $(grep -c 'CREATE TABLE' $BK/db_integrated.sql)"

tar czf $BK/competition-src.tar.gz -C /var/www competition-platform 2>/dev/null
tar czf $BK/integrated-src.tar.gz -C /var/www integrated-platform 2>/dev/null
ls -lh $BK/
echo "=== 备份完成 ==="
echo $BK > /root/.last_backup
