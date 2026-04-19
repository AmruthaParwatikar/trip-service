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

exports.completeTrip = async (req, res) => {
  await service.completeTrip(req.params.id);
  res.json({ message: 'Trip completed' });
};

exports.getTrip = async (req, res) => {
  const trip = await service.getTrip(req.params.id);
  res.json(trip);
};