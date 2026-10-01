const mysql = require("mysql2")
const fs = require("fs")
require("./loadEnv")

const useSsl =
    String(process.env.DB_SSL || "false").toLowerCase() === "true"

function getSslConfig() {
    if (!useSsl) {
        return undefined
    }

    const sslConfig = {
        minVersion: "TLSv1.2",
        rejectUnauthorized: true,
    }

    // Local development:
    // Read the TiDB CA certificate from your computer.
    if (process.env.DB_CA_PATH) {
        sslConfig.ca = fs.readFileSync(
            process.env.DB_CA_PATH,
            "utf8"
        )
    }

    // Render / cloud deployment:
    // Read the certificate directly from an environment variable.
    else if (process.env.DB_CA_CERT) {
        sslConfig.ca = process.env.DB_CA_CERT.replace(/\\n/g, "\n")
    }

    return sslConfig
}

const sslConfig = getSslConfig()

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

    ...(sslConfig ? { ssl: sslConfig } : {}),
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
