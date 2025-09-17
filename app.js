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
async function crossJoinUsersProducts(filter = '', limit = 20, offset = 0) {
  const sql = `
    SELECT u.name AS user_name, p.name AS product_name, p.price
    FROM users u
    CROSS JOIN products p
    ${filter ? `WHERE ${filter}` : ''}
    LIMIT ? OFFSET ?;
  `;
  const [rows] = await pool.query(sql, [limit, offset]);
  return rows;
}

// 2️ Users with total order value > $1000
async function usersAbove1000() {
  const [rows] = await pool.query(`
    SELECT u.name AS user_name, SUM(o.quantity * p.price) AS total_spent
    FROM users u
    JOIN orders o ON u.id = o.user_id
    JOIN products p ON o.product_id = p.id
    GROUP BY u.id
    HAVING total_spent > 1000;
  `);
  return rows;
}

// 3️ Top-selling product per user
async function topProductPerUser() {
  const [rows] = await pool.query(`
    SELECT u.name AS user_name, p.name AS top_product, MAX(total_qty) AS total_qty
    FROM (
        SELECT o.user_id, o.product_id, SUM(o.quantity) AS total_qty
        FROM orders o
        GROUP BY o.user_id, o.product_id
    ) AS user_product_totals
    JOIN users u ON u.id = user_product_totals.user_id
    JOIN products p ON p.id = user_product_totals.product_id
    WHERE (user_product_totals.user_id, user_product_totals.total_qty) IN (
        SELECT user_id, MAX(total_qty)
        FROM (
            SELECT o2.user_id, o2.product_id, SUM(o2.quantity) AS total_qty
            FROM orders o2
            GROUP BY o2.user_id, o2.product_id
        ) AS sub_totals
        GROUP BY user_id
    )
    GROUP BY u.id, p.id;
  `);
  return rows;
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
async function listUsers(page = 1, pageSize = 5) {
  const offset = (page - 1) * pageSize;
  const [rows] = await pool.query(
    `SELECT * FROM users LIMIT ? OFFSET ?`,
    [pageSize, offset]
  );
  return rows;
}
// 6 Pagination for products
async function listProducts(page = 1, pageSize = 5) {
  const offset = (page - 1) * pageSize;
  const [rows] = await pool.query(
    `SELECT * FROM products LIMIT ? OFFSET ?`,
    [pageSize, offset]
  );
  return rows;
}

// 7 Pagination for orders
async function listOrders(page = 1, pageSize = 5) {
  const offset = (page - 1) * pageSize;
  const [rows] = await pool.query(
    `SELECT * FROM orders LIMIT ? OFFSET ?`,
    [pageSize, offset]
  );
  return rows;
}

// 6️ Export users to CSV
async function exportUsersToCSV() {
  const [rows] = await pool.query(`SELECT * FROM users`);
  const csv = rows.map(r => Object.values(r).join(",")).join("\n");
  fs.writeFileSync("users.csv", csv);
  return "Exported users.csv successfully";
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
  const { filter, limit = 20, offset = 0 } = req.query;
  const data = await crossJoinUsersProducts(filter, parseInt(limit), parseInt(offset));
  res.json(data);
});

// Users above 1000
app.get('/users-rich', async (req, res) => {
  const data = await usersAbove1000();
  res.json(data);
});

// Top-selling product per user
app.get('/users-top-product', async (req, res) => {
  const data = await topProductPerUser();
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
app.get('/export-users', async (req, res) => {
  const message = await exportUsersToCSV();
  res.json({ message });
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


