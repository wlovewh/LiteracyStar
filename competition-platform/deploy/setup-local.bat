@echo off
chcp 65001 >nul
REM =============================================================
REM  本地一键初始化脚本  deploy/setup-local.bat
REM  用途: 检查环境、创建数据库、导入表结构与初始数据、安装依赖
REM =============================================================
setlocal
cd /d "%~dp0.."

echo [1/3] 检查 Node.js...
node -v || (echo 未检测到 Node.js，请先安装 Node.js 20 LTS & pause & exit /b 1)

echo.
echo [2/3] 创建数据库并导入数据...
echo 请输入 MySQL root 密码（无密码直接回车）:
set /p DBPW=
if "%DBPW%"=="" (
  mysql -u root < database\init.sql
  mysql -u root info_literacy < database\seed.sql
) else (
  mysql -u root -p%DBPW% < database\init.sql
  mysql -u root -p%DBPW% info_literacy < database\seed.sql
)

echo.
echo [3/3] 安装依赖...
pushd backend
call npm install
popd
pushd frontend
call npm install
popd

echo.
echo ============================================
echo  初始化完成
echo ============================================
echo  后端: cd backend  ^&^& npm run dev
echo  前端: cd frontend ^^&^& npm run dev
echo  访问: http://localhost:5173
echo  管理员: admin / admin123
echo ============================================
pause
