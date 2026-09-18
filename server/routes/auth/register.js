const express = require("express")
const router = express.Router()
const bcrypt = require("bcrypt")
const db = require("../../db")

router.post("/register", async (req, res) => {
  const { username, password, role, currentUserRole } = req.body

  if (currentUserRole !== "owner") {
    return res.status(403).json({ error: "Only owner can create accounts" })
  }

  if (!username || !password || !role) {
    return res.status(400).json({ error: "All fields are required" })
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10)

    const sql = `
      INSERT INTO users (username, password, role)
      VALUES (?, ?, ?)
    `

    db.query(sql, [username, hashedPassword, role], (err, result) => {
      if (err) return res.status(500).json({ error: err.message })

      res.json({
        message: "Account created successfully",
        user_id: result.insertId,
      })
    })
  } catch (error) {
    res.status(500).json({ error: "Registration failed" })
  }
})

module.exports = router