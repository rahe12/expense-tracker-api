const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Test connection
(async () => {
  try {
    const client = await pool.connect();
    console.log('✅ Connected to Neon PostgreSQL');
    client.release();
  } catch (err) {
    console.error('❌ Failed to connect to Neon PostgreSQL:', err.message);
    process.exit(1);
  }
})();

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: async () => {
    const client = await pool.connect();
    return client;
  },
};