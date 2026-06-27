// backend/routes/wishlists.js
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

// ⚠️ All specific named routes MUST be before /:id

// GET trophies
router.get('/trophies/all', auth, (req, res) => {
  const trophies = db.prepare(`
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
  `).all(req.user.id, req.user.id)
  res.json(trophies)
})

// GET all wishlists — owned + collaborative
router.get('/', auth, (req, res) => {
  const wishlists = db.prepare(`
    SELECT * FROM wishlists
    WHERE user_id = ?
      OR EXISTS (
        SELECT 1 FROM wishlist_members
        WHERE wishlist_members.wishlist_id = wishlists.id
          AND wishlist_members.user_id = ?
      )
    ORDER BY created_at DESC
  `).all(req.user.id, req.user.id)

  const result = wishlists.map(w => ({
    ...w,
    my_role: w.user_id === req.user.id ? 'owner' : 'collaborator'
  }))

  res.json(result)
})

// GET members of a wishlist
router.get('/:id/members', auth, (req, res) => {
  const access = db.prepare(`
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
  `).get(req.params.id, req.user.id, req.user.id)

  if (!access) return res.status(403).json({ error: 'Not authorized' })

  const members = db.prepare(`
    SELECT users.id, users.name, users.email, wishlist_members.role, wishlist_members.joined_at
    FROM wishlist_members
    JOIN users ON wishlist_members.user_id = users.id
    WHERE wishlist_members.wishlist_id = ?
  `).all(req.params.id)

  res.json(members)
})

// POST generate invite link — owner only
router.post('/:id/invite/link', auth, (req, res) => {
  const wishlist = db.prepare('SELECT * FROM wishlists WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id)
  if (!wishlist) return res.status(403).json({ error: 'Only the owner can generate invite links' })

  let invite = db.prepare('SELECT * FROM wishlist_invites WHERE wishlist_id = ?')
    .get(req.params.id)

  if (!invite) {
    const code = crypto.randomBytes(8).toString('hex')
    db.prepare('INSERT INTO wishlist_invites (wishlist_id, invite_code, created_by) VALUES (?, ?, ?)')
      .run(req.params.id, code, req.user.id)
    invite = db.prepare('SELECT * FROM wishlist_invites WHERE wishlist_id = ?').get(req.params.id)
  }

  res.json({ invite_code: invite.invite_code })
})

// POST invite by email — owner only
router.post('/:id/invite/email', auth, (req, res) => {
  const { email } = req.body
  const wishlist = db.prepare('SELECT * FROM wishlists WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id)
  if (!wishlist) return res.status(403).json({ error: 'Only the owner can invite collaborators' })

  const invitee = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
  if (!invitee) return res.status(404).json({ error: 'No user found with that email address' })
  if (invitee.id === req.user.id) return res.status(400).json({ error: 'You cannot invite yourself' })

  const existing = db.prepare('SELECT * FROM wishlist_members WHERE wishlist_id = ? AND user_id = ?')
    .get(req.params.id, invitee.id)
  if (existing) return res.status(400).json({ error: 'This person is already a collaborator' })

  db.prepare('INSERT INTO wishlist_members (wishlist_id, user_id, role) VALUES (?, ?, ?)')
    .run(req.params.id, invitee.id, 'collaborator')

  db.prepare("UPDATE wishlists SET privacy = 'collaborative' WHERE id = ?")
    .run(req.params.id)

  res.json({ success: true, name: invitee.name })
})

// DELETE remove a member — owner only
router.delete('/:id/members/:userId', auth, (req, res) => {
  const wishlist = db.prepare('SELECT * FROM wishlists WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id)
  if (!wishlist) return res.status(403).json({ error: 'Only the owner can remove collaborators' })

  db.prepare('DELETE FROM wishlist_members WHERE wishlist_id = ? AND user_id = ?')
    .run(req.params.id, req.params.userId)
  res.json({ success: true })
})

// GET single wishlist — owner or collaborator
router.get('/:id', auth, (req, res) => {
  const wishlist = db.prepare(`
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
  `).get(req.params.id, req.user.id, req.user.id)

  if (!wishlist) return res.status(404).json({ error: 'Wishlist not found' })

  const my_role = wishlist.user_id === req.user.id ? 'owner' : 'collaborator'
  res.json({ ...wishlist, my_role })
})

// POST create wishlist
router.post('/', auth, (req, res) => {
  const { name, description, color, privacy } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })
  const result = db.prepare(
    'INSERT INTO wishlists (user_id, name, description, color, privacy) VALUES (?, ?, ?, ?, ?)'
  ).run(req.user.id, name.trim(), description || null, color || null, privacy || 'private')
  const wishlist = db.prepare('SELECT * FROM wishlists WHERE id = ?').get(result.lastInsertRowid)
  res.json({ ...wishlist, my_role: 'owner' })
})

// POST cover image — owner or collaborator
router.post('/:id/cover', auth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' })

  const wishlist = db.prepare(`
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
  `).get(req.params.id, req.user.id, req.user.id)

  if (!wishlist) return res.status(404).json({ error: 'Wishlist not found' })

  const cover_url = `/uploads/images/${req.file.filename}`
  db.prepare('UPDATE wishlists SET cover_url = ? WHERE id = ?')
    .run(cover_url, req.params.id)
  res.json({ cover_url })
})

// PATCH update wishlist — owner only
router.patch('/:id', auth, (req, res) => {
  const { name, description, color, privacy } = req.body
  const wishlist = db.prepare('SELECT * FROM wishlists WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id)
  if (!wishlist) return res.status(403).json({ error: 'Only the owner can update this wishlist' })

  db.prepare(`
    UPDATE wishlists
    SET name = COALESCE(?, name),
        description = COALESCE(?, description),
        color = COALESCE(?, color),
        privacy = COALESCE(?, privacy)
    WHERE id = ?
  `).run(name || null, description || null, color || null, privacy || null, req.params.id)

  const updated = db.prepare('SELECT * FROM wishlists WHERE id = ?').get(req.params.id)
  res.json({ ...updated, my_role: 'owner' })
})

// DELETE wishlist — owner only
router.delete('/:id', auth, (req, res) => {
  const wishlist = db.prepare('SELECT * FROM wishlists WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id)
  if (!wishlist) return res.status(403).json({ error: 'Only the owner can delete this wishlist' })

  db.prepare('DELETE FROM items WHERE wishlist_id = ?').run(req.params.id)
  db.prepare('DELETE FROM wishlist_members WHERE wishlist_id = ?').run(req.params.id)
  db.prepare('DELETE FROM wishlist_invites WHERE wishlist_id = ?').run(req.params.id)
  db.prepare('DELETE FROM wishlists WHERE id = ?').run(req.params.id)
  res.json({ success: true })
})

// Nest items router
const itemsRouter = require('./items')
router.use('/:id/items', itemsRouter)

module.exports = router