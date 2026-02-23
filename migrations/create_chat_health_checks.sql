-- ============================================================================
-- Migration: chat_health_checks table
-- Stores periodic health check results for chat-vistaar APIs (chat + voice)
-- ============================================================================

-- Create the table (fresh installs)
CREATE TABLE IF NOT EXISTS chat_health_checks (
    id              SERIAL PRIMARY KEY,
    api_type        VARCHAR(20)   NOT NULL DEFAULT 'chat',  -- 'chat' or 'voice'
    status          VARCHAR(20)   NOT NULL,                  -- 'up', 'degraded', or 'down'
    response_time   INTEGER,                                 -- response time in milliseconds
    status_code     INTEGER,                                 -- HTTP status code from the API
    query_sent      TEXT,                                     -- the question that was sent
    response_body   TEXT,                                     -- truncated response body (first 1000 chars)
    error_message   TEXT,                                     -- error message if the check failed
    checked_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chat_health_checks_checked_at ON chat_health_checks (checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_health_checks_status     ON chat_health_checks (status);
CREATE INDEX IF NOT EXISTS idx_chat_health_checks_api_type   ON chat_health_checks (api_type);
CREATE INDEX IF NOT EXISTS idx_chat_health_checks_type_time  ON chat_health_checks (api_type, checked_at DESC);

-- ============================================================================
-- If upgrading an existing table, run these ALTER statements instead:
--
--   ALTER TABLE chat_health_checks ADD COLUMN IF NOT EXISTS api_type   VARCHAR(20) NOT NULL DEFAULT 'chat';
--   ALTER TABLE chat_health_checks ADD COLUMN IF NOT EXISTS query_sent TEXT;
-- ============================================================================
