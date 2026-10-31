import assert from "node:assert/strict";
import test from "node:test";
import {
  verifyMigrationCatalog,
  type CatalogForeignKey,
  type CatalogIndex,
  type ExpectedMigrationCatalog,
  type MigrationCatalogSnapshot,
} from "../helpers/migration-safety";

const btree = (table: string, names: string[], unique = false) => ({
  table,
  columns: names.map((name) => ({ name, direction: "ASC" as const, nulls: "LAST" as const, collation: null, operatorClass: null })),
  unique,
  method: "btree",
  includeColumns: [],
  predicate: null,
});

const requiredChecks = [
  { name: "organization_settings_daily_minutes_check", table: "organization_settings", columns: ["expected_daily_minutes"], definition: 'CHECK ("expected_daily_minutes" BETWEEN 60 AND 1440)' },
  { name: "organization_settings_half_day_check", table: "organization_settings", columns: ["half_day_threshold_mins", "expected_daily_minutes"], definition: 'CHECK ("half_day_threshold_mins" BETWEEN 30 AND 720 AND "half_day_threshold_mins" < "expected_daily_minutes")' },
  { name: "organization_settings_grace_check", table: "organization_settings", columns: ["late_grace_mins"], definition: 'CHECK ("late_grace_mins" BETWEEN 0 AND 180)' },
  { name: "organization_settings_break_minutes_check", table: "organization_settings", columns: ["max_break_mins"], definition: 'CHECK ("max_break_mins" IS NULL OR "max_break_mins" BETWEEN 5 AND 480)' },
  { name: "organization_settings_notice_days_check", table: "organization_settings", columns: ["leave_advance_notice_days"], definition: 'CHECK ("leave_advance_notice_days" BETWEEN 0 AND 365)' },
  { name: "organization_settings_ai_request_limit_check", table: "organization_settings", columns: ["ai_monthly_request_limit"], definition: 'CHECK ("ai_monthly_request_limit" BETWEEN 1 AND 5000)' },
  { name: "organization_settings_ai_token_limit_check", table: "organization_settings", columns: ["ai_monthly_token_limit"], definition: 'CHECK ("ai_monthly_token_limit" BETWEEN 1000 AND 50000000)' },
  { name: "organization_settings_ai_context_check", table: "organization_settings", columns: ["ai_context_max_chars"], definition: 'CHECK ("ai_context_max_chars" BETWEEN 4000 AND 50000)' },
  { name: "organization_settings_ai_retention_check", table: "organization_settings", columns: ["ai_retention_days"], definition: 'CHECK ("ai_retention_days" BETWEEN 1 AND 90)' },
  { name: "ai_generations_usage_nonnegative", table: "ai_generations", columns: ["input_tokens", "output_tokens", "total_tokens"], definition: 'CHECK ("input_tokens" >= 0 AND "output_tokens" >= 0 AND "total_tokens" >= 0)' },
];

