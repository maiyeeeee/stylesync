const express = require("express")
const router = express.Router()
const bcrypt = require("bcrypt")
const db = require("../../db")

router.post("/login", (req, res) => {
    const { username, password } = req.body

    const sql = "SELECT * FROM users WHERE username = ?"

    db.query(sql, [username], async (err, results) => {
        if (err) return res.status(500).json({ error: err.message })

        if (results.length === 0) {
            return res.status(401).json({ error: "User not found" })
        }

        const user = results[0]
        const isMatch = await bcrypt.compare(password, user.password)

        if (!isMatch) {
            return res.status(401).json({ error: "Incorrect password" })
        }

        res.json({
            message: "Login successful",
            user: {
                user_id: user.user_id,
                username: user.username,
                role: user.role,
            },
        })
    })
})

module.exports = router
