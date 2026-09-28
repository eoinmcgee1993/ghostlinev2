import type { Config } from "@netlify/functions";
import { processNextOutboundJob } from "../../lib/action-engine";
import { WebhookProvider } from "../../providers/webhook";

export default async function handler() {
  const workerId = `netlify_cron_${Math.random().toString(36).slice(2)}`;
  try {
    const provider = new WebhookProvider();
    const { registerProvider } = await import("../../lib/action-engine");
    registerProvider("webhook", provider);
    const result = await processNextOutboundJob(workerId);
    console.log("[NETLIFY_CRON_SUCCESS]", workerId, result);
    return new Response(JSON.stringify({workerId,result}),{status:200,headers:{"Content-Type":"application/json"}});
  } catch (err) {
    console.error("[NETLIFY_CRON_ERROR]", workerId, err);
    return new Response(JSON.stringify({error:err instanceof Error?err.message:String(err)}),{status:500});
  }
}

export const config: Config = { schedule: "* * * * *" };
