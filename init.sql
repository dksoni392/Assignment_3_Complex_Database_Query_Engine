-- Drop tables if they already exist
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS users;

-- Users table
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL
);

-- Products table
CREATE TABLE products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    stock INT DEFAULT 100
);

-- Orders table
CREATE TABLE orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    product_id INT,
    quantity INT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Insert sample users
INSERT INTO users (name, email) VALUES
('Alice', 'alice@example.com'),
('Bob', 'bob@example.com'),
('Charlie', 'charlie@example.com'),
('Diana', 'diana@example.com'),
('Eve', 'eve@example.com'),
('Frank', 'frank@example.com');

-- Insert sample products
INSERT INTO products (name, price, stock) VALUES
('Laptop', 1200.00, 50),
('Phone', 800.00, 100),
('Tablet', 400.00, 80),
('Headphones', 150.00, 200),
('Smartwatch', 250.00, 120),
('Monitor', 300.00, 60),
('Keyboard', 90.00, 150),
('Mouse', 50.00, 180);

-- Insert sample orders
INSERT INTO orders (user_id, product_id, quantity) VALUES
(1, 1, 1),   -- Alice bought 1 Laptop
(1, 2, 2),   -- Alice bought 2 Phones
(2, 3, 5),   -- Bob bought 5 Tablets
(2, 4, 10),  -- Bob bought 10 Headphones
(3, 1, 2),   -- Charlie bought 2 Laptops
(3, 5, 3),   -- Charlie bought 3 Smartwatches
(4, 2, 1),   -- Diana bought 1 Phone
(4, 3, 1),   -- Diana bought 1 Tablet
(5, 6, 2),   -- Eve bought 2 Monitors
(5, 7, 5),   -- Eve bought 5 Keyboards
(6, 8, 10),  -- Frank bought 10 Mice
(6, 1, 1),   -- Frank bought 1 Laptop
(2, 2, 3),   -- Bob bought 3 Phones
(3, 4, 5),   -- Charlie bought 5 Headphones
(1, 5, 2);   -- Alice bought 2 Smartwatches

-- Creating the index
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_product_id ON orders(product_id);
CREATE INDEX idx_products_price ON products(price);