// Required fields and index signatures below are taken from prisma/schema.prisma.
// Custom policy/AI CHECK definitions are intentionally not asserted: see the unresolved notes in docs/MIGRATION_REGRESSION_TESTS.md.
const expected: ExpectedMigrationCatalog = {
  constraintSignatures: requiredChecks,
  enums: {
    AutomationType: ["DAILY_EMAIL_REPORT"],
    EmailDeliveryStatus: ["PENDING", "SENDING", "SENT", "DELIVERED", "FAILED"],
    PasswordTokenPurpose: ["INITIAL_SETUP", "PASSWORD_RESET"],
    AiProvider: ["OPENAI"],
    AiInsightType: ["DAILY_SUMMARY", "BLOCKERS", "WORKLOAD", "ASSISTANT"],
    AiGenerationStatus: ["SUCCEEDED", "FAILED"],
    AiFeedbackRating: ["HELPFUL", "NOT_HELPFUL", "INCORRECT"],
  },
  extensions: ["pg_trgm"],
  tables: {
    users: ["id", "email", "email_verified", "password_hash", "auth_version"],
    password_tokens: ["id", "user_id", "token_hash", "purpose", "expires_at", "consumed_at", "created_at"],
    auth_rate_limits: ["key_hash", "window_started_at", "attempts"],
    auth_security_events: ["id", "user_id", "event", "subject_hash", "metadata", "created_at"],
    email_deliveries: ["id", "organization_id", "report_date", "report_version", "email_type", "recipient_email", "provider_message_id", "status", "attempt_count", "last_error", "sent_at", "delivered_at", "created_at", "updated_at"],
    ai_generations: ["id", "organization_id", "requested_by_id", "type", "status", "question", "output", "source_refs", "context_hash", "provider", "model", "input_tokens", "output_tokens", "total_tokens", "error_code", "expires_at", "created_at"],
    ai_feedback: ["id", "organization_id", "generation_id", "user_id", "rating", "created_at", "updated_at"],
    organization_settings: ["workday_start", "workday_end", "work_days", "late_grace_mins", "expected_daily_minutes", "half_day_threshold_mins", "max_break_mins", "daily_email_enabled", "daily_email_time", "ai_enabled", "ai_monthly_request_limit", "ai_monthly_token_limit", "ai_context_max_chars", "ai_retention_days"],
  },
  exactTables: ["email_deliveries"],
  primaryKeys: {
    users: ["id"], password_tokens: ["id"], auth_rate_limits: ["key_hash"], auth_security_events: ["id"],
    email_deliveries: ["id"], ai_generations: ["id"], ai_feedback: ["id"],
  },
  columnDefinitions: {
    users: {
      id: { type: "text", nullable: false },
      email: { type: "text", nullable: false },
      email_verified: { type: "timestamp(3) with time zone", nullable: true },
      password_hash: { type: "text", nullable: true },
      auth_version: { type: "integer", nullable: false, default: "0" },
    },
    password_tokens: {
      id: { type: "text", nullable: false },
      user_id: { type: "text", nullable: false },
      token_hash: { type: "text", nullable: false },
      purpose: { type: '"PasswordTokenPurpose"', nullable: false },
      expires_at: { type: "timestamp(3) with time zone", nullable: false },
      consumed_at: { type: "timestamp(3) with time zone", nullable: true, default: null },
      created_at: { type: "timestamp(3) with time zone", nullable: false, default: "CURRENT_TIMESTAMP" },
    },
    auth_rate_limits: {
      key_hash: { type: "text", nullable: false },
      window_started_at: { type: "timestamp(3) with time zone", nullable: false },
      attempts: { type: "integer", nullable: false, default: "0" },
    },
    email_deliveries: {
      id: { type: "text", nullable: false },
      organization_id: { type: "text", nullable: false },
      report_date: { type: "date", nullable: false },
      report_version: { type: "integer", nullable: false, default: "1" },
      email_type: { type: "text", nullable: false, default: "'DAILY_TEAM_REPORT'::text" },
      recipient_email: { type: "text", nullable: false },
      provider_message_id: { type: "text", nullable: true, default: null },
      status: { type: '"EmailDeliveryStatus"', nullable: false, default: "'PENDING'::\"EmailDeliveryStatus\"" },
      attempt_count: { type: "integer", nullable: false, default: "0" },
      last_error: { type: "text", nullable: true, default: null },
      sent_at: { type: "timestamp(3) with time zone", nullable: true, default: null },
      delivered_at: { type: "timestamp(3) with time zone", nullable: true, default: null },
      created_at: { type: "timestamp(3) with time zone", nullable: false, default: "CURRENT_TIMESTAMP" },
      updated_at: { type: "timestamp(3) with time zone", nullable: false },
    },
    ai_generations: {
      type: { type: '"AiInsightType"', nullable: false },
      status: { type: '"AiGenerationStatus"', nullable: false },
      question: { type: "text", nullable: true, default: null },
      output: { type: "jsonb", nullable: true, default: null },
      source_refs: { type: "jsonb", nullable: false },
      context_hash: { type: "text", nullable: false },
      provider: { type: '"AiProvider"', nullable: false },
      input_tokens: { type: "integer", nullable: false, default: "0" },
      output_tokens: { type: "integer", nullable: false, default: "0" },
      total_tokens: { type: "integer", nullable: false, default: "0" },
      error_code: { type: "text", nullable: true, default: null },
      expires_at: { type: "timestamp(3) with time zone", nullable: false },
    },
    ai_feedback: {
      rating: { type: '"AiFeedbackRating"', nullable: false },
    },
  },
  indexSignatures: [
    btree("users", ["email"], true),
    btree("email_deliveries", ["provider_message_id"], true),
    btree("email_deliveries", ["organization_id", "report_date", "email_type", "recipient_email", "report_version"], true),
    btree("email_deliveries", ["organization_id", "report_date", "status"]),
    btree("email_deliveries", ["status", "updated_at"]),
    btree("password_tokens", ["token_hash"], true),
    btree("password_tokens", ["user_id", "purpose", "expires_at"]),
    btree("password_tokens", ["expires_at"]),
    btree("auth_rate_limits", ["key_hash"], true),
    btree("auth_rate_limits", ["window_started_at"]),
    btree("auth_security_events", ["user_id", "created_at"]),
    btree("auth_security_events", ["event", "created_at"]),
    btree("tasks", ["organization_id", "status"]),
    btree("tasks", ["organization_id", "status", "position"]),
    btree("tasks", ["organization_id", "archived_at", "due_at"]),
    btree("tasks", ["organization_id", "created_at"]),
    btree("tasks", ["organization_id", "completed_at"]),
    btree("tasks", ["team_id", "status"]),
    btree("tasks", ["assigned_to_id", "status", "due_at"]),
    btree("tasks", ["created_by_id"]),
    btree("ai_generations", ["organization_id", "type", "created_at"]),
    btree("ai_generations", ["organization_id", "requested_by_id", "created_at"]),
    btree("ai_generations", ["organization_id", "context_hash", "expires_at"]),
    btree("ai_feedback", ["generation_id", "user_id"], true),
    btree("ai_feedback", ["organization_id", "created_at"]),
    btree("ai_feedback", ["user_id", "created_at"]),
  ],
  foreignKeySignatures: [
    { table: "email_deliveries", columns: ["organization_id"], referencedTable: "organizations", referencedColumns: ["id"], onDelete: "CASCADE", onUpdate: "CASCADE" },
    { table: "password_tokens", columns: ["user_id"], referencedTable: "users", referencedColumns: ["id"], onDelete: "CASCADE", onUpdate: "CASCADE" },
    { table: "ai_generations", columns: ["organization_id"], referencedTable: "organizations", referencedColumns: ["id"], onDelete: "CASCADE", onUpdate: "CASCADE" },
    { table: "ai_generations", columns: ["requested_by_id"], referencedTable: "users", referencedColumns: ["id"], onDelete: "CASCADE", onUpdate: "CASCADE" },
    { table: "ai_feedback", columns: ["organization_id"], referencedTable: "organizations", referencedColumns: ["id"], onDelete: "CASCADE", onUpdate: "CASCADE" },
    { table: "ai_feedback", columns: ["generation_id"], referencedTable: "ai_generations", referencedColumns: ["id"], onDelete: "CASCADE", onUpdate: "CASCADE" },
    { table: "ai_feedback", columns: ["user_id"], referencedTable: "users", referencedColumns: ["id"], onDelete: "CASCADE", onUpdate: "CASCADE" },
  ],
};

