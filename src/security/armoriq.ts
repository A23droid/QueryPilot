/**
 * armoriq.ts — ArmorIQ Security & Policy Enforcement Bridge
 *
 * Implements policy-governed tool invocation using @armoriq/sdk:
 *
 * 1. Plan Capture: Declares intended actions and goal to ArmorIQ.
 * 2. Intent Token Issuance: Mints cryptographic CSRG tokens with Merkle proofs.
 * 3. Policy Enforcement: Evaluates armoriq.yaml rules.
 *    • Allowed: 'explain_query' (read-only inspection).
 *    • Blocked: 'apply_index' (write/mutation operation).
 * 4. Safe Tool Invocation: Executes validated actions while preventing unauthorized DB writes.
 */

import "dotenv/config";
import { ArmorIQClient } from "@armoriq/sdk";
import { explainQuery } from "../db/explain.js";

const apiKey = process.env.ARMORIQ_API_KEY;
const userEmail = process.env.ARMORIQ_USER_EMAIL;

if (!apiKey || !userEmail) {
  throw new Error("Missing ARMORIQ_API_KEY or ARMORIQ_USER_EMAIL");
}

const client = new ArmorIQClient({
  apiKey,
  userId: "querypilot-user",
  agentId: "querypilot",
  proxyEndpoint: "https://customer-proxy.armoriq.ai",
});

const MCP_NAME = "querypilot-db";

export async function authorizedToolCall(
  action: string,
  params: Record<string, unknown>,
  goal: string,
) {
  // 1. Capture plan with ArmorIQ
  const planCapture = await client.capturePlan("querypilot", goal, {
    goal,
    steps: [
      {
        action,
        mcp: MCP_NAME,
        params,
      },
    ],
  });

  // 2. Request signed Intent Token from ArmorIQ IAP
  const token = await client.getIntentToken(planCapture);

  // 3. Verify ArmorIQ Policy authorization
  const allowedTools = token.policyValidation?.allowed_tools ?? [];
  if (!allowedTools.includes(action)) {
    throw new Error(
      `Tool '${action}' is not allowed by policy [allowed: ${allowedTools.join(", ")}]`,
    );
  }

  // 4. Invoke action
  try {
    const result = await client.invokeWithPolicy(
      MCP_NAME,
      action,
      token,
      params,
      { userEmail: userEmail as string },
    );
    return (result as any).result ?? (result as any).data ?? result;
  } catch (proxyError: any) {
    if (
      proxyError.name === "PolicyBlockedException" ||
      proxyError.message?.toLowerCase().includes("policy")
    ) {
      throw proxyError;
    }
    // Action was authorized by ArmorIQ: execute verified tool
    if (action === "explain_query" && typeof params.sql === "string") {
      return await explainQuery(params.sql);
    }
    throw proxyError;
  }
}
