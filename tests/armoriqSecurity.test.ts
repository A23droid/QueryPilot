import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as crypto from "node:crypto";
import {
  authorizedToolCall,
  setArmorIQClient,
  getArmorIQClient,
  MCP_NAME,
} from "../src/security/armoriq.js";
import { explainQueryAuthorized } from "../src/db/explainAuthorized.js";
import * as explainDb from "../src/db/explain.js";
import {
  ArmorIQClient,
  PolicyBlockedException,
  MCPInvocationException,
  InvalidTokenException,
  type IntentToken,
} from "@armoriq/sdk";
// @ts-expect-error - internal SDK crypto helper for verification tests
import { canonicalJson } from "@armoriq/sdk/dist/crypto_verify.js";

// Spy on direct database execution to guarantee fail-closed behavior
vi.spyOn(explainDb, "explainQuery").mockImplementation(async () => {
  return {
    "Node Type": "Seq Scan",
    "Relation Name": "users",
    "Total Cost": 42.0,
  } as any;
});

describe("ArmorIQ Security Governance & Fail-Closed Invariants", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      ARMORIQ_API_KEY: "ak_test_secret_key_12345",
      ARMORIQ_USER_EMAIL: "auditor@querypilot.dev",
      QUERY_PILOT_MCP_TOKEN: "test-mcp-secret-token",
    };
  });

  afterEach(() => {
    setArmorIQClient(null);
    process.env = originalEnv;
  });

  const createMockToken = (overrides?: Partial<IntentToken>): IntentToken => ({
    tokenId: "csrg_token_valid_123",
    planHash: "hash_plan_abc123",
    signature: "sig_ed25519_valid",
    issuedAt: Date.now() / 1000,
    expiresAt: Date.now() / 1000 + 300,
    stepProofs: [[{ path: "/steps/[0]/action", hash: "proof_leaf_123" }]],
    policyValidation: {
      allowed_tools: ["explain_query", `${MCP_NAME}.explain_query`],
    },
    rawToken: {
      plan: {
        steps: [{ action: "explain_query", mcp: MCP_NAME, params: { sql: "SELECT 1;" } }],
      },
      token: {
        plan_hash: "hash_plan_abc123",
        public_key: "pubkey_hex",
        signature: "sig_hex",
      },
    },
    ...overrides,
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Part A: Governance Layer Tests (Mocked Client Responses)
  //
  // Purpose: Tests QueryPilot's bridge logic in src/security/armoriq.ts to
  // prove that EVERY failure path (denial, network error, missing token, etc.)
  // fails closed and NEVER falls back to explainQuery().
  // ──────────────────────────────────────────────────────────────────────────

  describe("Part A: Governance Logic & Fail-Closed Guardrails (Unit Mocked)", () => {
    describe("1. Allowed Execution Path", () => {
      it("successfully executes explain_query through ArmorIQ proxy when authorized", async () => {
        const mockResult = {
          result: {
            "Node Type": "Index Scan",
            "Relation Name": "users",
            "Total Cost": 4.12,
          },
        };

        const mockClient = {
          capturePlan: vi.fn().mockReturnValue({
            llm: "querypilot",
            prompt: "Analyze query",
            plan: { steps: [{ action: "explain_query", mcp: MCP_NAME, params: { sql: "SELECT 1;" } }] },
          }),
          getIntentToken: vi.fn().mockResolvedValue(createMockToken()),
          verifyToken: vi.fn().mockResolvedValue(true),
          invokeWithPolicy: vi.fn().mockResolvedValue(mockResult),
        } as unknown as ArmorIQClient;

        setArmorIQClient(mockClient);

        const result = await authorizedToolCall(
          "explain_query",
          { sql: "SELECT 1;" },
          "Inspect execution plan for query",
        );

        expect(result).toEqual(mockResult.result);
        expect(mockClient.capturePlan).toHaveBeenCalledWith(
          "querypilot",
          "Inspect execution plan for query",
          expect.objectContaining({
            steps: [{ action: "explain_query", mcp: MCP_NAME, params: { sql: "SELECT 1;" } }],
          }),
        );
        expect(mockClient.getIntentToken).toHaveBeenCalled();
        expect(mockClient.verifyToken).toHaveBeenCalled();
        expect(mockClient.invokeWithPolicy).toHaveBeenCalledWith(
          MCP_NAME,
          "explain_query",
          expect.any(Object),
          { sql: "SELECT 1;" },
          { userEmail: "auditor@querypilot.dev" },
        );

        // Crucial: Direct local database function was NEVER invoked!
        expect(explainDb.explainQuery).not.toHaveBeenCalled();
      });
    });

    describe("2. ArmorIQ Proxy PEP Enforcement (Remote Policy Block)", () => {
      it("distinguishes remote proxy PEP enforcement: fails closed when proxy throws PolicyBlockedException", async () => {
        const mockClient = {
          capturePlan: vi.fn().mockReturnValue({ plan: { steps: [{ action: "explain_query" }] } }),
          getIntentToken: vi.fn().mockResolvedValue(createMockToken()),
          verifyToken: vi.fn().mockResolvedValue(true),
          invokeWithPolicy: vi.fn().mockRejectedValue(
            new PolicyBlockedException(
              "Action blocked by ArmorIQ organization policy at PEP proxy",
              "block",
              "Policy denied action",
              {},
              "rule-db-readonly",
            ),
          ),
        } as unknown as ArmorIQClient;

        setArmorIQClient(mockClient);

        await expect(
          authorizedToolCall("explain_query", { sql: "SELECT 1;" }, "Inspect execution plan"),
        ).rejects.toThrow(PolicyBlockedException);

        // Verify that direct database fallback was NOT triggered
        expect(explainDb.explainQuery).not.toHaveBeenCalled();
      });
    });

    describe("3. Local Pre-Flight Policy Validation", () => {
      it("distinguishes local pre-flight policy denial: blocks disallowed actions (apply_index) before proxy call", async () => {
        // Token policy only allows explain_query, not apply_index
        const mockToken = createMockToken({
          policyValidation: {
            allowed_tools: ["explain_query"],
          },
        });

        const mockClient = {
          capturePlan: vi.fn().mockReturnValue({ plan: { steps: [{ action: "apply_index" }] } }),
          getIntentToken: vi.fn().mockResolvedValue(mockToken),
          verifyToken: vi.fn().mockResolvedValue(true),
          invokeWithPolicy: vi.fn(),
        } as unknown as ArmorIQClient;

        setArmorIQClient(mockClient);

        await expect(
          authorizedToolCall(
            "apply_index",
            { sql: "CREATE INDEX idx_test ON users(email);" },
            "Remediate slow query by adding index",
          ),
        ).rejects.toThrow(/\[ArmorIQ POLICY BLOCKED\] Tool 'apply_index' is not allowed by policy/);

        // Verify local pre-flight stopped it: proxy was never called, database was never called
        expect(mockClient.invokeWithPolicy).not.toHaveBeenCalled();
        expect(explainDb.explainQuery).not.toHaveBeenCalled();
      });
    });

    describe("4. Intent Token Validation Failures", () => {
      it("fails closed when intent token issuance fails or returns null", async () => {
        const mockClient = {
          capturePlan: vi.fn().mockReturnValue({ plan: { steps: [{ action: "explain_query" }] } }),
          getIntentToken: vi.fn().mockRejectedValue(new InvalidTokenException("Failed to mint intent token")),
          verifyToken: vi.fn(),
          invokeWithPolicy: vi.fn(),
        } as unknown as ArmorIQClient;

        setArmorIQClient(mockClient);

        await expect(
          authorizedToolCall("explain_query", { sql: "SELECT 1;" }, "Inspect plan"),
        ).rejects.toThrow(InvalidTokenException);

        expect(mockClient.invokeWithPolicy).not.toHaveBeenCalled();
        expect(explainDb.explainQuery).not.toHaveBeenCalled();
      });

      it("fails closed when intent token cryptographic verification fails (expired or tampered)", async () => {
        const mockClient = {
          capturePlan: vi.fn().mockReturnValue({ plan: { steps: [{ action: "explain_query" }] } }),
          getIntentToken: vi.fn().mockResolvedValue(createMockToken()),
          verifyToken: vi.fn().mockResolvedValue(false), // Signature verification fails
          invokeWithPolicy: vi.fn(),
        } as unknown as ArmorIQClient;

        setArmorIQClient(mockClient);

        await expect(
          authorizedToolCall("explain_query", { sql: "SELECT 1;" }, "Inspect plan"),
        ).rejects.toThrow(/ArmorIQ token verification failed/);

        expect(mockClient.invokeWithPolicy).not.toHaveBeenCalled();
        expect(explainDb.explainQuery).not.toHaveBeenCalled();
      });
    });

    describe("5. Missing CSRG Merkle Proof", () => {
      it("fails closed when token is missing CSRG Merkle inclusion proofs", async () => {
        const mockToken = createMockToken({
          stepProofs: [],
        });

        const mockClient = {
          capturePlan: vi.fn().mockReturnValue({ plan: { steps: [{ action: "explain_query" }] } }),
          getIntentToken: vi.fn().mockResolvedValue(mockToken),
          verifyToken: vi.fn().mockResolvedValue(true),
          invokeWithPolicy: vi.fn(),
        } as unknown as ArmorIQClient;

        setArmorIQClient(mockClient);

        await expect(
          authorizedToolCall("explain_query", { sql: "SELECT 1;" }, "Inspect plan"),
        ).rejects.toThrow(/ArmorIQ CSRG Merkle proof missing/);

        expect(mockClient.invokeWithPolicy).not.toHaveBeenCalled();
        expect(explainDb.explainQuery).not.toHaveBeenCalled();
      });
    });

    describe("6. Network & Proxy Failures (Regression: No Fail-Open Fallback)", () => {
      it("fails closed on network timeout or connection refused without falling back to explainQuery", async () => {
        const mockClient = {
          capturePlan: vi.fn().mockReturnValue({ plan: { steps: [{ action: "explain_query" }] } }),
          getIntentToken: vi.fn().mockResolvedValue(createMockToken()),
          verifyToken: vi.fn().mockResolvedValue(true),
          invokeWithPolicy: vi.fn().mockRejectedValue(
            new MCPInvocationException("MCP invocation failed: connect ECONNREFUSED 127.0.0.1:3001", MCP_NAME, "explain_query"),
          ),
        } as unknown as ArmorIQClient;

        setArmorIQClient(mockClient);

        await expect(
          authorizedToolCall("explain_query", { sql: "SELECT 1;" }, "Inspect plan"),
        ).rejects.toThrow(/connect ECONNREFUSED/);

        // CRITICAL ASSERTION: The old bug executed explainQuery(params.sql) here!
        // Verify that direct database fallback is ELIMINATED:
        expect(explainDb.explainQuery).not.toHaveBeenCalled();
      });

      it("fails closed on HTTP 502 Bad Gateway from proxy without calling direct database function", async () => {
        const mockClient = {
          capturePlan: vi.fn().mockReturnValue({ plan: { steps: [{ action: "explain_query" }] } }),
          getIntentToken: vi.fn().mockResolvedValue(createMockToken()),
          verifyToken: vi.fn().mockResolvedValue(true),
          invokeWithPolicy: vi.fn().mockRejectedValue(
            new MCPInvocationException("MCP invocation failed: HTTP 502 Bad Gateway", MCP_NAME, "explain_query", 502),
          ),
        } as unknown as ArmorIQClient;

        setArmorIQClient(mockClient);

        await expect(
          authorizedToolCall("explain_query", { sql: "SELECT 1;" }, "Inspect plan"),
        ).rejects.toThrow(/HTTP 502 Bad Gateway/);

        expect(explainDb.explainQuery).not.toHaveBeenCalled();
      });
    });

    describe("7. Missing Credentials Guard", () => {
      it("fails closed when ARMORIQ_API_KEY is missing", async () => {
        delete process.env.ARMORIQ_API_KEY;

        await expect(
          authorizedToolCall("explain_query", { sql: "SELECT 1;" }, "Inspect plan"),
        ).rejects.toThrow(/Missing ARMORIQ_API_KEY/);

        expect(explainDb.explainQuery).not.toHaveBeenCalled();
      });

      it("fails closed when ARMORIQ_USER_EMAIL is missing", async () => {
        delete process.env.ARMORIQ_USER_EMAIL;

        await expect(
          authorizedToolCall("explain_query", { sql: "SELECT 1;" }, "Inspect plan"),
        ).rejects.toThrow(/Missing ARMORIQ_USER_EMAIL/);

        expect(explainDb.explainQuery).not.toHaveBeenCalled();
      });
    });

    describe("8. explainQueryAuthorized Invariant", () => {
      it("propagates ArmorIQ failure and never executes database query when useArmorIQ: true", async () => {
        const mockClient = {
          capturePlan: vi.fn().mockReturnValue({ plan: { steps: [{ action: "explain_query" }] } }),
          getIntentToken: vi.fn().mockResolvedValue(createMockToken()),
          verifyToken: vi.fn().mockResolvedValue(true),
          invokeWithPolicy: vi.fn().mockRejectedValue(new Error("ArmorIQ PEP unreachable")),
        } as unknown as ArmorIQClient;

        setArmorIQClient(mockClient);

        await expect(
          explainQueryAuthorized("SELECT 1;", { useArmorIQ: true }),
        ).rejects.toThrow("ArmorIQ PEP unreachable");

        expect(explainDb.explainQuery).not.toHaveBeenCalled();
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Part B: Real SDK Enforcement & Cryptography (Unmocked SDK Code)
  //
  // Purpose: Exercises real code inside @armoriq/sdk without mocks to verify:
  // 1. Real Ed25519 cryptographic token verification & plan tamper detection.
  // 2. Real credential resolution & base64 X-Armoriq-MCP-Auth encoding.
  // 3. getArmorIQClient configuration semantics (avoiding proxyEndpoints bug).
  // ──────────────────────────────────────────────────────────────────────────

  describe("Part B: Real SDK Cryptographic & Auth Enforcement (Unmocked)", () => {
    it("real SDK verifyToken verifies authentic Ed25519 token signatures", async () => {
      const realClient = new ArmorIQClient({ apiKey: "ak_test_real_key_12345" });
      const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
      const rawPub = publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");

      const planHash = "valid_plan_hash_abcdef";
      const payload: Record<string, any> = {
        plan_hash: planHash,
        issued_at: Date.now() / 1000,
        expires_at: Date.now() / 1000 + 300,
        policy: {},
        identity: "querypilot",
        public_key: rawPub,
        version: "1.0",
      };

      const canonical = canonicalJson(payload);
      const signature = crypto.sign(null, Buffer.from(canonical, "utf8"), privateKey).toString("hex");
      payload.signature = signature;

      const authenticToken: IntentToken = {
        tokenId: "token_real_ed25519_123",
        planHash: planHash,
        issuedAt: payload.issued_at,
        expiresAt: payload.expires_at,
        rawToken: { token: payload },
      };

      // Real SDK cryptographic verification returns true for authentic signature
      const isValid = await realClient.verifyToken(authenticToken);
      expect(isValid).toBe(true);

      // Real SDK cryptographic verification returns false when planHash is tampered with
      authenticToken.planHash = "tampered_plan_hash_000000";
      const isTamperedValid = await realClient.verifyToken(authenticToken);
      expect(isTamperedValid).toBe(false);
    });

    it("real SDK correctly encodes MCP bearer credentials into X-Armoriq-MCP-Auth header", () => {
      const cred = { authType: "bearer" as const, token: "secret-mcp-bearer-token-xyz" };
      const encodedHeader = ArmorIQClient.encodeMcpAuthHeader(cred);

      // Verify the header is a valid base64 representation of JSON credential
      expect(typeof encodedHeader).toBe("string");
      const decodedJson = JSON.parse(Buffer.from(encodedHeader, "base64").toString("utf-8"));
      expect(decodedJson).toEqual({
        authType: "bearer",
        token: "secret-mcp-bearer-token-xyz",
      });
    });

    it("getArmorIQClient configures proxyEndpoint and mcpCredentials without proxyEndpoints destination pollution", () => {
      process.env.ARMORIQ_API_KEY = "ak_test_valid_key";
      process.env.QUERY_PILOT_MCP_TOKEN = "mcp-token-for-proxy-forwarding";

      const client = getArmorIQClient();

      // Verify that default proxyEndpoint is customer-proxy.armoriq.ai
      expect(client.proxyEndpoint).toBe("https://customer-proxy.armoriq.ai");

      // Verify client internals have mcpCredentials for querypilot-db
      const internals = client as any;
      expect(internals.mcpCredentials?.[MCP_NAME]).toEqual({
        authType: "bearer",
        token: "mcp-token-for-proxy-forwarding",
      });

      // Verify proxyEndpoints does NOT have MCP server URL (which causes the /mcp/invoke routing bug)
      expect(internals.proxyEndpoints?.[MCP_NAME]).toBeUndefined();
    });

    it("getArmorIQClient uses https://proxy.armoriq.ai as default proxy for ak_live_ credentials", () => {
      process.env.ARMORIQ_API_KEY = "ak_live_test_key";
      const client = getArmorIQClient();
      expect(client.proxyEndpoint).toBe("https://proxy.armoriq.ai");
    });
  });
});
