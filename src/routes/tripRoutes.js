const express = require('express');
const router = express.Router();
const controller = require('../controllers/tripController');

router.post('/', controller.createTrip);
router.get('/reports/riders/:riderId', controller.getRiderTripReport);
router.get('/reports/drivers/:driverId', controller.getDriverTripReport);
router.post('/:id/accept', controller.acceptTrip);
router.post('/:id/start', controller.startTrip);
router.post('/:id/cancel', controller.cancelTrip);
router.post('/:id/complete', controller.completeTrip);
router.get('/:id/status', controller.getTripStatus);
router.get('/:id', controller.getTrip);

module.exports = router;
