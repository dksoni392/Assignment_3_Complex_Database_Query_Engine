// app.js
const express = require('express');
const mysql = require('mysql2/promise');
const dotenv = require("dotenv");
const fs = require('fs');

const app = express();
app.use(express.json());

dotenv.config();

// ----------------- MySQL Connection -----------------
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT, 10) || 10,
  queueLimit: 0
});

module.exports = pool;
// ----------------- Queries / Functions -----------------

// 1️ Cross join with optional filter

async function crossJoinUsersProducts(filter = '', page = 1, pageSize = 10) {
  const offset = (page - 1) * pageSize;
  const limit = pageSize;

  // Query for paginated data
  const sql = `
    SELECT u.name AS user_name, p.name AS product_name, p.price
    FROM users u
    CROSS JOIN products p
    ${filter ? `WHERE ${filter}` : ''}
    LIMIT ? OFFSET ?;
  `;
  const [rows] = await pool.query(sql, [limit, offset]);

  // Query for total count (no pagination)
  const countSql = `
    SELECT COUNT(*) AS total
    FROM users u
    CROSS JOIN products p
    ${filter ? `WHERE ${filter}` : ''};
  `;
  const [countResult] = await pool.query(countSql);
  const totalRecords = countResult[0].total;

  return {
    data: rows,
    metadata: {
      totalRecords,
      totalPages: Math.ceil(totalRecords / pageSize),
      currentPage: page,   // <-- directly from params
      pageSize
    }
  };
}


// 2️ Users with total order value > $1000
async function usersAbove1000(page = 1, pageSize = 10) {
  const offset = (page - 1) * pageSize;
  const limit = pageSize;

  // Query with pagination built-in
  const sql = `
    SELECT u.name AS user_name, SUM(o.quantity * p.price) AS total_spent
    FROM users u
    JOIN orders o ON u.id = o.user_id
    JOIN products p ON o.product_id = p.id
    GROUP BY u.id
    HAVING total_spent > 1000
    LIMIT ? OFFSET ?;
  `;
  const [rows] = await pool.query(sql, [limit, offset]);

  // Count total qualifying users (without pagination)
  // ✅ Instead of doing another full query, reuse the same aggregation logic but just count
  const countSql = `
    SELECT COUNT(*) AS total
    FROM (
      SELECT u.id
      FROM users u
      JOIN orders o ON u.id = o.user_id
      JOIN products p ON o.product_id = p.id
      GROUP BY u.id
      HAVING SUM(o.quantity * p.price) > 1000
    ) AS subquery;
  `;
  const [countResult] = await pool.query(countSql);
  const totalRecords = countResult[0].total;

  return {
    data: rows,
    metadata: {
      totalRecords,
      totalPages: Math.ceil(totalRecords / pageSize),
      currentPage: page,
      pageSize
    }
  };
}


// 3️ Top-selling product per user (unique)
async function topProductPerUser(page = 1, pageSize = 10) {
  const offset = (page - 1) * pageSize;

  const sql = `
    SELECT u.name AS user_name, p.name AS top_product, t.total_qty, t.total_value
    FROM (
        SELECT 
            o.user_id,
            o.product_id,
            SUM(o.quantity) AS total_qty,
            SUM(o.quantity * p.price) AS total_value,
            ROW_NUMBER() OVER (
                PARTITION BY o.user_id
                ORDER BY SUM(o.quantity) DESC, SUM(o.quantity * p.price) DESC, o.product_id ASC
            ) AS rn
        FROM orders o
        JOIN products p ON p.id = o.product_id
        GROUP BY o.user_id, o.product_id
    ) AS t
    JOIN users u ON u.id = t.user_id
    JOIN products p ON p.id = t.product_id
    WHERE t.rn = 1
    LIMIT ? OFFSET ?;
  `;

  const [rows] = await pool.query(sql, [pageSize, offset]);

  // Get total number of unique users (only once)
  const countSql = `
    SELECT COUNT(*) AS total
    FROM (
        SELECT o.user_id,
               ROW_NUMBER() OVER (
                   PARTITION BY o.user_id
                   ORDER BY SUM(o.quantity) DESC, SUM(o.quantity * p.price) DESC, o.product_id ASC
               ) AS rn
        FROM orders o
        JOIN products p ON p.id = o.product_id
        GROUP BY o.user_id, o.product_id
    ) t
    WHERE t.rn = 1;
  `;
  const [countResult] = await pool.query(countSql);
  const totalRecords = countResult[0].total;

  return {
    data: rows,
    metadata: {
      totalRecords,
      totalPages: Math.ceil(totalRecords / pageSize),
      currentPage: page,
      pageSize
    }
  };
}