function fixture(): MigrationCatalogSnapshot {
  const indexes: Record<string, CatalogIndex> = {};
  expected.indexSignatures?.forEach((signature, index) => {
    indexes[`fixture_index_${index}`] = { ...signature, definition: "fixture definition", valid: true };
  });

  const foreignKeys: Record<string, CatalogForeignKey> = {};
  expected.foreignKeySignatures?.forEach((signature, index) => {
    foreignKeys[`fixture_fk_${index}`] = { ...signature, definition: "fixture definition", validated: true };
  });

  return {
    enums: {
      AutomationType: ["CHECK_IN_REMINDER", "DAILY_EMAIL_REPORT"],
      EmailDeliveryStatus: ["PENDING", "SENDING", "SENT", "DELIVERED", "FAILED"],
      PasswordTokenPurpose: ["INITIAL_SETUP", "PASSWORD_RESET"],
      AiProvider: ["OPENAI"],
      AiInsightType: ["DAILY_SUMMARY", "BLOCKERS", "WORKLOAD", "ASSISTANT"],
      AiGenerationStatus: ["SUCCEEDED", "FAILED"],
      AiFeedbackRating: ["HELPFUL", "NOT_HELPFUL", "INCORRECT"],
    },
    extensions: ["pg_trgm"],
    tables: Object.fromEntries(Object.entries(expected.tables ?? {}).map(([name, columns]) => [name, {
      columns: Object.fromEntries(columns.map((column) => [column, { ...(expected.columnDefinitions?.[name]?.[column] ?? {}) }])),
    }])),
    primaryKeys: Object.fromEntries(Object.entries(expected.primaryKeys ?? {}).map(([name, columns]) => [name, [...columns]])),
    constraints: Object.fromEntries(requiredChecks.map((constraint) => [constraint.name, {
      ...constraint,
      validated: true,
    }])),
    indexes,
    foreignKeys,
  };
}

