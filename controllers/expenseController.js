const db = require('../db');

const expenseController = {
  getExpenses: async (req, res) => {
    try {
      const { startDate, endDate, categoryId } = req.query;
      let query = 'SELECT e.*, c.name as category_name, c.color as category_color FROM expenses e LEFT JOIN categories c ON e.category_id = c.id WHERE e.user_id = $1';
      const params = [req.userId];
      
      if (startDate && endDate) {
        query += ' AND e.date BETWEEN $2 AND $3';
        params.push(startDate, endDate);
      } else if (startDate) {
        query += ' AND e.date >= $2';
        params.push(startDate);
      } else if (endDate) {
        query += ' AND e.date <= $2';
        params.push(endDate);
      }
      
      if (categoryId) {
        query += ' AND e.category_id = $' + (params.length + 1);
        params.push(categoryId);
      }
      
      query += ' ORDER BY e.date DESC';
      
      const expenses = await db.query(query, params);
      res.json(expenses.rows);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  createExpense: async (req, res) => {
    try {
      const { amount, description, date, category_id } = req.body;
      
      const newExpense = await db.query(
        'INSERT INTO expenses (user_id, amount, description, date, category_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [req.userId, amount, description, date, category_id]
      );
      
      res.status(201).json(newExpense.rows[0]);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  getExpense: async (req, res) => {
    try {
      const { id } = req.params;
      
      const expense = await db.query(
        'SELECT e.*, c.name as category_name, c.color as category_color FROM expenses e LEFT JOIN categories c ON e.category_id = c.id WHERE e.id = $1 AND e.user_id = $2',
        [id, req.userId]
      );
      
      if (expense.rows.length === 0) {
        return res.status(404).json({ error: 'Expense not found' });
      }
      
      res.json(expense.rows[0]);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  updateExpense: async (req, res) => {
    try {
      const { id } = req.params;
      const { amount, description, date, category_id } = req.body;
      
      const updatedExpense = await db.query(
        'UPDATE expenses SET amount = $1, description = $2, date = $3, category_id = $4 WHERE id = $5 AND user_id = $6 RETURNING *',
        [amount, description, date, category_id, id, req.userId]
      );
      
      if (updatedExpense.rows.length === 0) {
        return res.status(404).json({ error: 'Expense not found' });
      }
      
      res.json(updatedExpense.rows[0]);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  deleteExpense: async (req, res) => {
    try {
      const { id } = req.params;
      
      const deletedExpense = await db.query(
        'DELETE FROM expenses WHERE id = $1 AND user_id = $2 RETURNING *',
        [id, req.userId]
      );
      
      if (deletedExpense.rows.length === 0) {
        return res.status(404).json({ error: 'Expense not found' });
      }
      
      res.json({ message: 'Expense deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  getExpenseSummary: async (req, res) => {
    try {
      const { period = 'month' } = req.query;
      
      let dateTrunc;
      switch (period) {
        case 'day':
          dateTrunc = 'day';
          break;
        case 'week':
          dateTrunc = 'week';
          break;
        case 'year':
          dateTrunc = 'year';
          break;
        default:
          dateTrunc = 'month';
      }
      
      // Summary by period
      const summaryByPeriod = await db.query(
        `SELECT 
          DATE_TRUNC('${dateTrunc}', date) as period,
          SUM(amount) as total_amount
         FROM expenses
         WHERE user_id = $1
         GROUP BY period
         ORDER BY period DESC`,
        [req.userId]
      );
      
      // Summary by category
      const summaryByCategory = await db.query(
        `SELECT 
          c.id as category_id,
          c.name as category_name,
          c.color as category_color,
          SUM(e.amount) as total_amount
         FROM expenses e
         LEFT JOIN categories c ON e.category_id = c.id
         WHERE e.user_id = $1
         GROUP BY c.id, c.name, c.color
         ORDER BY total_amount DESC`,
        [req.userId]
      );
      
      res.json({
        byPeriod: summaryByPeriod.rows,
        byCategory: summaryByCategory.rows
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = expenseController;