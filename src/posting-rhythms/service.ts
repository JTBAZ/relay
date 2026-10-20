import { createHash } from "node:crypto";
import { CreatorPlan, Prisma, type PrismaClient } from "@prisma/client";
import { requireCreatorPlanAtLeast } from "../billing/creator-plan-entitlement-service.js";
import { isPostingAssistantAllowedForCreator } from "../creator/creator-feature-flags-service.js";
import { stripHtmlForSearch } from "../gallery/query.js";
import { listConnectedPlatforms } from "../distribution/connected-platforms-service.js";
import { createCreatorScheduleEvent } from "../distribution/creator-schedule-event-service.js";
import { resolveRelayWebBase } from "../distribution/schedule-reminder-extension-api.js";
import { buildDistributionPlanCreateData, buildDistributionVariantCreateData } from "../distribution/distribution-row-builders.js";
import { getDistributionPlanById } from "../distribution/post-distribution-service.js";
import { applyPostingAssistantToVariants } from "../distribution/posting-assistant-service.js";
import type { FormattedPlatformVariant } from "../distribution/platform-formatters.js";
import { matchesRhythm, parseRhythmConfig, parseDescription, rhythmDueAt, RhythmError, validRhythmReceipt, type RhythmConfig, type RhythmRoute, type RhythmDestination } from "./contract.js";

