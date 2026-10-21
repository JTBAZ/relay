import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { EditorError, RENAME_NOTICE, type CommitReceipt, type EditorContext, type EditorSession, type EditAction, type ChangeCart } from "./types.js";
import { buildChangeCart, clone, dependencies, fingerprint, loadEditorState, rowKey, s, simulateEditorActions, TABLES, type EditorDb, type EditorState, type Row, type Table } from "./state.js";
import type { PostPresentationUpsertPayload } from "../gallery/post-presentation-mutate.js";
import { mergeCartPatch, type CartPatch } from './cart-patch.js';
import { previewCopy, receiptCopy } from './factual-copy.js';

const json = (value: unknown) => clone(value) as Prisma.InputJsonValue;
const WRITABLE: Table[] = ["series", "works", "seriesMembers", "workMembers", "presentations", "overrides", "collections", "collectionPosts"];
const delegates = {series:"creativeSeries",works:"creativeWork",seriesMembers:"creativeSeriesMember",workMembers:"creativeWorkMember",presentations:"postPresentation",overrides:"postOverride",collections:"libraryCollection",collectionPosts:"collectionPost"} as const;
type Delegate = { deleteMany(args: {where:Record<string,unknown>}): Promise<unknown>; upsert(args: {where:Record<string,unknown>;create:Record<string,unknown>;update:Record<string,unknown>}): Promise<unknown> };
function where(table: Table,row:Row) { return table==="collectionPosts" ? {collectionId_postId:{collectionId:row.collectionId,postId:row.postId}} : {id:row.id}; }
function deleteWhere(table:Table,row:Row){return table==="collectionPosts"?{collectionId:row.collectionId,postId:row.postId}:{id:row.id};}
function values(row:Row, update=false) {
  const out={...row}; delete out.updatedAt;
  if(update){delete out.id;delete out.createdAt;}
  if("tierPreviewSettings"in out && out.tierPreviewSettings===null)out.tierPreviewSettings=Prisma.DbNull;
  return out;
}
/** Writes only changed rows from validated server snapshots. Canonical ingest is never writable here. */
export async function persistEditorState(db:EditorDb,before:EditorState,after:EditorState):Promise<void>{
  const dbDelegates=db as unknown as Record<string,Delegate>;
  for(const table of [...WRITABLE].reverse()){
    const delegate=dbDelegates[delegates[table as keyof typeof delegates]]!;
    for(const row of before.tables[table])if(!after.tables[table].some(r=>rowKey(table,r)===rowKey(table,row)))await delegate.deleteMany({where:deleteWhere(table,row)});
  }
  for(const table of WRITABLE){
    const delegate=dbDelegates[delegates[table as keyof typeof delegates]]!;
    for(const row of after.tables[table]){
      const old=before.tables[table].find(r=>rowKey(table,r)===rowKey(table,row));
      if(fingerprint(old??null)!==fingerprint(row))await delegate.upsert({where:where(table,row),create:values(row),update:values(row,true)});
    }
  }
}
function checkRevision(actual:number,expected:number){if(!Number.isInteger(expected)||actual!==expected)throw new EditorError("STALE_CART","The cart changed. Reload it before applying or editing.",409);}
function checkDependencies(expected:Record<string,string>,state:EditorState){if(fingerprint(expected)!==fingerprint(dependencies(state)))throw new EditorError("STALE_PREVIEW","Related content changed since this preview. Refresh the cart before applying.",409);}
export async function serializable<T>(prisma:PrismaClient,fn:(tx:Prisma.TransactionClient)=>Promise<T>):Promise<T>{
  for(let attempt=0;;attempt++)try{return await prisma.$transaction(fn,{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:5000,timeout:20000});}catch(error){
    if(isRetryableTransactionError(error)&&attempt<2)continue;
    throw error;
  }
}
/** Prisma adapter raw errors can wrap SQLSTATE under meta.driverAdapterError.cause. */
export function isRetryableTransactionError(error:unknown):boolean{
  const seen=new Set<object>();
  function inspect(value:unknown,depth:number):boolean{
    if(!value||typeof value!=="object"||depth>5||seen.has(value))return false;
    seen.add(value);const row=value as Record<string,unknown>;
    if([row.code,row.originalCode,row.sqlState].some(code=>code==="40001"||code==="40P01"||code==="P2034"))return true;
    return ["meta","driverAdapterError","cause"].some(key=>inspect(row[key],depth+1));
  }
  return inspect(error,0);
}
function sessionWire(row:{id:string;creatorId:string;revision:number;context:unknown;messages:unknown;cart:unknown}):EditorSession{
  return {id:row.id,creatorId:row.creatorId,revision:row.revision,context:row.context as EditorContext,messages:row.messages as EditorSession["messages"],cart:row.cart as ChangeCart};
}
/** Caller supplies committed snapshots and the existing transaction; never starts a nested transaction. */
export async function recordManualStateChange(tx:Prisma.TransactionClient,input:{creatorId:string;actorId:string;before:EditorState;after:EditorState;actions:EditAction[];scope:string}):Promise<CommitReceipt>{
  const {creatorId,actorId,before,after,actions,scope}=input,id=randomUUID(),commitId=randomUUID();
  const preview=buildChangeCart(before,after,actions,1);
  const receipt:CommitReceipt={id:commitId,sessionId:id,committedAt:new Date().toISOString(),actionCount:Math.max(actions.length,1),affectedPostIds:preview.items.filter(i=>i.targetType==="post"&&fingerprint(i.before)!==fingerprint(i.after)).map(i=>i.targetId),preservedExceptions:preview.items.filter(i=>i.targetType==="post"&&(i.exception||i.preservedReason)&&fingerprint(i.before)===fingerprint(i.after)).map(i=>i.targetId),notice:RENAME_NOTICE};
  await tx.galleryEditorSession.create({data:{id,creatorId,actorId,revision:1,context:{selectedPostIds:before.scope.posts},messages:[],cart:json({revision:1,actions:[],items:[],dependencies:{},conflicts:[],notice:RENAME_NOTICE,origin:"manual"})}});
  await tx.galleryEditorCommit.create({data:{id:commitId,creatorId,actorId,sessionId:id,idempotencyKey:`manual:${commitId}`,origin:"manual",scope,actions:json(actions),before:json(before),after:json(after),dependencies:json(dependencies(before)),receipt:json(receipt)}});
  return receipt;
}
export class GalleryEditorService {
  constructor(readonly prisma:PrismaClient){}
  /** Existing Inspect Save is an explicit manual commit; uses the same journal/transaction as AI Apply. */
  async applyManualPresentation(creatorId:string,actorId:string,postId:string,fragments:PostPresentationUpsertPayload){
    return serializable(this.prisma,async tx=>{
      const seed:EditAction={id:randomUUID(),kind:"source_post_title",postId};
      const before=await loadEditorState(tx,creatorId,[seed]);
      const old=before.tables.presentations.find(p=>s(p,"postId")===postId);
      const mode=fragments.titleMode??s(old,"titleMode")??"source";
      const actions:EditAction[]=[];
      if(fragments.titleMode!==undefined||fragments.relayTitle!==undefined){
        if(mode==="custom")actions.push({id:randomUUID(),kind:"rename_post",postId,title:fragments.relayTitle??s(old,"relayTitle")});
        else actions.push({id:randomUUID(),kind:mode==="inherit_work"?"inherit_post_title":"source_post_title",postId});
      }
      if(fragments.relayDescription!==undefined)actions.push({id:randomUUID(),kind:"set_description",postId,description:fragments.relayDescription});
      const after=simulateEditorActions(before,creatorId,actions);
      let presentation=after.tables.presentations.find(p=>s(p,"postId")===postId);
      if(!presentation){presentation={id:randomUUID(),creatorId,postId,titleMode:"source",relayTitle:null,relayDescription:null,mediaOrder:[],tierPreviewSettings:null,promoPreviewMediaId:null};after.tables.presentations.push(presentation);}
      if(fragments.mediaOrder!==undefined){
        const ids=fragments.mediaOrder;
        const assets=await tx.mediaAsset.findMany({where:{creatorId,id:{in:ids}}});
        if(new Set(ids).size!==ids.length||assets.length!==ids.length||assets.some(a=>a.primaryPostId!==postId&&!a.postIds.includes(postId)))throw new EditorError("INVALID_MEDIA","Media must belong to this post.");
        presentation.mediaOrder=ids;
      }
      if(fragments.promoPreviewMediaId){const asset=await tx.mediaAsset.findFirst({where:{id:fragments.promoPreviewMediaId,creatorId,upstreamStatus:"active"}});if(!asset)throw new EditorError("INVALID_MEDIA","Preview media is unavailable.");}
      if(fragments.tierPreviewSettings!==undefined)presentation.tierPreviewSettings=fragments.tierPreviewSettings;
      if(fragments.promoPreviewMediaId!==undefined)presentation.promoPreviewMediaId=fragments.promoPreviewMediaId;
      await persistEditorState(tx,before,after);
      const committed=await loadEditorState(tx,creatorId,[seed],true,before.scope),id=randomUUID(),commitId=randomUUID();
      const receipt:CommitReceipt={id:commitId,sessionId:id,committedAt:new Date().toISOString(),actionCount:Math.max(actions.length,1),affectedPostIds:[postId],preservedExceptions:[],notice:RENAME_NOTICE};
      await tx.galleryEditorSession.create({data:{id,creatorId,actorId,revision:1,context:{selectedPostIds:[postId]},messages:[],cart:json({revision:1,actions:[],items:[],dependencies:{},conflicts:[],notice:RENAME_NOTICE,origin:"manual"})}});
      await tx.galleryEditorCommit.create({data:{id:commitId,creatorId,actorId,sessionId:id,idempotencyKey:`manual:${commitId}`,origin:"manual",scope:"post_presentation",actions:json(actions),before:json(before),after:json(committed),dependencies:json(dependencies(before)),receipt:json(receipt)}});
      return {presentation:await tx.postPresentation.findUniqueOrThrow({where:{postId}}),receipt};
    });
  }
  async create(creatorId:string,actorId:string,context:EditorContext):Promise<EditorSession>{
    if(context.selectedPostIds.length){const count=await this.prisma.post.count({where:{creatorId,id:{in:context.selectedPostIds}}});if(count!==new Set(context.selectedPostIds).size)throw new EditorError("INVALID_TARGET","Selection contains unavailable posts.",404);}
    const cart:ChangeCart={revision:0,actions:[],items:[],dependencies:{},conflicts:[],notice:RENAME_NOTICE};
    const row=await this.prisma.galleryEditorSession.create({data:{id:randomUUID(),creatorId,actorId,revision:0,context:json(context),messages:[],cart:json(cart)}});
    return this.read(creatorId,actorId,row.id);
  }
  async read(creatorId:string,actorId:string,id:string,db:EditorDb=this.prisma):Promise<EditorSession>{
    const row=await db.galleryEditorSession.findFirst({where:{id,creatorId,actorId}});
    if(!row)throw new EditorError("NOT_FOUND","Editor session not found.",404);
    const session=sessionWire(row);
    const receipt=await db.galleryEditorCommit.findFirst({where:{creatorId,actorId,reversalOfId:null},orderBy:{createdAt:"desc"}});
    if(receipt){session.lastReceipt={...(receipt.receipt as unknown as CommitReceipt),...(receipt.reversedAt?{reversedAt:receipt.reversedAt.toISOString()}:{})};session.lastReceipt.summary=receiptCopy(session.lastReceipt);}
    return session;
  }
  async revise(creatorId:string,actorId:string,id:string,revision:number,actions:EditAction[],context?:EditorContext,messages?:EditorSession["messages"],origin:"manual"|"ai"="manual",compiled?:{patch:CartPatch;factualPreview:boolean;uninspectedMediaCount?:number}):Promise<EditorSession>{
    return serializable(this.prisma,async tx=>{
      const session=await this.read(creatorId,actorId,id,tx);checkRevision(session.revision,revision);
      if(compiled)actions=mergeCartPatch(session.cart,compiled.patch);
      const before=await loadEditorState(tx,creatorId,actions),after=simulateEditorActions(before,creatorId,actions);
      const next=revision+1,cart=buildChangeCart(before,after,actions,next);
      cart.origin=session.cart.actions.length && session.cart.origin && session.cart.origin!==origin ? "mixed" : origin;
      cart.actionOrigins=Object.fromEntries(actions.map(action=>{
        const prior=session.cart.actions.find(a=>a.id===action.id);
        return [action.id,prior&&fingerprint(prior)===fingerprint(action)?session.cart.actionOrigins?.[action.id]??(session.cart.origin==='ai'?'ai':'manual'):origin];
      }));
      if(compiled?.factualPreview&&messages?.length)messages=[...messages.slice(0,-1),{role:'assistant',text:previewCopy(cart)+(compiled.uninspectedMediaCount?` ${compiled.uninspectedMediaCount} requested media could not be inspected. Visual observations cover only inspected images.`:'')}];
      const ctx=context??session.context;
      if(ctx.selectedPostIds.length){const count=await tx.post.count({where:{creatorId,id:{in:ctx.selectedPostIds}}});if(count!==new Set(ctx.selectedPostIds).size)throw new EditorError("INVALID_TARGET","Selection contains unavailable posts.",404);}
      const changed=await tx.galleryEditorSession.updateMany({where:{id,creatorId,actorId,revision},data:{revision:next,cart:json(cart),context:json(ctx),...(messages?{messages:json(messages.slice(-40))}:{})}});
      if(changed.count!==1)throw new EditorError("STALE_CART","The cart was edited in another tab.",409);
      return this.read(creatorId,actorId,id,tx);
    });
  }
  async apply(creatorId:string,actorId:string,id:string,revision:number,idempotencyKey:string,origin?:string):Promise<CommitReceipt>{
    if(!idempotencyKey||idempotencyKey.length>200)throw new EditorError("INVALID_KEY","An idempotency key is required.");
    try{return await serializable(this.prisma,async tx=>{
      const replay=await tx.galleryEditorCommit.findUnique({where:{creatorId_idempotencyKey:{creatorId,idempotencyKey}}});
      if(replay){if(replay.actorId!==actorId||replay.sessionId!==id||(replay.receipt as unknown as {revision?:number}).revision!==revision)throw new EditorError("KEY_REUSED","This key belongs to another operation.",409);return replay.receipt as unknown as CommitReceipt;}
      await tx.$queryRaw`SELECT id FROM gallery_editor_sessions WHERE id = ${id} AND creator_id = ${creatorId} AND actor_id = ${actorId} FOR UPDATE`;
      const session=await this.read(creatorId,actorId,id,tx);checkRevision(session.revision,revision);
      if(!session.cart.actions.length||session.cart.conflicts.length)throw new EditorError("INVALID_CART","The cart is empty or unresolved.");
      const before=await loadEditorState(tx,creatorId,session.cart.actions);checkDependencies(session.cart.dependencies,before);
      const proposed=simulateEditorActions(before,creatorId,session.cart.actions);
      await persistEditorState(tx,before,proposed);
      // Re-read database generated timestamps for precise future Undo conflict checks.
      const after=await loadEditorState(tx,creatorId,session.cart.actions,true,before.scope);
      const commitId=randomUUID();
      const preview=buildChangeCart(before,after,session.cart.actions,revision);
      const changedPosts=preview.items.filter(i=>i.targetType==="post"&&fingerprint(i.before)!==fingerprint(i.after));
      const receipt:CommitReceipt & {revision:number}={id:commitId,sessionId:id,revision,committedAt:new Date().toISOString(),actionCount:session.cart.actions.length,affectedPostIds:changedPosts.map(i=>i.targetId),preservedExceptions:preview.items.filter(i=>i.targetType==="post"&&(i.exception||i.preservedReason)&&fingerprint(i.before)===fingerprint(i.after)).map(i=>i.targetId),notice:RENAME_NOTICE};
      receipt.titleModeCounts={};
      for(const item of preview.items)if(item.targetType==='post'||item.targetType==='work'){
        const mode=(item.after as {titleMode?:string}|null)?.titleMode;
        if(mode&&['source','inherit_work','custom','independent','inherit_series'].includes(mode)){
          const key=mode as keyof NonNullable<CommitReceipt['titleModeCounts']>;
          receipt.titleModeCounts[key]=(receipt.titleModeCounts[key]??0)+1;
        }
      }
      receipt.summary=receiptCopy(receipt);
      await tx.galleryEditorCommit.create({data:{id:commitId,creatorId,actorId,sessionId:id,idempotencyKey,origin:origin??session.cart.origin??"manual",actions:json(session.cart.actions),before:json(before),after:json(after),dependencies:json(session.cart.dependencies),receipt:json(receipt)}});
      const empty:ChangeCart={revision:revision+1,actions:[],items:[],dependencies:{},conflicts:[],notice:RENAME_NOTICE};
      await tx.galleryEditorSession.update({where:{id},data:{revision:revision+1,cart:json(empty)}});
      return receipt;
    });}catch(error){
      if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==="P2002"){
        const replay=await this.prisma.galleryEditorCommit.findUnique({where:{creatorId_idempotencyKey:{creatorId,idempotencyKey}}});
        if(replay&&replay.actorId===actorId&&replay.sessionId===id&&(replay.receipt as unknown as {revision:number}).revision===revision)return replay.receipt as unknown as CommitReceipt;
      }throw error;
    }
  }
  async undo(creatorId:string,actorId:string,commitId:string):Promise<CommitReceipt>{
    return serializable(this.prisma,async tx=>{
      await tx.$queryRaw`SELECT id FROM gallery_editor_commits WHERE id = ${commitId} AND creator_id = ${creatorId} AND actor_id = ${actorId} FOR UPDATE`;
      const commit=await tx.galleryEditorCommit.findFirst({where:{id:commitId,creatorId,actorId}});
      if(!commit)throw new EditorError("NOT_FOUND","Commit not found.",404);
      if(commit.reversalOfId)throw new EditorError("INVALID_UNDO","A reversal cannot itself be undone.",409);
      if(commit.reversedAt){const receipt={...(commit.receipt as unknown as CommitReceipt),reversedAt:commit.reversedAt.toISOString()};return {...receipt,summary:receiptCopy(receipt)};}
      const actions=commit.actions as unknown as EditAction[],before=commit.before as unknown as EditorState,after=commit.after as unknown as EditorState;
      const current=await loadEditorState(tx,creatorId,actions,true,after.scope);
      checkDependencies(dependencies(after),current);
      await persistEditorState(tx,current,before);
      const now=new Date(),receipt={...(commit.receipt as unknown as CommitReceipt),reversedAt:now.toISOString()};
      receipt.summary=receiptCopy(receipt);
      await tx.galleryEditorCommit.create({data:{id:randomUUID(),creatorId,actorId,sessionId:commit.sessionId,idempotencyKey:`undo:${commitId}`,origin:"manual",reversalOfId:commitId,actions:[],before:json(current),after:json(before),dependencies:json(dependencies(current)),receipt:json(receipt)}});
      await tx.galleryEditorCommit.update({where:{id:commitId},data:{reversedAt:now}});
      const session=await this.read(creatorId,actorId,commit.sessionId,tx);
      // Existing proposals remain inspectable but must be refreshed after reversing their dependencies.
      await tx.galleryEditorSession.update({where:{id:commit.sessionId},data:{revision:{increment:1},cart:json({...session.cart,revision:session.revision+1,conflicts:session.cart.actions.length?["Content was undone. Refresh this cart before Apply."]:[]})}});
      return receipt;
    });
  }
}
