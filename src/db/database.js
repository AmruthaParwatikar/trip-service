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

function numericValue(value) {
  const number = Number.parseFloat(String(value || '').trim());
  return Number.isFinite(number) ? number : null;
}

function ensureColumn(name, definition) {
  db.run(`ALTER TABLE trips ADD COLUMN ${name} ${definition}`, (err) => {
    if (err && !String(err.message).includes('duplicate column name')) {
      throw err;
    }
  });
}

function readSeedRows() {
  if (!fs.existsSync(seedCsvPath)) {
    return [];
  }

  const lines = fs.readFileSync(seedCsvPath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim());

  if (lines.length <= 1) {
    return [];
  }

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

function locationParts(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .split(',')
    .map((part) => part.replace(/^\d+\s+/, '').trim())
    .filter(Boolean);
}

function normalizeLocation(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function exactLocationMatches(input, candidate) {
  return normalizeLocation(input) === normalizeLocation(candidate);
}

function locationMatches(input, candidate) {
  const inputParts = locationParts(input);
  const candidateParts = locationParts(candidate);

  if (inputParts.length === 0 || candidateParts.length === 0) {
    return false;
  }

  return inputParts.some((inputPart) => {
    return candidateParts.some((candidatePart) => {
      return inputPart.includes(candidatePart) || candidatePart.includes(inputPart);
    });
  });
}

function routeMatches(trip, seedRow) {
  return locationMatches(trip.pickup, seedRow.pickup_location)
    && locationMatches(trip.drop_location, seedRow.drop_location);
}

function exactRouteMatches(trip, seedRow) {
  return exactLocationMatches(trip.pickup, seedRow.pickup_location)
    && exactLocationMatches(trip.drop_location, seedRow.drop_location);
}

function seedTripsFromCsv() {
  const rows = readSeedRows();
  if (rows.length === 0) {
    return;
  }

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
      created_at,
      city,
      distance_km,
      surge_multiplier,
      base_fare
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      city = COALESCE(trips.city, excluded.city),
      distance_km = COALESCE(trips.distance_km, excluded.distance_km),
      surge_multiplier = COALESCE(trips.surge_multiplier, excluded.surge_multiplier),
      base_fare = COALESCE(trips.base_fare, excluded.base_fare)
  `);

  for (const row of rows) {
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
      normalizeTimestamp(row.requested_at),
      row.city,
      numericValue(row.distance_km),
      numericValue(row.surge_multiplier),
      numericValue(row.base_fare)
    ]);
  }

  insert.finalize();
}

function repairGeneratedTripFareFactors() {
  const rows = readSeedRows();
  if (rows.length === 0) {
    return;
  }

  const maxSeedTripId = rows.reduce((max, row) => {
    const tripId = Number.parseInt(String(row.trip_id || '').trim(), 10);
    return Number.isFinite(tripId) ? Math.max(max, tripId) : max;
  }, 0);

  db.all(
    `
      SELECT *
      FROM trips
      WHERE (
          id <> ''
          AND id NOT GLOB '*[^0-9]*'
          AND CAST(id AS INTEGER) > ?
        )
        OR (
          (distance_km IS NULL OR surge_multiplier IS NULL OR base_fare IS NULL)
          AND fare <= 120
        )
    `,
    [maxSeedTripId],
    (err, trips) => {
      if (err) {
        throw err;
      }

      const update = db.prepare(`
        UPDATE trips
        SET fare = ?,
            distance_km = ?,
            surge_multiplier = ?,
            base_fare = ?
        WHERE id = ?
      `);

      for (const trip of trips || []) {
        const exactMatch = rows.find((row) => exactRouteMatches(trip, row));
        const weakFare = !numericValue(trip.distance_km)
          || !numericValue(trip.surge_multiplier)
          || !numericValue(trip.base_fare)
          || Number(trip.fare || 0) <= 120;
        const match = exactMatch || (weakFare ? rows.find((row) => routeMatches(trip, row)) : null);
        if (!match) continue;

        update.run([
          numericValue(match.fare_amount) || trip.fare,
          numericValue(match.distance_km),
          numericValue(match.surge_multiplier),
          numericValue(match.base_fare),
          trip.id
        ]);
      }

      update.finalize();
    }
  );
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
  ensureColumn('city', 'TEXT');
  ensureColumn('distance_km', 'REAL');
  ensureColumn('surge_multiplier', 'REAL');
  ensureColumn('base_fare', 'REAL');
  seedTripsFromCsv();
  repairGeneratedTripFareFactors();
});

module.exports = db;
