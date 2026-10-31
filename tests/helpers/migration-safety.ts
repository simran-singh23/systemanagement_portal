/** Pure preflight and catalog-verification helpers. This module never opens a connection. */

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const PROTECTED_DATABASES = new Set(["teamflow", "teamflow_rehearsal_20261028"]);
const DEDICATED_DATABASE_PATTERN = /^teamflow_migration_test_[a-z0-9][a-z0-9_]{2,62}$/;

export interface SafeMigrationDatabaseTarget {
  host: string;
  port: number;
  database: string;
  schema: "public";
}

/** Validate a dedicated local test URL without returning or logging its credentials. */
export function validateMigrationTestDatabaseUrl(value: string): SafeMigrationDatabaseTarget {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Migration test database URL is malformed.");
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("Migration test database URL must use PostgreSQL.");
  }

  const host = url.hostname.toLowerCase();
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error("Migration test database host must be an IPv4 or IPv6 loopback address.");
  }

  const port = url.port ? Number(url.port) : 5432;
  if (!Number.isInteger(port) || port !== 5432) {
    throw new Error("Migration test database port must be 5432.");
  }

  let database: string;
  try {
    database = decodeURIComponent(url.pathname.slice(1)).toLowerCase();
  } catch {
    throw new Error("Migration test database path is malformed.");
  }
  if (PROTECTED_DATABASES.has(database)) {
    throw new Error("Protected TeamFlow databases cannot be migration test targets.");
  }
  if (!DEDICATED_DATABASE_PATTERN.test(database)) {
    throw new Error("Migration test database name must use the teamflow_migration_test_<unique-suffix> format.");
  }

  const parameterNames = [...url.searchParams.keys()];
  const schemas = url.searchParams.getAll("schema");
  if (parameterNames.some((name) => name !== "schema")) {
    throw new Error("Migration test database URL contains an unsupported query parameter.");
  }
  if (schemas.length !== 1 || schemas[0] !== "public") {
    throw new Error("Migration test database URL must select only the public schema.");
  }

  return { host, port, database, schema: "public" };
}

export interface CatalogDefinition {
  definition: string;
  validated?: boolean;
  valid?: boolean;
  table?: string;
  columns?: string[];
}

export interface CatalogConstraintSignature {
  name: string;
  table: string;
  columns: string[];
  definition: string;
}

export interface CatalogIndexColumn {
  name: string;
  direction: "ASC" | "DESC";
  nulls: "FIRST" | "LAST";
  collation: string | null;
  operatorClass: string | null;
}

export interface CatalogIndexSignature {
  table: string;
  columns: CatalogIndexColumn[];
  unique: boolean;
  method: string;
  includeColumns: string[];
  predicate: string | null;
}

export interface CatalogIndex extends CatalogDefinition, CatalogIndexSignature {}

export interface CatalogForeignKeySignature {
  table: string;
  columns: string[];
  referencedTable: string;
  referencedColumns: string[];
  onDelete: string;
  onUpdate: string;
}

export interface CatalogForeignKey extends CatalogDefinition, CatalogForeignKeySignature {}

export interface MigrationCatalogSnapshot {
  enums: Record<string, string[]>;
  extensions: string[];
  tables: Record<string, { columns: Record<string, CatalogColumnDefinition> }>;
  primaryKeys: Record<string, string[]>;
  constraints: Record<string, CatalogDefinition>;
  indexes: Record<string, CatalogIndex>;
  foreignKeys: Record<string, CatalogForeignKey>;
}

export interface CatalogColumnDefinition {
  type?: string;
  nullable?: boolean;
  default?: string | null;
}

export interface ExpectedMigrationCatalog {
  enums?: Record<string, string[]>;
  extensions?: string[];
  tables?: Record<string, string[]>;
  exactTables?: string[];
  columnDefinitions?: Record<string, Record<string, CatalogColumnDefinition>>;
  primaryKeys?: Record<string, string[]>;
  constraints?: Record<string, string>;
  constraintSignatures?: CatalogConstraintSignature[];
  indexes?: Record<string, string>;
  indexSignatures?: CatalogIndexSignature[];
  foreignKeys?: Record<string, string>;
  foreignKeySignatures?: CatalogForeignKeySignature[];
}

