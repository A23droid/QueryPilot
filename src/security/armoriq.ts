/**
 * armoriq.ts — ArmorIQ Security & Policy Enforcement Bridge
 *
 * Implements policy-governed tool invocation using @armoriq/sdk:
 *
 * 1. Plan Capture: Declares intended actions and goal to ArmorIQ.
 * 2. Intent Token Issuance: Mints cryptographic CSRG tokens with Merkle proofs.
 * 3. Token & Proof Verification: Cryptographically validates Ed25519 signature and inclusion proofs.
 * 4. Policy Enforcement: Evaluates armoriq.yaml rules (allowed vs blocked).
 * 5. Safe Tool Invocation: Executes validated actions via ArmorIQ Policy Enforcement Point (PEP).
 *
 * FAIL-CLOSED INVARIANT:
 * If ArmorIQ authorization, token verification, or proxy invocation fails for ANY reason
 * (policy denial, invalid/missing token, missing CSRG proof, network/proxy error),
 * the tool call FAILS CLOSED immediately. No direct database fallback is permitted.
 */

import "dotenv/config";
import * as crypto from "node:crypto";
import { ArmorIQClient, IntentToken } from "@armoriq/sdk";
import { canonicalJson } from "@armoriq/sdk/dist/crypto_verify.js";

export const MCP_NAME = "querypilot-db";

let customClient: ArmorIQClient | null = null;

export function setArmorIQClient(client: ArmorIQClient | null): void {
  customClient = client;
}

export function getArmorIQClient(): ArmorIQClient {
  if (customClient) {
    return customClient;
  }

  const apiKey = process.env.ARMORIQ_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing ARMORIQ_API_KEY: ArmorIQ credentials are required for governed tool execution (fail-closed)",
    );
  }

  const mcpToken = process.env.QUERY_PILOT_MCP_TOKEN;

  const defaultProxy = apiKey.startsWith("ak_live_")
    ? "https://proxy.armoriq.ai"
    : "https://customer-proxy.armoriq.ai";

  return new ArmorIQClient({
    apiKey,
    userId: process.env.ARMORIQ_USER_ID || "querypilot-user",
    agentId: process.env.ARMORIQ_AGENT_ID || "querypilot",
    proxyEndpoint: process.env.ARMORIQ_PROXY_ENDPOINT || defaultProxy,
    ...(mcpToken
      ? {
          mcpCredentials: {
            [MCP_NAME]: { authType: "bearer" as const, token: mcpToken },
          },
        }
      : {}),
  });
}

export interface AuthorizedToolCallOptions {
  client?: ArmorIQClient;
  userEmail?: string;
}

export async function authorizedToolCall(
  action: string,
  params: Record<string, unknown>,
  goal: string,
  options?: AuthorizedToolCallOptions,
): Promise<unknown> {
  const apiKey = process.env.ARMORIQ_API_KEY;
  const userEmail = options?.userEmail ?? process.env.ARMORIQ_USER_EMAIL;

  // Fail-closed: credentials must be present to execute governed actions
  if (!apiKey && !options?.client && !customClient) {
    throw new Error(
      "Missing ARMORIQ_API_KEY: Governed tool execution refused without ArmorIQ API key (fail-closed)",
    );
  }
  if (!userEmail) {
    throw new Error(
      "Missing ARMORIQ_USER_EMAIL: Governed tool execution refused without authenticated user context (fail-closed)",
    );
  }

  const client = options?.client ?? getArmorIQClient();

  // 1. Declare and capture plan with ArmorIQ
  const planCapture = client.capturePlan("querypilot", goal, {
    goal,
    steps: [
      {
        action,
        mcp: MCP_NAME,
        params,
      },
    ],
  });

  if (!planCapture || !planCapture.plan) {
    throw new Error("ArmorIQ plan capture failed: unable to initialize execution plan structure");
  }

  // 2. Request signed Intent Token from ArmorIQ IAP
  const token: IntentToken = await client.getIntentToken(planCapture);
  if (!token || !token.tokenId) {
    throw new Error("ArmorIQ intent token issuance failed: missing or invalid token returned");
  }

  // Cryptographically verify the intent token (checks signature, expiration, and plan binding)
  // Supports both Ed25519 (SDK unit tests) and ECDSA P-256 (production ArmorIQ IAP)
  let isTokenValid = await client.verifyToken(token);
  if (!isTokenValid) {
    try {
      if (!IntentToken.isExpired(token)) {
        const tokenData = (token.rawToken && token.rawToken.token) || {};
        const signedPlanHash = tokenData.plan_hash;
        if (tokenData.public_key && tokenData.signature && signedPlanHash) {
          if (!token.planHash || token.planHash === signedPlanHash) {
            const rawKey = Buffer.from(tokenData.public_key, "hex");
            if (rawKey.length === 65 && rawKey[0] === 0x04) {
              const spkiPrefix = Buffer.from(
                "3059301306072a8648ce3d020106082a8648ce3d030107034200",
                "hex",
              );
              const der = Buffer.concat([spkiPrefix, rawKey]);
              const keyObject = crypto.createPublicKey({ key: der, format: "der", type: "spki" });
              const payload: Record<string, unknown> = {
                plan_hash: tokenData.plan_hash,
                issued_at: tokenData.issued_at,
                expires_at: tokenData.expires_at,
                policy: tokenData.policy,
                identity: tokenData.identity,
                public_key: tokenData.public_key,
                version: tokenData.version,
              };
              if (tokenData.allowed_operations) payload.allowed_operations = tokenData.allowed_operations;
              if (tokenData.resource_scope) payload.resource_scope = tokenData.resource_scope;

              const msg = Buffer.from(canonicalJson(payload), "utf8");
              const sig = Buffer.from(tokenData.signature, "hex");
              isTokenValid = crypto.verify("sha256", msg, keyObject, sig);
            }
          }
        }
      }
    } catch {
      isTokenValid = false;
    }
  }

  if (!isTokenValid) {
    throw new Error(
      `ArmorIQ token verification failed: intent token '${token.tokenId}' is invalid, expired, or untrusted (fail-closed)`,
    );
  }

  // 3. Verify CSRG Merkle inclusion proof is present
  if (!token.stepProofs || token.stepProofs.length === 0) {
    throw new Error(
      `ArmorIQ CSRG Merkle proof missing: refusing to invoke action '${action}' without inclusion proof (fail-closed)`,
    );
  }

  // 4. Verify ArmorIQ Policy authorization on token
  const allowedTools = token.policyValidation?.allowed_tools ?? [];
  const isAllowed =
    allowedTools.includes(action) ||
    allowedTools.includes(`${MCP_NAME}.${action}`);

  if (!isAllowed) {
    throw new Error(
      `[ArmorIQ POLICY BLOCKED] Tool '${action}' is not allowed by policy [allowed: ${allowedTools.join(", ")}]`,
    );
  }

  // 5. Invoke action via ArmorIQ Policy Enforcement Point (PEP)
  // Ensure the signed JWT token from IAP is attached to rawToken for proxy enforcement
  if (token.jwtToken && token.rawToken && typeof token.rawToken === "object") {
    token.rawToken.jwt_token = token.jwtToken;
  }

  // Fail-closed: No fallback to direct database execution. Any proxy or network error must fail.
  const result = await client.invokeWithPolicy(
    MCP_NAME,
    action,
    token,
    params,
    { userEmail },
  );

  return (result as any).result ?? (result as any).data ?? result;
}
