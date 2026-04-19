const db = require('../db/database');

exports.createTrip = (trip) => {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT INTO trips VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        trip.created_at
      ],
      (err) => {
        if (err) reject(err);
        else resolve(trip);
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

exports.getTripById = (id) => {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM trips WHERE id = ?`, [id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};