// passport.js
const passport = require('passport')
const GoogleStrategy = require('passport-google-oauth20').Strategy
const db = require('./db')

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: '/api/auth/google/callback',
}, (accessToken, refreshToken, profile, done) => {
  const email = profile.emails[0].value
  const name = profile.displayName

  // Find or create user
  let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email)

  if (!user) {
    const result = db.prepare(
      'INSERT INTO users (email, name, password) VALUES (?, ?, ?)'
    ).run(email, name, 'GOOGLE_OAUTH') // no password for Google users
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid)
  }

  return done(null, user)
}))

passport.serializeUser((user, done) => done(null, user.id))
passport.deserializeUser((id, done) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
  done(null, user)
})