const router = require('express').Router({ mergeParams: true })
const auth = require('../middleware/auth')
const multer = require('multer')
const path = require('path')
const db = require('../db')

// Storage configuration for multer

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../uploads/images'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
})
const upload = multer({ storage })

router.get('/', auth, (req, res) => {
  const items = db.prepare('SELECT * FROM items WHERE wishlist_id = ?').all(req.params.id)
  res.json(items)
})

router.post('/', auth, upload.single('image'), (req, res) => {
  const { title, note } = req.body
  const image_url = req.file ? `/uploads/images/${req.file.filename}` : null
  const result = db.prepare(
    'INSERT INTO items (wishlist_id, title, note, image_url) VALUES (?, ?, ?, ?)'
  ).run(req.params.id, title, note, image_url)
  res.json({ id: result.lastInsertRowid, title, note, image_url, completed: 0 })
})

// PATCH toggle completed
router.patch('/:itemId', auth, (req, res) => {
  const { completed } = req.body
  db.prepare('UPDATE items SET completed = ? WHERE id = ?')
    .run(completed ? 1 : 0, req.params.itemId)
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.itemId)
  res.json(item)
})

router.delete('/:itemId', auth, (req, res) => {
  db.prepare('DELETE FROM items WHERE id = ?').run(req.params.itemId)
  res.json({ success: true })
})

module.exports = router