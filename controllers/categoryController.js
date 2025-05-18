const db = require('../db');

const categoryController = {
  getCategories: async (req, res) => {
    try {
      const categories = await db.query(
        'SELECT * FROM categories WHERE user_id = $1 ORDER BY name',
        [req.userId]
      );
      res.json(categories.rows);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  createCategory: async (req, res) => {
    try {
      const { name, color, icon } = req.body;
      
      const newCategory = await db.query(
        'INSERT INTO categories (user_id, name, color, icon) VALUES ($1, $2, $3, $4) RETURNING *',
        [req.userId, name, color, icon]
      );
      
      res.status(201).json(newCategory.rows[0]);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  updateCategory: async (req, res) => {
    try {
      const { id } = req.params;
      const { name, color, icon } = req.body;
      
      const updatedCategory = await db.query(
        'UPDATE categories SET name = $1, color = $2, icon = $3 WHERE id = $4 AND user_id = $5 RETURNING *',
        [name, color, icon, id, req.userId]
      );
      
      if (updatedCategory.rows.length === 0) {
        return res.status(404).json({ error: 'Category not found' });
      }
      
      res.json(updatedCategory.rows[0]);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  deleteCategory: async (req, res) => {
    try {
      const { id } = req.params;
      
      // First, set category_id to NULL for expenses with this category
      await db.query(
        'UPDATE expenses SET category_id = NULL WHERE category_id = $1 AND user_id = $2',
        [id, req.userId]
      );
      
      // Then delete the category
      const deletedCategory = await db.query(
        'DELETE FROM categories WHERE id = $1 AND user_id = $2 RETURNING *',
        [id, req.userId]
      );
      
      if (deletedCategory.rows.length === 0) {
        return res.status(404).json({ error: 'Category not found' });
      }
      
      res.json({ message: 'Category deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = categoryController;