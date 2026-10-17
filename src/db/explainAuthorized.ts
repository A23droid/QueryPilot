import "dotenv/config";
import { explainQuery, type ExplainOptions } from "../db/explain.js";
import { authorizedToolCall } from "../security/armoriq.js";

export interface AuthorizedExplainOptions extends ExplainOptions {
  useArmorIQ?: boolean;
  goal?: string;
}

export async function explainQueryAuthorized(
  sql: string,
  opts: AuthorizedExplainOptions = {},
) {
  if (opts.useArmorIQ) {
    const goal =
      opts.goal ??
      "Inspect the execution plan for this SQL query to detect performance issues";

    const result = (await authorizedToolCall(
      "explain_query",
      {
        sql,
        analyze: opts.analyze ?? false,
      },
      goal,
    )) as unknown;

    return result;
  }

  return explainQuery(sql, opts);
}
