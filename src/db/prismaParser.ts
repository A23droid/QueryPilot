/**
 * prismaParser.ts
 *
 * Parses Prisma schema (.prisma) files and extracts model definitions.
 * This lets QueryPilot understand Prisma models and map them to SQL
 * for EXPLAIN analysis when a developer changes a Prisma-based query.
 *
 * Teaching note:
 *   Prisma schemas use a HCL-like syntax with `model`, `field`, and
 *   attribute blocks. We do a lightweight regex-based parse here — good
 *   enough for extracting table names, column names, types, and relations
 *   without pulling in a full Prisma dependency.
 *
 *   Example schema:
 *     model User {
 *       id    Int     @id @default(autoincrement())
 *       email String  @unique
 *       name  String?
 *       posts Post[]
 *     }
 *
 *   Parses into:
 *     {
 *       name: "User",
 *       fields: [
 *         { name: "id", type: "Int", attributes: ["@id", "@default(autoincrement())"] },
 *         { name: "email", type: "String", attributes: ["@unique"] },
 *         { name: "name", type: "String", attributes: [], isOptional: true },
 *       ],
 *       relations: [
 *         { field: "posts", type: "Post[]", kind: "has-many" },
 *       ],
 *     }
 */

import { readFile } from "node:fs/promises";

// ── types ──────────────────────────────────────────────────────────────────

export interface PrismaField {
  name: string;
  type: string;              // e.g. "Int", "String", "User", "Post[]"
  attributes: string[];      // e.g. ["@id", "@unique", "@default(...)"]
  isOptional: boolean;       // true if field type ends with "?"
  isList: boolean;           // true if field type ends with "[]"
  baseType: string;          // type without "?" or "[]"
}

export interface PrismaRelation {
  field: string;
  targetModel: string;
  kind: "has-one" | "has-many" | "belongs-to";
}

export interface PrismaModel {
  name: string;
  fields: PrismaField[];
  relations: PrismaRelation[];
  attributes: string[];      // model-level attributes like @@id, @@unique
}

export interface PrismaDatasource {
  provider?: string;
  url?: string;
}

export interface PrismaGenerator {
  provider?: string;
}

export interface PrismaSchema {
  models: PrismaModel[];
  datasource?: PrismaDatasource;
  generator?: PrismaGenerator;
}

// ── parsing helpers ────────────────────────────────────────────────────────

function stripComments(schema: string): string {
  return schema.replace(/--[^\r\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

function extractFieldAttributes(rest: string): string[] {
  const attrs: string[] = [];
  const attrRegex = /@(\w+)(?:\(([^)]*)\))?/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(rest)) !== null) {
    if (match[2] !== undefined) {
      attrs.push(`@${match[1]}(${match[2]})`);
    } else {
      attrs.push(`@${match[1]}`);
    }
  }
  return attrs;
}

