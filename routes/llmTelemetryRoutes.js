const express = require("express");
const router = express.Router();
const { receiveTelemetry } = require("../controllers/llmTelemetry.controller");

// POST /action/data/v3/telemetry
router.post("/telemetry", receiveTelemetry);

module.exports = router;
