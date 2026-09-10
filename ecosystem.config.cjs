// ملف إدارة PM2 الموحد لـ P-Sale Ultra Cloud
// التشغيل:   pm2 start ecosystem.config.cjs
// الحفظ:     pm2 save
// الإيقاف:   pm2 stop ecosystem.config.cjs
// السجلات:   pm2 logs

module.exports = {
  apps: [
    {
      name: 'psale-server',
      cwd: './server',
      script: './node_modules/tsx/dist/cli.mjs',
      args: 'watch src/app.ts',
      interpreter: 'node',
      autorestart: true,
      max_restarts: 10,
      min_uptime: 1000,
      time: true,
    },
    {
      name: 'psale-client',
      cwd: './client',
      script: './node_modules/serve/build/main.js',
      args: '-s dist -l 5175',
      interpreter: 'node',
      autorestart: true,
      max_restarts: 10,
      min_uptime: 1000,
      time: true,
    },
  ],
}
