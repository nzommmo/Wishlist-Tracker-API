// seed.js  — run once with: node seed.js
require('dotenv').config()
const bcrypt = require('bcryptjs')
const db = require('./db')

const email = 'ericnzomo17@gmail.com'
const password = bcrypt.hashSync('Eric@2578', 10)
const name = 'Eric'

try {
  db.prepare('INSERT INTO users (email, password, name) VALUES (?, ?, ?)').run(email, password, name)
  console.log('✅ User seeded successfully')
} catch {
  console.log('⚠️  User already exists')
}