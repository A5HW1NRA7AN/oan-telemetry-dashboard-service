const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const pool = require("./db");

// ─── Random question pool (sourced from OAN-UI en.json) ───────────────────────
const HEALTH_CHECK_QUESTIONS = [
  "What is PM-KISAN scheme and how can I apply for it?",
  "Tell me about Kisan Credit Card scheme",
  "I want to know about Pradhan Mantri Fasal Bima Yojana",
  "What are the benefits of Soil Health Card scheme?",
  "Can you explain PMKSY scheme to me?",
  "What government schemes are available for farmers?",
  "Tell me about the Agriculture Infrastructure Fund",
  "How can I check my soil health card online?",
  "What documents do I need to apply for Kisan Credit Card?",
  "How much insurance coverage will I get for my wheat crop in Punjab?",
];

/**
 * Pick a random question from the pool.
 */
function getRandomQuestion() {
  return HEALTH_CHECK_QUESTIONS[
    Math.floor(Math.random() * HEALTH_CHECK_QUESTIONS.length)
  ];
}

// ─── Chat API health check (GET /api/chat/) ──────────────────────────────────
/**
 * Hits the chat-vistaar GET /api/chat/ endpoint and saves the result.
 *
 * Required env vars:
 *   CHAT_HEALTH_CHECK_BASE_URL   – e.g. http://10.0.0.5 (internal IP)
 *   CHAT_HEALTH_CHECK_AUTH_TOKEN – Bearer token
 *
 * Optional env vars:
 *   CHAT_HEALTH_CHECK_SRC_LANG, CHAT_HEALTH_CHECK_TGT_LANG, CHAT_HEALTH_CHECK_TIMEOUT_MS
 */
async function runChatHealthCheck() {
  const baseUrl = process.env.CHAT_HEALTH_CHECK_BASE_URL;
  const authToken = process.env.CHAT_HEALTH_CHECK_AUTH_TOKEN;

  if (!baseUrl || !authToken) {
    console.warn(
      "[ChatHealthCheck] Skipping – CHAT_HEALTH_CHECK_BASE_URL or CHAT_HEALTH_CHECK_AUTH_TOKEN not configured."
    );
    return null;
  }

  const query = getRandomQuestion();
  const sourceLang = process.env.CHAT_HEALTH_CHECK_SRC_LANG || "en";
  const targetLang = process.env.CHAT_HEALTH_CHECK_TGT_LANG || "en";
  const timeoutMs = parseInt(
    process.env.CHAT_HEALTH_CHECK_TIMEOUT_MS || "30000",
    10
  );

  const sessionId = uuidv4();
  const url = `${baseUrl}/api/chat/`;
  const params = {
    session_id: sessionId,
    query,
    source_lang: sourceLang,
    target_lang: targetLang,
  };

  return await executeAndSave({
    apiType: "chat",
    url,
    method: "GET",
    axiosConfig: {
      params,
      headers: {
        Authorization: `Bearer ${authToken}`,
        "User-Agent": "OAN-Telemetry-Dashboard-Service/1.0 (HealthCheck)",
      },
      timeout: timeoutMs,
    },
    querySent: query,
  });
}

// ─── Voice API health check (POST /api/v1/chat/completions) ──────────────────
/**
 * Hits the chat-vistaar POST /api/v1/chat/completions (voice) endpoint and saves the result.
 *
 * Required env vars:
 *   VOICE_HEALTH_CHECK_BASE_URL – e.g. http://10.0.0.5 (internal IP)
 *
 * Optional env vars:
 *   VOICE_HEALTH_CHECK_TENANT_ID, VOICE_HEALTH_CHECK_USER_ID,
 *   VOICE_HEALTH_CHECK_LANGUAGE, VOICE_HEALTH_CHECK_MODEL,
 *   VOICE_HEALTH_CHECK_TIMEOUT_MS
 */
async function runVoiceHealthCheck() {
  const baseUrl = process.env.VOICE_HEALTH_CHECK_BASE_URL;

  if (!baseUrl) {
    console.warn(
      "[VoiceHealthCheck] Skipping – VOICE_HEALTH_CHECK_BASE_URL not configured."
    );
    return null;
  }

  const query = getRandomQuestion();
  const tenantId =
    process.env.VOICE_HEALTH_CHECK_TENANT_ID || "health-check-tenant";
  const userId =
    process.env.VOICE_HEALTH_CHECK_USER_ID || "health-check-user";
  const sessionId = uuidv4();
  const language = process.env.VOICE_HEALTH_CHECK_LANGUAGE || "en";
  const model =
    process.env.VOICE_HEALTH_CHECK_MODEL || "bharatvistaar-voice";
  const timeoutMs = parseInt(
    process.env.VOICE_HEALTH_CHECK_TIMEOUT_MS || "30000",
    10
  );

  const url = `${baseUrl}/api/v1/chat/completions`;
  const body = {
    model,
    messages: [{ role: "user", content: query }],
    stream: false,
  };

  return await executeAndSave({
    apiType: "voice",
    url,
    method: "POST",
    axiosConfig: {
      method: "POST",
      url,
      data: body,
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-ID": tenantId,
        "X-User-ID": userId,
        "X-Session-ID": sessionId,
        "X-Language": language,
        "User-Agent": "OAN-Telemetry-Dashboard-Service/1.0 (HealthCheck)",
      },
      timeout: timeoutMs,
    },
    querySent: query,
  });
}

