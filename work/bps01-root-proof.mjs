import assert from 'node:assert/strict';
import {open,readFile} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import express from 'express';
import request from 'supertest';
import sharp from 'sharp';
import {registerBenchScheduleRoutes} from '../dist/src/editor-bench/schedule-routes.js';
import {createBenchDistributionVariantAdapter} from '../dist/src/editor-bench/distribution-variant-adapter.js';
import {parsePlanPreviewMediaId,parseVariantMediaBinding,resolveVariantMediaIds} from '../dist/src/distribution/media-binding.js';
const out=await open('outputs/editor-bench-preview-draft-schedule-http-bps01-recheck.json','wx');
const sha=v=>createHash('sha256').update(v).digest('hex');
const report={ticket:'BPS-01',passed:false,scope:'canned_authenticated_mock_http',paidCalls:0,steps:[],checks:{},limits:['Temporary mock manual cues, not durable Schedule Rail','No browser/front-end test or paid language-quality proof']};
try{
 const baseline=JSON.parse(await readFile('work/bps01-baseline/baseline.json','utf8'));
 const texts=['Find all my sketches and prepare them for posting to Twitter. Run them through the Previewizer first.','Use Square teaser for both, and keep their existing titles.','Cancel the preview-first preparation goal.'];
 const actions=[{kind:'selection',selection:{mode:'replace',requestQuote:texts[0],selector:{base:'catalog',all:[{field:'stage',value:'sketch',requestQuote:'sketches'}],any:[],none:[]}},preparation:{destination:'x',destinationQuote:'Twitter',previewFirst:true,previewQuote:'Run them through the Previewizer first.'}},{kind:'preparation_update',templateQuote:'Square teaser',copyChoice:{kind:'existing_titles',quote:'keep their existing titles'}},{kind:'preparation_cancel',requestQuote:texts[2]}];
 let calls=0;const inputSizes=[];
 const provider={async respond(input){assert(calls<actions.length);assert.deepEqual(input.tools,[]);const bytes=Buffer.byteLength(JSON.stringify({input:input.input,tools:input.tools,responseSchema:input.responseSchema}));assert(bytes<=24576);inputSizes.push(bytes);return {output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({result:actions[calls++]})}]}]};}};
 const adapter=createBenchDistributionVariantAdapter();const app=express();app.use(express.json());
 registerBenchScheduleRoutes(app,{development:true,signingSecret:randomBytes(32),traceId:()=> 'bps01-root',authenticateCreator:async req=>req.headers['x-proof-owner']==='anonymous'?null:{creatorId:req.headers['x-proof-owner']==='foreign'?'foreign':'owner',accountId:'account'},guardMutation:async()=>true,distributionVariantAdapter:adapter,getVariantEditProvider:async()=>provider,createEvent:async()=>{throw Error('Unexpected production DB event write');},readEvent:async()=>{throw Error('Unexpected production DB event read');}});
 const base='/api/v1/editor-bench/schedule';let r=await request(app).post(base+'/conversation/session').send({});assert.equal(r.status,201);let session=r.body.data;
 const cards=structuredClone(session.cards),media=structuredClone(session.media);
 for(let n=0;n<2;n++){r=await request(app).post(base+'/conversation/turn').send({sessionId:session.sessionId,revision:session.revision,latestRequest:texts[n]});assert.equal(r.status,200);session=r.body.data;}
 const postIds=[...session.selection.postIds];assert.equal(postIds.length,2);const created=[];
 for(const [index,postId] of postIds.entries()){
  const sourceId=session.media.find(m=>m.postId===postId&&m.mimeType.startsWith('image/')).id;
  r=await request(app).post(base+'/conversation/preview/open').send({sessionId:session.sessionId,revision:session.revision,postId,mediaId:sourceId});assert.equal(r.status,200);const attempt=r.body.data.attempt.id;
  const jpeg=await sharp({create:{width:32,height:32,channels:3,background:index?'#345678':'#123456'}}).jpeg().toBuffer();
  const path=`${base}/conversation/session/${session.sessionId}/preview/${attempt}`;
  r=await request(app).post(path+'/upload').set('Content-Type','image/jpeg').send(jpeg);assert.equal(r.status,200);const previewId=r.body.data.previewMediaId;
  r=await request(app).post(path+'/complete').send({previewMediaId:previewId});assert.equal(r.status,200);session=r.body.data;
  r=await request(app).post(base+'/conversation/x-draft/review').send({sessionId:session.sessionId,revision:session.revision,postId});assert.equal(r.status,200);const creationToken=r.body.data.reviewToken;
  r=await request(app).post(base+'/conversation/x-draft/confirm').send({sessionId:session.sessionId,reviewToken:creationToken});assert.equal(r.status,201);session=r.body.data;
  created.push({receipt:structuredClone(r.body.data.receipt),creationToken,previewId,jpegHash:sha(jpeg),postId});
 }
 const totalDrafts=adapter.draftSize();assert.equal(totalDrafts,2);
 // Confirmed drafts survive both deselection and explicit goal cancellation.
 for(const postId of postIds){r=await request(app).post(base+'/conversation/selection/toggle').send({sessionId:session.sessionId,revision:session.revision,postId});assert.equal(r.status,200);session=r.body.data;}
 r=await request(app).post(base+'/conversation/turn').send({sessionId:session.sessionId,revision:session.revision,latestRequest:texts[2]});assert.equal(r.status,200);session=r.body.data;assert.equal(session.preparation,null);assert.deepEqual(session.selection.postIds,[]);
 assert.equal(session.confirmedDrafts.length,2);
 const scheduled=[];
 for(const [index,creation] of created.entries()){
  const variantId=creation.receipt.variant.id;
  const input={sessionId:session.sessionId,revision:session.revision,variantId,localDate:index?'2030-12-12':'2030-07-10',localTime:'17:30'};
  const snapshot=structuredClone({selection:session.selection,preparation:session.preparation,cards:session.cards,media:session.media});
  const invalid=await request(app).post(base+'/conversation/x-draft/schedule/review').send({...input,localDate:'2030-02-30'});assert.equal(invalid.status,400);
  const past=await request(app).post(base+'/conversation/x-draft/schedule/review').send({...input,localDate:'2020-01-01'});assert.equal(past.status,400);
  const foreign=await request(app).post(base+'/conversation/x-draft/schedule/review').set('x-proof-owner','foreign').send(input);assert.equal(foreign.status,404);
  const old=await request(app).post(base+'/conversation/x-draft/schedule/review').send(input);assert.equal(old.status,200);
  r=await request(app).post(base+'/conversation/x-draft/schedule/review').send(input);assert.equal(r.status,200);const review=r.body.data;
  assert.equal(review.review.copyText,creation.receipt.copyText);
  assert.equal(review.review.dueAt.utc,index?'2030-12-12T17:30:00.000Z':'2030-07-10T16:30:00.000Z');
  assert.equal(review.review.dueAt.timezone,'Europe/London');
  assert.equal(adapter.draftSize(),totalDrafts);assert.equal(adapter.size(),0);const beforeSchedule=adapter.readDraftState('owner',variantId);assert.equal(beforeSchedule.event,null);assert.equal(beforeSchedule.currentRows.variant.scheduledFor,null);
  const image=await request(app).get(review.review.previewUrl).buffer(true);assert.equal(image.status,200);assert.equal(sha(image.body),creation.jpegHash);
  const token=review.reviewToken;
  r=await request(app).post(base+'/conversation/x-draft/schedule/confirm').send({sessionId:session.sessionId,reviewToken:token});assert.equal(r.status,201);session=r.body.data;const receipt=structuredClone(r.body.data.receipt);
  const state=adapter.readDraftState('owner',variantId),variant=state.currentRows.variant,plan=state.currentRows.plan;
  assert.equal(receipt.variantId,variantId);assert.equal(receipt.planId,creation.receipt.plan.id);assert.equal(variant.id,variantId);assert.equal(plan.id,creation.receipt.plan.id);assert.equal(variant.postText,creation.receipt.copyText);assert.equal(variant.scheduledFor,review.review.dueAt.utc);
  assert.equal(variant.status,'draft');assert.equal(variant.assistantEnabled,false);assert.equal(receipt.event.status,'pending');assert.equal(receipt.event.destination,'x');assert.equal(receipt.event.event_type,'make_post');assert.equal(receipt.event.due_at,variant.scheduledFor);assert.equal(receipt.event.title,creation.receipt.copyText);assert.equal(receipt.event.post_id,null);assert.deepEqual(receipt.event.media_ids,[]);assert.deepEqual(receipt.event.linkage,{plan_id:creation.receipt.plan.id,variant_id:variantId});assert.deepEqual(state.event,receipt.event);
  assert.deepEqual(variant.advice,creation.receipt.variant.advice);assert.deepEqual(state.creationRows,{plan:creation.receipt.plan,variant:creation.receipt.variant});
  assert.deepEqual(resolveVariantMediaIds({canonicalMediaIds:cards.find(c=>c.postId===creation.postId).mediaIds,binding:parseVariantMediaBinding(variant.platformFields,'x'),planPreviewMediaId:parsePlanPreviewMediaId(plan.assistantPlan)}),[creation.previewId]);
  assert.deepEqual({selection:session.selection,preparation:session.preparation,cards:session.cards,media:session.media},snapshot);
  const stale=await request(app).post(base+'/conversation/x-draft/schedule/confirm').send({sessionId:session.sessionId,reviewToken:old.body.data.reviewToken});assert.equal(stale.status,409);
  const retry=await request(app).post(base+'/conversation/x-draft/schedule/confirm').send({sessionId:session.sessionId,reviewToken:token});assert.equal(retry.status,200);assert.deepEqual(retry.body.data.receipt,receipt);assert.equal(retry.body.data.reused,true);
  const creationReplay=await request(app).post(base+'/conversation/x-draft/confirm').send({sessionId:session.sessionId,reviewToken:creation.creationToken});assert.equal(creationReplay.status,200);assert.deepEqual(creationReplay.body.data.receipt,creation.receipt);assert.equal(creationReplay.body.data.receipt.variant.scheduledFor,null);
  const changedDate=await request(app).post(base+'/conversation/x-draft/schedule/review').send({...input,revision:session.revision,localDate:'2031-01-01'});assert.equal(changedDate.status,409);
  scheduled.push({token,receipt});report.steps.push({variantId,scheduledFor:variant.scheduledFor,samePlanAndVariant:true,creationReceiptUnchanged:true,previewOnly:true,staleTokenRejected:true,rescheduleRejected:true});
 }
 // A successful token returns the current selection rather than rewinding it.
 r=await request(app).post(base+'/conversation/selection/toggle').send({sessionId:session.sessionId,revision:session.revision,postId:postIds[0]});assert.equal(r.status,200);session=r.body.data;
 const replay=await request(app).post(base+'/conversation/x-draft/schedule/confirm').send({sessionId:session.sessionId,reviewToken:scheduled[0].token});assert.equal(replay.status,200);assert.deepEqual(replay.body.data.receipt,scheduled[0].receipt);assert.deepEqual(replay.body.data.selection,session.selection);
 assert.deepEqual(session.cards,cards);assert.deepEqual(session.media,media);assert.equal(adapter.draftSize(),2);assert.equal(adapter.size(),0);assert.equal(calls,3);
 const ledger=JSON.parse(await readFile('.relay-data/gallery-editor-budget.json','utf8'));assert.equal(sha(JSON.stringify(ledger)),baseline.ledger.sha256);
 for(const [p,h] of Object.entries(baseline.reports))assert.equal(sha(await readFile(p)),h,p);
 report.checks={twoSchedulesOnExistingDraftIds:true,exactPreviewAndCopy:true,noProductionWrites:true,creationReceiptsAndOriginalsUnchanged:true,currentContextOnReplay:true,goalCancellationAndExclusionsPreserved:true,londonSummerAndWinterResolved:true,invalidPastForeignRejected:true,pendingReviewDoesNotCommit:true,ledgerUnchanged:true,priorReportsPreserved:Object.keys(baseline.reports).length,inputBytes:inputSizes};report.passed=true;
}catch(error){report.error={name:error.name,message:error.message};}
await out.writeFile(JSON.stringify(report,null,2)+'\n');await out.close();console.log(JSON.stringify({passed:report.passed,checks:report.checks,error:report.error??null}));if(!report.passed)process.exitCode=1;
