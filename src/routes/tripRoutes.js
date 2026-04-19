const express = require('express');
const router = express.Router();
const controller = require('../controllers/tripController');

router.post('/', controller.createTrip);
router.post('/:id/accept', controller.acceptTrip);
router.post('/:id/start', controller.startTrip);
router.post('/:id/complete', controller.completeTrip);

module.exports = router;

router.get('/:id', controller.getTrip);