test("accepts the repository-backed schema fixture", () => {
  assert.deepEqual(verifyMigrationCatalog(expected, fixture()), []);
});

test("reports missing enum types and values, including delivery and auth enums", () => {
  const actual = fixture();
  actual.enums.EmailDeliveryStatus = ["PENDING"];
  delete actual.enums.PasswordTokenPurpose;
  const issues = verifyMigrationCatalog(expected, actual);
  assert.ok(issues.some((issue) => issue.object === "EmailDeliveryStatus.SENDING" && issue.code === "missing"));
  assert.ok(issues.some((issue) => issue.object === "PasswordTokenPurpose" && issue.code === "missing"));
});

test("reports missing required tables and columns", () => {
  const actual = fixture();
  delete actual.tables.password_tokens;
  delete actual.tables.email_deliveries.columns.delivered_at;
  const issues = verifyMigrationCatalog(expected, actual);
  assert.ok(issues.some((issue) => issue.category === "table" && issue.object === "password_tokens" && issue.code === "missing"));
  assert.ok(issues.some((issue) => issue.category === "column" && issue.object === "email_deliveries.delivered_at" && issue.code === "missing"));
});

test("requires the simplified EmailDelivery columns and rejects an unexpected fixture column", () => {
  const actual = fixture();
  actual.tables.email_deliveries.columns.fixture_extra_column = {};
  const issue = verifyMigrationCatalog(expected, actual).find((candidate) => candidate.object === "email_deliveries.fixture_extra_column");
  assert.deepEqual(issue, { code: "unexpected", category: "column", object: "email_deliveries.fixture_extra_column" });
});

