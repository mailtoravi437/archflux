// ArchFlux PM2 ecosystem file — alternative to systemd for running the backend.
// NOTE: server/ is a Spring Boot (Java) app. PM2 can launch `java -jar`, but
// systemd (archflux-backend.service) is the recommended choice on Debian.
// If you switch the backend to Node, point `script` at your entry file instead.
module.exports = {
  apps: [
    {
      name: 'archflux-backend',
      script: 'java',
      args: ' -jar target/app.jar',
      cwd: '/var/www/archflux-server',
      exec_interpreter: 'none',
      env: {
        SPRING_PROFILES_ACTIVE: 'prod',
        SERVER_PORT: '3001',
        APP_COOKIE_SECURE: 'true',
        REDIS_HOST: '127.0.0.1',
      },
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      watch: false,
      max_memory_restart: '1G',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};

// Usage (run as the archflux user, with /etc/archflux/backend.env loaded):
//   sudo -u archflux sh -c 'cd /var/www/archflux-server && set -a && . /etc/archflux/backend.env && set +a && npx pm2 start ecosystem.config.cjs'
//   npx pm2 save && npx pm2 startup systemd   # survive reboots
// Zero-downtime reload (Node backend only): npx pm2 reload archflux-backend
// For Java: `pm2 restart archflux-backend` (brief downtime).
