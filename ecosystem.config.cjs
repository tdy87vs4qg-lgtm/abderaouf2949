module.exports = {
  apps: [
    {
      name: 'webapp',
      script: 'npx',
      // Bindings (DB, SESSIONS) are read from wrangler.jsonc and served from the
      // local state under .wrangler/state/v3 — the same store the `db:migrate:local`
      // / `db:seed:local` scripts write to. .dev.vars supplies SESSION_SECRET.
      args: 'wrangler pages dev dist --local --ip 0.0.0.0 --port 3000',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork'
    }
  ]
}
