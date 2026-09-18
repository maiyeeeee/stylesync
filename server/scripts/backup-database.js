const { spawn } = require("child_process")
const fs = require("fs")
const path = require("path")
require("../loadEnv")

const backupDir = path.resolve(process.env.BACKUP_DIR || "backups")
const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS || 30)
const stamp = new Date().toISOString().replace(/[:.]/g, "-")
const filePath = path.join(backupDir, `stylesync-${stamp}.sql`)

fs.mkdirSync(backupDir, { recursive: true })

const output = fs.createWriteStream(filePath, { flags: "wx" })
const child = spawn(
  "mysqldump",
  [
    "--single-transaction",
    "--routines",
    "--triggers",
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
    stdio: ["ignore", "pipe", "pipe"],
  }
)

child.stdout.pipe(output)
let errorText = ""
child.stderr.on("data", (chunk) => {
  errorText += chunk.toString()
})

child.on("error", (error) => {
  output.destroy()
  console.error(`Backup could not start: ${error.message}`)
  process.exitCode = 1
})

child.on("close", (code) => {
  output.end()
  if (code !== 0) {
    console.error(`Backup failed: ${errorText.trim() || `exit code ${code}`}`)
    process.exitCode = 1
    return
  }

  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  for (const name of fs.readdirSync(backupDir)) {
    if (!name.startsWith("stylesync-") || !name.endsWith(".sql")) continue
    const candidate = path.join(backupDir, name)
    if (fs.statSync(candidate).mtimeMs < cutoff) fs.unlinkSync(candidate)
  }

  console.log(`Backup completed: ${filePath}`)
})