// ─── Response validators per API type ─────────────────────────────────────────

/**
 * Validates the chat API response.
 * Expected: the response should contain a non-empty answer string.
 * The GET /api/chat/ endpoint typically returns an object with an answer/response field.
 *
 * @param {Object|string} data – response body
 * @returns {{ valid: boolean, reason: string|null }}
 */
function validateChatResponse(data) {
  if (!data) {
    return { valid: false, reason: "Empty response body" };
  }

  // If the response is a string, it should be non-empty
  if (typeof data === "string") {
    if (data.trim().length === 0) {
      return { valid: false, reason: "Empty string response" };
    }
    // Check for error indicators in string responses
    const lower = data.toLowerCase();
    if (lower.includes('"error"') || lower.includes("internal server error")) {
      return { valid: false, reason: `Response contains error: ${data.substring(0, 200)}` };
    }
    return { valid: true, reason: null };
  }

  // Object response
  if (data.error || data.Error) {
    return {
      valid: false,
      reason: `API returned error: ${JSON.stringify(data.error || data.Error).substring(0, 200)}`,
    };
  }

  // Look for an actual answer in common response field names
  const answer =
    data.answer || data.response || data.text || data.message || data.result || data.output;

  if (!answer || (typeof answer === "string" && answer.trim().length === 0)) {
    return {
      valid: false,
      reason: `No valid answer in response. Keys: [${Object.keys(data).join(", ")}]`,
    };
  }

  return { valid: true, reason: null };
}

/**
 * Validates the voice API response.
 * Expected OpenAI-compatible format:
 *   { choices: [{ message: { content: "..." } }] }
 *
 * @param {Object|string} data – response body
 * @returns {{ valid: boolean, reason: string|null }}
 */
function validateVoiceResponse(data) {
  if (!data) {
    return { valid: false, reason: "Empty response body" };
  }

  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return { valid: false, reason: "Response is not valid JSON" };
    }
  }

  if (data.error || data.Error) {
    return {
      valid: false,
      reason: `API returned error: ${JSON.stringify(data.error || data.Error).substring(0, 200)}`,
    };
  }

  if (!Array.isArray(data.choices) || data.choices.length === 0) {
    return {
      valid: false,
      reason: `Missing or empty 'choices' array. Keys: [${Object.keys(data).join(", ")}]`,
    };
  }

  const firstChoice = data.choices[0];
  const content =
    firstChoice?.message?.content || firstChoice?.text || firstChoice?.delta?.content;

  if (!content || (typeof content === "string" && content.trim().length === 0)) {
    return {
      valid: false,
      reason: `Empty content in choices[0]. Choice keys: [${Object.keys(firstChoice || {}).join(", ")}]`,
    };
  }

  return { valid: true, reason: null };
}

// ─── Shared execution + persistence logic ─────────────────────────────────────
/**
 * Executes an HTTP request, validates the response content, and saves the health check result to DB.
 *
 * Health check statuses:
 *   'up'       – HTTP 2xx AND response body passes content validation
 *   'degraded' – HTTP 2xx but response body fails content validation (API is reachable but broken)
 *   'down'     – HTTP error, timeout, or network failure
 *
 * @param {Object} opts
 * @param {string} opts.apiType    – 'chat' | 'voice'
 * @param {string} opts.url
 * @param {string} opts.method     – 'GET' | 'POST'
 * @param {Object} opts.axiosConfig
 * @param {string} opts.querySent  – the question that was sent
 */
