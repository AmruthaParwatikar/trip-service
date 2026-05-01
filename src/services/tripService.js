const axios = require('axios');
const repo = require('../repositories/tripRepository');

const DRIVER_SERVICE_URL = process.env.DRIVER_SERVICE_URL || 'http://driver-service:3003';
const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || 'http://payment-service:8082';
const RIDER_SERVICE_URL = process.env.RIDER_SERVICE_URL || 'http://rider-service:8081';

function unwrapServiceData(response) {
  return response && response.data && response.data.data !== undefined
    ? response.data.data
    : response.data;
}

async function fetchDriverDetails(driverId) {
  try {
    const response = await axios.get(`${DRIVER_SERVICE_URL}/v1/drivers/${encodeURIComponent(driverId)}`);
    return unwrapServiceData(response);
  } catch (err) {
    return null;
  }
}

async function fetchRiderDetails(riderId) {
  try {
    const response = await axios.get(`${RIDER_SERVICE_URL}/v1/riders/${encodeURIComponent(riderId)}`);
    return unwrapServiceData(response);
  } catch (err) {
    return null;
  }
}

function formatTripReportItem(trip, detailsKey, details) {
  return {
    trip_id: trip.id,
    status: trip.status,
    pickup_point: trip.pickup,
    drop_point: trip.drop_location,
    amount: Number(trip.fare || 0),
    payment_status: trip.payment_status,
    created_at: trip.created_at,
    [detailsKey]: details
  };
}

function defaultFare() {
  const distance = 10;
  const rate = 10;
  const surge = 1.2;

  return distance * rate * surge;
}

function positiveAmount(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

async function fareFromPaymentHistory() {
  try {
    const response = await axios.get(`${PAYMENT_SERVICE_URL}/v1/payments?limit=25`);
    const payments = Array.isArray(response.data) ? response.data : [];
    const payment = payments.find((item) => item.status === 'SUCCESS' && positiveAmount(item.amount))
      || payments.find((item) => positiveAmount(item.amount));
    return payment ? positiveAmount(payment.amount) : null;
  } catch (err) {
    return null;
  }
}

async function fareFromRiderHistory(data) {
  const previousFare = await repo.getLatestFareForRider({
    riderId: data.rider_id,
    pickup: data.pickup,
    drop: data.drop
  });

  return previousFare
    || positiveAmount(data.estimated_fare)
    || await fareFromPaymentHistory()
    || defaultFare();
}

exports.createTrip = async (data) => {
  // Call Driver Service
  const response = await axios.get(
    `${DRIVER_SERVICE_URL}/v1/drivers?is_active=true&city=${data.city}&limit=1`
  );

  const drivers = Array.isArray(response.data) ? response.data : response.data.data;
  const driver = Array.isArray(drivers) ? drivers[0] : null;
  if (!driver) throw new Error('No active drivers available');

  const fare = await fareFromRiderHistory(data);

  const trip = {
    id: await repo.getNextTripId(),
    rider_id: data.rider_id,
    driver_id: driver.id,
    status: 'REQUESTED',
    pickup: data.pickup,
    drop: data.drop,
    fare,
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

exports.cancelTrip = async (id) => {
  const trip = await repo.getTripById(id);

  if (!trip) {
    throw new Error('Trip not found');
  }

  if (['COMPLETED', 'CANCELLED'].includes(trip.status)) {
    throw new Error(`Trip cannot be cancelled from ${trip.status}`);
  }

  if (trip.status === 'ONGOING') {
    throw new Error('Trip cannot be cancelled after it has started');
  }

  await repo.updateTripStatus(id, 'CANCELLED');
  return await repo.getTripById(id);
};

exports.completeTrip = async (id) => {
  const trip = await repo.getTripById(id);

  if (!trip) {
    throw new Error('Trip not found');
  }

  if (trip.status !== 'ONGOING') {
    throw new Error('Trip must be ongoing to complete');
  }

  const fare = Number(trip.fare || 0) > 0 ? Number(trip.fare) : defaultFare();

  try {
    await repo.updateTripStatus(id, 'COMPLETED');

    await axios.post(`${PAYMENT_SERVICE_URL}/v1/payments/charge`, {
      tripId: id,
      amount: fare,
      method: 'UPI',
      transactionRef: `trip-${id}`
    });

    await repo.updateFareAndPayment(id, fare, 'SUCCESS');

  } catch (err) {
    await repo.updateFareAndPayment(id, fare, 'FAILED');
    await repo.updateTripStatus(id, 'PAYMENT_PENDING');
  }
};

exports.getTrip = async (id) => {
  return await repo.getTripById(id);
};

exports.getTripStatus = async (id) => {
  const trip = await repo.getTripById(id);

  if (!trip) {
    throw new Error('Trip not found');
  }

  return trip.status;
};

exports.getRiderTripReport = async (riderId) => {
  const trips = await repo.listPastTripsByRiderId(riderId);
  const report = await Promise.all(
    trips.map(async (trip) => formatTripReportItem(
      trip,
      'driver_details',
      await fetchDriverDetails(trip.driver_id)
    ))
  );

  return {
    rider_id: riderId,
    count: report.length,
    data: report
  };
};

exports.getDriverTripReport = async (driverId) => {
  const trips = await repo.listPastTripsByDriverId(driverId);
  const report = await Promise.all(
    trips.map(async (trip) => formatTripReportItem(
      trip,
      'rider_details',
      await fetchRiderDetails(trip.rider_id)
    ))
  );

  return {
    driver_id: driverId,
    count: report.length,
    data: report
  };
};
