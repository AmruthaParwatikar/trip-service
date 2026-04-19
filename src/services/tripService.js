const axios = require('axios');
const { randomUUID } = require('crypto');
const repo = require('../repositories/tripRepository');

const DRIVER_SERVICE_URL = 'http://driver-service:3003';

exports.createTrip = async (data) => {
  // Call Driver Service
  const response = await axios.get(
    `${DRIVER_SERVICE_URL}/v1/drivers?is_active=true&city=${data.city}&limit=1`
  );

  const driver = response.data[0];
  if (!driver) throw new Error('No active drivers available');

  const trip = {
    id: randomUUID(),
    rider_id: data.rider_id,
    driver_id: driver.id,
    status: 'REQUESTED',
    pickup: data.pickup,
    drop: data.drop,
    fare: 0,
    payment_status: 'PENDING',
    created_at: new Date().toISOString()
  };

  return await repo.createTrip(trip);
};

exports.acceptTrip = async (id) => {
  await repo.updateTripStatus(id, 'ACCEPTED');
};

exports.startTrip = async (id) => {
  await repo.updateTripStatus(id, 'ONGOING');
};

exports.completeTrip = async (id) => {
  const trip = await repo.getTripById(id);

  if (!trip) {
    throw new Error('Trip not found');
  }

  // ✅ PASTE HERE
  if (trip.status !== 'ONGOING') {
    throw new Error('Trip must be ongoing to complete');
  }

  const distance = 10;
  const rate = 10;
  const surge = 1.2;

  const fare = distance * rate * surge;

  try {
    await axios.post('http://payment-service:3004', {
      trip_id: id,
      amount: fare
    });

    await repo.updateFareAndPayment(id, fare, 'SUCCESS');
    await repo.updateTripStatus(id, 'COMPLETED');

  } catch (err) {
    await repo.updateFareAndPayment(id, fare, 'FAILED');
    await repo.updateTripStatus(id, 'PAYMENT_PENDING');
  }
};

exports.getTrip = async (id) => {
  return await repo.getTripById(id);
};
