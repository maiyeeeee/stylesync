// Run from the project root: node server/payment-setup.js
const fs = require("fs")
const path = require("path")
require("dotenv").config()
const db = require("./db")
async function main() {
    const conn = db.promise()
    for (const table of ["booking_deposits", "booking_deposit_applications"]) {
        const [rows] = await conn.query("SHOW TABLES LIKE ?", [table])
        if (!rows.length) throw new Error(`Required existing table ${table} is missing.`)
    }
    await conn.query(`CREATE TABLE IF NOT EXISTS booking_payment_settings (
    id INT NOT NULL PRIMARY KEY,
    receiving_name VARCHAR(150) NOT NULL,
    receiving_number VARCHAR(30) NOT NULL,
    qr_data LONGTEXT NOT NULL,
    enabled TINYINT NOT NULL DEFAULT 1,
    version INT NOT NULL DEFAULT 1,
    updated_by INT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`)
    const [columns] = await conn.query("SHOW COLUMNS FROM booking_deposits LIKE 'qr_snapshot'")
    if (!columns.length)
        await conn.query("ALTER TABLE booking_deposits ADD COLUMN qr_snapshot LONGTEXT NULL")
    const qr =
        "data:image/jpeg;base64," +
        fs.readFileSync(path.join(__dirname, "payment-assets/gcash-test.jpg")).toString("base64")
    await conn.query(
        `INSERT IGNORE INTO booking_payment_settings
    (id, receiving_name, receiving_number, qr_data) VALUES (1, ?, ?, ?)`,
        ["Irene Mae Cartaciano", "09618184830", qr],
    )
    console.log("Payment settings ready. Existing settings and records were preserved.")
}
main()
    .catch((err) => {
        console.error(err.message)
        process.exitCode = 1
    })
    .finally(() => db.end())
