import { describe, it, expect } from "vitest";
import {
  parsePrismaSchema,
  modelToSql,
  modelToSelectSql,
} from "../src/db/prismaParser.js";

const sampleSchema = `
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String?
  posts     Post[]
  profile   Profile?
  createdAt DateTime @default(now())
}

model Post {
  id        Int      @id @default(autoincrement())
  title     String
  content   String?
  published Boolean  @default(false)
  authorId  Int
  author    User     @relation(fields: [authorId], references: [id])
}

model Profile {
  id     Int    @id @default(autoincrement())
  bio    String
  userId Int    @unique
  user   User   @relation(fields: [userId], references: [id])
}
`;

describe("parsePrismaSchema", () => {
  it("parses datasource and generator", () => {
    const result = parsePrismaSchema(sampleSchema);
    expect(result.datasource?.provider).toBe("postgresql");
    expect(result.generator?.provider).toBe("prisma-client-js");
  });

  it("extracts all models", () => {
    const result = parsePrismaSchema(sampleSchema);
    const modelNames = result.models.map((m) => m.name);
    expect(modelNames).toEqual(["User", "Post", "Profile"]);
  });

  it("parses model fields correctly with types and modifiers", () => {
    const result = parsePrismaSchema(sampleSchema);
    const userModel = result.models.find((m) => m.name === "User");
    expect(userModel).toBeDefined();

    const nameField = userModel?.fields.find((f) => f.name === "name");
    expect(nameField?.isOptional).toBe(true);
    expect(nameField?.baseType).toBe("String");

    const postsField = userModel?.fields.find((f) => f.name === "posts");
    expect(postsField?.isList).toBe(true);
    expect(postsField?.baseType).toBe("Post");

    const emailField = userModel?.fields.find((f) => f.name === "email");
    expect(emailField?.attributes).toContain("@unique");

    const idField = userModel?.fields.find((f) => f.name === "id");
    expect(idField?.attributes).toContain("@id");
    expect(idField?.attributes.some((a) => a.startsWith("@default"))).toBe(true);
  });

  it("detects relationships and their kinds", () => {
    const result = parsePrismaSchema(sampleSchema);
    const user = result.models.find((m) => m.name === "User");
    const post = result.models.find((m) => m.name === "Post");

    const userPostsRel = user?.relations.find((r) => r.field === "posts");
    expect(userPostsRel?.kind).toBe("has-many");
    expect(userPostsRel?.targetModel).toBe("Post");

    const postAuthorRel = post?.relations.find((r) => r.targetModel === "User");
    expect(postAuthorRel?.kind).toBe("belongs-to");
    expect(postAuthorRel?.field).toBe("authorId");
  });
});

describe("modelToSql", () => {
  it("generates valid CREATE TABLE SQL for a model", () => {
    const result = parsePrismaSchema(sampleSchema);
    const userModel = result.models.find((m) => m.name === "User")!;
    const sql = modelToSql(userModel);

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "User"');
    expect(sql).toContain('"id" INTEGER');
    expect(sql).toContain("GENERATED ALWAYS AS IDENTITY");
    expect(sql).toContain('"email" TEXT');
    expect(sql).toContain("UNIQUE");
    expect(sql).toContain('"name" TEXT');
  });
});

describe("modelToSelectSql", () => {
  it("generates SELECT query with all columns and LIMIT 1", () => {
    const result = parsePrismaSchema(sampleSchema);
    const postModel = result.models.find((m) => m.name === "Post")!;
    const sql = modelToSelectSql(postModel);

    expect(sql).toContain('SELECT "id", "title", "content", "published", "authorId", "author" FROM "Post" LIMIT 1;');
  });
});