export interface CatalogIssue {
  code: "missing" | "unexpected" | "definition_mismatch" | "not_validated" | "ambiguous" | "duplicate_enum_value";
  category: "enum" | "extension" | "table" | "column" | "constraint" | "index" | "foreign_key";
  object: string;
}

function normalizeDefinition(definition: string): string | null {
  let normalized = "";
  let quote: "single" | "double" | null = null;
  let pendingSpace = false;
  let escapeString = false;

  for (let index = 0; index < definition.length; index += 1) {
    const character = definition[index];
    const next = definition[index + 1];

    if (quote) {
      if (quote === "single" && definition[index] === "\\") {
        if (!escapeString) return null;
        if (index + 1 >= definition.length) return null;
        normalized += definition.slice(index, index + 2);
        index += 1;
        continue;
      }
      normalized += character;
      const quoteCharacter = quote === "single" ? "'" : '"';
      if (character === quoteCharacter && next === quoteCharacter) {
        normalized += next;
        index += 1;
      } else if (character === quoteCharacter) {
        quote = null;
      }
      continue;
    }

    if (character === "'" || character === '"') {
      const whitespaceBeforeQuote = pendingSpace;
      if (pendingSpace && normalized && !normalized.endsWith(" ") && !normalized.endsWith("(")) normalized += " ";
      pendingSpace = false;
      quote = character === "'" ? "single" : "double";
      escapeString = quote === "single" && !whitespaceBeforeQuote && /[eE]$/.test(normalized) && (normalized.length === 1 || !/[a-zA-Z0-9_$]/.test(normalized[normalized.length - 2]));
      normalized += character;
    } else if ((character === "-" && next === "-") || (character === "/" && next === "*")) {
      return null;
    } else if (character === "$" && /\$[a-zA-Z_0-9]*\$/.test(definition.slice(index))) {
      return null;
    } else if (character === "(" || character === ")") {
      pendingSpace = false;
      normalized += character;
    } else if (/\s/.test(character)) {
      pendingSpace = true;
    } else {
      if (pendingSpace && normalized && !normalized.endsWith(" ") && !normalized.endsWith("(")) normalized += " ";
      pendingSpace = false;
      normalized += character;
    }
  }

  return quote ? null : normalized.trim();
}

function definitionsEqual(left: string, right: string): boolean {
  const normalizedLeft = normalizeDefinition(left);
  const normalizedRight = normalizeDefinition(right);
  // Unsupported syntax cannot be certified by this lightweight normalizer, even
  // when the raw strings happen to match. Callers must treat it as a mismatch.
  if (normalizedLeft === null || normalizedRight === null) return false;
  return normalizedLeft === normalizedRight;
}