test("reports missing and incorrect CHECK definitions while preserving quoted identifier case", () => {
  const checkExpectation: ExpectedMigrationCatalog = { constraints: { "fixture_check": "CHECK (\"OfficeStart\" < \"OfficeEnd\")" } };
  const actual = fixture();
  actual.constraints = {};
  assert.ok(verifyMigrationCatalog(checkExpectation, actual).some((issue) => issue.code === "missing"));
  actual.constraints.fixture_check = { definition: " CHECK  (\n\"OfficeStart\"   <\n \"OfficeEnd\") ", validated: true };
  assert.deepEqual(verifyMigrationCatalog(checkExpectation, actual), []);
  actual.constraints.fixture_check.definition = 'CHECK ("officestart" < "OfficeEnd")';
  assert.ok(verifyMigrationCatalog(checkExpectation, actual).some((issue) => issue.code === "definition_mismatch"));
  actual.constraints.fixture_check.validated = false;
  assert.ok(verifyMigrationCatalog(checkExpectation, actual).some((issue) => issue.code === "not_validated"));
});

test("rejects missing, incorrect, unvalidated, or duplicate required CHECK candidates", () => {
  const required = requiredChecks[0];
  const checkExpected: ExpectedMigrationCatalog = { constraintSignatures: [required] };
  const actual = fixture();
  delete actual.constraints[required.name];
  assert.ok(verifyMigrationCatalog(checkExpected, actual).some((issue) => issue.code === "missing"));

  actual.constraints[required.name] = { ...required, definition: 'CHECK ("expected_daily_minutes" > 0)', validated: true };
  assert.ok(verifyMigrationCatalog(checkExpected, actual).some((issue) => issue.code === "definition_mismatch"));
  actual.constraints[required.name] = { ...required, validated: false };
  assert.ok(verifyMigrationCatalog(checkExpected, actual).some((issue) => issue.code === "not_validated"));
  delete actual.constraints[required.name].validated;
  assert.ok(verifyMigrationCatalog(checkExpected, actual).some((issue) => issue.code === "not_validated"));
  actual.constraints[required.name].validated = true;
  assert.deepEqual(verifyMigrationCatalog(checkExpected, actual), []);

  actual.constraints.conflicting_duplicate = {
    ...required,
    name: "conflicting_duplicate",
    definition: 'CHECK ("expected_daily_minutes" BETWEEN 1 AND 2000)',
    validated: true,
  };
  assert.ok(verifyMigrationCatalog(checkExpected, actual).some((issue) => issue.category === "constraint" && issue.code === "ambiguous"));
});

test("preserves literal whitespace and handles escaped apostrophes in PostgreSQL E strings", () => {
  const escapeStringCheck: ExpectedMigrationCatalog = {
    constraints: { fixture_escape_check: String.raw`CHECK (note = E'can\'t  stop')` },
  };
  const actual = fixture();
  actual.constraints.fixture_escape_check = {
    definition: String.raw` CHECK  ( note = E'can\'t  stop' ) `,
    validated: true,
  };
  assert.deepEqual(verifyMigrationCatalog(escapeStringCheck, actual), []);

  actual.constraints.fixture_escape_check.definition = String.raw`CHECK (note = E'can\'t stop')`;
  assert.ok(verifyMigrationCatalog(escapeStringCheck, actual).some((issue) => issue.code === "definition_mismatch"));

  const ordinaryStringCheck: ExpectedMigrationCatalog = { constraints: { fixture_text_check: "CHECK (note = 'a  b')" } };
  actual.constraints.fixture_text_check = { definition: "CHECK (note = 'a b')", validated: true };
  assert.ok(verifyMigrationCatalog(ordinaryStringCheck, actual).some((issue) => issue.code === "definition_mismatch"));
});