// 4️ Place order transaction (prepared statement)
async function placeOrder(userId, productId, qty) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Lock product row for stock check
    const [stockRows] = await conn.query(
      `SELECT stock FROM products WHERE id = ? FOR UPDATE`,
      [productId]
    );
    if (stockRows.length === 0) throw new Error("Product not found");
    if (stockRows[0].stock < qty) throw new Error("Insufficient stock");

    // Update stock
    await conn.query(`UPDATE products SET stock = stock - ? WHERE id = ?`, [qty, productId]);

    // Insert order
    await conn.query(
      `INSERT INTO orders (user_id, product_id, quantity) VALUES (?, ?, ?)`,
      [userId, productId, qty]
    );

    await conn.commit();
    return { success: true, message: "Order placed successfully" };
  } catch (err) {
    await conn.rollback();
    return { success: false, message: err.message };
  } finally {
    conn.release();
  }
}

// 5️ Pagination for users
async function listUsers(page = 1, pageSize = 10) {
  const offset = (page - 1) * pageSize;

  const [rows] = await pool.query(
    `SELECT * FROM users LIMIT ? OFFSET ?`,
    [pageSize, offset]
  );

  const [countResult] = await pool.query(`SELECT COUNT(*) AS total FROM users`);
  const totalRecords = countResult[0].total;

  return {
    data: rows,
    metadata: {
      totalRecords,
      totalPages: Math.ceil(totalRecords / pageSize),
      currentPage: page,
      pageSize
    }
  };
}

// 6 Pagination for products
async function listProducts(page = 1, pageSize = 10) {
  const offset = (page - 1) * pageSize;

  const [rows] = await pool.query(
    `SELECT * FROM products LIMIT ? OFFSET ?`,
    [pageSize, offset]
  );

  const [countResult] = await pool.query(`SELECT COUNT(*) AS total FROM products`);
  const totalRecords = countResult[0].total;

  return {
    data: rows,
    metadata: {
      totalRecords,
      totalPages: Math.ceil(totalRecords / pageSize),
      currentPage: page,
      pageSize
    }
  };
}

// 7 Pagination for orders
async function listOrders(page = 1, pageSize = 10) {
  const offset = (page - 1) * pageSize;

  const [rows] = await pool.query(
    `SELECT * FROM orders LIMIT ? OFFSET ?`,
    [pageSize, offset]
  );

  const [countResult] = await pool.query(`SELECT COUNT(*) AS total FROM orders`);
  const totalRecords = countResult[0].total;

  return {
    data: rows,
    metadata: {
      totalRecords,
      totalPages: Math.ceil(totalRecords / pageSize),
      currentPage: page,
      pageSize
    }
  };
}


// 6️ Export users to CSV
async function exportTableToCSV(tableName) {
  const [rows] = await pool.query(`SELECT * FROM ${tableName}`);
  if (rows.length === 0) {
    return { file: null, count: 0, message: `${tableName} table is empty` };
  }

  const headers = Object.keys(rows[0]).join(",");
  const csvRows = rows.map(r => Object.values(r).join(","));
  const csv = [headers, ...csvRows].join("\n");

  const fileName = `${tableName}.csv`;
  fs.writeFileSync(fileName, csv);

  return {
    file: fileName,
    count: rows.length,
    message: `Exported ${rows.length} rows from ${tableName} table to ${fileName}`
  };
}

