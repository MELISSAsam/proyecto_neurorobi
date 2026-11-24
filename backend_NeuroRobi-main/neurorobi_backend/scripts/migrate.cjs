require('dotenv').config();
const { spawnSync } = require('node:child_process');
if (!/^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL || '')) {
  throw new Error('Configura DATABASE_URL con una URL PostgreSQL antes de migrar.');
}
const result = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy', '--config', 'prisma.config.ts'], { stdio: 'inherit', env: process.env });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
