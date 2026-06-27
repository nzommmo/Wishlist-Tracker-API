// passport.js
const passport = require('passport')
const GoogleStrategy = require('passport-google-oauth20').Strategy
const { get_, run_ } = require('./db')

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL,
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const email = profile.emails[0].value
    const name = profile.displayName

    let user = await get_('SELECT * FROM users WHERE email = ?', [email])

    if (!user) {
      const result = await run_(
        'INSERT INTO users (email, name, password) VALUES (?, ?, ?)',
        [email, name, 'GOOGLE_OAUTH']
      )
      user = await get_('SELECT * FROM users WHERE id = ?', [result.lastInsertRowid])
    }

    return done(null, user)
  } catch (err) {
    return done(err)
  }
}))

passport.serializeUser((user, done) => done(null, user.id))
passport.deserializeUser(async (id, done) => {
  try {
    const user = await get_('SELECT * FROM users WHERE id = ?', [id])
    done(null, user)
  } catch (err) {
    done(err)
  }
})