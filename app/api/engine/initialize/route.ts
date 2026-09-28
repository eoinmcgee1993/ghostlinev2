import { NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { getPool } from "@/lib/db";
import { analyzeOffer } from "@/lib/ai-router";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const targetUrl = new URL(String(body.url ?? "")).toString();
    const pool = getPool();
    const workspace = await pool.query("SELECT id FROM workspaces ORDER BY created_at ASC LIMIT 1");
    if (!workspace.rows[0]) return NextResponse.json({error:"No workspace configured. Create a workspace before launching."},{status:503});
    const workspaceId = workspace.rows[0].id;

    const offer = await pool.query(
      "INSERT INTO offers (workspace_id,target_url,status) VALUES ($1,$2,'analyzing') RETURNING id",
      [workspaceId,targetUrl]
    );
    const offerId = offer.rows[0].id;
    await pool.query(
      "INSERT INTO system_events (offer_id,agent_name,event_type,message) VALUES ($1,'engine','initialized','Offer accepted for analysis')",
      [offerId]
    );

    void (async () => {
      try {
        const analysis = await analyzeOffer(targetUrl);
        await pool.query("UPDATE offers SET extracted_offer=$1, icp_schema=$2, status='ready' WHERE id=$3",
          [JSON.stringify(analysis), JSON.stringify({titles:analysis.icp_titles,industries:analysis.target_industries}), offerId]);
        await pool.query("INSERT INTO system_events (offer_id,agent_name,event_type,message,payload) VALUES ($1,'offer-agent','completed','Offer analysis completed',$2)",
          [offerId,JSON.stringify(analysis)]);
      } catch (e) {
        await pool.query("UPDATE offers SET status='failed' WHERE id=$1",[offerId]);
        await pool.query("INSERT INTO system_events (offer_id,agent_name,event_type,message) VALUES ($1,'offer-agent','failed',$2)",
          [offerId,e instanceof Error?e.message:String(e)]);
      }
    })();

    return NextResponse.json({offerId, requestId:randomUUID(), inputHash:createHash("sha256").update(targetUrl).digest("hex")});
  } catch (e) {
    return NextResponse.json({error:e instanceof Error?e.message:"Invalid request"},{status:400});
  }
}
