const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbPath = process.env.DB_PATH || './trip-service.db';
const seedCsvPath = process.env.TRIP_SEED_CSV_PATH || path.resolve(__dirname, '../../data/ride_trips.csv');
fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });

const db = new sqlite3.Database(dbPath);

function parseCsvLine(line) {
  const values = [];
  let value = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(value);
      value = '';
    } else {
      value += char;
    }
  }

  values.push(value);
  return values;
}

function normalizeTimestamp(value) {
  const trimmed = String(value || '').trim();
  return trimmed ? trimmed.replace(' ', 'T') : null;
}

function normalizeDriverId(value) {
  const numeric = Number.parseInt(String(value || '').trim(), 10);
  return Number.isFinite(numeric) ? numeric : null;
}

function paymentStatusForTrip(status, fare) {
  if (status === 'COMPLETED' && Number(fare || 0) > 0) {
    return 'SUCCESS';
  }

  return 'PENDING';
}

function seedTripsFromCsv() {
  if (!fs.existsSync(seedCsvPath)) {
    return;
  }

  const lines = fs.readFileSync(seedCsvPath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim());

  if (lines.length <= 1) {
    return;
  }

  const headers = parseCsvLine(lines[0]);
  const insert = db.prepare(`
    INSERT OR IGNORE INTO trips (
      id,
      rider_id,
      driver_id,
      status,
      pickup,
      drop_location,
      fare,
      payment_status,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
    const status = String(row.trip_status || 'REQUESTED').trim().toUpperCase();
    const fare = Number.parseFloat(row.fare_amount || '0') || 0;

    insert.run([
      String(row.trip_id).trim(),
      Number.parseInt(row.rider_id, 10),
      normalizeDriverId(row.driver_id),
      status,
      row.pickup_location,
      row.drop_location,
      fare,
      paymentStatusForTrip(status, fare),
      normalizeTimestamp(row.requested_at)
    ]);
  }

  insert.finalize();
}

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
  seedTripsFromCsv();
});

module.exports = db;
