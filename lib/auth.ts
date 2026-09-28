import { createHash } from "node:crypto";
import { getPool } from "./db";

export async function authenticateWorkspaceRequest(req: Request) {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) throw new Error("UNAUTHORIZED");
  const token = header.slice(7).trim();
  if (!token) throw new Error("UNAUTHORIZED");

  const hash = createHash("sha256").update(token).digest("hex");
  const result = await getPool().query(
    "SELECT id, name FROM workspaces WHERE api_key_hash = $1 LIMIT 1",
    [hash]
  );
  if (!result.rows[0]) throw new Error("UNAUTHORIZED");
  return result.rows[0] as { id: string; name: string };
}
