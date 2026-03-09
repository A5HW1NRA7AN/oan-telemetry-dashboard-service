const pool = require("../services/db");

/**
 * Parse latency value that may arrive as a number or a string like "4s".
 */
function parseLatency(value) {
    if (value === null || value === undefined) return null;
    return Number.parseFloat(String(value).replaceAll(/[^\d.]/g, "")) || null;
}

/**
 * Extract the telemetry fields from either payload shape:
 *
 * Shape A – direct POST from the LLM backend:
 *   { session_id, user_id, total_input_tokens, total_output_tokens,
 *     tools_used, total_latency_seconds }
 *
 * Shape B – processor-style event:
 *   { eid: "...", edata: { eks: { target: { llmTelemetryDetails: {...} } } } }
 */
function extractFields(body) {
    let data = body;

    // Shape B: unwrap processor envelope
    if (body?.edata?.eks?.target?.llmTelemetryDetails) {
        data = body.edata.eks.target.llmTelemetryDetails;
    }

    return {
        session_id: data.session_id ?? null,
        uid: data.user_id ?? data.uid ?? null,
        total_input_tokens: Number.parseInt(data.total_input_tokens ?? 0, 10) || 0,
        total_output_tokens: Number.parseInt(data.total_output_tokens ?? 0, 10) || 0,
        tools_used: Array.isArray(data.tools_used) ? data.tools_used : [],
        total_latency_seconds: parseLatency(data.total_latency_seconds),
    };
}

/**
 * POST /action/data/v3/telemetry
 *
 * Accepts LLM telemetry from the backend and persists it to llm_telemetry.
 */
async function receiveTelemetry(req, res) {
    const fields = extractFields(req.body);

    if (!fields.session_id) {
        return res.status(400).json({
            status: "error",
            message: "session_id is required",
        });
    }

    try {
        const result = await pool.query(
            `INSERT INTO llm_telemetry
         (session_id, uid, total_input_tokens, total_output_tokens,
          tools_used, total_latency_seconds)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at`,
            [
                fields.session_id,
                fields.uid,
                fields.total_input_tokens,
                fields.total_output_tokens,
                JSON.stringify(fields.tools_used),
                fields.total_latency_seconds,
            ]
        );

        return res.status(201).json({
            status: "success",
            id: result.rows[0].id,
            created_at: result.rows[0].created_at,
        });
    } catch (err) {
        console.error("[llmTelemetry] DB insert failed:", err.message);
        return res.status(500).json({ status: "error", message: "Internal server error" });
    }
}

module.exports = { receiveTelemetry };
