const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const url = process.env.DATABASE_URL;
if (!url?.startsWith('file:')) throw new Error('DATABASE_URL debe ser una URL SQLite file:');
// Inicializa el archivo vacio antes de que el motor Prisma aplique migraciones.
fs.mkdirSync(path.dirname(url.slice(5)), { recursive: true });
new Database(url.slice(5)).close();
const result = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
