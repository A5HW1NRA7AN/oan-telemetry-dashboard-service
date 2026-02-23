const {
  runChatHealthCheck,
  runVoiceHealthCheck,
  runAllHealthChecks,
  getRecentHealthChecks,
} = require("../services/chatHealthCheck");

/**
 * POST /v1/chat-health/run
 * Manually trigger health check(s).
 * Query param: type = 'chat' | 'voice' | 'all' (default: 'all')
 */
const triggerHealthCheck = async (req, res) => {
  try {
    const type = (req.query.type || "all").toLowerCase();

    let result;
    if (type === "chat") {
      result = await runChatHealthCheck();
    } else if (type === "voice") {
      result = await runVoiceHealthCheck();
    } else {
      result = await runAllHealthChecks();
    }

    if (!result) {
      return res.status(503).json({
        success: false,
        message:
          "Health check not configured. Check CHAT_HEALTH_CHECK_* and VOICE_HEALTH_CHECK_* env vars.",
      });
    }
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error("[ChatHealthController] triggerHealthCheck error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /v1/chat-health/history
 * Returns recent chat health check records from the DB.
 * Query params:
 *   limit – number of records to return (default 50, max 500)
 *   type  – 'chat' | 'voice' | omit for all
 */
const getHealthCheckHistory = async (req, res) => {
  try {
    let limit = parseInt(req.query.limit || "50", 10);
    if (isNaN(limit) || limit < 1) limit = 50;
    if (limit > 500) limit = 500;

    const apiType = req.query.type || null;

    const rows = await getRecentHealthChecks(limit, apiType);
    res.status(200).json({ success: true, count: rows.length, data: rows });
  } catch (error) {
    console.error("[ChatHealthController] getHealthCheckHistory error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /v1/chat-health/status
 * Returns the latest health check status for each api type.
 * Query param: type = 'chat' | 'voice' | omit for both
 */
const getLatestStatus = async (req, res) => {
  try {
    const apiType = req.query.type || null;

    if (apiType) {
      const rows = await getRecentHealthChecks(1, apiType);
      if (rows.length === 0) {
        return res
          .status(200)
          .json({ success: true, data: null, message: `No ${apiType} checks recorded yet` });
      }
      const latest = rows[0];
      return res.status(200).json({
        success: true,
        data: {
          apiType: latest.api_type,
          status: latest.status,
          responseTime: latest.response_time,
          statusCode: latest.status_code,
          querySent: latest.query_sent,
          checkedAt: latest.checked_at,
          errorMessage: latest.error_message,
        },
      });
    }

    // Return latest for both types
    const [chatRows, voiceRows] = await Promise.all([
      getRecentHealthChecks(1, "chat"),
      getRecentHealthChecks(1, "voice"),
    ]);

    const format = (row) =>
      row
        ? {
            apiType: row.api_type,
            status: row.status,
            responseTime: row.response_time,
            statusCode: row.status_code,
            querySent: row.query_sent,
            checkedAt: row.checked_at,
            errorMessage: row.error_message,
          }
        : null;

    res.status(200).json({
      success: true,
      data: {
        chat: format(chatRows[0] || null),
        voice: format(voiceRows[0] || null),
      },
    });
  } catch (error) {
    console.error("[ChatHealthController] getLatestStatus error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { triggerHealthCheck, getHealthCheckHistory, getLatestStatus };