function parseModelBlock(block: string): PrismaModel | null {
  const modelMatch = block.match(/model\s+(\w+)\s*\{/);
  if (!modelMatch) return null;

  const name = modelMatch[1]!;
  const start = block.indexOf("{");
  const end = block.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const inner = block.slice(start + 1, end);

  const fields: PrismaField[] = [];
  const relations: PrismaRelation[] = [];
  const attributes: string[] = [];

  const lines = inner.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//")) continue;

    // Model-level attribute: @@attribute or @@attribute(args)
    if (trimmed.startsWith("@@")) {
      attributes.push(...extractFieldAttributes(trimmed));
      continue;
    }

    // Field line: name Type @attr1 @attr2(...)
    const fieldMatch = trimmed.match(/^(\w+)\s+([\w\[\]?]+)\s*(.*)$/);
    if (!fieldMatch) continue;

    const fieldName = fieldMatch[1]!;
    const fieldTypeRaw = fieldMatch[2]!;
    const rest = fieldMatch[3] ?? "";

    const field: PrismaField = {
      name: fieldName,
      type: fieldTypeRaw,
      attributes: extractFieldAttributes(rest),
      isOptional: fieldTypeRaw.endsWith("?"),
      isList: fieldTypeRaw.endsWith("[]"),
      baseType: fieldTypeRaw.replace(/[?\[\]]/g, ""),
    };
    fields.push(field);

    // Detect relations: if the field type matches another model name, or
    // it has a @relation attribute
    const relationAttr = field.attributes.find((a) => a.startsWith("@relation"));
    if (relationAttr) {
      const relMatch = relationAttr.match(/@relation\(.*fields: \[(\w+)\].*references: \[(\w+)\]/);
      if (relMatch) {
        relations.push({
          field: relMatch[1]!,
          targetModel: field.baseType,
          kind: "belongs-to",
        });
      } else if (field.isList) {
        relations.push({
          field: fieldName,
          targetModel: field.baseType,
          kind: "has-many",
        });
      } else {
        relations.push({
          field: fieldName,
          targetModel: field.baseType,
          kind: "has-one",
        });
      }
    } else if (field.isList) {
      // A list field like `posts Post[]` implies a has-many relation
      relations.push({
        field: fieldName,
        targetModel: field.baseType,
        kind: "has-many",
      });
    }
  }

  return { name, fields, relations, attributes };
}

function parseDatasource(schema: string): PrismaDatasource | undefined {
  const match = schema.match(
    /datasource\s+\w+\s*\{([\s\S]*?)\}/,
  );
  if (!match) return undefined;

  const inner = match[1]!;
  const provider = inner.match(/provider\s*=\s*"([^"]+)"/)?.[1];
  const url = inner.match(/url\s*=\s*(?:env\("[^"]+"\)|"([^"]+)")/)?.[1];

  const result: PrismaDatasource = {};
  if (provider !== undefined) result.provider = provider;
  if (url !== undefined) result.url = url;
  return result;
}

function parseGenerator(schema: string): PrismaGenerator | undefined {
  const match = schema.match(
    /generator\s+\w+\s*\{([\s\S]*?)\}/,
  );
  if (!match) return undefined;

  const inner = match[1]!;
  const provider = inner.match(/provider\s*=\s*"([^"]+)"/)?.[1];

  const result: PrismaGenerator = {};
  if (provider !== undefined) result.provider = provider;
  return result;
}

// ── public API ─────────────────────────────────────────────────────────────

/**
 * Parse a Prisma schema string into a structured object.
 */
export function parsePrismaSchema(schema: string): PrismaSchema {
  const cleaned = stripComments(schema);

  // Extract model blocks
  const modelBlocks: string[] = [];
  const modelRegex = /model\s+\w+\s*\{[\s\S]*?\}/g;
  let match: RegExpExecArray | null;
  while ((match = modelRegex.exec(cleaned)) !== null) {
    modelBlocks.push(match[0]);
  }

  const models: PrismaModel[] = [];
  for (const block of modelBlocks) {
    const model = parseModelBlock(block);
    if (model) models.push(model);
  }

  const datasource = parseDatasource(cleaned);
  const generator = parseGenerator(cleaned);

  const result: PrismaSchema = { models };
  if (datasource !== undefined) result.datasource = datasource;
  if (generator !== undefined) result.generator = generator;
  return result;
}

/**
 * Read and parse a Prisma schema file from disk.
 */
export async function readPrismaSchema(filePath: string): Promise<PrismaSchema> {
  const content = await readFile(filePath, "utf8");
  return parsePrismaSchema(content);
}

/**
 * Convert a Prisma model to a CREATE TABLE statement (for seeding/testing).
 */
export function modelToSql(model: PrismaModel): string {
  const typeMap: Record<string, string> = {
    Int: "INTEGER",
    String: "TEXT",
    Boolean: "BOOLEAN",
    Float: "DOUBLE PRECISION",
    DateTime: "TIMESTAMPTZ",
    Json: "JSONB",
    Bytes: "BYTEA",
    BigInt: "BIGINT",
    Decimal: "DECIMAL",
  };

  const columns: string[] = [];
  let primaryKey: string | null = null;

  for (const field of model.fields) {
    const sqlType = typeMap[field.baseType] ?? "TEXT";
    const colParts: string[] = [`"${field.name}" ${sqlType}`];

    if (field.attributes.includes("@id")) {
      primaryKey = field.name;
      colParts.push("PRIMARY KEY");
    }
    if (field.attributes.includes("@default(autoincrement())")) {
      colParts.push("GENERATED ALWAYS AS IDENTITY");
    }
    if (field.attributes.includes("@unique")) {
      colParts.push("UNIQUE");
    }
    if (!field.isOptional && !field.attributes.includes("@id")) {
      colParts.push("NOT NULL");
    }

    columns.push(colParts.join(" "));
  }

  if (primaryKey) {
    columns.push(`PRIMARY KEY ("${primaryKey}")`);
  }

  return `CREATE TABLE IF NOT EXISTS "${model.name}" (\n  ${columns.join(",\n  ")}\n);`;
}

/**
 * Generate a SELECT * query for a Prisma model (used for EXPLAIN analysis).
 */
export function modelToSelectSql(model: PrismaModel): string {
  const columns = model.fields.map((f) => `"${f.name}"`).join(", ");
  return `SELECT ${columns} FROM "${model.name}" LIMIT 1;`;
}
