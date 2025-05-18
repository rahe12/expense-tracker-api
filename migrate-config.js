require('dotenv').config();

module.exports = {
  databaseUrl: process.env.DATABASE_URL,
  migrationsTable: 'pgmigrations',
  dir: 'migrations',
  direction: 'up',
  count: Infinity,
  verbose: true,
  schema: ['public'],
  noLock: false,
  ssl: {
    rejectUnauthorized: false // Required for Neon
  }
};