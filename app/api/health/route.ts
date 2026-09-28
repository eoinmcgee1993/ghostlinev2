import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export const dynamic="force-dynamic";

export async function GET() {
  const checks:Record<string,string>={database:"UNKNOWN",hfToken:process.env.HF_TOKEN?"CONFIGURED":"MISSING",
    resendKey:process.env.RESEND_API_KEY?"CONFIGURED":"MISSING",
    workerSecret:process.env.WORKER_SECRET_KEY?"CONFIGURED":"MISSING"};
  try {
    const r=await getPool().query("SELECT NOW() AS current_time");
    checks.database=r.rows[0]?.current_time?"HEALTHY":"UNHEALTHY";
  } catch { checks.database="UNHEALTHY"; }
  const healthy=checks.database==="HEALTHY" && checks.hfToken==="CONFIGURED";
  return NextResponse.json({status:healthy?"OK":"DEGRADED",checks,timestamp:new Date().toISOString()},{status:healthy?200:503});
}
