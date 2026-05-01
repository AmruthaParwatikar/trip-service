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

async function fetchPaymentDetails(tripId) {
  try {
    const response = await axios.get(`${PAYMENT_SERVICE_URL}/v1/payments/trips/${encodeURIComponent(tripId)}`);
    return unwrapServiceData(response);
  } catch (err) {
    return null;
  }
}

function formatTripReportItem(trip, detailsKey, details, payment) {
  const paymentStatus = payment?.status || trip.payment_status || 'PENDING';

  return {
    trip_id: trip.id,
    status: trip.status,
    pickup_point: trip.pickup,
    drop_point: trip.drop_location,
    amount: Number(trip.fare || 0),
    payment_status: paymentStatus,
    payment_method: payment?.method || null,
    payment_reference: payment?.reference || null,
    payment_id: payment?.paymentId || null,
    payment_created_at: payment?.createdAt || null,
    created_at: trip.created_at,
    [detailsKey]: details
  };
}

const DEFAULT_FARE_FACTORS = {
  base_fare: 100,
  distance_km: 10,
  rate_per_km: 10,
  surge_multiplier: 1.2
};

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function defaultFare() {
  return roundMoney(
    DEFAULT_FARE_FACTORS.base_fare
      + DEFAULT_FARE_FACTORS.distance_km * DEFAULT_FARE_FACTORS.rate_per_km * DEFAULT_FARE_FACTORS.surge_multiplier
  );
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

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeLocation(value) {
  return normalizeText(value).replace(/\s+/g, ' ');
}

function locationParts(value) {
  return normalizeText(value)
    .split(',')
    .map((part) => part.replace(/^\d+\s+/, '').trim())
    .filter(Boolean);
}

function locationMatches(input, candidate) {
  const inputParts = locationParts(input);
  const candidateParts = locationParts(candidate);

  if (inputParts.length === 0 || candidateParts.length === 0) return false;

  return inputParts.some((inputPart) => {
    return candidateParts.some((candidatePart) => {
      return inputPart.includes(candidatePart) || candidatePart.includes(inputPart);
    });
  });
}

function routeMatches(data, trip) {
  return locationMatches(data.pickup, trip.pickup)
    && locationMatches(data.drop, trip.drop_location);
}

function routeMatchRank(data, trip) {
  const exactRoute = normalizeLocation(data.pickup) === normalizeLocation(trip.pickup)
    && normalizeLocation(data.drop) === normalizeLocation(trip.drop_location);

  if (exactRoute) return 2;
  return routeMatches(data, trip) ? 1 : 0;
}

function hasFareFactors(trip) {
  return positiveAmount(trip.base_fare)
    && positiveAmount(trip.distance_km)
    && positiveAmount(trip.surge_multiplier);
}

function farePayloadFromTrip(trip) {
  return {
    fare: Number(trip.fare),
    base_fare: trip.base_fare,
    distance_km: trip.distance_km,
    surge_multiplier: trip.surge_multiplier
  };
}

function isCompleted(trip) {
  return String(trip.status || '').toUpperCase() === 'COMPLETED';
}

function bestRouteMatch(data, trips, predicate) {
  const matches = trips
    .map((trip) => ({ trip, rank: routeMatchRank(data, trip) }))
    .filter((match) => match.rank > 0 && predicate(match.trip));

  const pick = (rank, matcher) => {
    const match = matches.find((item) => item.rank === rank && matcher(item.trip));
    return match ? match.trip : null;
  };

  return pick(2, (trip) => hasFareFactors(trip) && isCompleted(trip))
    || pick(2, hasFareFactors)
    || pick(2, isCompleted)
    || pick(2, () => true)
    || pick(1, (trip) => hasFareFactors(trip) && isCompleted(trip))
    || pick(1, hasFareFactors)
    || pick(1, isCompleted)
    || pick(1, () => true);
}

function inferredRatePerKm(trip) {
  const fare = positiveAmount(trip.fare);
  const baseFare = positiveAmount(trip.base_fare) || DEFAULT_FARE_FACTORS.base_fare;
  const distance = positiveAmount(trip.distance_km);
  const surge = positiveAmount(trip.surge_multiplier) || 1;

  if (!fare || !distance) return null;

  const rate = (fare - baseFare) / (distance * surge);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

function average(values, fallback) {
  const valid = values.filter((value) => Number.isFinite(value) && value > 0);
  if (valid.length === 0) return fallback;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function estimateFromFactors(referenceTrips, city) {
  const cityTrips = referenceTrips.filter((trip) => normalizeText(trip.city) === normalizeText(city));
  const basis = cityTrips.length > 0 ? cityTrips : referenceTrips;

  const baseFare = average(basis.map((trip) => Number(trip.base_fare)), DEFAULT_FARE_FACTORS.base_fare);
  const distance = average(basis.map((trip) => Number(trip.distance_km)), DEFAULT_FARE_FACTORS.distance_km);
  const surge = average(basis.map((trip) => Number(trip.surge_multiplier)), DEFAULT_FARE_FACTORS.surge_multiplier);
  const rate = average(basis.map(inferredRatePerKm), DEFAULT_FARE_FACTORS.rate_per_km);

  return {
    fare: roundMoney(baseFare + distance * rate * surge),
    base_fare: roundMoney(baseFare),
    distance_km: roundMoney(distance),
    surge_multiplier: roundMoney(surge)
  };
}

async function fareEstimateForTrip(data) {
  const referenceTrips = await repo.listFareReferenceTrips();
  const similarRiderTrip = bestRouteMatch(data, referenceTrips, (trip) => {
    return String(trip.rider_id) === String(data.rider_id);
  });

  if (similarRiderTrip) {
    return farePayloadFromTrip(similarRiderTrip);
  }

  const similarRouteTrip = bestRouteMatch(data, referenceTrips, () => true);
  if (similarRouteTrip) {
    return farePayloadFromTrip(similarRouteTrip);
  }

  if (referenceTrips.length > 0) {
    return estimateFromFactors(referenceTrips, data.city);
  }

  return {
    fare: positiveAmount(data.estimated_fare) || await fareFromPaymentHistory() || defaultFare(),
    base_fare: DEFAULT_FARE_FACTORS.base_fare,
    distance_km: DEFAULT_FARE_FACTORS.distance_km,
    surge_multiplier: DEFAULT_FARE_FACTORS.surge_multiplier
  };
}

exports.createTrip = async (data) => {
  // Call Driver Service
  const response = await axios.get(
    `${DRIVER_SERVICE_URL}/v1/drivers?is_active=true&city=${data.city}&limit=1`
  );

  const drivers = Array.isArray(response.data) ? response.data : response.data.data;
  const driver = Array.isArray(drivers) ? drivers[0] : null;
  if (!driver) throw new Error('No active drivers available');

  const fareEstimate = await fareEstimateForTrip(data);

  const trip = {
    id: await repo.getNextTripId(),
    rider_id: data.rider_id,
    driver_id: driver.id,
    status: 'REQUESTED',
    pickup: data.pickup,
    drop: data.drop,
    fare: fareEstimate.fare,
    payment_status: 'PENDING',
    created_at: new Date().toISOString(),
    city: data.city,
    distance_km: fareEstimate.distance_km,
    surge_multiplier: fareEstimate.surge_multiplier,
    base_fare: fareEstimate.base_fare
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
    trips.map(async (trip) => {
      const [driverDetails, paymentDetails] = await Promise.all([
        fetchDriverDetails(trip.driver_id),
        fetchPaymentDetails(trip.id)
      ]);

      return formatTripReportItem(trip, 'driver_details', driverDetails, paymentDetails);
    })
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
    trips.map(async (trip) => {
      const [riderDetails, paymentDetails] = await Promise.all([
        fetchRiderDetails(trip.rider_id),
        fetchPaymentDetails(trip.id)
      ]);

      return formatTripReportItem(trip, 'rider_details', riderDetails, paymentDetails);
    })
  );

  return {
    driver_id: driverId,
    count: report.length,
    data: report
  };
};
