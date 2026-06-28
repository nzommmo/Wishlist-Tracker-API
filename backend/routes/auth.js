// routes/auth.js (Auth Config)
const router = require('express').Router()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const passport = require('passport')
const { run_, get_, all_ } = require('../db')

const generateToken = (user) =>
  jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' })

router.post('/register', async (req, res) => {
  const { email, password, name } = req.body
  const hashed = bcrypt.hashSync(password, 10)
  try {
    const result = await run_(
      'INSERT INTO users (email, password, name) VALUES (?, ?, ?)',
      [email, hashed, name]
    )
    res.json({ id: result.lastInsertRowid })
  } catch {
    res.status(400).json({ error: 'Email already exists' })
  }
})

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    const user = await get_('SELECT * FROM users WHERE email = ?', [email])
    if (!user || !bcrypt.compareSync(password, user.password))
      return res.status(401).json({ error: 'Invalid credentials' })
    res.json({ token: generateToken(user), name: user.name })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
)

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: `${process.env.FRONTEND_URL}/login?error=google_failed` }),
  (req, res) => {
    const token = generateToken(req.user)
    const name = req.user.name
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}&name=${encodeURIComponent(name)}`)
  }
)

module.exports = router