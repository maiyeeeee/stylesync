const express = require("express")
const router = express.Router()
const bcrypt = require("bcrypt")
const db = require("../../db")

router.post("/signup", async (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({
      error: "Username and password are required",
    })
  }

  if (username.trim().length < 3) {
    return res.status(400).json({
      error: "Username must be at least 3 characters",
    })
  }

  if (password.length < 6) {
    return res.status(400).json({
      error: "Password must be at least 6 characters",
    })
  }

  try {
    const checkSql =
      "SELECT user_id FROM users WHERE username = ?"

    db.query(
      checkSql,
      [username.trim()],
      async (checkErr, results) => {
        if (checkErr) {
          return res.status(500).json({
            error: checkErr.message,
          })
        }

        if (results.length > 0) {
          return res.status(409).json({
            error: "Username already exists",
          })
        }

        const hashedPassword = await bcrypt.hash(
          password,
          10
        )

        const insertSql = `
          INSERT INTO users (username, password, role)
          VALUES (?, ?, ?)
        `

        db.query(
          insertSql,
          [
            username.trim(),
            hashedPassword,
            "admin",
          ],
          (insertErr, result) => {
            if (insertErr) {
              return res.status(500).json({
                error: insertErr.message,
              })
            }

            return res.status(201).json({
              message:
                "Admin account created successfully",
              user: {
                user_id: result.insertId,
                username: username.trim(),
                role: "admin",
              },
            })
          }
        )
      }
    )
  } catch (error) {
    console.error("Signup error:", error)

    return res.status(500).json({
      error: "Unable to create account",
    })
  }
})

module.exports = router