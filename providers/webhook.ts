import type { ActionProvider } from "../lib/action-engine";
import { withTransaction, getPool } from "../lib/db";
import { pinAndValidateSsrfUrl } from "../lib/ssrf";

export class WebhookProvider implements ActionProvider {
  name = "webhook";

  async send(payload: Record<string, any>, idempotencyKey: string) {
    const target = String(payload.target_url ?? "");
    const pinned = await pinAndValidateSsrfUrl(target);
    const now = new Date();
    const lease = new Date(now.getTime() + 60_000);

    const state = await withTransaction(async client => {
      const found = await client.query(
        "SELECT id,status,delivering_until FROM webhook_deliveries WHERE idempotency_key=$1 FOR UPDATE",
        [idempotencyKey]
      );
      if (found.rows[0]?.status === "delivered") return { done: true, id: found.rows[0].id };
      if (found.rows[0]?.status === "delivering" && found.rows[0].delivering_until && new Date(found.rows[0].delivering_until) > now) {
        throw new Error("WEBHOOK_DELIVERY_IN_FLIGHT");
      }
      if (found.rows[0]) {
        await client.query(
          "UPDATE webhook_deliveries SET status='delivering', target_url=$2, updated_at=NOW(), delivering_until=$3 WHERE id=$1",
          [found.rows[0].id, target, lease]
        );
        return { done: false, id: found.rows[0].id };
      }
      const inserted = await client.query(
        "INSERT INTO webhook_deliveries (idempotency_key,target_url,status,delivering_until) VALUES ($1,$2,'delivering',$3) RETURNING id",
        [idempotencyKey, target, lease]
      );
      return { done: false, id: inserted.rows[0].id };
    });

    if (state.done) return { externalId: `webhook_cached_${state.id}` };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(pinned.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Host": pinned.url.host,
          "X-Ghostline-Idempotency-Key": idempotencyKey
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      const body = (await response.text()).slice(0, 10000);
      await getPool().query(
        "UPDATE webhook_deliveries SET status=$1,status_code=$2,response_body=$3,updated_at=NOW(),delivering_until=NULL WHERE id=$4",
        [response.ok ? "delivered" : "failed", response.status, body, state.id]
      );
      if (!response.ok) throw new Error(`WEBHOOK_HTTP_${response.status}`);
      return { externalId: `webhook_${Date.now()}` };
    } catch (error) {
      await getPool().query(
        "UPDATE webhook_deliveries SET status='failed',response_body=$1,updated_at=NOW(),delivering_until=NULL WHERE id=$2",
        [error instanceof Error ? error.message : String(error), state.id]
      );
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
