const mysql = require("mysql2")
require("./loadEnv")

const db = mysql.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "stylesync_db",
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
    queueLimit: 0,
    dateStrings: true,
})

db.getConnection((err, connection) => {
    if (err) {
        console.error("Database Connection Failed:", err.message)
        return
    }

    console.log("MySQL Connected Successfully")
    connection.release()
})

module.exports = db
