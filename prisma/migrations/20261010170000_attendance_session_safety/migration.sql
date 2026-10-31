CREATE INDEX "work_sessions_user_id_ended_at_idx"
ON "work_sessions"("user_id", "ended_at");

-- A user can never have two open office sessions at the same time.
CREATE UNIQUE INDEX "work_sessions_one_active_per_user_idx"
ON "work_sessions"("user_id")
WHERE "ended_at" IS NULL;
