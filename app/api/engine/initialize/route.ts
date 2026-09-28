import { NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { getPool } from "@/lib/db";
import { authenticateWorkspaceRequest } from "@/lib/auth";
import { fetchWebsiteContent } from "@/lib/scraper";
import { analyzeOffer } from "@/lib/ai-router";

export async function POST(req:Request) {
 try {
  const workspace=await authenticateWorkspaceRequest(req);
  const body=await req.json();
  const targetUrl=new URL(String(body.url??"")).toString();
  const offer=(await getPool().query(
   "INSERT INTO offers (workspace_id,target_url,status) VALUES ($1,$2,'analyzing') RETURNING id",
   [workspace.id,targetUrl])).rows[0];
  await getPool().query(
   "INSERT INTO system_events (offer_id,agent_name,event_type,message) VALUES ($1,'engine','initialized','Offer accepted for analysis')",
   [offer.id]);
  void (async()=>{
   try {
    const content=await fetchWebsiteContent(targetUrl);
    const analysis=await analyzeOffer(content);
    await getPool().query("UPDATE offers SET extracted_offer=$1,icp_schema=$2,status='ready' WHERE id=$3",
     [JSON.stringify(analysis),JSON.stringify({titles:analysis.icp_titles,industries:analysis.target_industries}),offer.id]);
    await getPool().query("INSERT INTO system_events (offer_id,agent_name,event_type,message,payload) VALUES ($1,'offer-agent','completed','Offer analysis completed',$2)",
     [offer.id,JSON.stringify(analysis)]);
   } catch(e) {
    await getPool().query("UPDATE offers SET status='failed' WHERE id=$1",[offer.id]);
    await getPool().query("INSERT INTO system_events (offer_id,agent_name,event_type,message) VALUES ($1,'offer-agent','failed',$2)",
     [offer.id,e instanceof Error?e.message:String(e)]);
   }
  })();
  return NextResponse.json({success:true,offerId:offer.id,requestId:randomUUID(),inputHash:createHash("sha256").update(targetUrl).digest("hex")});
 } catch(e) {
  const msg=e instanceof Error?e.message:"Invalid request";
  return NextResponse.json({error:msg.includes("UNAUTHORIZED")?"UNAUTHORIZED":msg},{status:msg.includes("UNAUTHORIZED")?401:400});
 }
}
