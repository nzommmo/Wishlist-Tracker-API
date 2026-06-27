// backend/run-migration.js
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') })
const db = require('./db')

try {
  db.exec(`ALTER TABLE wishlists ADD COLUMN description TEXT;`)
  console.log('✅ Added description')
} catch (e) { console.log('⚠️ description already exists') }

try {
  db.exec(`ALTER TABLE wishlists ADD COLUMN color TEXT;`)
  console.log('✅ Added color')
} catch (e) { console.log('⚠️ color already exists') }

try {
  db.exec(`ALTER TABLE wishlists ADD COLUMN privacy TEXT DEFAULT 'private';`)
  console.log('✅ Added privacy')
} catch (e) { console.log('⚠️ privacy already exists') }

try {
  db.exec(`ALTER TABLE wishlists ADD COLUMN cover_url TEXT;`)
  console.log('✅ Added cover_url')
} catch (e) { console.log('⚠️ cover_url already exists') }

try {
  db.exec(`ALTER TABLE items ADD COLUMN completed INTEGER DEFAULT 0;`)
  console.log('✅ Added completed')
} catch (e) { console.log('⚠️ completed already exists') }

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS wishlist_invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wishlist_id INTEGER NOT NULL,
      invite_code TEXT UNIQUE NOT NULL,
      created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (wishlist_id) REFERENCES wishlists(id)
    );
  `)
  console.log('✅ Created wishlist_invites table')
} catch (e) { console.log('⚠️ wishlist_invites already exists') }

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS wishlist_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wishlist_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT DEFAULT 'collaborator',
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (wishlist_id) REFERENCES wishlists(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(wishlist_id, user_id)
    );
  `)
  console.log('✅ Created wishlist_members table')
} catch (e) { console.log('⚠️ wishlist_members already exists') }

console.log('✅ Migration complete')