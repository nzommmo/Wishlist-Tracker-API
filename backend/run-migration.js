// backend/run-migration.js
const { ready } = require('./db')

ready.then((db) => {
  const migrations = [
    `ALTER TABLE wishlists ADD COLUMN description TEXT`,
    `ALTER TABLE wishlists ADD COLUMN color TEXT`,
    `ALTER TABLE wishlists ADD COLUMN privacy TEXT DEFAULT 'private'`,
    `ALTER TABLE wishlists ADD COLUMN cover_url TEXT`,
    `ALTER TABLE items ADD COLUMN completed INTEGER DEFAULT 0`,
    `ALTER TABLE items ADD COLUMN scheduled_date TEXT`,
    `CREATE TABLE IF NOT EXISTS wishlist_invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wishlist_id INTEGER NOT NULL,
      invite_code TEXT UNIQUE NOT NULL,
      created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (wishlist_id) REFERENCES wishlists(id)
    )`,
    `CREATE TABLE IF NOT EXISTS wishlist_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wishlist_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT DEFAULT 'collaborator',
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (wishlist_id) REFERENCES wishlists(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(wishlist_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS item_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      comment TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (item_id) REFERENCES items(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS item_reactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      emoji TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (item_id) REFERENCES items(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(item_id, user_id, emoji)
    )`,
  ]

  migrations.forEach(sql => {
    try {
      db.run(sql)
      const action = sql.trim().split(' ').slice(0, 4).join(' ')
      console.log(`✅ ${action}`)
    } catch (e) {
      const action = sql.trim().split(' ').slice(0, 4).join(' ')
      console.log(`⚠️  Skipped (already exists): ${action}`)
    }
  })

  db._persist()
  console.log('\n✅ All migrations done')
  process.exit(0)
}).catch(err => {
  console.error('❌ Migration failed:', err)
  process.exit(1)
})