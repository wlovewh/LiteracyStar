// =============================================================
//  PM2 配置  deploy/ecosystem.config.js
//  用法: pm2 start ecosystem.config.js
//  注意: 服务器实际内存 1613MB，需严格限制 Node 内存占用
// =============================================================
module.exports = {
  apps: [
    {
      name: 'info-literacy-api',
      script: './src/app.js',
      cwd: '/var/www/info-literacy/backend',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '384M',
      // 单进程即可满足校内规模；如开启 cluster 需改用共享的 SSE 广播
      node_args: '--max-old-space-size=340',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: '/var/log/pm2/info-literacy-error.log',
      out_file: '/var/log/pm2/info-literacy-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '20s',
      watch: false
    }
  ]
};
