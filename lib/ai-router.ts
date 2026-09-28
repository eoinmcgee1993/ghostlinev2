import { HfInference } from "@huggingface/inference";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getPool } from "./db";

export const OfferAnalysisSchema=z.object({core_value:z.string(),primary_pain:z.string(),icp_titles:z.array(z.string()),target_industries:z.array(z.string())});
export const ReplyClassificationSchema=z.object({classification:z.enum(["HOT_LEAD","QUESTION","UNSUBSCRIBE","HUMAN_REVIEW"]),confidence:z.number().min(0).max(1),reasoning:z.string()});
export type TaskType="offer_analysis"|"reply_classification";

const TASKS={
 offer_analysis:{model:"meta-llama/Llama-3.3-70B-Instruct",schema:OfferAnalysisSchema,
  system:"You are an elite B2B offer analyst. Output raw valid JSON only.",
  prompt:(input:string)=>`Extract core_value, primary_pain, icp_titles and target_industries as JSON.\n\nText:\n${input.slice(0,5000)}`},
 reply_classification:{model:"meta-llama/Llama-3.1-8B-Instruct",schema:ReplyClassificationSchema,
  system:"You classify inbound prospect replies. Output raw valid JSON only.",
  prompt:(input:string)=>`Classify as HOT_LEAD, QUESTION, UNSUBSCRIBE or HUMAN_REVIEW with confidence 0..1 and reasoning.\n\nReply:\n${input.slice(0,5000)}`}
} as const;

function jsonFrom(text:string):unknown {
 const match=text.match(/\{[\s\S]*\}/);
 if(!match) throw new Error("AI returned no JSON");
 return JSON.parse(match[0]);
}

async function logRun(task:TaskType,model:string,input:string,started:number,status:string,error?:string,agentRunId?:string,outputText="") {
 try {
  const inputTokens=Math.ceil(input.length/4);
  const outputTokens=Math.ceil(outputText.length/4);
  const estimatedCostUsd=(inputTokens/1000)*0.0007+(outputTokens/1000)*0.0008;
  await getPool().query(`INSERT INTO ai_runs
   (agent_run_id,task_name,provider,model_resolved,input_hash,status,latency_ms,input_tokens,output_tokens,estimated_cost_usd,error_message)
   VALUES ($1,$2,'huggingface',$3,$4,$5,$6,$7,$8,$9,$10)`,
   [agentRunId??null,task,model,createHash("sha256").update(input).digest("hex"),status,
    Date.now()-started,inputTokens,outputTokens,estimatedCostUsd,error??null]);
 } catch (loggingError) { console.error("[AI_TELEMETRY_FAILURE]",loggingError); }
}

export async function executeAiTask<T>(task:TaskType,inputData:any,agentRunId?:string):Promise<T> {
 const token=process.env.HF_TOKEN;
 if(!token) throw new Error("HF_TOKEN is not configured");
 const cfg=TASKS[task];
 const input=task==="offer_analysis"?String(inputData.text??""):String(inputData.replyText??"");
 const started=Date.now();
 let raw="";
 let status:"success"|"error"="success";
 let errorMessage:string|undefined;
 try {
  const response=await new HfInference(token).chatCompletion({
   model:cfg.model,
   messages:[{role:"system",content:cfg.system},{role:"user",content:cfg.prompt(input)}],
   max_tokens:1000,temperature:0.1
  });
  raw=String(response.choices[0]?.message?.content??"");
  return cfg.schema.parse(jsonFrom(raw)) as T;
 } catch(e) {
  status="error";
  errorMessage=e instanceof Error?e.message:String(e);
  throw new Error(`[HF_AI_ROUTER_FAILURE] ${task}: ${errorMessage}`);
 } finally {
  await logRun(task,cfg.model,input,started,status,errorMessage,agentRunId,raw);
 }
}

export async function analyzeOffer(text:string) {
 return executeAiTask<z.infer<typeof OfferAnalysisSchema>>("offer_analysis",{text});
}
export async function classifyReply(text:string) {
 return executeAiTask<z.infer<typeof ReplyClassificationSchema>>("reply_classification",{replyText:text});
}
