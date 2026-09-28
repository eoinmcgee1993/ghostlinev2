import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const offerId = new URL(req.url).searchParams.get("offerId");
  if (!offerId) return new Response("offerId required",{status:400});
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let last = new Date(0).toISOString();

  const stream = new ReadableStream({
    start(controller) {
      const poll = async () => {
        try {
          const rows = await getPool().query(
            "SELECT id,agent_name,event_type,message,created_at FROM system_events WHERE offer_id=$1 AND created_at>$2 ORDER BY created_at ASC LIMIT 100",
            [offerId,last]
          );
          for (const row of rows.rows) {
            last = new Date(row.created_at).toISOString();
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(row)}\n\n`));
          }
        } catch (e) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({event_type:"error",message:e instanceof Error?e.message:String(e)})}\n\n`));
        }
      };
      void poll();
      timer = setInterval(() => void poll(),1500);
      req.signal.addEventListener("abort", () => { if(timer) clearInterval(timer); try{controller.close()}catch{} }, {once:true});
    },
    cancel(){ if(timer) clearInterval(timer); }
  });
  return new Response(stream,{headers:{"Content-Type":"text/event-stream","Cache-Control":"no-cache","Connection":"keep-alive"}});
}
