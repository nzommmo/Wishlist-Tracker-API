// routes/wishlists.js
const router = require('express').Router()
const multer = require('multer')
const path = require('path')
const crypto = require('crypto')
const auth = require('../middleware/auth')
const db = require('../db')

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../uploads/images'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
})
const upload = multer({ storage })

router.get('/trophies/all', auth, async (req, res) => {
  try {
    const trophies = await db.all_(`
      SELECT items.*, wishlists.name as wishlist_name
      FROM items
      JOIN wishlists ON items.wishlist_id = wishlists.id
      WHERE (
        wishlists.user_id = ?
        OR EXISTS (
          SELECT 1 FROM wishlist_members
          WHERE wishlist_members.wishlist_id = wishlists.id
            AND wishlist_members.user_id = ?
        )
      )
      AND items.completed = 1
      ORDER BY items.created_at DESC
    `, [req.user.id, req.user.id])
    res.json(trophies)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/', auth, async (req, res) => {
  try {
    const wishlists = await db.all_(`
      SELECT * FROM wishlists
      WHERE user_id = ?
        OR EXISTS (
          SELECT 1 FROM wishlist_members
          WHERE wishlist_members.wishlist_id = wishlists.id
            AND wishlist_members.user_id = ?
        )
      ORDER BY created_at DESC
    `, [req.user.id, req.user.id])

    const result = wishlists.map(w => ({
      ...w,
      my_role: w.user_id === req.user.id ? 'owner' : 'collaborator'
    }))
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/:id/members', auth, async (req, res) => {
  try {
    const access = await db.get_(`
      SELECT 1 FROM wishlists
      WHERE id = ?
        AND (
          user_id = ?
          OR EXISTS (
            SELECT 1 FROM wishlist_members
            WHERE wishlist_members.wishlist_id = wishlists.id
              AND wishlist_members.user_id = ?
          )
        )
    `, [req.params.id, req.user.id, req.user.id])

    if (!access) return res.status(403).json({ error: 'Not authorized' })

    const members = await db.all_(`
      SELECT users.id, users.name, users.email, wishlist_members.role, wishlist_members.joined_at
      FROM wishlist_members
      JOIN users ON wishlist_members.user_id = users.id
      WHERE wishlist_members.wishlist_id = ?
    `, [req.params.id])

    res.json(members)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/:id/invite/link', auth, async (req, res) => {
  try {
    const wishlist = await db.get_(
      'SELECT * FROM wishlists WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    )
    if (!wishlist) return res.status(403).json({ error: 'Only the owner can generate invite links' })

    let invite = await db.get_('SELECT * FROM wishlist_invites WHERE wishlist_id = ?', [req.params.id])

    if (!invite) {
      const code = crypto.randomBytes(8).toString('hex')
      await db.run_(
        'INSERT INTO wishlist_invites (wishlist_id, invite_code, created_by) VALUES (?, ?, ?)',
        [req.params.id, code, req.user.id]
      )
      invite = await db.get_('SELECT * FROM wishlist_invites WHERE wishlist_id = ?', [req.params.id])
    }

    res.json({ invite_code: invite.invite_code })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/:id/invite/email', auth, async (req, res) => {
  try {
    const { email } = req.body
    const wishlist = await db.get_(
      'SELECT * FROM wishlists WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    )
    if (!wishlist) return res.status(403).json({ error: 'Only the owner can invite collaborators' })

    const invitee = await db.get_('SELECT * FROM users WHERE email = ?', [email])
    if (!invitee) return res.status(404).json({ error: 'No user found with that email address' })
    if (invitee.id === req.user.id) return res.status(400).json({ error: 'You cannot invite yourself' })

    const existing = await db.get_(
      'SELECT * FROM wishlist_members WHERE wishlist_id = ? AND user_id = ?',
      [req.params.id, invitee.id]
    )
    if (existing) return res.status(400).json({ error: 'This person is already a collaborator' })

    await db.run_(
      'INSERT INTO wishlist_members (wishlist_id, user_id, role) VALUES (?, ?, ?)',
      [req.params.id, invitee.id, 'collaborator']
    )
    await db.run_("UPDATE wishlists SET privacy = 'collaborative' WHERE id = ?", [req.params.id])

    res.json({ success: true, name: invitee.name })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/:id/members/:userId', auth, async (req, res) => {
  try {
    const wishlist = await db.get_(
      'SELECT * FROM wishlists WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    )
    if (!wishlist) return res.status(403).json({ error: 'Only the owner can remove collaborators' })

    await db.run_(
      'DELETE FROM wishlist_members WHERE wishlist_id = ? AND user_id = ?',
      [req.params.id, req.params.userId]
    )
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/:id', auth, async (req, res) => {
  try {
    const wishlist = await db.get_(`
      SELECT * FROM wishlists
      WHERE id = ?
        AND (
          user_id = ?
          OR EXISTS (
            SELECT 1 FROM wishlist_members
            WHERE wishlist_members.wishlist_id = wishlists.id
              AND wishlist_members.user_id = ?
          )
        )
    `, [req.params.id, req.user.id, req.user.id])

    if (!wishlist) return res.status(404).json({ error: 'Wishlist not found' })

    const my_role = wishlist.user_id === req.user.id ? 'owner' : 'collaborator'
    res.json({ ...wishlist, my_role })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', auth, async (req, res) => {
  try {
    const { name, description, color, privacy } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })
    const result = await db.run_(
      'INSERT INTO wishlists (user_id, name, description, color, privacy) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, name.trim(), description || null, color || null, privacy || 'private']
    )
    const wishlist = await db.get_('SELECT * FROM wishlists WHERE id = ?', [result.lastInsertRowid])
    res.json({ ...wishlist, my_role: 'owner' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/:id/cover', auth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' })

    const wishlist = await db.get_(`
      SELECT * FROM wishlists
      WHERE id = ?
        AND (
          user_id = ?
          OR EXISTS (
            SELECT 1 FROM wishlist_members
            WHERE wishlist_members.wishlist_id = wishlists.id
              AND wishlist_members.user_id = ?
          )
        )
    `, [req.params.id, req.user.id, req.user.id])

    if (!wishlist) return res.status(404).json({ error: 'Wishlist not found' })

    const cover_url = `/uploads/images/${req.file.filename}`
    await db.run_('UPDATE wishlists SET cover_url = ? WHERE id = ?', [cover_url, req.params.id])
    res.json({ cover_url })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.patch('/:id', auth, async (req, res) => {
  try {
    const { name, description, color, privacy } = req.body
    const wishlist = await db.get_(
      'SELECT * FROM wishlists WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    )
    if (!wishlist) return res.status(403).json({ error: 'Only the owner can update this wishlist' })

    await db.run_(`
      UPDATE wishlists
      SET name = COALESCE(?, name),
          description = COALESCE(?, description),
          color = COALESCE(?, color),
          privacy = COALESCE(?, privacy)
      WHERE id = ?
    `, [name || null, description || null, color || null, privacy || null, req.params.id])

    const updated = await db.get_('SELECT * FROM wishlists WHERE id = ?', [req.params.id])
    res.json({ ...updated, my_role: 'owner' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/:id', auth, async (req, res) => {
  try {
    const wishlist = await db.get_(
      'SELECT * FROM wishlists WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    )
    if (!wishlist) return res.status(403).json({ error: 'Only the owner can delete this wishlist' })

    await db.run_('DELETE FROM items WHERE wishlist_id = ?', [req.params.id])
    await db.run_('DELETE FROM wishlist_members WHERE wishlist_id = ?', [req.params.id])
    await db.run_('DELETE FROM wishlist_invites WHERE wishlist_id = ?', [req.params.id])
    await db.run_('DELETE FROM wishlists WHERE id = ?', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

const itemsRouter = require('./items')
router.use('/:id/items', itemsRouter)

module.exports = router