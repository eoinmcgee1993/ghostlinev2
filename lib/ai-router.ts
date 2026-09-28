import { HfInference } from "@huggingface/inference";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getPool } from "./db";

const OfferAnalysisSchema = z.object({
  core_value: z.string(),
  primary_pain: z.string(),
  icp_titles: z.array(z.string()),
  target_industries: z.array(z.string())
});

const ReplyClassificationSchema = z.object({
  classification: z.enum(["HOT_LEAD", "QUESTION", "UNSUBSCRIBE", "HUMAN_REVIEW"]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string()
});

const hf = () => {
  const token = process.env.HF_TOKEN;
  if (!token) throw new Error("HF_TOKEN is not configured");
  return new HfInference(token);
};

function extractJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI returned no JSON");
  return JSON.parse(match[0]);
}

async function logRun(task: string, model: string, input: string, started: number, status: string, error?: string) {
  try {
    await getPool().query(
      `INSERT INTO ai_runs (task_name, provider, model_resolved, input_hash, status, latency_ms, error_message)
       VALUES ($1,'huggingface',$2,$3,$4,$5,$6)`,
      [task, model, createHash("sha256").update(input).digest("hex"), status, Date.now()-started, error ?? null]
    );
  } catch {}
}

export async function analyzeOffer(text: string) {
  const model = "meta-llama/Llama-3.3-70B-Instruct";
  const started = Date.now();
  try {
    const response = await hf().chatCompletion({
      model,
      messages: [
        { role: "system", content: "Return only raw JSON matching the requested schema." },
        { role: "user", content: `Analyze this offer. Return JSON with core_value, primary_pain, icp_titles, target_industries.\n\n${text}` }
      ],
      max_tokens: 500,
      temperature: 0.1
    });
    const parsed = OfferAnalysisSchema.parse(extractJson(response.choices[0]?.message?.content ?? ""));
    await logRun("offer_analysis", model, text, started, "success");
    return parsed;
  } catch (e) {
    await logRun("offer_analysis", model, text, started, "failed", e instanceof Error ? e.message : String(e));
    throw e;
  }
}

export async function classifyReply(text: string) {
  const model = "meta-llama/Llama-3.1-8B-Instruct";
  const started = Date.now();
  try {
    const response = await hf().chatCompletion({
      model,
      messages: [
        { role: "system", content: "Return only raw JSON. classification must be HOT_LEAD, QUESTION, UNSUBSCRIBE, or HUMAN_REVIEW; confidence must be 0..1; include reasoning." },
        { role: "user", content: text }
      ],
      max_tokens: 300,
      temperature: 0
    });
    const parsed = ReplyClassificationSchema.parse(extractJson(response.choices[0]?.message?.content ?? ""));
    await logRun("reply_classification", model, text, started, "success");
    return parsed;
  } catch (e) {
    await logRun("reply_classification", model, text, started, "failed", e instanceof Error ? e.message : String(e));
    throw e;
  }
}
