import { mysqlPool } from './pool.js';

export async function ensureSchema() {
  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS short_urls (
      alias VARCHAR(6) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      destination_url MEDIUMTEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (alias)
    ) ENGINE=InnoDB
  `);

  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS app_migrations (
      migration_name VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      completed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (migration_name)
    ) ENGINE=InnoDB
  `);
}

export async function insertUrl(alias, destinationUrl) {
  await mysqlPool.execute(
    'INSERT INTO short_urls (alias, destination_url) VALUES (?, ?)',
    [alias, destinationUrl],
  );
}

export async function insertUrlIfMissing(alias, destinationUrl) {
  await mysqlPool.execute(
    'INSERT IGNORE INTO short_urls (alias, destination_url) VALUES (?, ?)',
    [alias, destinationUrl],
  );
}

export async function findUrl(alias) {
  const [rows] = await mysqlPool.execute(
    'SELECT destination_url FROM short_urls WHERE alias = ? LIMIT 1',
    [alias],
  );

  return rows[0]?.destination_url || null;
}

export async function listAliasesAfter(lastAlias, limit) {
  const [rows] = await mysqlPool.execute(
    'SELECT alias FROM short_urls WHERE alias > ? ORDER BY alias LIMIT ?',
    [lastAlias, limit],
  );

  return rows.map((row) => row.alias);
}

export async function countUrls() {
  const [rows] = await mysqlPool.query('SELECT COUNT(*) AS total FROM short_urls');
  return Number(rows[0].total);
}

export async function hasMigration(migrationName) {
  const [rows] = await mysqlPool.execute(
    'SELECT migration_name FROM app_migrations WHERE migration_name = ? LIMIT 1',
    [migrationName],
  );

  return rows.length > 0;
}

export async function markMigrationComplete(migrationName) {
  await mysqlPool.execute(
    'INSERT IGNORE INTO app_migrations (migration_name) VALUES (?)',
    [migrationName],
  );
}
