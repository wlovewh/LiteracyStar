// =============================================================
//  PM2 配置  integrated-platform/deploy/ecosystem.config.js
//  用法: pm2 start integrated-platform/deploy/ecosystem.config.js
//  注意: 服务器实际内存 1613MB，两个 Node 进程合计需严格控制
// =============================================================
module.exports = {
  apps: [
    {
      name: 'platform-api',
      script: './src/app.js',
      cwd: '/var/www/integrated-platform/backend',
      instances: 1,
      exec_mode: 'fork',
      // 综合平台内存预算按用户要求收紧到 256M
      max_memory_restart: '256M',
      node_args: '--max-old-space-size=220',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      error_file: '/var/log/pm2/platform-error.log',
      out_file: '/var/log/pm2/platform-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '20s',
      watch: false
    }
  ]
};
