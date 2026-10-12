import type { Express, Request, Response } from "express";
import type { PrismaClient } from "@prisma/client";
import { join } from "node:path";
import { errorEnvelope, successEnvelope } from "../contracts/api.js";
import { EditorError, RENAME_NOTICE, type EditorContext } from "./types.js";
import { GalleryEditorService } from "./service.js";
import { validateActions } from "./action-validation.js";
import { FileProviderBudget } from "./budget.js";
import { responsesProviderFromEnv, type EditorProvider } from "./provider.js";
import { runEditorIntent, type EditorReadTools } from "./intent.js";
import { expandLibraryFamily, LibraryReadBudget, readLibraryCollectionPosts, readLibraryCollections, readLibraryMedia, resolveLibraryPosts, retrieveLibraryThumbnails, searchLibraryPosts, type LibraryHistoryReader, type LibraryTitleMatch } from "./context.js";
import { ownedStorageReader } from "./media-reader.js";
import { effectivePostTitle, effectiveWorkTitle, s, type EditorState } from "./state.js";
import { createLogger } from "../lib/logger.js";

export interface EditorPrincipal { creatorId:string;actorId:string }
export interface EditorRouteOptions {
  prisma:PrismaClient;
  authorize(req:Request,res:Response,mutation:boolean):Promise<EditorPrincipal|null>;
  traceId(req:Request):string;
  storageRoot:string;
  storesReady?:boolean;
  provider?:EditorProvider;
}
function enabled(creatorId:string){
  return process.env.RELAY_GALLERY_EDITOR_ENABLED==="1" && (process.env.RELAY_GALLERY_EDITOR_ALLOWLIST??"").split(",").map(x=>x.trim()).filter(Boolean).includes(creatorId);
}
function aiAvailable(creatorId:string){
  return enabled(creatorId)&&process.env.RELAY_GALLERY_EDITOR_AI_ENABLED!=="0"&&Boolean(process.env.OPENAI_API_KEY?.trim())&&Boolean(process.env.LIBRARY_EDITOR_MODEL_PRICING_JSON?.trim());
}
function context(value:unknown):EditorContext{
  if(!value||typeof value!=="object"||Array.isArray(value))throw new EditorError("INVALID_CONTEXT","Supply editor selection context.");
  const v=value as Record<string,unknown>;
  const ids=(key:string)=>{const a=v[key];if(a===undefined&&key!=="selectedPostIds")return undefined;if(!Array.isArray(a)||a.length>100||a.some(x=>typeof x!=="string"||!x.trim()||x.length>200))throw new EditorError("INVALID_CONTEXT","Selection must contain valid IDs.");return [...new Set(a)] as string[];};
  if(v.activeCollectionId!==undefined&&(typeof v.activeCollectionId!=="string"||v.activeCollectionId.length>200))throw new EditorError("INVALID_CONTEXT","Invalid collection context.");
  const filters=v.filters;
  if(filters!==undefined&&(!filters||typeof filters!=="object"||Array.isArray(filters)||Object.keys(filters).length>20||Object.entries(filters).some(([k,x])=>k.length>100||!(typeof x==="boolean"||typeof x==="string"&&x.length<2000))))throw new EditorError("INVALID_CONTEXT","Invalid filters.");
  return {selectedPostIds:ids("selectedPostIds")!,...(v.loadedPostIds!==undefined?{loadedPostIds:ids("loadedPostIds")}:{}) ,...(v.selectedMediaIds!==undefined?{selectedMediaIds:ids("selectedMediaIds")}:{}) ,...(v.activeCollectionId?{activeCollectionId:v.activeCollectionId as string}:{}),...(filters?{filters:filters as EditorContext["filters"]}:{})};
}
function revision(value:unknown){if(typeof value!=="number"||!Number.isSafeInteger(value)||value<0)throw new EditorError("INVALID_REVISION","Supply the current cart revision.");return value;}
/** Search only historical title fields from creator-scoped immutable receipts, never prompts/descriptions. */
export function editorHistoryReader(prisma:PrismaClient):LibraryHistoryReader{
  return {async search(creatorId,query){
    if(!query.trim())return [];
    // Composed inherited titles live as separate parent/label values in snapshots.
    // Broaden only the candidate read; the resolved title below still matches the full query.
    const candidate=query.split(" — ")[0];
    const escaped=candidate.replace(/[\\%_]/g,"\\$&");
    const jsonEscaped=JSON.stringify(candidate).slice(1,-1).replace(/[\\%_]/g,"\\$&");
    const rows=await prisma.$queryRawUnsafe<{before:EditorState;after:EditorState}[]>(`SELECT "before", "after" FROM gallery_editor_commits WHERE creator_id = $1 AND ("before"::text ILIKE $2 OR "after"::text ILIKE $2 OR "before"::text ILIKE $3 OR "after"::text ILIKE $3) ORDER BY created_at DESC LIMIT 1001`,creatorId,`%${escaped}%`,`%${jsonEscaped}%`);
    if(rows.length>1000)throw new EditorError("HISTORY_LIMIT","Narrow the old-name search to inspect its complete history.");
    const matches=new Map<string,LibraryTitleMatch>();
    for(const receipt of rows)for(const state of [receipt.before,receipt.after]){
      if(!state?.tables)continue;
      const works=new Set<string>(),postMatches=new Map<string,string>();
      for(const post of state.tables.posts??[]){const name=effectivePostTitle(state,s(post,"id"));if(name.toLowerCase().includes(query.toLowerCase()))postMatches.set(s(post,"id"),name);}
      for(const work of state.tables.works??[]){if(effectiveWorkTitle(state,s(work,"id")).toLowerCase().includes(query.toLowerCase()))works.add(s(work,"id"));}
      for(const p of state.tables.presentations??[])if(s(p,"relayTitle").toLowerCase().includes(query.toLowerCase()))postMatches.set(s(p,"postId"),s(p,"relayTitle"));
      for(const w of state.tables.works??[])if(s(w,"title").toLowerCase().includes(query.toLowerCase()))works.add(s(w,"id"));
      for(const series of state.tables.series??[])if(s(series,"title").toLowerCase().includes(query.toLowerCase()))for(const m of state.tables.seriesMembers??[])if(s(m,"creativeSeriesId")===s(series,"id"))works.add(s(m,"creativeWorkId"));
      for(const member of state.tables.workMembers??[])if(works.has(s(member,"creativeWorkId")))postMatches.set(s(member,"postId"),query);
      for(const [postId,matchedTitle]of postMatches)matches.set(postId,{postId,matchedTitle,provenance:"historical"});
    }
    return [...matches.values()];
  }};
}
export function registerGalleryEditorRoutes(app:Express,options:EditorRouteOptions):void{
  const metrics=createLogger({name:"relay-gallery-editor"});
  const service=new GalleryEditorService(options.prisma);
  const provider=options.provider??responsesProviderFromEnv(new FileProviderBudget(join(process.env.RELAY_GALLERY_EDITOR_DATA_DIR??".relay-data","gallery-editor-budget.json")));
  const history=editorHistoryReader(options.prisma);
  const route=(method:"get"|"post"|"patch",path:string,mutation:boolean,fn:(req:Request,principal:EditorPrincipal)=>Promise<unknown>,requireEnabled=true)=>{
    app[method](path,async(req:Request,res:Response)=>{
      const started=Date.now();
      res.once("finish",()=>metrics.info({event:"editor_request",operation:path.slice(path.lastIndexOf("/")+1),method,status:res.statusCode,durationMs:Date.now()-started},"gallery_editor_metric"));
      const traceId=options.traceId(req);res.setHeader("Cache-Control","private, no-store");
      try{
        const principal=await options.authorize(req,res,mutation);if(!principal)return;
        const supplied=req.body?.creator_id??req.query.creator_id;if(supplied!==undefined&&supplied!==principal.creatorId)throw new EditorError("FORBIDDEN","Creator scope does not match your account.",403);
        if(requireEnabled&&(!enabled(principal.creatorId)||!options.storesReady))throw new EditorError("EDITOR_DISABLED","The Library editor requires an enabled account and PostgreSQL Library stores.",403);
        return res.json(successEnvelope(await fn(req,principal),traceId));
      }catch(error){
        if(error instanceof EditorError)return res.status(error.status).json(errorEnvelope(error.code,error.message,traceId));
        return res.status(503).json(errorEnvelope("EDITOR_UNAVAILABLE","The editor could not finish this request. Your cart is preserved; retry after reloading.",traceId));
      }
    });
  };
  const base="/api/v1/gallery/editor";
  route("get",`${base}/capabilities`,false,async(_req,p)=>({enabled:enabled(p.creatorId)&&Boolean(options.storesReady),aiAvailable:Boolean(options.storesReady)&&(aiAvailable(p.creatorId)||Boolean(options.provider)&&enabled(p.creatorId)),notice:RENAME_NOTICE}),false);
  route("post",`${base}/sessions`,true,(req,p)=>service.create(p.creatorId,p.actorId,context(req.body?.context)));
  route("get",`${base}/sessions/:id`,false,(req,p)=>service.read(p.creatorId,p.actorId,String(req.params.id)),false);
  route("patch",`${base}/sessions/:id`,true,(req,p)=>service.revise(p.creatorId,p.actorId,String(req.params.id),revision(req.body?.revision),validateActions(req.body?.actions),req.body?.context?context(req.body.context):undefined));
  route("post",`${base}/sessions/:id/apply`,true,async(req,p)=>({receipt:await service.apply(p.creatorId,p.actorId,String(req.params.id),revision(req.body?.revision),typeof req.body?.idempotencyKey==="string"?req.body.idempotencyKey:"")}));
  route("post",`${base}/commits/:id/undo`,true,async(req,p)=>({receipt:await service.undo(p.creatorId,p.actorId,String(req.params.id))}),false);
  route("post",`${base}/sessions/:id/turn`,true,async(req,p)=>{
    if(!options.provider&&!aiAvailable(p.creatorId))throw new EditorError("AI_DISABLED","Conversational editing is unavailable. You can still edit the cart manually.",503);
    const session=await service.read(p.creatorId,p.actorId,String(req.params.id));
    if(session.revision!==revision(req.body?.revision))throw new EditorError("STALE_CART","Reload the latest cart before continuing.",409);
    if(req.body?.context)session.context=context(req.body.context);
    const budget=new LibraryReadBudget();
    const readTools:EditorReadTools=async(name,args,{signal})=>{
      signal.throwIfAborted();
      const page={cursor:typeof args.cursor==="string"?args.cursor:undefined,limit:typeof args.limit==="number"?args.limit:undefined,budget};
      switch(name){
        case "searchLibraryPosts":return {data:await searchLibraryPosts(options.prisma,p.creatorId,args.query as string,{...page,history})};
        case "resolveLibraryPosts":return {data:await resolveLibraryPosts(options.prisma,p.creatorId,args.postIds as string[],{budget})};
        case "expandLibraryFamily":return {data:await expandLibraryFamily(options.prisma,p.creatorId,{kind:args.kind as "post"|"work"|"series",id:args.id as string},page)};
        case "readLibraryCollections":return {data:typeof args.collectionId==="string"?await readLibraryCollectionPosts(options.prisma,p.creatorId,args.collectionId,page):await readLibraryCollections(options.prisma,p.creatorId,page)};
        case "readLibraryMedia":return {data:await readLibraryMedia(options.prisma,p.creatorId,args.mediaIds as string[],{budget})};
        case "resolveLibraryImageReferences":{const result=await retrieveLibraryThumbnails(options.prisma,p.creatorId,args.mediaIds as string[],ownedStorageReader(options.storageRoot,signal),{budget});return {data:{inspectedMediaIds:result.images.map(i=>i.mediaId),unsupported:result.unsupported},images:result.images.map(i=>({mediaId:i.mediaId,url:`data:${i.mimeType};base64,${i.bytes.toString("base64")}`}))};}
      }
    };
    const result=await runEditorIntent(session,req.body?.message,provider,readTools);
    metrics.info({event:"editor_turn",disposition:result.disposition??"unclassified",actionCount:result.actions.length,inputTokens:result.usage?.inputTokens,outputTokens:result.usage?.outputTokens,costUsd:result.usage?.costUsd,calls:result.usage?.calls},"gallery_editor_metric");
    return service.revise(p.creatorId,p.actorId,session.id,session.revision,result.actions,session.context,[...session.messages,{role:"user",text:req.body.message},{role:"assistant",text:result.message}],"ai");
  });
}