test("fails closed for unsupported comments and dollar-quoted SQL, even when raw text is identical", () => {
  const expectedComment: ExpectedMigrationCatalog = { constraints: { fixture_comment_check: "CHECK (value > 0) -- first" } };
  const actual = fixture();
  actual.constraints.fixture_comment_check = { definition: "CHECK (value > 0) -- second", validated: true };
  assert.ok(verifyMigrationCatalog(expectedComment, actual).some((issue) => issue.code === "definition_mismatch"));
  actual.constraints.fixture_comment_check.definition = expectedComment.constraints!.fixture_comment_check;
  assert.ok(verifyMigrationCatalog(expectedComment, actual).some((issue) => issue.code === "definition_mismatch"));

  const expectedDollarQuote: ExpectedMigrationCatalog = { constraints: { fixture_dollar_check: "CHECK (note = $$a  b$$)" } };
  actual.constraints.fixture_dollar_check = { definition: "CHECK (note = $$a b$$)", validated: true };
  assert.ok(verifyMigrationCatalog(expectedDollarQuote, actual).some((issue) => issue.code === "definition_mismatch"));
  actual.constraints.fixture_dollar_check.definition = expectedDollarQuote.constraints!.fixture_dollar_check;
  assert.ok(verifyMigrationCatalog(expectedDollarQuote, actual).some((issue) => issue.code === "definition_mismatch"));
});

test("reports missing schema-backed email, password, AI, and task indexes", () => {
  const actual = fixture();
  actual.indexes = {};
  const issues = verifyMigrationCatalog(expected, actual);
  for (const object of [
    "email_deliveries(organization_id,report_date,email_type,recipient_email,report_version) unique",
    "password_tokens(user_id,purpose,expires_at)",
    "tasks(organization_id,status,position)",
    "ai_generations(organization_id,context_hash,expires_at)",
  ]) {
    assert.ok(issues.some((issue) => issue.category === "index" && issue.object === object && issue.code === "missing"), object);
  }

  actual.indexes = {
    wrongMethod: { ...btree("email_deliveries", ["provider_message_id"], true), method: "hash", definition: "wrong index method", valid: true },
  };
  assert.ok(verifyMigrationCatalog(expected, actual).some((issue) => issue.object === "email_deliveries(provider_message_id) unique" && issue.code === "definition_mismatch"));
});

test("rejects each materially different index signature dimension", () => {
  const required = expected.indexSignatures!.find((index) => index.table === "tasks" && index.columns.map((column) => column.name).join(",") === "organization_id,status,position")!;
  const variants = [
    { ...required, columns: required.columns.map((column, position) => position === 0 ? { ...column, direction: "DESC" as const } : column) },
    { ...required, columns: required.columns.map((column, position) => position === 0 ? { ...column, nulls: "FIRST" as const } : column) },
    { ...required, columns: required.columns.map((column, position) => position === 0 ? { ...column, collation: "C" } : column) },
    { ...required, columns: required.columns.map((column, position) => position === 0 ? { ...column, operatorClass: "text_pattern_ops" } : column) },
    { ...required, unique: true },
    { ...required, method: "hash" },
    { ...required, includeColumns: ["created_at"] },
    { ...required, predicate: "archived_at IS NULL" },
  ];

  for (const variant of variants) {
    const actual = fixture();
    actual.indexes = { only_candidate: { ...variant, definition: "fixture index", valid: true } };
    assert.ok(verifyMigrationCatalog({ indexSignatures: [required] }, actual).some((issue) => issue.code === "definition_mismatch"));
  }
});

test("rejects duplicate index and foreign-key candidates even when one candidate is correct", () => {
  const requiredIndex = expected.indexSignatures!.find((index) => index.table === "tasks" && index.columns.map((column) => column.name).join(",") === "organization_id,status,position")!;
  const duplicateIndexes = fixture();
  duplicateIndexes.indexes = {
    correct: { ...requiredIndex, definition: "correct", valid: true },
    conflicting: {
      ...requiredIndex,
      columns: requiredIndex.columns.map((column, position) => position === 0 ? { ...column, direction: "DESC" as const } : column),
      definition: "conflicting duplicate",
      valid: true,
    },
  };
  assert.ok(verifyMigrationCatalog({ indexSignatures: [requiredIndex] }, duplicateIndexes).some((issue) => issue.category === "index" && issue.code === "ambiguous"));

  const requiredForeignKey = expected.foreignKeySignatures![0];
  const duplicateForeignKeys = fixture();
  duplicateForeignKeys.foreignKeys = {
    correct: { ...requiredForeignKey, definition: "correct", validated: true },
    conflicting: { ...requiredForeignKey, onUpdate: "RESTRICT", definition: "conflicting duplicate", validated: true },
  };
  assert.ok(verifyMigrationCatalog({ foreignKeySignatures: [requiredForeignKey] }, duplicateForeignKeys).some((issue) => issue.category === "foreign_key" && issue.code === "ambiguous"));
});

