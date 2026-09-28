import { getPool } from "./db";

export interface ActionProvider {
  name: string;
  send(payload: Record<string, any>, idempotencyKey: string): Promise<{ externalId: string }>;
}

const providers = new Map<string, ActionProvider>();

export function registerProvider(actionType: string, provider: ActionProvider) {
  providers.set(`${actionType}:${provider.name}`, provider);
}

export async function processNextOutboundJob(workerId: string) {
  const pool = getPool();
  const client = await pool.connect();
  let job: any;
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT * FROM outbound_jobs
       WHERE status = 'queued'
          OR (status = 'claimed' AND locked_until < NOW())
       ORDER BY created_at ASC
       FOR UPDATE SKIP LOCKED LIMIT 1`
    );
    if (!result.rows[0]) {
      await client.query("COMMIT");
      return { status: "idle" };
    }
    job = result.rows[0];
    await client.query(
      `UPDATE outbound_jobs SET status='claimed', locked_by=$1, locked_until=NOW()+INTERVAL '5 minutes'
       WHERE id=$2`,
      [workerId, job.id]
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  const suppression = await pool.query(
    "SELECT 1 FROM suppressions WHERE workspace_id=$1 AND lower(email)=lower($2) LIMIT 1",
    [job.workspace_id, job.payload?.email]
  );
  if (suppression.rowCount) {
    await pool.query("UPDATE outbound_jobs SET status='skipped_suppressed', locked_by=NULL, locked_until=NULL WHERE id=$1", [job.id]);
    return { status: "skipped_suppressed", jobId: job.id };
  }

  const provider = providers.get(`${job.action_type}:${job.provider_name}`);
  if (!provider) {
    await pool.query("UPDATE outbound_jobs SET status='failed', locked_by=NULL, locked_until=NULL WHERE id=$1", [job.id]);
    throw new Error(`PROVIDER_NOT_REGISTERED:${job.action_type}:${job.provider_name}`);
  }

  try {
    const sent = await provider.send(job.payload, job.idempotency_key);
    await pool.query(
      "UPDATE outbound_jobs SET status='dispatched', dispatched_at=NOW(), locked_by=NULL, locked_until=NULL WHERE id=$1",
      [job.id]
    );
    return { status: "dispatched", jobId: job.id, externalId: sent.externalId };
  } catch (error) {
    await pool.query("UPDATE outbound_jobs SET status='queued', locked_by=NULL, locked_until=NULL WHERE id=$1", [job.id]);
    throw error;
  }
}
