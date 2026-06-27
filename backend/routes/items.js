// routes/items.js
const router = require('express').Router({ mergeParams: true })
const auth = require('../middleware/auth')
const multer = require('multer')
const path = require('path')
const db = require('../db')

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../uploads/images'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
})
const upload = multer({ storage })

router.get('/', auth, async (req, res) => {
  try {
    const items = await db.all_('SELECT * FROM items WHERE wishlist_id = ?', [req.params.id])
    res.json(items)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', auth, upload.single('image'), async (req, res) => {
  try {
    const { title, note } = req.body
    const image_url = req.file ? `/uploads/images/${req.file.filename}` : null
    const result = await db.run_(
      'INSERT INTO items (wishlist_id, title, note, image_url) VALUES (?, ?, ?, ?)',
      [req.params.id, title, note, image_url]
    )
    res.json({ id: result.lastInsertRowid, title, note, image_url, completed: 0 })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.patch('/:itemId', auth, async (req, res) => {
  try {
    const { completed } = req.body
    await db.run_('UPDATE items SET completed = ? WHERE id = ?', [completed ? 1 : 0, req.params.itemId])
    const item = await db.get_('SELECT * FROM items WHERE id = ?', [req.params.itemId])
    res.json(item)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/:itemId', auth, async (req, res) => {
  try {
    await db.run_('DELETE FROM items WHERE id = ?', [req.params.itemId])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router