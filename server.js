require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Database connection (add this if using DB)
const pool = require('./config/db'); // Example path

// Test DB connection (optional)
pool.query('SELECT NOW()')
  .then(() => console.log('✅ Database connected'))
  .catch(err => console.error('❌ DB connection failed:', err));

// ======================
// Route Imports
// ======================
const authRoutes = require('./routes/authRoutes');
const expenseRoutes = require('./routes/expenseRoutes'); // Example additional route

// ======================
// Mount Routes
// ======================
app.use('/api/auth', authRoutes);
app.use('/api/expenses', expenseRoutes); // Example additional route

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'running', 
    timestamp: new Date() 
  });
});

// ======================
// Error Handling
// ======================
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// For Vercel deployment (required)
module.exports = app;

// Local development
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}