type Tx=Prisma.TransactionClient;
const json=(x:unknown)=>JSON.parse(JSON.stringify(x)) as Prisma.InputJsonValue;
const key=(x:string)=>createHash('sha256').update(x).digest('hex');
const lock=(tx:Tx,k:string)=>tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${k},0))`;
export async function assertRhythmAccess(db:PrismaClient,creatorId:string){
  if (!(await requireCreatorPlanAtLeast(db,creatorId,CreatorPlan.autopost)).ok) throw new RhythmError('Posting Rhythms requires Autopost.',403,'PLAN_REQUIRED');
}
async function sourceAccount(db:PrismaClient|Tx,creatorId:string){
  const p=await db.creatorProfile.findFirst({where:{tenant:{relayCreatorId:creatorId}},select:{patreonCampaignId:true,displayName:true,username:true}});
  if(!p?.patreonCampaignId)return p;
  const canonical=p.patreonCampaignId.startsWith('patreon_campaign_')?p.patreonCampaignId:'patreon_campaign_'+p.patreonCampaignId;
  const campaign=await db.campaign.findFirst({where:{creatorId,id:{in:[p.patreonCampaignId,canonical]}},select:{id:true}});
  return {...p,patreonCampaignId:campaign?.id??canonical};
}
async function checkConfig(db:PrismaClient,creatorId:string,config:RhythmConfig){
  await assertRhythmAccess(db,creatorId);
  const profile=await sourceAccount(db,creatorId);
  if(!profile?.patreonCampaignId || config.source!==profile.patreonCampaignId)throw new RhythmError('Reconnect your Patreon creator account.',409,'SOURCE_DISCONNECTED');
  const ids=[...new Set(config.routes.filter(r=>r.media==='preview').map(r=>r.templateId!))];
  if(ids.length && await db.creatorPreviewTemplate.count({where:{creatorId,id:{in:ids}}})!==ids.length)throw new RhythmError('Choose a preview type saved in your account.');
  if(config.routes.some(r=>r.coach) && !await isPostingAssistantAllowedForCreator(db,creatorId))throw new RhythmError('Coach is not available on your current plan.',403,'COACH_UNAVAILABLE');
}
export async function rhythmBootstrap(db:PrismaClient,creatorId:string){
  await assertRhythmAccess(db,creatorId);
  const [profile,platforms,templates,rhythms,drafts,posts,coach]=await Promise.all([
    sourceAccount(db,creatorId),listConnectedPlatforms(db,creatorId),db.creatorPreviewTemplate.findMany({where:{creatorId},orderBy:{updatedAt:'desc'},take:100}),
    db.creatorPostingRhythm.findMany({where:{creatorId,status:{not:'archived'}},orderBy:{updatedAt:'desc'},take:100}),
    db.creatorPostingRhythmDraft.findMany({where:{creatorId},orderBy:{createdAt:'desc'},take:100}),
    db.post.findMany({where:{creatorId,source:'PATREON',upstreamStatus:'active',publishState:'published'},include:{versions:{orderBy:{versionSeq:'desc'},take:1}},orderBy:{createdAt:'desc'},take:50}),
    isPostingAssistantAllowedForCreator(db,creatorId)
  ]);
  return {source:profile?.patreonCampaignId?{id:profile.patreonCampaignId,label:profile.displayName||profile.username||'Patreon creator'}:null,platforms,
    templates:templates.map(t=>({id:t.id,name:t.name,config:t.config})),rhythms,drafts,coach,
    posts:posts.map(p=>({id:p.id,title:p.versions[0]?.title||'Untitled',description:stripHtmlForSearch(p.versions[0]?.description||''),mediaIds:p.versions[0]?.mediaIds||[]})),emailAvailable:false};
}
export async function saveRhythm(db:PrismaClient,creatorId:string,input:unknown,id?:string,version?:number){
  const config=parseRhythmConfig(input);await checkConfig(db,creatorId,config);
  return db.$transaction(async tx=>{
    await lock(tx,'rhythms:'+creatorId);
    const old=id?await tx.creatorPostingRhythm.findFirst({where:{id,creatorId,status:{not:'archived'}}}):null;
    if(id&&!old)throw new RhythmError('Rhythm not found.',404);
    if(old&&old.version!==version)throw new RhythmError('This rhythm changed in another window. Reload it before saving.',409,'RHYTHM_CONFLICT');
    if(!old&&await tx.creatorPostingRhythm.count({where:{creatorId,status:{not:'archived'}}})>=100)throw new RhythmError('Archive a rhythm before adding another.');
    if(config.useDefault)await tx.creatorPostingRhythm.updateMany({where:{creatorId,isDefault:true},data:{isDefault:false}});
    const row=old?await tx.creatorPostingRhythm.update({where:{id:old.id},data:{name:config.name,config:json(config),version:{increment:1},isDefault:config.useDefault,alwaysOn:config.alwaysOn,
      ...(!old.alwaysOn&&config.alwaysOn?{eligibleFrom:new Date(),cursor:Prisma.DbNull}:{})}}):await tx.creatorPostingRhythm.create({data:{creatorId,name:config.name,config:json(config),isDefault:config.useDefault,alwaysOn:config.alwaysOn}});
    const changedAt=new Date();await tx.creatorPostingRhythmWindow.updateMany({where:{rhythmId:row.id,eligibleTo:null},data:{eligibleTo:changedAt,nextMatch:false}});
    await tx.creatorPostingRhythmWindow.create({data:{rhythmId:row.id,version:row.version,config:json(config),eligibleFrom:old?changedAt:row.eligibleFrom,alwaysOn:config.alwaysOn&&row.status==='active',nextMatch:row.armed&&row.status==='active'}});
    for(const route of config.routes)for(const destination of route.destinations)await tx.creatorDistributionRule.create({data:{id:`rhythm:${row.id}:v${row.version}:${route.id}:${destination}`,creatorId,rhythmId:row.id,status:'active',offsetDays:route.days,targetDestinations:[destination],transformMode:route.media,title:config.name,draftOnly:true}});
    return row;
  });
}
export async function setRhythmStatus(db:PrismaClient,creatorId:string,id:string,version:number,status:unknown){
  await assertRhythmAccess(db,creatorId);if(!['active','paused','archived'].includes(String(status)))throw new RhythmError('Invalid rhythm status.');
  return db.$transaction(async tx=>{await lock(tx,'rhythms:'+creatorId);const row=await tx.creatorPostingRhythm.findFirst({where:{id,creatorId,version,status:{not:'archived'}}});if(!row)throw new RhythmError('Reload this rhythm before changing it.',409,'RHYTHM_CONFLICT');
    const result=await tx.creatorPostingRhythm.update({where:{id},data:{status:String(status),version:{increment:1},...(status==='active'?{eligibleFrom:new Date(),cursor:Prisma.DbNull}:{})}});
    const changedAt=new Date();await tx.creatorPostingRhythmWindow.updateMany({where:{rhythmId:id,eligibleTo:null},data:{eligibleTo:changedAt,nextMatch:false}});
    await tx.creatorPostingRhythmWindow.create({data:{rhythmId:id,version:result.version,config:row.config as Prisma.InputJsonValue,eligibleFrom:changedAt,alwaysOn:status==='active'&&row.alwaysOn,nextMatch:status==='active'&&row.armed}});
    // Status edits preserve the current rule revision; source enrollment references it explicitly.
    const config=row.config as unknown as RhythmConfig;
    for(const route of config.routes)for(const destination of route.destinations)await tx.creatorDistributionRule.upsert({where:{id:`rhythm:${id}:v${result.version}:${route.id}:${destination}`},create:{id:`rhythm:${id}:v${result.version}:${route.id}:${destination}`,creatorId,rhythmId:id,targetDestinations:[destination],offsetDays:route.days,transformMode:route.media,title:config.name},update:{}});
    if(status==='archived')await tx.creatorDistributionRuleRun.updateMany({where:{creatorId,rule:{rhythmId:id},status:{in:['pending','materialized']}},data:{status:'cancelled'}});
    return result;
  });
}
export async function saveDescription(db:PrismaClient,creatorId:string,name:unknown,fields:unknown){
  await assertRhythmAccess(db,creatorId);if(typeof name!=='string'||!name.trim()||name.length>80)throw new RhythmError('Name this draft.');
  const copy=parseDescription(fields);return db.creatorPostingRhythmDraft.create({data:{creatorId,name:name.trim(),fields:json(copy)}});
}
export type EnrollmentSnapshot={config:RhythmConfig;version:number;postId:string;postVersionId:string;publishedAt:string;mediaId:string;mediaRevision:string;title:string;body:string;templates:Record<string,unknown>;rules:Record<string,string>};
async function createReadyRuns(tx:Tx,enrollment:{id:string;creatorId:string;sourcePostId:string;snapshot:unknown}){
  const s=enrollment.snapshot as EnrollmentSnapshot;
  const rows=await tx.creatorDistributionRuleRun.findMany({where:{rhythmEnrollmentId:enrollment.id}});
  for(const route of s.config.routes)for(const destination of route.destinations){
    const ruleId=s.rules[route.id+'|'+destination];if(rows.some(r=>r.ruleId===ruleId))continue;
    const parent=route.anchor==='source'?null:rows.find(r=>r.rhythmRouteId===route.anchor&&s.rules[route.anchor+'|'+destination]===r.ruleId);
    if(route.anchor!=='source'&&!parent?.receiptAt)continue;
    const anchor=parent?.receiptAt??new Date(s.publishedAt);let dueAt=anchor,failureReason:string|null=null;
    try{dueAt=rhythmDueAt(anchor,route,s.config.timezone);}catch(err){failureReason=err instanceof Error?err.message:'Choose a later posting date.';}
    await tx.creatorDistributionRuleRun.upsert({where:{ruleId_sourcePostId:{ruleId,sourcePostId:enrollment.sourcePostId}},create:{id:'rhythm_run_'+key(enrollment.id+'|'+route.id+'|'+destination),ruleId,creatorId:enrollment.creatorId,sourcePostId:enrollment.sourcePostId,sourcePublishedAt:new Date(s.publishedAt),dueAt,status:failureReason?'failed':'pending',failureReason,rhythmEnrollmentId:enrollment.id,rhythmRouteId:route.id,idempotencyKey:'rhythm:'+key(enrollment.id+'|'+route.id+'|'+destination)},update:{}});
  }
}
async function enroll(tx:Tx,rhythm:{id:string;creatorId:string;version:number;config:unknown},postId:string){
  const existing=await tx.creatorPostingRhythmEnrollment.findUnique({where:{rhythmId_sourcePostId:{rhythmId:rhythm.id,sourcePostId:postId}}});if(existing)return existing;
  const config=rhythm.config as RhythmConfig;
  const post=await tx.post.findFirst({where:{id:postId,creatorId:rhythm.creatorId,campaignId:config.source,source:'PATREON',upstreamStatus:'active',publishState:'published'},include:{versions:{orderBy:{versionSeq:'desc'}}}});
  const version=post?.versions[0],first=post?.versions.filter(v=>v.publishedAt).at(-1);
  if(!post||!version||!first?.publishedAt)throw new RhythmError('Choose a published Patreon post from this account.');
  const images=await tx.mediaAsset.findMany({where:{id:{in:version.mediaIds},creatorId:rhythm.creatorId,upstreamStatus:'active',currentMimeType:{startsWith:'image/'},processingStatus:'READY'}});
  const text=stripHtmlForSearch(version.description||'');
  const links=Array.from((version.description||'').matchAll(/href\s*=\s*["'](https?:[^"']+)/gi),m=>m[1].replace(/&amp;/g,'&'));
  if(!matchesRhythm(config,{text:version.title+'\n'+text,images:images.length,links}))return null;
  if(images.length!==1)throw new RhythmError('This rhythm needs exactly one image. Select a one-image post.');
  const templates:Record<string,unknown>={},rules:Record<string,string>={};
  for(const r of config.routes){if(r.templateId&&r.media==='preview'){const t=await tx.creatorPreviewTemplate.findFirst({where:{id:r.templateId,creatorId:rhythm.creatorId}});if(!t)throw new RhythmError('A saved preview type is no longer available.');templates[r.templateId]=t.config;}
    for(const dest of r.destinations)rules[r.id+'|'+dest]=`rhythm:${rhythm.id}:v${rhythm.version}:${r.id}:${dest}`;}
  const snapshot:EnrollmentSnapshot={config,version:rhythm.version,postId,postVersionId:version.id,publishedAt:first.publishedAt.toISOString(),mediaId:images[0].id,mediaRevision:images[0].currentUpstreamRevision,title:version.title,body:text,templates,rules};
  const row=await tx.creatorPostingRhythmEnrollment.create({data:{rhythmId:rhythm.id,creatorId:rhythm.creatorId,sourcePostId:postId,snapshot:json(snapshot)}});await createReadyRuns(tx,row);return row;
}
export async function confirmRhythm(db:PrismaClient,creatorId:string,id:string,version:number,postId:string|null){
  await assertRhythmAccess(db,creatorId);
  return db.$transaction(async tx=>{await lock(tx,'rhythms:'+creatorId);const row=await tx.creatorPostingRhythm.findFirst({where:{id,creatorId,version,status:'active'}});if(!row)throw new RhythmError('Save or resume this rhythm before confirming a plan.',409);
    if(!postId){
      if(row.armed)return row;
      const changedAt=new Date();await tx.creatorPostingRhythmWindow.updateMany({where:{rhythmId:id,eligibleTo:null},data:{eligibleTo:changedAt,nextMatch:false}});
      await tx.creatorPostingRhythmWindow.create({data:{rhythmId:id,version:row.version,config:row.config as Prisma.InputJsonValue,eligibleFrom:changedAt,alwaysOn:row.alwaysOn,nextMatch:true}});
      return tx.creatorPostingRhythm.update({where:{id},data:{armed:true}});
    }
    const result=await enroll(tx,row,postId);if(!result)throw new RhythmError('This post does not match the rhythm filters.');return result;
  });
}
async function availableSource(db:PrismaClient|Tx,creatorId:string,s:EnrollmentSnapshot){
  const [post,media]=await Promise.all([db.post.findFirst({where:{id:s.postId,creatorId,upstreamStatus:'active',publishState:'published'}}),db.mediaAsset.findFirst({where:{id:s.mediaId,creatorId,upstreamStatus:'active',currentUpstreamRevision:s.mediaRevision,processingStatus:'READY'}})]);
  if(!post||!media)throw new RhythmError('The pinned source image is no longer available. Review this release before retrying.',409);
}
export async function reconcileRhythms(db:PrismaClient,options:{creatorId?:string;now?:Date}={}){
  if(['0','false','off'].includes((process.env.RELAY_FEATURE_DISTRIBUTION_RULES||'true').toLowerCase()))return {rules:0,runs_created:0,materialized:0,failed:0};
  const now=options.now??new Date();const where=options.creatorId?{creatorId:options.creatorId}:{};
  const rhythms=await db.creatorPostingRhythm.findMany({where:{...where},take:200,orderBy:{lastCheckedAt:'asc'}});
  let created=0,materialized=0;
  for(const rhythm of rhythms){
    try{await assertRhythmAccess(db,rhythm.creatorId);}catch{continue;}
    const profile=await sourceAccount(db,rhythm.creatorId);
    await db.$transaction(async tx=>{
      await lock(tx,'rhythms:'+rhythm.creatorId);const row=await tx.creatorPostingRhythm.findUnique({where:{id:rhythm.id}});if(!row)return;await tx.creatorPostingRhythm.update({where:{id:row.id},data:{lastCheckedAt:now}});
      if(row.status==='active'){
        const windows=await tx.creatorPostingRhythmWindow.findMany({where:{rhythmId:row.id,OR:[{alwaysOn:true},{nextMatch:true}]},orderBy:{eligibleFrom:'asc'}});
        for(const window of windows){
          const config=window.config as unknown as RhythmConfig;if(profile?.patreonCampaignId!==config.source)continue;
          const cursor=window.cursor as {at:string;id:string}|null;
          const versions=await tx.postVersion.findMany({where:{ingestedAt:{gte:window.eligibleFrom,lte:now},post:{creatorId:row.creatorId,campaignId:config.source,source:'PATREON',upstreamStatus:'active',publishState:'published'},...(cursor?{OR:[{ingestedAt:{gt:new Date(cursor.at),lte:now}},{ingestedAt:new Date(cursor.at),id:{gt:cursor.id}}]}:{})},orderBy:[{ingestedAt:'asc'},{id:'asc'}],take:100});
          let nextMatch=window.nextMatch;
          for(const v of versions){
            const first=await tx.postVersion.findFirst({where:{postId:v.postId,publishedAt:{not:null}},orderBy:{versionSeq:'asc'}});
            if(first?.publishedAt&&first.publishedAt>=window.eligibleFrom&&first.publishedAt<=now&&(!window.eligibleTo||first.publishedAt<window.eligibleTo)){
              try{
                const existed=await tx.creatorPostingRhythmEnrollment.findUnique({where:{rhythmId_sourcePostId:{rhythmId:row.id,sourcePostId:v.postId}}});
                const accepted=existed??await enroll(tx,{...row,config:window.config,version:window.version},v.postId);
                if(accepted&&!existed){created++;if(nextMatch){nextMatch=false;await tx.creatorPostingRhythm.update({where:{id:row.id},data:{armed:false}});await tx.creatorPostingRhythmWindow.update({where:{id:window.id},data:{nextMatch:false}});}}
              }catch(e){if(!(e instanceof RhythmError))throw e;}
            }
            await tx.creatorPostingRhythmWindow.update({where:{id:window.id},data:{cursor:json({at:v.ingestedAt.toISOString(),id:v.id})}});
            if(!window.alwaysOn&&!nextMatch)break;
          }
        }
      }
      const runs=await tx.creatorDistributionRuleRun.findMany({where:{creatorId:row.creatorId,rule:{rhythmId:row.id},status:{in:['materialized','cancelled']},planId:{not:null},receiptAt:null},include:{rhythmEnrollment:true},take:100});
      for(const run of runs){
        const s=run.rhythmEnrollment!.snapshot as unknown as EnrollmentSnapshot,dest=Object.keys(s.rules).find(k=>s.rules[k]===run.ruleId)!.split('|')[1] as RhythmDestination;
        const attempt=await tx.postDistributionAttempt.findFirst({where:{creatorId:row.creatorId,status:'posted',variant:{planId:run.planId!},externalUrl:{not:null}},orderBy:{completedAt:'asc'}});
        if(!attempt?.completedAt||!validRhythmReceipt(dest,attempt.externalUrl!,s.config.accounts[dest]!))continue;
        const changed=await tx.creatorDistributionRuleRun.updateMany({where:{id:run.id,receiptAt:null},data:{status:'completed',receiptAt:attempt.completedAt,receiptUrl:attempt.externalUrl,completedAt:attempt.completedAt}});
        if(changed.count){if(run.materializedEventId)await tx.creatorScheduleEvent.updateMany({where:{id:run.materializedEventId,creatorId:row.creatorId},data:{status:'done'}});if(row.status==='active')await createReadyRuns(tx,run.rhythmEnrollment!);}
      }
      if(row.status==='active'){const accepted=await tx.creatorPostingRhythmEnrollment.findMany({where:{rhythmId:row.id},take:100,orderBy:{createdAt:'desc'}});for(const enrollment of accepted)await createReadyRuns(tx,enrollment);}
    },{timeout:30000});
  }
  const due=await db.creatorDistributionRuleRun.findMany({where:{...where,rule:{rhythmId:{not:null},rhythm:{status:'active'}},status:'pending',dueAt:{lte:now}},include:{rule:true,rhythmEnrollment:true},orderBy:{dueAt:'asc'},take:100});
  for(const run of due){try{
    await assertRhythmAccess(db,run.creatorId);
    await db.$transaction(async tx=>{await lock(tx,'rhythms:'+run.creatorId);await lock(tx,'rhythm-run:'+run.id);const owner=await tx.creatorPostingRhythm.findUnique({where:{id:run.rule.rhythmId!}});if(owner?.status!=='active')return;const current=await tx.creatorDistributionRuleRun.findUnique({where:{id:run.id}});if(!current||current.status!=='pending')return;
      const s=run.rhythmEnrollment!.snapshot as unknown as EnrollmentSnapshot;const connected=await sourceAccount(tx,run.creatorId);if(connected?.patreonCampaignId!==s.config.source)throw new RhythmError('Reconnect the source account before preparing this release.',409);await availableSource(tx,run.creatorId,s);
      const eventId='rhythm_event_'+key(run.id),link=resolveRelayWebBase(process.env)+'/studio/rhythms?action='+encodeURIComponent(run.id);
      if(!await tx.creatorScheduleEvent.findUnique({where:{id:eventId}}))await createCreatorScheduleEvent(tx as unknown as PrismaClient,run.creatorId,{event_type:'custom',due_at:run.dueAt.toISOString(),title:'Review '+s.config.name,note:'rhythm_action:'+run.id,external_url:link,remind_me:true},{trustedEventId:eventId});
      await tx.creatorDistributionRuleRun.update({where:{id:run.id},data:{status:'materialized',materializedAt:now,expiresAt:new Date(+now+72*3600000),materializedEventId:eventId,previewTemplateSnapshot:s.templates[s.config.routes.find(r=>r.id===run.rhythmRouteId)!.templateId!] as Prisma.InputJsonValue??Prisma.DbNull}});materialized++;
    });
  }catch(err){if(err instanceof RhythmError)await db.creatorDistributionRuleRun.updateMany({where:{id:run.id,status:'pending'},data:{status:'failed',failureReason:err.message}});else throw err;}}
  return {rules:rhythms.length,runs_created:created,materialized,failed:0};
}
export async function listRhythmRuns(db:PrismaClient,creatorId:string){
  await assertRhythmAccess(db,creatorId);
  return db.creatorPostingRhythmEnrollment.findMany({where:{creatorId},include:{runs:{orderBy:{dueAt:'asc'},include:{rule:{select:{targetDestinations:true}}}},rhythm:{select:{name:true,status:true}}},orderBy:{createdAt:'desc'},take:100});
}
export async function rhythmAction(db:PrismaClient,creatorId:string,id:string,readOnly=false){
  await assertRhythmAccess(db,creatorId);
  const run=await db.creatorDistributionRuleRun.findFirst({where:{id,creatorId,rhythmEnrollmentId:{not:null}},include:{rule:{include:{rhythm:true}},rhythmEnrollment:true}});
  if(!run?.rhythmEnrollment)throw new RhythmError('Release not found.',404);
  if(!readOnly&&run.rule.rhythm?.status!=='active')throw new RhythmError('Resume this rhythm to review its releases.',409);
  if(!['materialized','completed'].includes(run.status)&&!(readOnly&&run.status==='cancelled'&&run.planId))throw new RhythmError(run.failureReason||'This release is not ready for review.',409);
  if(!readOnly&&run.status!=='completed'&&run.expiresAt&&run.expiresAt<new Date())throw new RhythmError('This review expired. Prepare it again.',409,'REVIEW_EXPIRED');
  const snapshot=run.rhythmEnrollment.snapshot as unknown as EnrollmentSnapshot;if(!readOnly)await availableSource(db,creatorId,snapshot);
  const route=snapshot.config.routes.find(r=>r.id===run.rhythmRouteId)!;
  const profile=await sourceAccount(db,creatorId);if(!readOnly&&profile?.patreonCampaignId!==snapshot.config.source)throw new RhythmError('Reconnect the source account before reviewing.',409);
  return {run,snapshot,route,destination:run.rule.targetDestinations[0] as RhythmDestination};
}
export async function prepareRhythmPlan(db:PrismaClient,creatorId:string,id:string,previewMediaId?:string){
  const action=await rhythmAction(db,creatorId,id),{snapshot:s,route:r,destination}=action;
  if(action.run.planId)return getDistributionPlanById(db,creatorId,action.run.planId);
  if(r.media==='preview'){
    const preview=previewMediaId?await db.mediaAsset.findFirst({where:{id:previewMediaId,creatorId,upstreamStatus:'active',processingStatus:'READY',ingestOrigin:'RELAY_UPLOAD',currentMimeType:{startsWith:'image/'}}}):null;
    if(!preview)throw new RhythmError('Export and upload the selected preview before reviewing this release.');
  }
  return db.$transaction(async tx=>{
    await lock(tx,'rhythms:'+creatorId);await lock(tx,'rhythm-run:'+id);const owner=await tx.creatorPostingRhythm.findUnique({where:{id:action.run.rule.rhythmId!}});if(owner?.status!=='active')throw new RhythmError('Resume this rhythm before preparing its releases.',409);const fresh=await tx.creatorDistributionRuleRun.findUnique({where:{id}});if(fresh?.planId)return getDistributionPlanById(tx as unknown as PrismaClient,creatorId,fresh.planId);
    const copy=r.description??{title:s.title,body:s.body,x:s.body,tags:''};

    let variants:FormattedPlatformVariant[]=[{destination,title:copy.title,bodyText:copy.body,postText:copy.x,tags:copy.tags.split(',').map(t=>t.trim()).filter(Boolean),platformFields:{media_version:r.media==='preview'?'preview':'full'},advice:{}}];
    let assistantMode='none',assistantPlan:Record<string,unknown>={};
    if(r.coach){if(!await isPostingAssistantAllowedForCreator(db,creatorId))throw new RhythmError('Coach is unavailable on your current plan.',403);const output=await applyPostingAssistantToVariants(tx as unknown as PrismaClient,creatorId,variants,{goals:['engagement_optimization'],user_notes:r.notes,timezone:s.config.timezone},new Set([destination]));if(output.assistantPlan.ai_used!==true)throw new RhythmError('Coach could not prepare changes. Retry when Coach is available.',503,'COACH_UNAVAILABLE');variants=output.variants;assistantMode=output.assistantMode;assistantPlan=output.assistantPlan;}
    const plan=await tx.postDistributionPlan.create({data:{...buildDistributionPlanCreateData({creatorId,postId:s.postId,assistantMode,assistantContext:{goals:r.coach?['engagement_optimization']:[],user_notes:r.notes},assistantPlan:{...assistantPlan,rhythm_action_id:id,rhythm_media_id:r.media==='preview'?previewMediaId:s.mediaId,rhythm_source_media_id:s.mediaId,rhythm_media_revision:s.mediaRevision,rhythm_output_revision:(await tx.mediaAsset.findUniqueOrThrow({where:{id:r.media==='preview'?previewMediaId!:s.mediaId},select:{currentUpstreamRevision:true}})).currentUpstreamRevision,rhythm_account_handle:s.config.accounts[destination],preview_media_id:r.media==='preview'?previewMediaId:null}}),rhythmActionId:id}});
    for(const variant of variants)await tx.postDistributionVariant.create({data:buildDistributionVariantCreateData({planId:plan.id,postId:s.postId,creatorId,variant,assistantEnabled:r.coach})});
    await tx.creatorDistributionRuleRun.update({where:{id},data:{planId:plan.id}});
    return getDistributionPlanById(tx as unknown as PrismaClient,creatorId,plan.id);
  },{timeout:60000});
}

/** Renew an unstarted review without replaying an uncertain or published handoff. */
export async function retryRhythmAction(db:PrismaClient,creatorId:string,id:string){
  await assertRhythmAccess(db,creatorId);
  await db.$transaction(async tx=>{
    await lock(tx,'rhythms:'+creatorId);await lock(tx,'rhythm-run:'+id);
    const row=await tx.creatorDistributionRuleRun.findFirst({where:{id,creatorId,rhythmEnrollmentId:{not:null}},include:{rule:{include:{rhythm:true}}}});
    if(!row||row.rule.rhythm?.status!=='active')throw new RhythmError('Resume this rhythm before preparing its release again.',409);
    if(row.receiptAt||!['materialized','failed','expired'].includes(row.status))throw new RhythmError('This release cannot be prepared again.',409);
    if(row.planId){
      if(await tx.postDistributionAttempt.count({where:{creatorId,variant:{planId:row.planId},status:{notIn:['failed','fill_failed','abandoned']}}}))throw new RhythmError('Confirm the existing publication before retrying this release.',409);
      await tx.postDistributionPlan.updateMany({where:{id:row.planId,creatorId,rhythmActionId:id},data:{status:'archived',rhythmActionId:null}});
    }
    await tx.creatorDistributionRuleRun.update({where:{id},data:{status:'pending',planId:null,failureReason:null,expiresAt:null}});
  });
  await reconcileRhythms(db,{creatorId});
}
