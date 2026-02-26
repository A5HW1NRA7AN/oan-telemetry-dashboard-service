const express = require('express');
const {
    getCalls,
    getCallById,
    getCallsStats,
} = require('../controllers/calls.controller');

const router = express.Router();

// Get aggregate stats for header cards
router.get('/calls/stats', getCallsStats);

// Get paginated calls list with search, date filtering, sorting
router.get('/calls', getCalls);

// Get single call details + messages by interaction_id (supports IDs with slashes)
router.get('/calls/*', getCallById);

module.exports = router;
