import { NextResponse } from "next/server";
import { authenticateWorkspaceRequest } from "@/lib/auth";
import { processIncomingReply } from "@/lib/compliance";

export async function POST(req:Request) {
 try {
  const workspace=await authenticateWorkspaceRequest(req);
  const body=await req.json();
  const prospectEmail=String(body.prospectEmail??"").trim().toLowerCase();
  const replyText=String(body.replyText??"");
  const jobId=body.jobId?String(body.jobId):undefined;
  if(!prospectEmail || !replyText) return NextResponse.json({error:"prospectEmail and replyText are required"},{status:400});
  const result=await processIncomingReply({workspaceId:workspace.id,prospectEmail,replyText,jobId});
  return NextResponse.json({success:true,...result});
 } catch(e) {
  const message=e instanceof Error?e.message:"Invalid request";
  return NextResponse.json({error:message.includes("UNAUTHORIZED")?"UNAUTHORIZED":message},{status:message.includes("UNAUTHORIZED")?401:400});
 }
}
