-- Additive migration only. Review on a test database before production TiDB.
CREATE TABLE IF NOT EXISTS transaction_items (
  item_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  transaction_id INT NOT NULL,
  item_type VARCHAR(20) NOT NULL,
  catalog_id INT NOT NULL,
  item_name VARCHAR(150) NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  line_total DECIMAL(10,2) NOT NULL,
  INDEX idx_transaction_items_parent (transaction_id),
  CONSTRAINT fk_transaction_items_transaction
    FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id)
    ON DELETE RESTRICT
);
