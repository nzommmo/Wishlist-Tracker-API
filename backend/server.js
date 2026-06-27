// server.js
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') })
const express = require('express')
const cors = require('cors')
const path = require('path')
const session = require('express-session')
const passport = require('passport')
const auth = require('./middleware/auth')
const db = require('./db')
require('./passport')

const app = express()

app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }))
app.use(express.json())
app.use(session({
  secret: process.env.JWT_SECRET,
  resave: false,
  saveUninitialized: false,
}))
app.use(passport.initialize())
app.use(passport.session())
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

app.use('/api/auth', require('./routes/auth'))

// Join via invite link
app.get('/api/join/:code', auth, async (req, res) => {
  try {
    const invite = await db.get_('SELECT * FROM wishlist_invites WHERE invite_code = ?', [req.params.code])
    if (!invite) return res.status(404).json({ error: 'Invalid or expired invite link' })

    const wishlist = await db.get_('SELECT * FROM wishlists WHERE id = ?', [invite.wishlist_id])
    if (wishlist.user_id === req.user.id)
      return res.status(400).json({ error: 'You already own this wishlist' })

    const existing = await db.get_(
      'SELECT * FROM wishlist_members WHERE wishlist_id = ? AND user_id = ?',
      [invite.wishlist_id, req.user.id]
    )

    if (!existing) {
      await db.run_('INSERT INTO wishlist_members (wishlist_id, user_id, role) VALUES (?, ?, ?)',
        [invite.wishlist_id, req.user.id, 'collaborator'])
      await db.run_("UPDATE wishlists SET privacy = 'collaborative' WHERE id = ?", [invite.wishlist_id])
    }

    res.json({ wishlist_id: invite.wishlist_id, wishlist_name: wishlist.name })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.use('/api/wishlists', require('./routes/wishlists'))

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))