/** Compare a catalog fixture with required schema objects; no SQL is executed. */
export function verifyMigrationCatalog(
  expected: ExpectedMigrationCatalog,
  actual: MigrationCatalogSnapshot,
): CatalogIssue[] {
  const issues: CatalogIssue[] = [];

  for (const [enumName, requiredValues] of Object.entries(expected.enums ?? {})) {
    const values = actual.enums[enumName];
    if (!values) {
      issues.push({ code: "missing", category: "enum", object: enumName });
      continue;
    }
    for (const value of requiredValues) {
      if (!values.includes(value)) issues.push({ code: "missing", category: "enum", object: `${enumName}.${value}` });
    }
    for (const value of new Set(values)) {
      if (values.filter((candidate) => candidate === value).length > 1) {
        issues.push({ code: "duplicate_enum_value", category: "enum", object: `${enumName}.${value}` });
      }
    }
  }

  for (const extension of expected.extensions ?? []) {
    if (!actual.extensions.includes(extension)) issues.push({ code: "missing", category: "extension", object: extension });
  }

  for (const [tableName, requiredColumns] of Object.entries(expected.tables ?? {})) {
    const table = actual.tables[tableName];
    if (!table) {
      issues.push({ code: "missing", category: "table", object: tableName });
      continue;
    }
    const columns = Object.keys(table.columns);
    for (const column of requiredColumns) {
      if (!columns.includes(column)) issues.push({ code: "missing", category: "column", object: `${tableName}.${column}` });
    }
    if (expected.exactTables?.includes(tableName)) {
      for (const column of columns) {
        if (!requiredColumns.includes(column)) issues.push({ code: "unexpected", category: "column", object: `${tableName}.${column}` });
      }
    }
  }

  for (const [tableName, definitions] of Object.entries(expected.columnDefinitions ?? {})) {
    for (const [columnName, definition] of Object.entries(definitions)) {
      const actualColumn = actual.tables[tableName]?.columns[columnName];
      if (!actualColumn) {
        issues.push({ code: "missing", category: "column", object: `${tableName}.${columnName}` });
        continue;
      }
      const defaultExpected = Object.hasOwn(definition, "default");
      const defaultMatches = !defaultExpected || (
        definition.default === null
          ? actualColumn.default === null
          : typeof definition.default === "string" && typeof actualColumn.default === "string" && definitionsEqual(definition.default, actualColumn.default)
      );
      if (
        (definition.type !== undefined && (actualColumn.type === undefined || !definitionsEqual(definition.type, actualColumn.type))) ||
        (definition.nullable !== undefined && definition.nullable !== actualColumn.nullable) ||
        !defaultMatches
      ) {
        issues.push({ code: "definition_mismatch", category: "column", object: `${tableName}.${columnName}` });
      }
    }
  }

  for (const [tableName, requiredColumns] of Object.entries(expected.primaryKeys ?? {})) {
    const actualColumns = actual.primaryKeys[tableName];
    if (!actualColumns) {
      issues.push({ code: "missing", category: "table", object: `${tableName}.PRIMARY KEY` });
    } else if (actualColumns.length !== requiredColumns.length || actualColumns.some((column, position) => column !== requiredColumns[position])) {
      issues.push({ code: "definition_mismatch", category: "table", object: `${tableName}.PRIMARY KEY` });
    }
  }

  const verifyDefinitions = (
    category: "constraint" | "index" | "foreign_key",
    required: Record<string, string> | undefined,
    found: Record<string, CatalogDefinition>,
  ) => {
    for (const [name, definition] of Object.entries(required ?? {})) {
      const object = found[name];
      if (!object) {
        issues.push({ code: "missing", category, object: name });
      } else if (!definitionsEqual(object.definition, definition)) {
        issues.push({ code: "definition_mismatch", category, object: name });
      }
      if (object && category === "index" && object.valid !== true) {
        issues.push({ code: "not_validated", category, object: name });
      } else if (object && category !== "index" && object.validated !== true) {
        issues.push({ code: "not_validated", category, object: name });
      }
    }
  };

  verifyDefinitions("constraint", expected.constraints, actual.constraints);
  verifyDefinitions("index", expected.indexes, actual.indexes);
  verifyDefinitions("foreign_key", expected.foreignKeys, actual.foreignKeys);

  for (const required of expected.constraintSignatures ?? []) {
    // Constraint candidates are grouped by relation and referenced-column set.
    // More than one check for that identity may impose conflicting semantics,
    // so require exactly one candidate and fail closed on ambiguity.
    const requiredColumns = [...required.columns].sort();
    const candidates = Object.values(actual.constraints).filter((constraint) =>
      constraint.table === required.table &&
      constraint.columns?.length === required.columns.length &&
      [...constraint.columns].sort().every((column, position) => column === requiredColumns[position]),
    );
    if (candidates.length > 1) {
      issues.push({ code: "ambiguous", category: "constraint", object: required.name });
      continue;
    }
    const candidate = candidates[0];
    if (!candidate) {
      issues.push({ code: "missing", category: "constraint", object: required.name });
      continue;
    }
    if (!definitionsEqual(candidate.definition, required.definition)) {
      issues.push({ code: "definition_mismatch", category: "constraint", object: required.name });
    }
    if (candidate.validated !== true) {
      issues.push({ code: "not_validated", category: "constraint", object: required.name });
    }
  }

  for (const required of expected.indexSignatures ?? []) {
    // A key is identified by its table and key-column set. More than one
    // candidate is ambiguous; never let one good index hide a duplicate with
    // different ordering or other semantics.
    const requiredKeyColumns = required.columns.map((column) => column.name).sort();
    const candidates = Object.values(actual.indexes).filter((index) =>
      index.table === required.table &&
      index.columns.length === required.columns.length &&
      index.columns.map((column) => column.name).sort().every((column, position) => column === requiredKeyColumns[position]),
    );
    const objectName = `${required.table}(${required.columns.map((column) => column.name).join(",")})${required.unique ? " unique" : ""}`;
    if (candidates.length > 1) {
      issues.push({ code: "ambiguous", category: "index", object: objectName });
      continue;
    }
    const candidate = candidates[0];
    if (!candidate) {
      issues.push({ code: "missing", category: "index", object: objectName });
      continue;
    }

    const signatureMatches = candidate.unique === required.unique &&
      candidate.method === required.method &&
      candidate.columns.every((column, position) => {
        const expectedColumn = required.columns[position];
        return column.direction === expectedColumn.direction &&
          column.nulls === expectedColumn.nulls &&
          column.collation === expectedColumn.collation &&
          column.operatorClass === expectedColumn.operatorClass;
      }) &&
      candidate.includeColumns.length === required.includeColumns.length &&
      candidate.includeColumns.every((column, position) => column === required.includeColumns[position]) &&
      ((candidate.predicate === null && required.predicate === null) ||
        (candidate.predicate !== null && required.predicate !== null && definitionsEqual(candidate.predicate, required.predicate)));
    if (!signatureMatches) {
      issues.push({ code: "definition_mismatch", category: "index", object: objectName });
    }
    if (candidate.valid !== true) {
      issues.push({ code: "not_validated", category: "index", object: objectName });
    }
    if (!signatureMatches || candidate.valid !== true) {
      continue;
    }
  }

  for (const required of expected.foreignKeySignatures ?? []) {
    // Foreign keys sharing a source table and source-column set are competing
    // candidates. Reject ambiguity rather than accepting the first match.
    const requiredSourceColumns = [...required.columns].sort();
    const candidates = Object.values(actual.foreignKeys).filter((foreignKey) =>
      foreignKey.table === required.table &&
      foreignKey.columns.length === required.columns.length &&
      [...foreignKey.columns].sort().every((column, position) => column === requiredSourceColumns[position]),
    );
    const objectName = `${required.table}(${required.columns.join(",")}) -> ${required.referencedTable}(${required.referencedColumns.join(",")}) ON DELETE ${required.onDelete} ON UPDATE ${required.onUpdate}`;
    if (candidates.length > 1) {
      issues.push({ code: "ambiguous", category: "foreign_key", object: objectName });
      continue;
    }
    const candidate = candidates[0];
    if (!candidate) {
      issues.push({ code: "missing", category: "foreign_key", object: objectName });
      continue;
    }
    const signatureMatches = candidate.referencedTable === required.referencedTable &&
      candidate.onDelete === required.onDelete &&
      candidate.onUpdate === required.onUpdate &&
      candidate.referencedColumns.length === required.referencedColumns.length &&
      candidate.referencedColumns.every((column, position) => column === required.referencedColumns[position]);
    if (!signatureMatches) {
      issues.push({ code: "definition_mismatch", category: "foreign_key", object: objectName });
    }
    if (candidate.validated !== true) {
      issues.push({ code: "not_validated", category: "foreign_key", object: objectName });
    }
    if (!signatureMatches || candidate.validated !== true) {
      continue;
    }
  }

  return issues;
}
