const service = require('../services/tripService');

exports.createTrip = async (req, res) => {
  try {
    const trip = await service.createTrip(req.body);
    res.json(trip);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.acceptTrip = async (req, res) => {
  try {
    await service.acceptTrip(req.params.id);
    
    res.json({
      message: "Trip accepted",
      tripId: req.params.id
    });

  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.startTrip = async (req, res) => {
  await service.startTrip(req.params.id);
  res.json({ message: 'Trip started' });
};

exports.cancelTrip = async (req, res) => {
  try {
    const trip = await service.cancelTrip(req.params.id);
    res.json({ message: 'Trip cancelled', data: trip });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.completeTrip = async (req, res) => {
  try {
    await service.completeTrip(req.params.id);
    res.json({ message: 'Trip completed' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.getTrip = async (req, res) => {
  const trip = await service.getTrip(req.params.id);
  res.json(trip);
};

exports.getTripStatus = async (req, res) => {
  try {
    const status = await service.getTripStatus(req.params.id);
    res.type('text/plain').send(status);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
};

exports.getRiderTripReport = async (req, res) => {
  try {
    const report = await service.getRiderTripReport(req.params.riderId);
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getDriverTripReport = async (req, res) => {
  try {
    const report = await service.getDriverTripReport(req.params.driverId);
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