async function executeAndSave({ apiType, url, method, axiosConfig, querySent }) {
  const tag = apiType === "voice" ? "VoiceHealthCheck" : "ChatHealthCheck";

  const startTime = Date.now();
  let statusCode = null;
  let responseBody = null;
  let errorMessage = null;
  let status = "down";

  try {
    console.log(`[${tag}] Hitting ${method} ${url} — q: "${querySent}"`);

    // Use responseType:'stream' so SSE / chunked responses are fully consumed
    const streamConfig = { ...axiosConfig, responseType: "stream" };
    let response;
    if (method === "POST") {
      response = await axios(streamConfig);
    } else {
      response = await axios.get(url, streamConfig);
    }

    statusCode = response.status;

    // Drain the stream completely — prevents ECONNRESET on SSE endpoints
    const streamTimeout = axiosConfig.timeout || 30000;
    const rawText = await new Promise((resolve, reject) => {
      const chunks = [];
      const timer = setTimeout(
        () => reject(new Error(`Stream read timed out after ${streamTimeout}ms`)),
        streamTimeout
      );
      response.data.on("data", (chunk) => chunks.push(chunk));
      response.data.on("end", () => {
        clearTimeout(timer);
        resolve(Buffer.concat(chunks).toString("utf-8"));
      });
      response.data.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    responseBody = rawText.substring(0, 1000);

    // Try to parse as JSON, fall back to raw text for validation
    let rawData;
    try {
      rawData = JSON.parse(rawText);
    } catch {
      rawData = rawText;
    }

    const elapsed = Date.now() - startTime;

    if (statusCode >= 200 && statusCode < 300) {
      // HTTP succeeded — now validate the actual response content
      const validator =
        apiType === "voice" ? validateVoiceResponse : validateChatResponse;
      const validation = validator(rawData);

      if (validation.valid) {
        status = "up";
        console.log(
          `[${tag}] ✅ UP — ${statusCode} in ${elapsed}ms — response validated OK`
        );
      } else {
        status = "degraded";
        errorMessage = validation.reason;
        console.warn(
          `[${tag}] ⚠️ DEGRADED — ${statusCode} in ${elapsed}ms — ${validation.reason}`
        );
      }
    } else {
      // Non-2xx status code
      status = "down";
      errorMessage = `Unexpected status code: ${statusCode}`;
      console.error(
        `[${tag}] 🔴 DOWN — ${statusCode} in ${elapsed}ms`
      );
    }
  } catch (err) {
    const elapsed = Date.now() - startTime;
    statusCode = err.response?.status || null;
    errorMessage = err.message;
    responseBody = err.response?.data
      ? JSON.stringify(err.response.data).substring(0, 1000)
      : null;

    // Differentiate timeout vs network vs HTTP error
    if (err.code === "ECONNABORTED" || err.message.includes("timeout")) {
      status = "down";
      errorMessage = `Timeout after ${elapsed}ms: ${err.message}`;
      console.error(`[${tag}] 🔴 DOWN (timeout) — ${elapsed}ms — ${err.message}`);
    } else if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND") {
      status = "down";
      errorMessage = `Connection failed (${err.code}): ${err.message}`;
      console.error(`[${tag}] 🔴 DOWN (connection) — ${err.code} — ${err.message}`);
    } else if (err.response) {
      status = "down";
      errorMessage = `HTTP ${statusCode}: ${err.message}`;
      console.error(`[${tag}] 🔴 DOWN (HTTP ${statusCode}) — ${elapsed}ms — ${err.message}`);
    } else {
      status = "down";
      errorMessage = `Network error: ${err.message}`;
      console.error(`[${tag}] 🔴 DOWN (network) — ${elapsed}ms — ${err.message}`);
    }
  }

  const responseTime = Date.now() - startTime;

  // Persist to DB
  try {
    const insertQuery = `
      INSERT INTO chat_health_checks
        (api_type, status, response_time, status_code, query_sent, response_body, error_message, checked_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *;
    `;
    const result = await pool.query(insertQuery, [
      apiType,
      status,
      responseTime,
      statusCode,
      querySent,
      responseBody,
      errorMessage,
    ]);

    console.log(
      `[${tag}] Saved check id=${result.rows[0].id} status=${status}`
    );
    return result.rows[0];
  } catch (dbErr) {
    console.error(
      `[${tag}] Failed to save health check to DB:`,
      dbErr.message
    );
    return { api_type: apiType, status, responseTime, statusCode, querySent, errorMessage };
  }
}

// ─── Run both health checks in parallel ───────────────────────────────────────
async function runAllHealthChecks() {
  const [chatResult, voiceResult] = await Promise.allSettled([
    runChatHealthCheck(),
    runVoiceHealthCheck(),
  ]);
  return {
    chat:
      chatResult.status === "fulfilled"
        ? chatResult.value
        : { status: "error", error: chatResult.reason?.message },
    voice:
      voiceResult.status === "fulfilled"
        ? voiceResult.value
        : { status: "error", error: voiceResult.reason?.message },
  };
}

// ─── DB query helpers ─────────────────────────────────────────────────────────
/**
 * Fetch recent health checks, optionally filtered by api_type.
 * @param {number} limit
 * @param {string|null} apiType – 'chat' | 'voice' | null (all)
 */
async function getRecentHealthChecks(limit = 50, apiType = null) {
  if (apiType) {
    const result = await pool.query(
      "SELECT * FROM chat_health_checks WHERE api_type = $1 ORDER BY checked_at DESC LIMIT $2",
      [apiType, limit]
    );
    return result.rows;
  }
  const result = await pool.query(
    "SELECT * FROM chat_health_checks ORDER BY checked_at DESC LIMIT $1",
    [limit]
  );
  return result.rows;
}

module.exports = {
  runChatHealthCheck,
  runVoiceHealthCheck,
  runAllHealthChecks,
  getRecentHealthChecks,
  HEALTH_CHECK_QUESTIONS,
};
