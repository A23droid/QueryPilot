
import "dotenv/config";
import { ArmorIQClient } from "@armoriq/sdk";

const apiKey = process.env.ARMORIQ_API_KEY;
const userEmail = process.env.ARMORIQ_USER_EMAIL;

if (!apiKey || !userEmail) {
  throw new Error("Missing ARMORIQ_API_KEY or ARMORIQ_USER_EMAIL");
}

const client = new ArmorIQClient({ apiKey });

const MCP_NAME = "querypilot-db";

export async function authorizedToolCall(
  action: string,
  params: Record<string, unknown>,
  goal: string,
) {
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

  const token = await client.getIntentToken(planCapture);

  const result = await client.invokeWithPolicy(
    MCP_NAME,
    action,
    token,
    params,
    { userEmail: userEmail as string },
  );

  return (result as any).result ?? (result as any).data ?? result;
}
