# Assignment 3 - Complex Database Query Engine

This project implements a **complex database query engine** using **Node.js, Express, and MySQL**.  
It demonstrates advanced SQL queries, prepared statements, transactions, pagination, and both **API endpoints** and **CLI support**.

---

## 📦 Setup

1. **Clone the repository**
   ```bash
   git clone Assignment_3_Complex_Database_Query_Engine
   cd Assignment_3_Complex_Database_Query_Engine
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Setup MySQL Database**
   - Login to MySQL:
     ```bash
     mysql -u root -p
     ```
   - Create database:
     ```sql
     CREATE DATABASE assignment3;
     ```
   - Load schema & sample data:
     ```bash
     mysql -u root -p assignment3 < init.sql
     ```

4. **Start the server**
   ```bash
   node app.js
   ```
   Server will run on:  
   👉 `http://localhost:3000`

---

## 🌐 API Endpoints

### 1. Cross Join Users & Products
Get user-product combinations with optional filters.
```http
GET /cross?filter=p.price>500&limit=5&offset=0
```

### 2. Users Above $1000 in Orders
```http
GET /users-rich
```

### 3. Top Product Per User
```http
GET /users-top-product
```

### 4. Place Order (Transaction)
```http
POST /order
Body: { "userId": 1, "productId": 2, "quantity": 3 }
```

### 5. Paginated Users
```http
GET /users?page=2&pageSize=5
```

### 6. Paginated Products
```http
GET /products?page=1&pageSize=5
```

### 7. Paginated Orders
```http
GET /orders?page=1&pageSize=5
```

### 8. Export Users to CSV
```http
GET /export-users
```

---

## 💻 CLI Usage

Run queries directly from CLI:

```bash
node app.js <command>
```

### Commands:
- `cross` → Show cross join of users & products  
- `rich` → Show users with total order value > $1000  
- `top` → Show top product per user  
- `order <userId> <productId> <qty>` → Place an order  
- `users <page>` → List users with pagination  
- `export` → Export users to CSV  
- `tables` → Show all current tables (users, products, orders)

---

## ⚡ Features

- Uses **mysql2** with prepared statements (prevents SQL injection).  
- Implements **transactions** (insert order + stock update).  
- Optimized with **indexes** for performance.  
- Supports **pagination** for large datasets.  
- Provides both **API endpoints** and **CLI interface**.  
- Allows **CSV export** of data.  

---

## 🛠 Requirements

- Node.js (>=16)  
- MySQL (>=8.0)  
- npm  
