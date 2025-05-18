exports.up = (pgm) => {
  pgm.createTable('users', {
    id: { type: 'serial', primaryKey: true },
    username: { type: 'varchar(50)', notNull: true, unique: true },
    email: { type: 'varchar(100)', notNull: true, unique: true },
    password_hash: { type: 'varchar(255)', notNull: true },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') }
  });

  pgm.createTable('categories', {
    id: { type: 'serial', primaryKey: true },
    user_id: { 
      type: 'integer', 
      notNull: true, 
      references: 'users(id)', 
      onDelete: 'CASCADE' 
    },
    name: { type: 'varchar(50)', notNull: true },
    color: { type: 'varchar(20)' },
    icon: { type: 'varchar(30)' },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') }
  });

  pgm.createTable('expenses', {
    id: { type: 'serial', primaryKey: true },
    user_id: { 
      type: 'integer', 
      notNull: true, 
      references: 'users(id)', 
      onDelete: 'CASCADE' 
    },
    category_id: { 
      type: 'integer', 
      references: 'categories(id)', 
      onDelete: 'SET NULL' 
    },
    amount: { type: 'decimal(10, 2)', notNull: true },
    description: { type: 'varchar(255)' },
    date: { type: 'date', notNull: true, default: pgm.func('current_date') },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') }
  });

  // Create indexes
  pgm.createIndex('expenses', 'user_id');
  pgm.createIndex('expenses', 'date');
};

exports.down = (pgm) => {
  pgm.dropTable('expenses');
  pgm.dropTable('categories');
  pgm.dropTable('users');
};