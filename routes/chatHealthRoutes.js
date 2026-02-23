const express = require("express");
const chatHealthController = require("../controllers/chatHealth.controller");
const authController = require("../controllers/auth.controller");

const router = express.Router();

// Public endpoints (no auth required — consumed by the status page)
router.get("/chat-health/status", chatHealthController.getLatestStatus);
router.get("/chat-health/history", chatHealthController.getHealthCheckHistory);

// Protected endpoint (requires auth — manual trigger)
router.post("/chat-health/run", authController, chatHealthController.triggerHealthCheck);

module.exports = router;
