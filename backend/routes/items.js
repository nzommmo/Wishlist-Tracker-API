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

// GET single item with comments and reactions
router.get('/:itemId', auth, async (req, res) => {
  try {
    const item = await get_(
      'SELECT * FROM items WHERE id = ?',
      [req.params.itemId]
    )
    if (!item) return res.status(404).json({ error: 'Item not found' })

    const comments = await all_(`
      SELECT item_comments.*, users.name as user_name
      FROM item_comments
      JOIN users ON item_comments.user_id = users.id
      WHERE item_comments.item_id = ?
      ORDER BY item_comments.created_at ASC
    `, [req.params.itemId])

    const reactions = await all_(`
      SELECT emoji, COUNT(*) as count,
        MAX(CASE WHEN user_id = ? THEN 1 ELSE 0 END) as reacted
      FROM item_reactions
      WHERE item_id = ?
      GROUP BY emoji
    `, [req.user.id, req.params.itemId])

    res.json({ ...item, comments, reactions })
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

// PATCH — handles toggle complete, edit, and scheduled date
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

    const newTitle = body.title !== undefined ? body.title : item.title
    const newNote = body.note !== undefined ? (body.note || null) : item.note
    const newImage = req.file ? `/uploads/images/${req.file.filename}` : item.image_url

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

// POST add comment
router.post('/:itemId/comments', auth, async (req, res) => {
  try {
    const { comment } = req.body
    if (!comment?.trim()) return res.status(400).json({ error: 'Comment cannot be empty' })

    const result = await run_(
      'INSERT INTO item_comments (item_id, user_id, comment) VALUES (?, ?, ?)',
      [req.params.itemId, req.user.id, comment.trim()]
    )
    const newComment = await get_(`
      SELECT item_comments.*, users.name as user_name
      FROM item_comments
      JOIN users ON item_comments.user_id = users.id
      WHERE item_comments.id = ?
    `, [result.lastInsertRowid])

    res.json(newComment)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE comment
router.delete('/:itemId/comments/:commentId', auth, async (req, res) => {
  try {
    await run_(
      'DELETE FROM item_comments WHERE id = ? AND user_id = ?',
      [req.params.commentId, req.user.id]
    )
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST toggle reaction
router.post('/:itemId/reactions', auth, async (req, res) => {
  try {
    const { emoji } = req.body
    const existing = await get_(
      'SELECT * FROM item_reactions WHERE item_id = ? AND user_id = ? AND emoji = ?',
      [req.params.itemId, req.user.id, emoji]
    )

    if (existing) {
      await run_(
        'DELETE FROM item_reactions WHERE item_id = ? AND user_id = ? AND emoji = ?',
        [req.params.itemId, req.user.id, emoji]
      )
    } else {
      await run_(
        'INSERT INTO item_reactions (item_id, user_id, emoji) VALUES (?, ?, ?)',
        [req.params.itemId, req.user.id, emoji]
      )
    }

    const reactions = await all_(`
      SELECT emoji, COUNT(*) as count,
        MAX(CASE WHEN user_id = ? THEN 1 ELSE 0 END) as reacted
      FROM item_reactions
      WHERE item_id = ?
      GROUP BY emoji
    `, [req.user.id, req.params.itemId])

    res.json(reactions)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE item
router.delete('/:itemId', auth, async (req, res) => {
  try {
    await run_('DELETE FROM item_comments WHERE item_id = ?', [req.params.itemId])
    await run_('DELETE FROM item_reactions WHERE item_id = ?', [req.params.itemId])
    await run_('DELETE FROM items WHERE id = ?', [req.params.itemId])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router