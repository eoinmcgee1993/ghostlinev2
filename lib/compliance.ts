import { getPool } from "./db";
import { classifyReply } from "./ai-router";

const OPT_OUT_KEYWORDS = ["unsubscribe","stop","remove","take me off","do not email"];

export async function processIncomingReply(params: {
  workspaceId:string; prospectEmail:string; replyText:string; jobId?:string;
}) {
  const {workspaceId,prospectEmail,replyText,jobId}=params;
  if (OPT_OUT_KEYWORDS.some(k=>replyText.toLowerCase().includes(k))) {
    await getPool().query(`INSERT INTO suppressions (workspace_id,email,reason)
      VALUES ($1,$2,'hard_opt_out_keyword') ON CONFLICT (workspace_id,email) DO NOTHING`,
      [workspaceId,prospectEmail]);
    return {status:"SUPPRESSED",route:"HARD_OPT_OUT"};
  }
  const classification=await classifyReply(replyText);
  if (classification.confidence<0.85 || classification.classification==="HUMAN_REVIEW") {
    await getPool().query(`INSERT INTO human_review_queue (workspace_id,job_id,reason,payload)
      VALUES ($1,$2,$3,$4)`,
      [workspaceId,jobId??null,`LOW_CONFIDENCE_CLASSIFICATION: ${classification.confidence}`,
       JSON.stringify({replyText,classification})]);
    return {status:"HUMAN_REVIEW_QUEUED",confidence:classification.confidence};
  }
  if (classification.classification==="UNSUBSCRIBE") {
    await getPool().query(`INSERT INTO suppressions (workspace_id,email,reason)
      VALUES ($1,$2,'classifier_opt_out') ON CONFLICT (workspace_id,email) DO NOTHING`,
      [workspaceId,prospectEmail]);
    return {status:"SUPPRESSED",route:"CLASSIFIER_OPT_OUT"};
  }
  return {status:"PROCEED",intent:classification.classification};
}
