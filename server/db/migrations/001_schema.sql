-- Labrador relational schema (MySQL 8, InnoDB)
-- Runs automatically on first `docker compose up` and via `npm run migrate`.

CREATE DATABASE IF NOT EXISTS labrador CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE labrador;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS equipment_bookings;
DROP TABLE IF EXISTS request_items;
DROP TABLE IF EXISTS requests;
DROP TABLE IF EXISTS consumables;
DROP TABLE IF EXISTS equipment;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

-- 1. Lab members and their roles
CREATE TABLE users (
  user_id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email          VARCHAR(190) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,
  full_name      VARCHAR(120) NOT NULL,
  role           ENUM('member','staff','admin') NOT NULL DEFAULT 'member',
  avatar_path    VARCHAR(255) NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2. Shared instruments and devices
CREATE TABLE equipment (
  equipment_id   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(150) NOT NULL,
  category       VARCHAR(80)  NOT NULL,
  location       VARCHAR(120) NOT NULL,
  status         ENUM('available','in_use','maintenance','retired') NOT NULL DEFAULT 'available',
  description    TEXT NULL,
  image_path     VARCHAR(255) NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_equipment_status (status)
) ENGINE=InnoDB;

-- 3. Consumable inventory (gloves, pipette tips, reagents ...)
CREATE TABLE consumables (
  consumable_id  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(150) NOT NULL UNIQUE,
  unit           VARCHAR(40)  NOT NULL,
  stock_quantity INT NOT NULL DEFAULT 0,
  reorder_level  INT NOT NULL DEFAULT 0,
  unit_cost      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  CONSTRAINT chk_stock_nonnegative CHECK (stock_quantity >= 0),
  CONSTRAINT chk_reorder_nonnegative CHECK (reorder_level >= 0),
  CONSTRAINT chk_cost_nonnegative CHECK (unit_cost >= 0)
) ENGINE=InnoDB;

-- 4. Every support request / ticket in the lab
CREATE TABLE requests (
  request_id     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  requester_id   INT UNSIGNED NOT NULL,
  assignee_id    INT UNSIGNED NULL,
  equipment_id   INT UNSIGNED NULL,
  type           ENUM('experiment_setup','maintenance','access','consumables','ticket') NOT NULL,
  title          VARCHAR(200) NOT NULL,
  description    TEXT NULL,
  priority       ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
  status         ENUM('open','in_progress','waiting','resolved','closed') NOT NULL DEFAULT 'open',
  due_date       DATE NULL,
  resolved_at    DATETIME NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_req_requester FOREIGN KEY (requester_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_req_assignee  FOREIGN KEY (assignee_id)  REFERENCES users(user_id) ON DELETE SET NULL,
  CONSTRAINT fk_req_equipment FOREIGN KEY (equipment_id) REFERENCES equipment(equipment_id) ON DELETE SET NULL,
  INDEX idx_req_status (status),
  INDEX idx_req_priority (priority),
  INDEX idx_req_created (created_at)
) ENGINE=InnoDB;

-- 5. Junction: consumables requested on a consumables-order request
CREATE TABLE request_items (
  item_id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  request_id     INT UNSIGNED NOT NULL,
  consumable_id  INT UNSIGNED NOT NULL,
  quantity       INT NOT NULL,
  unit_cost      DECIMAL(10,2) NOT NULL,
  CONSTRAINT fk_item_request    FOREIGN KEY (request_id)    REFERENCES requests(request_id) ON DELETE CASCADE,
  CONSTRAINT fk_item_consumable FOREIGN KEY (consumable_id) REFERENCES consumables(consumable_id) ON DELETE RESTRICT,
  CONSTRAINT chk_item_qty CHECK (quantity > 0),
  UNIQUE KEY uq_request_consumable (request_id, consumable_id)
) ENGINE=InnoDB;

-- 6. Equipment time-slot bookings
CREATE TABLE equipment_bookings (
  booking_id     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  equipment_id   INT UNSIGNED NOT NULL,
  user_id        INT UNSIGNED NOT NULL,
  request_id     INT UNSIGNED NULL,
  start_time     DATETIME NOT NULL,
  end_time       DATETIME NOT NULL,
  purpose        VARCHAR(255) NULL,
  status         ENUM('booked','cancelled','completed') NOT NULL DEFAULT 'booked',
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_book_equipment FOREIGN KEY (equipment_id) REFERENCES equipment(equipment_id) ON DELETE CASCADE,
  CONSTRAINT fk_book_user      FOREIGN KEY (user_id)      REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_book_request   FOREIGN KEY (request_id)   REFERENCES requests(request_id) ON DELETE SET NULL,
  CONSTRAINT chk_book_window CHECK (end_time > start_time),
  INDEX idx_book_window (equipment_id, start_time, end_time)
) ENGINE=InnoDB;
