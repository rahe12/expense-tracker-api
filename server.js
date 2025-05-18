// Top of file
require('dotenv').config();
console.log('✅ Environment loaded:', {
  PORT: process.env.PORT,
  DB: process.env.DATABASE_URL?.split('@')[1]?.split('/')[0] // Hide credentials
});

// Database connection test
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
pool.query('SELECT NOW()')
  .then(() => console.log('✅ Database connected'))
  .catch(err => {
    console.error('❌ Database connection failed', err);
    process.exit(1);
  });

// Server setup
const express = require('express');
const app = express();
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date() });
});

// Error handling
process.on('unhandledRejection', (err) => {
  console.error('⚠️ Unhandled rejection:', err);
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
