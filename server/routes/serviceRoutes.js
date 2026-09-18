const express = require("express")
const router = express.Router()
const db = require("../db")
const multer = require("multer")
const path = require("path")
const fs = require("fs")

const uploadDir = "uploads/services"

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true })
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir)
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + "-" + Math.round(Math.random() * 1e9)
        cb(null, uniqueName + path.extname(file.originalname))
    },
})

const upload = multer({ storage })

// GET all services
router.get("/", (req, res) => {
    const sql = "SELECT * FROM services"

    db.query(sql, (err, results) => {
        if (err) {
            return res.status(500).json({ error: err.message })
        }

        res.json(results)
    })
})

// ADD service with image upload
router.post("/", upload.single("image"), (req, res) => {
    const { service, category, price, status } = req.body
    const durationMinutes = Number(req.body.duration_minutes || req.body.duration)

    if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 480) {
        return res.status(400).json({
            error: "Service duration must be between 1 and 480 minutes",
        })
    }

    const image_url = req.file ? `/uploads/services/${req.file.filename}` : ""

    const sql = `
    INSERT INTO services
    (service, category, price, duration, duration_minutes, status, image_url)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `

    db.query(
        sql,
        [
            service,
            category,
            price,
            `${durationMinutes} mins`,
            durationMinutes,
            status || "Available",
            image_url,
        ],
        (err, result) => {
            if (err) {
                return res.status(500).json({ error: err.message })
            }

            res.json({
                message: "Service added successfully",
                id: result.insertId,
                image_url,
            })
        },
    )
})

// EDIT service with optional new image
router.put("/:id", upload.single("image"), (req, res) => {
    const { id } = req.params
    const { service, category, price, status, old_image_url } = req.body
    const durationMinutes = Number(req.body.duration_minutes || req.body.duration)

    if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 480) {
        return res.status(400).json({
            error: "Service duration must be between 1 and 480 minutes",
        })
    }

    const image_url = req.file ? `/uploads/services/${req.file.filename}` : old_image_url || ""

    const sql = `
    UPDATE services
    SET service = ?, category = ?, price = ?, duration = ?, duration_minutes = ?,
        status = ?, image_url = ?
    WHERE service_id = ?
  `

    db.query(
        sql,
        [
            service,
            category,
            price,
            `${durationMinutes} mins`,
            durationMinutes,
            status,
            image_url,
            id,
        ],
        (err, result) => {
            if (err) {
                return res.status(500).json({ error: err.message })
            }

            res.json({
                message: "Service updated successfully",
                affectedRows: result.affectedRows,
                image_url,
            })
        },
    )
})

// DELETE service
router.delete("/:id", (req, res) => {
    const { id } = req.params

    const sql = "DELETE FROM services WHERE service_id = ?"

    db.query(sql, [id], (err, result) => {
        if (err) {
            return res.status(500).json({ error: err.message })
        }

        res.json({
            message: "Service deleted successfully",
            affectedRows: result.affectedRows,
        })
    })
})

module.exports = router
