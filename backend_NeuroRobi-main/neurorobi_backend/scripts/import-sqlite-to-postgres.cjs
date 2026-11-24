// One-time copy of an existing SQLite database into an already migrated,
// empty PostgreSQL database. Set SQLITE_DATABASE_URL and DATABASE_URL privately.
require('dotenv').config();
const Database = require('better-sqlite3');
const { Client } = require('pg');
const path = require('node:path');

const tables = [
  'Institution', 'Specialist', 'Patient', 'PatientAssignment', 'NeuroDevice',
  'ClinicalSession', 'SensorReading', 'SpikesLogItem', 'AuditLog',
  'PlatformSetting', 'TelemetryPacket',
];
const booleanColumns = new Set([
  'active', 'clinicalRead', 'mustChangePassword', 'previousSqueeze',
  'previousLeft', 'previousRight', 'previousShake',
]);
const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;

async function main() {
  const sqliteUrl = process.env.SQLITE_DATABASE_URL;
  const postgresUrl = process.env.DATABASE_URL;
  if (!sqliteUrl?.startsWith('file:')) throw new Error('SQLITE_DATABASE_URL debe ser file:ruta/a/la/base.db');
  if (!/^postgres(ql)?:\/\//i.test(postgresUrl || '')) throw new Error('DATABASE_URL debe apuntar a PostgreSQL.');

  const sqlitePath = sqliteUrl.slice(5);
  const sqlite = new Database(path.resolve(sqlitePath), { readonly: true, fileMustExist: true });
  const pg = new Client({ connectionString: postgresUrl });
  try {
    const sqliteTables = new Set(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name));
    const missing = tables.filter((table) => !sqliteTables.has(table));
    if (missing.length) throw new Error(`Faltan tablas SQLite: ${missing.join(', ')}`);

    await pg.connect();
    const targetColumns = new Map();
    for (const table of tables) {
      const result = await pg.query(`SELECT count(*)::int AS count FROM ${quote(table)}`);
      if (result.rows[0].count !== 0) throw new Error(`PostgreSQL no está vacío: ${table} ya tiene filas. No se importó nada.`);
      const columns = await pg.query('SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position', [table]);
      targetColumns.set(table, new Set(columns.rows.map((row) => row.column_name)));
    }

    await pg.query('BEGIN');
    for (const table of tables) {
      const columns = sqlite.prepare(`PRAGMA table_info(${quote(table)})`).all().map((column) => column.name).filter((column) => targetColumns.get(table).has(column));
      if (!columns.length) continue;
      const rows = sqlite.prepare(`SELECT * FROM ${quote(table)}`).all();
      const sql = `INSERT INTO ${quote(table)} (${columns.map(quote).join(', ')}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')})`;
      for (const row of rows) {
        const values = columns.map((column) => booleanColumns.has(column) && row[column] !== null ? Boolean(row[column]) : row[column]);
        await pg.query(sql, values);
      }
      console.log(`${table}: ${rows.length} filas`);
    }

    for (const table of ['SensorReading', 'TelemetryPacket']) {
      const result = await pg.query(`SELECT pg_get_serial_sequence($1, 'id') AS sequence`, [quote(table)]);
      const sequence = result.rows[0].sequence;
      if (sequence) {
        await pg.query(`SELECT setval($1, COALESCE((SELECT MAX("id") FROM ${quote(table)}), 1), EXISTS (SELECT 1 FROM ${quote(table)}))`, [sequence]);
      }
    }
    await pg.query('COMMIT');
    console.log('Importación completada. Verifica cuentas, pacientes y sesiones antes de cambiar tráfico.');
  } catch (error) {
    try { await pg.query('ROLLBACK'); } catch { /* no transaction started */ }
    throw error;
  } finally {
    sqlite.close();
    await pg.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error(`Error de importación: ${error.message}`);
  process.exitCode = 1;
});
