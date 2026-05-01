const db = require('../db/database');

exports.createTrip = (trip) => {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT INTO trips (
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
    `;
    db.run(
      query,
      [
        trip.id,
        trip.rider_id,
        trip.driver_id,
        trip.status,
        trip.pickup,
        trip.drop,
        trip.fare,
        trip.payment_status,
        trip.created_at,
        trip.city || null,
        trip.distance_km || null,
        trip.surge_multiplier || null,
        trip.base_fare || null
      ],
      (err) => {
        if (err) reject(err);
        else resolve(trip);
      }
    );
  });
};

exports.listFareReferenceTrips = () => {
  return new Promise((resolve, reject) => {
    db.all(
      `
        SELECT
          id,
          rider_id,
          status,
          city,
          pickup,
          drop_location,
          fare,
          distance_km,
          surge_multiplier,
          base_fare,
          created_at
        FROM trips
        WHERE fare > 0
        ORDER BY created_at DESC
      `,
      [],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
};

exports.getTripById = (id) => {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM trips WHERE id = ?`, [id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

exports.getNextTripId = () => {
  return new Promise((resolve, reject) => {
    db.get(
      `
        SELECT COALESCE(MAX(CAST(id AS INTEGER)), 0) + 1 AS next_id
        FROM trips
        WHERE id <> ''
          AND id NOT GLOB '*[^0-9]*'
      `,
      [],
      (err, row) => {
        if (err) reject(err);
        else resolve(String(row.next_id));
      }
    );
  });
};

exports.getLatestFareForRider = ({ riderId, pickup, drop }) => {
  return new Promise((resolve, reject) => {
    db.get(
      `
        SELECT fare
        FROM trips
        WHERE rider_id = ?
          AND fare > 0
        ORDER BY
          CASE
            WHEN pickup = ? AND drop_location = ? THEN 0
            ELSE 1
          END,
          created_at DESC
        LIMIT 1
      `,
      [riderId, pickup, drop],
      (err, row) => {
        if (err) reject(err);
        else resolve(row ? Number(row.fare) : null);
      }
    );
  });
};

exports.updateTripStatus = (id, status) => {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE trips SET status = ? WHERE id = ?`,
      [status, id],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
};

exports.updateFareAndPayment = (id, fare, payment_status) => {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE trips SET fare = ?, payment_status = ? WHERE id = ?`,
      [fare, payment_status, id],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
};

exports.listPastTripsByRiderId = (riderId) => {
  return exports.listPastTripsByRiderIds([riderId]);
};

exports.listPastTripsByRiderIds = (riderIds) => {
  return new Promise((resolve, reject) => {
    const ids = [...new Set(riderIds.map((id) => String(id)).filter(Boolean))];
    if (ids.length === 0) {
      resolve([]);
      return;
    }

    const placeholders = ids.map(() => '?').join(', ');
    db.all(
      `
        SELECT *
        FROM trips
        WHERE CAST(rider_id AS TEXT) IN (${placeholders})
        ORDER BY created_at DESC
      `,
      ids,
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
};

exports.listPastTripsByDriverId = (driverId) => {
  return new Promise((resolve, reject) => {
    db.all(
      `
        SELECT *
        FROM trips
        WHERE driver_id = ?
        ORDER BY created_at DESC
      `,
      [driverId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
};
