const readline = require("node:readline")
const { Writable } = require("node:stream")
const bcrypt = require("bcrypt")

function askHidden(label) {
  return new Promise((resolve, reject) => {
    const hiddenOutput = new Writable({
      write(chunk, encoding, callback) {
        callback()
      },
    })

    const rl = readline.createInterface({
      input: process.stdin,
      output: hiddenOutput,
      terminal: true,
      historySize: 0,
    })

    let finished = false
    process.stdout.write(label)

    rl.on("SIGINT", () => rl.close())

    rl.on("close", () => {
      hiddenOutput.end()

      if (!finished) {
        process.stdout.write("\n")
        reject(new Error("Reset cancelled."))
      }
    })

    rl.question("", (answer) => {
      finished = true
      rl.close()
      process.stdout.write("\n")
      resolve(answer)
    })
  })
}

async function main() {
  if (!process.stdin.isTTY) {
    throw new Error(
      "Use an interactive PowerShell terminal in VS Code."
    )
  }

  const database = require("./db").promise()

  try {
    const [databases] = await database.query(
      "SELECT DATABASE() AS name"
    )

    if (databases[0]?.name !== "stylesync_db") {
      throw new Error(
        "Wrong database selected. Expected stylesync_db."
      )
    }

    const [rows] = await database.query(
      `SELECT user_id, username, email, password, role, account_status
       FROM users
       WHERE LOWER(TRIM(email)) = ?`,
      ["irenecartaciano38@gmail.com"]
    )

    const owner = rows[0]

    if (
      rows.length !== 1 ||
      Number(owner?.user_id) !== 14 ||
      owner?.username !== "irene" ||
      owner?.role !== "owner" ||
      owner?.account_status !== "Active"
    ) {
      throw new Error(
        "The account does not match the verified active owner. No password changed."
      )
    }

    console.log("Resetting password for irene (owner, ID 14).")
    console.log(
      "Typing is hidden, including stars. Press Enter after each password."
    )

    const password = await askHidden("New password: ")
    const confirmation = await askHidden("Confirm new password: ")

    if (
      password.length < 8 ||
      Buffer.byteLength(password, "utf8") > 72
    ) {
      throw new Error(
        "Use at least 8 characters and at most 72 bytes. Run again."
      )
    }

    if (password !== confirmation) {
      throw new Error(
        "Passwords do not match. No password changed. Run again."
      )
    }

    const hash = await bcrypt.hash(password, 12)

    const [result] = await database.query(
      `UPDATE users SET password = ?
       WHERE user_id = ? AND username = ?
         AND LOWER(TRIM(email)) = ?
         AND role = 'owner' AND account_status = 'Active'
         AND CAST(password AS BINARY) = CAST(? AS BINARY)`,
      [
        hash,
        14,
        "irene",
        "irenecartaciano38@gmail.com",
        owner.password,
      ]
    )

    if (result.affectedRows !== 1) {
      throw new Error(
        "The account changed during reset. No password changed by this script."
      )
    }

    console.log(
      "Password reset successful. Log in as irene using your new password."
    )
  } finally {
    await database.end().catch(() => {})
  }
}

main().catch((error) => {
  console.error("Reset stopped:", error.code || error.message)
  process.exitCode = 1
})