test("reports missing or incorrectly defined indexes", () => {
  const actual = fixture();
  actual.indexes = { wrong: { ...btree("tasks", ["title"]), definition: "wrong definition", valid: true } };
  assert.ok(verifyMigrationCatalog(expected, actual).some((issue) => issue.category === "index" && issue.code === "missing"));
  const wrongDefinitionExpectation: ExpectedMigrationCatalog = { indexes: { "fixture_index": "CREATE INDEX fixture_index ON public.tasks (title)" } };
  actual.indexes.fixture_index = { ...btree("tasks", ["title"]), method: "gin", definition: "CREATE INDEX fixture_index ON public.tasks USING gin (title gin_trgm_ops)", valid: true };
  assert.ok(verifyMigrationCatalog(wrongDefinitionExpectation, actual).some((issue) => issue.category === "index" && issue.code === "definition_mismatch"));
  actual.indexes.fixture_index.definition = wrongDefinitionExpectation.indexes!.fixture_index;
  actual.indexes.fixture_index.valid = false;
  assert.ok(verifyMigrationCatalog(wrongDefinitionExpectation, actual).some((issue) => issue.category === "index" && issue.code === "not_validated"));
});

test("requires explicit validity status for constraints, named indexes, and foreign keys", () => {
  const cases = [
    { category: "constraint", object: "fixture_constraint", expected: { constraints: { fixture_constraint: "CHECK (value > 0)" } }, field: "constraints", statusField: "validated", value: { definition: "CHECK (value > 0)" } },
    { category: "index", object: "fixture_index", expected: { indexes: { fixture_index: "CREATE INDEX fixture_index ON public.tasks (title)" } }, field: "indexes", statusField: "valid", value: { ...btree("tasks", ["title"]), definition: "CREATE INDEX fixture_index ON public.tasks (title)" } },
    { category: "foreign_key", object: "fixture_fk", expected: { foreignKeys: { fixture_fk: "FOREIGN KEY (user_id) REFERENCES users(id)" } }, field: "foreignKeys", statusField: "validated", value: { table: "tasks", columns: ["user_id"], referencedTable: "users", referencedColumns: ["id"], onDelete: "CASCADE", onUpdate: "CASCADE", definition: "FOREIGN KEY (user_id) REFERENCES users(id)" } },
  ] as const;

  for (const item of cases) {
    for (const status of [undefined, false, true] as const) {
      const actual = fixture();
      const object = status === undefined ? item.value : { ...item.value, [item.statusField]: status };
      (actual[item.field] as Record<string, unknown>)[item.object] = object;
      const issues = verifyMigrationCatalog(item.expected, actual);
      if (status === true) assert.deepEqual(issues, []);
      else assert.ok(issues.some((issue) => issue.code === "not_validated" && issue.category === item.category), `${item.category} status ${String(status)}`);
    }
  }
});

