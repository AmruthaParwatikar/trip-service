const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./trip-service.db');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY,
      rider_id INTEGER,
      driver_id INTEGER,
      status TEXT,
      pickup TEXT,
      drop_location TEXT,
      fare REAL,
      payment_status TEXT,
      created_at TEXT
    )
  `);
});

module.exports = db;