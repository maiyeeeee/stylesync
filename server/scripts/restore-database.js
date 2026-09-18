const { spawn } = require("child_process")
const fs = require("fs")
const path = require("path")
require("../loadEnv")

const requestedFile = process.argv[2]
if (!requestedFile) {
  console.error("Usage: npm run restore -- path/to/backup.sql")
  process.exit(1)
}

const filePath = path.resolve(requestedFile)
if (!fs.existsSync(filePath) || path.extname(filePath).toLowerCase() !== ".sql") {
  console.error("Restore file must be an existing .sql backup")
  process.exit(1)
}

const child = spawn(
  "mysql",
  [
    "--host",
    process.env.DB_HOST || "127.0.0.1",
    "--port",
    String(process.env.DB_PORT || 3306),
    "--user",
    process.env.DB_USER || "root",
    process.env.DB_NAME || "stylesync_db",
  ],
  {
    env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD || "" },
    stdio: ["pipe", "inherit", "inherit"],
  }
)

fs.createReadStream(filePath).pipe(child.stdin)
child.on("error", (error) => {
  console.error(`Restore could not start: ${error.message}`)
  process.exitCode = 1
})
child.on("close", (code) => {
  if (code !== 0) {
    process.exitCode = code
    return
  }
  console.log(`Restore completed from: ${filePath}`)
})
