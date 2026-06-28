// backend/routes/items.js
const router = require('express').Router({ mergeParams: true })
const auth = require('../middleware/auth')
const multer = require('multer')
const path = require('path')
const { run_, get_, all_ } = require('../db')

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../uploads/images'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
})
const upload = multer({ storage })

// GET all items in a wishlist
router.get('/', auth, async (req, res) => {
  try {
    const items = await all_(
      'SELECT * FROM items WHERE wishlist_id = ? ORDER BY scheduled_date ASC, created_at ASC',
      [req.params.id]
    )
    res.json(items)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST add item
router.post('/', auth, upload.single('image'), async (req, res) => {
  try {
    const { title, note, scheduled_date } = req.body
    const image_url = req.file ? `/uploads/images/${req.file.filename}` : null
    const result = await run_(
      'INSERT INTO items (wishlist_id, title, note, image_url, scheduled_date) VALUES (?, ?, ?, ?, ?)',
      [req.params.id, title, note || null, image_url, scheduled_date || null]
    )
    res.json({
      id: result.lastInsertRowid,
      title,
      note: note || null,
      image_url,
      scheduled_date: scheduled_date || null,
      completed: 0,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PATCH — single route handles toggle complete, edit, and scheduled date
router.patch('/:itemId', auth, upload.single('image'), async (req, res) => {
  try {
    const item = await get_('SELECT * FROM items WHERE id = ?', [req.params.itemId])
    if (!item) return res.status(404).json({ error: 'Item not found' })

    const body = req.body || {}

    const newCompleted = body.completed !== undefined
      ? (Number(body.completed) === 1 ? 1 : 0)
      : item.completed

    const newDate = body.scheduled_date !== undefined
      ? (body.scheduled_date || null)
      : item.scheduled_date

    const newTitle = body.title !== undefined
      ? body.title
      : item.title

    const newNote = body.note !== undefined
      ? (body.note || null)
      : item.note

    const newImage = req.file
      ? `/uploads/images/${req.file.filename}`
      : item.image_url

    await run_(
      'UPDATE items SET completed = ?, scheduled_date = ?, title = ?, note = ?, image_url = ? WHERE id = ?',
      [newCompleted, newDate, newTitle, newNote, newImage, req.params.itemId]
    )

    const updated = await get_('SELECT * FROM items WHERE id = ?', [req.params.itemId])
    res.json(updated)
  } catch (err) {
    console.error('Update item error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// DELETE item
router.delete('/:itemId', auth, async (req, res) => {
  try {
    await run_('DELETE FROM items WHERE id = ?', [req.params.itemId])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router