// 7 List of tables
async function showTables() {
  // Users
  const [users] = await pool.query("SELECT * FROM users");
  console.log("\n=== Users ===");
  console.table(users);

  // Products
  const [products] = await pool.query("SELECT * FROM products");
  console.log("\n=== Products ===");
  console.table(products);

  // Orders
  const [orders] = await pool.query("SELECT * FROM orders");
  console.log("\n=== Orders ===");
  console.table(orders);
}


// ----------------- Express Endpoints -----------------

// Cross join endpoint
app.get('/cross', async (req, res) => {
  const { filter, page = 1, pageSize = 10 } = req.query;
  const data = await crossJoinUsersProducts(filter, parseInt(page), parseInt(pageSize));
  res.json(data);
});

// Users above 1000
app.get('/users-rich', async (req, res) => {
  const {page = 1, pageSize = 10 } = req.query;
  const data = await usersAbove1000(parseInt(page), parseInt(pageSize));
  res.json(data);
});

// Top-selling product per user
app.get('/users-top-product', async (req, res) => {
  const {page = 1, pageSize = 10 } = req.query;
  const data = await topProductPerUser(parseInt(page), parseInt(pageSize));
  res.json(data);
});

// Place order
app.post('/order', async (req, res) => {
  const { userId, productId, quantity } = req.body;
  if (!userId || !productId || !quantity) return res.status(400).json({ message: "Missing fields" });
  const result = await placeOrder(userId, productId, quantity);
  res.json(result);
});

// Paginate users
app.get('/users', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 5;
  const data = await listUsers(page,pageSize);
  res.json(data);
});

// Paginate products
app.get("/products", async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 5;
  const products = await listProducts(page, pageSize);
  res.json(products);
});

// Paginated orders
app.get("/orders", async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 5;
  const orders = await listOrders(page, pageSize);
  res.json(orders);
});

// Export CSV
app.post("/export", async (req, res) => {
  try {
    const { users, products, orders } = req.body;

    // ✅ Validate booleans strictly
    if (
      typeof users !== "boolean" ||
      typeof products !== "boolean" ||
      typeof orders !== "boolean"
    ) {
      return res.status(400).json({
        error:
          "Invalid request: users, products, and orders must be boolean values (true/false)"
      });
    }

    const tablesToExport = [];
    if (users) tablesToExport.push("users");
    if (products) tablesToExport.push("products");
    if (orders) tablesToExport.push("orders");

    if (tablesToExport.length === 0) {
      return res
        .status(400)
        .json({ error: "No table selected for export (all are false)" });
    }

    const results = {};
    for (const table of tablesToExport) {
      results[table] = await exportTableToCSV(table);
    }

    res.json({
      tables_exported: tablesToExport,
      results
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


CLI : 

// ----------------- Optional CLI support -----------------
if (require.main === module && process.argv[2]) {
  (async () => {
    const action = process.argv[2];
    switch (action) {
      case 'cross': console.table(await crossJoinUsersProducts()); break;
      case 'rich': console.table(await usersAbove1000()); break;
      case 'top': console.table(await topProductPerUser()); break;
      case 'order':
        const [userId, productId, qty] = process.argv.slice(3).map(Number);
        console.log(await placeOrder(userId, productId, qty));
        break;
      case 'users':
        const page = parseInt(process.argv[3]) || 1;
        console.table(await listUsers(page));
        break;
      case 'export':
        console.log(await exportUsersToCSV());
        break;
      case 'tables':  // 🔥 new option
        await showTables();
        break;
      default: console.log("Unknown CLI action");
    }
    process.exit();
  })();
}

// Start Express server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`--- Server running on http://localhost:${PORT} ---`);
  console.log(`Available endpoints: /cross, /users-rich, /users-top-product, /order, /users, /export-users`);
});


