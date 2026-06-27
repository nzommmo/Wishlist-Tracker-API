// db.js
const initSqlJs = require('sql.js')
const path = require('path')
const fs = require('fs')

const DB_PATH = path.join(__dirname, 'db/database.sqlite')

let db

const ready = initSqlJs().then(SQL => {
  const fileBuffer = fs.existsSync(DB_PATH) ? fs.readFileSync(DB_PATH) : null
  db = new SQL.Database(fileBuffer)

  db.run('PRAGMA journal_mode = WAL')
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS wishlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT,
      privacy TEXT DEFAULT 'private',
      cover_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wishlist_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      note TEXT,
      image_url TEXT,
      completed INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (wishlist_id) REFERENCES wishlists(id)
    );
    CREATE TABLE IF NOT EXISTS wishlist_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wishlist_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT DEFAULT 'collaborator',
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (wishlist_id) REFERENCES wishlists(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS wishlist_invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wishlist_id INTEGER NOT NULL,
      invite_code TEXT UNIQUE NOT NULL,
      created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (wishlist_id) REFERENCES wishlists(id)
    );
  `)

  db._persist = () => fs.writeFileSync(DB_PATH, Buffer.from(db.export()))
  return db
})

const getDb = () => {
  if (!db) throw new Error('Database not initialized yet')
  return db
}

const run_ = (sql, params = []) => {
  const d = getDb()
  d.run(sql, params)
  const lastInsertRowid = d.exec('SELECT last_insert_rowid() as id')[0]?.values[0][0] ?? null
  const changes = d.exec('SELECT changes() as c')[0]?.values[0][0] ?? 0
  d._persist()
  return Promise.resolve({ lastInsertRowid, changes })
}

const get_ = (sql, params = []) => {
  const d = getDb()
  const stmt = d.prepare(sql)
  stmt.bind(params)
  const row = stmt.step() ? stmt.getAsObject() : null
  stmt.free()
  return Promise.resolve(row)
}

const all_ = (sql, params = []) => {
  const d = getDb()
  const stmt = d.prepare(sql)
  stmt.bind(params)
  const rows = []
  while (stmt.step()) rows.push(stmt.getAsObject())
  stmt.free()
  return Promise.resolve(rows)
}

module.exports = { ready, run_, get_, all_ }