test("requires explicit valid and validated status for index and foreign-key signatures", () => {
  const requiredIndex = expected.indexSignatures![0];
  const requiredForeignKey = expected.foreignKeySignatures![0];

  for (const status of [undefined, false, true] as const) {
    const indexSnapshot = fixture();
    indexSnapshot.indexes = { candidate: { ...requiredIndex, definition: "fixture", ...(status === undefined ? {} : { valid: status }) } };
    const indexIssues = verifyMigrationCatalog({ indexSignatures: [requiredIndex] }, indexSnapshot);
    if (status === true) assert.deepEqual(indexIssues, []);
    else assert.ok(indexIssues.some((issue) => issue.code === "not_validated" && issue.category === "index"), `index status ${String(status)}`);

    const foreignKeySnapshot = fixture();
    foreignKeySnapshot.foreignKeys = { candidate: { ...requiredForeignKey, definition: "fixture", ...(status === undefined ? {} : { validated: status }) } };
    const foreignKeyIssues = verifyMigrationCatalog({ foreignKeySignatures: [requiredForeignKey] }, foreignKeySnapshot);
    if (status === true) assert.deepEqual(foreignKeyIssues, []);
    else assert.ok(foreignKeyIssues.some((issue) => issue.code === "not_validated" && issue.category === "foreign_key"), `foreign-key status ${String(status)}`);
  }
});

test("reports missing and incorrect foreign-key relationships", () => {
  const actual = fixture();
  actual.foreignKeys = {};
  assert.ok(verifyMigrationCatalog(expected, actual).some((issue) => issue.category === "foreign_key" && issue.code === "missing"));
  actual.foreignKeys.email = {
    table: "email_deliveries",
    columns: ["organization_id"],
    referencedTable: "users",
    referencedColumns: ["id"],
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
    definition: "fixture definition",
    validated: true,
  };
  assert.ok(verifyMigrationCatalog(expected, actual).some((issue) => issue.category === "foreign_key" && issue.code === "missing"));

  const wrongUpdate = fixture();
  wrongUpdate.foreignKeys = {};
  const required = expected.foreignKeySignatures![0];
  wrongUpdate.foreignKeys.email = {
    ...required,
    onUpdate: "RESTRICT",
    definition: "fixture definition",
    validated: true,
  };
  assert.ok(verifyMigrationCatalog({ foreignKeySignatures: [required] }, wrongUpdate).some((issue) => issue.code === "definition_mismatch"));
});

test("checks established column types, nullability, defaults, primary keys, and unique User.email", () => {
  const actual = fixture();
  actual.tables.users.columns.email.type = "character varying";
  actual.tables.users.columns.password_hash.nullable = false;
  actual.tables.users.columns.auth_version.default = "1";
  actual.primaryKeys.email_deliveries = ["organization_id"];
  actual.indexes = Object.fromEntries(Object.entries(actual.indexes).filter(([name]) => !name.endsWith("0")));
  const issues = verifyMigrationCatalog(expected, actual);
  assert.ok(issues.some((issue) => issue.object === "users.email" && issue.code === "definition_mismatch"));
  assert.ok(issues.some((issue) => issue.object === "users.password_hash" && issue.code === "definition_mismatch"));
  assert.ok(issues.some((issue) => issue.object === "users.auth_version" && issue.code === "definition_mismatch"));
  assert.ok(issues.some((issue) => issue.object === "email_deliveries.PRIMARY KEY" && issue.code === "definition_mismatch"));
  assert.ok(issues.some((issue) => issue.object === "users(email) unique" && issue.code === "missing"));

  const noPrimaryKey = fixture();
  delete noPrimaryKey.primaryKeys.users;
  assert.ok(verifyMigrationCatalog(expected, noPrimaryKey).some((issue) => issue.object === "users.PRIMARY KEY" && issue.code === "missing"));
});

test("reports missing extensions and duplicate labels in malformed fixtures", () => {
  const actual = fixture();
  actual.extensions = [];
  actual.enums.EmailDeliveryStatus.push("PENDING");
  const issues = verifyMigrationCatalog(expected, actual);
  assert.ok(issues.some((issue) => issue.category === "extension" && issue.object === "pg_trgm" && issue.code === "missing"));
  assert.ok(issues.some((issue) => issue.category === "enum" && issue.object === "EmailDeliveryStatus.PENDING" && issue.code === "duplicate_enum_value"));
});
