const express = require("express")
const router = express.Router()
const db = require("../../db")

router.get("/users", (req, res) => {
  const sql = `
    SELECT user_id, username, role, created_at 
    FROM users 
    ORDER BY created_at DESC
  `

  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: err.message })

    res.json(results)
  })
})

router.delete("/users/:id", (req, res) => {
  const { id } = req.params

  const sql = "DELETE FROM users WHERE user_id = ?"

  db.query(sql, [id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message })

    res.json({
      message: "Account deleted successfully",
      affectedRows: result.affectedRows,
    })
  })
})

module.exports = router