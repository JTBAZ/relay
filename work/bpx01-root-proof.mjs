import assert from 'node:assert/strict';
import { open, readFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import sharp from 'sharp';
import { registerBenchScheduleRoutes } from '../dist/src/editor-bench/schedule-routes.js';
import { createBenchDistributionVariantAdapter, loadBenchVariantSource } from '../dist/src/editor-bench/distribution-variant-adapter.js';
import { parsePlanPreviewMediaId, parseVariantMediaBinding, resolveVariantMediaIds } from '../dist/src/distribution/media-binding.js';
const file=await open('outputs/editor-bench-previewizer-x-draft-http-bpx01.json','wx');
const sha=v=>createHash('sha256').update(v).digest('hex');
const report={ticket:'BPX-01',passed:false,scope:'synthetic_http_no_browser',paidCalls:0,steps:[],checks:{},limits:['Generated JPEG transport proof; no browser renderer or frontend testing','Temporary mock drafts only; publishing manual']};
try {
 const baseline=JSON.parse(await readFile('work/bpx01-baseline/baseline.json','utf8'));
 const texts=['Find all my sketches and prepare them for posting to Twitter. Run them through the Previewizer first.','Use Square teaser for both, and keep their existing titles.','Use "Shared teaser caption" as the X copy.'];
 const actions=[{kind:'selection',selection:{mode:'replace',requestQuote:texts[0],selector:{base:'catalog',all:[{field:'stage',value:'sketch',requestQuote:'sketches'}],any:[],none:[]}},preparation:{destination:'x',destinationQuote:'Twitter',previewFirst:true,previewQuote:'Run them through the Previewizer first.'}},{kind:'preparation_update',templateQuote:'Square teaser',copyChoice:{kind:'existing_titles',quote:'keep their existing titles'}},{kind:'preparation_update',templateQuote:null,copyChoice:{kind:'literal',quote:'"Shared teaser caption"'}}];
 let calls=0;const payloadBytes=[];
 const provider={async respond(input){assert(calls<3);assert.deepEqual(input.tools,[]);const bytes=Buffer.byteLength(JSON.stringify({input:input.input,tools:input.tools,responseSchema:input.responseSchema}));assert(bytes<=24576);payloadBytes.push(bytes);return {output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({result:actions[calls++]})}]}]};}};
 const adapter=createBenchDistributionVariantAdapter();const app=express();app.use(express.json({limit:'112kb'}));
 registerBenchScheduleRoutes(app,{development:true,signingSecret:randomBytes(32),traceId:()=> 'bpx01-root',authenticateCreator:async req=>req.headers['x-proof-owner']==='anonymous'?null:{creatorId:req.headers['x-proof-owner']==='foreign'?'foreign':'owner',accountId:'account'},guardMutation:async()=>true,distributionVariantAdapter:adapter,loadBenchVariantSource:async(_creator,postId,mediaIds)=>loadBenchVariantSource(postId,mediaIds),getVariantEditProvider:async()=>provider,createEvent:async()=>{throw Error('Unexpected DB event write');},readEvent:async()=>{throw Error('Unexpected DB event read');}});
 const base='/api/v1/editor-bench/schedule';let response=await request(app).post(`${base}/conversation/session`).send({});assert.equal(response.status,201);let session=response.body.data;
 const originalCards=structuredClone(session.cards);const originalMedia=structuredClone(session.media);
 for(let i=0;i<2;i++){response=await request(app).post(`${base}/conversation/turn`).send({sessionId:session.sessionId,revision:session.revision,latestRequest:texts[i]});assert.equal(response.status,200);session=response.body.data;}
 const postIds=[...session.selection.postIds];assert.equal(postIds.length,2);const completed={};const tokens={};const creationRows={};
 for(const [index,postId] of postIds.entries()){
  const media=session.media.find(m=>m.postId===postId&&m.processingStatus==='ready');assert(media);
  const opened=await request(app).post(`${base}/conversation/preview/open`).send({sessionId:session.sessionId,revision:session.revision,postId,mediaId:media.id});assert.equal(opened.status,200);
  const previewPath=`${base}/conversation/session/${session.sessionId}/preview/${opened.body.data.attempt.id}`;
  const jpeg=await sharp({create:{width:48,height:48,channels:3,background:index?'#334455':'#556633'}}).jpeg().toBuffer();
  const upload=await request(app).post(`${previewPath}/upload`).set('Content-Type','image/jpeg').send(jpeg);assert.equal(upload.status,200);
  const premature=await request(app).post(`${base}/conversation/x-draft/review`).send({sessionId:session.sessionId,revision:session.revision,postId});assert.equal(premature.status,409);assert.equal(adapter.draftSize(),0);
  const done=await request(app).post(`${previewPath}/complete`).send({previewMediaId:upload.body.data.previewMediaId});assert.equal(done.status,200);session=done.body.data;completed[postId]={mediaId:upload.body.data.previewMediaId,hash:sha(jpeg),size:jpeg.length};
 }
 for(const postId of postIds){
  const body={sessionId:session.sessionId,revision:session.revision,postId};const before=adapter.draftSize();
  const old=await request(app).post(`${base}/conversation/x-draft/review`).send(body);assert.equal(old.status,200);
  const reviewed=await request(app).post(`${base}/conversation/x-draft/review`).send(body);assert.equal(reviewed.status,200);assert.equal(adapter.draftSize(),before);
  const review=reviewed.body.data;assert.equal(review.review.copyText,originalCards.find(c=>c.postId===postId).title);
  const image=await request(app).get(review.review.previewUrl).buffer(true);assert.equal(image.status,200);assert(Buffer.isBuffer(image.body));assert.equal(sha(image.body),completed[postId].hash);assert.match(image.headers['cache-control'],/private.*no-store/);assert.equal(image.headers['x-content-type-options'],'nosniff');
  const foreign=await request(app).get(review.review.previewUrl).set('x-proof-owner','foreign');assert.equal(foreign.status,404);
  const confirmed=await request(app).post(`${base}/conversation/x-draft/confirm`).send({sessionId:session.sessionId,reviewToken:review.reviewToken});assert.equal(confirmed.status,201);session=confirmed.body.data;const receipt=session.receipt;assert.equal(adapter.draftSize(),before+1);assert.equal(adapter.size(),0);
  const variant=receipt.variant,plan=receipt.plan;assert.equal(variant.status,'draft');assert.equal(variant.scheduledFor,null);assert.equal(variant.assistantEnabled,false);assert(!('event' in receipt));assert.equal(variant.postText,review.review.copyText);assert.equal(variant.advice.bench_variant_revisions_v1.currentRevision,0);
  const ids=resolveVariantMediaIds({canonicalMediaIds:originalCards.find(c=>c.postId===postId).mediaIds,binding:parseVariantMediaBinding(variant.platformFields,'x'),planPreviewMediaId:parsePlanPreviewMediaId(plan.assistantPlan)});assert.deepEqual(ids,[completed[postId].mediaId]);
  const stale=await request(app).post(`${base}/conversation/x-draft/confirm`).send({sessionId:session.sessionId,reviewToken:old.body.data.reviewToken});assert.equal(stale.status,409);
  const retry=await request(app).post(`${base}/conversation/x-draft/confirm`).send({sessionId:session.sessionId,reviewToken:review.reviewToken});assert.equal(retry.status,200);assert.equal(retry.body.data.reused,true);assert.deepEqual(retry.body.data.receipt,receipt);
  tokens[postId]=review.reviewToken;creationRows[postId]=structuredClone(receipt);
  report.steps.push({postId,reviewOnlyNoWrite:true,exportHash:completed[postId].hash,mediaIds:ids,confirmedStatus:confirmed.status,retryReused:true,staleUnconfirmedTokenRejected:true,unscheduled:true});
 }
 const removed=await request(app).post(`${base}/conversation/selection/toggle`).send({sessionId:session.sessionId,revision:session.revision,postId:postIds[0]});assert.equal(removed.status,200);session=removed.body.data;
 const retry=await request(app).post(`${base}/conversation/x-draft/confirm`).send({sessionId:session.sessionId,reviewToken:tokens[postIds[0]]});assert.equal(retry.status,200);assert.deepEqual(retry.body.data.receipt,creationRows[postIds[0]]);assert.deepEqual(retry.body.data.selection,session.selection);
 const pinned=await request(app).get(`${base}/conversation/session/${session.sessionId}/preview-media/${completed[postIds[0]].mediaId}`).buffer(true);assert.equal(pinned.status,200);assert.equal(sha(pinned.body),completed[postIds[0]].hash);
 const changed=await request(app).post(`${base}/conversation/turn`).send({sessionId:session.sessionId,revision:session.revision,latestRequest:texts[2]});assert.equal(changed.status,200);session=changed.body.data;assert.equal(session.preparation.copyChoice.text,'Shared teaser caption');
 const reviewed=await request(app).post(`${base}/conversation/x-draft/review`).send({sessionId:session.sessionId,revision:session.revision,postId:postIds[1]});assert.equal(reviewed.status,200);assert.equal(reviewed.body.data.review.copyText,'Shared teaser caption');
 const changedDraft=await request(app).post(`${base}/conversation/x-draft/confirm`).send({sessionId:session.sessionId,reviewToken:reviewed.body.data.reviewToken});assert.equal(changedDraft.status,201);session=changedDraft.body.data;assert.equal(adapter.draftSize(),3);assert.equal(session.receipt.variant.postText,'Shared teaser caption');
 assert.deepEqual(adapter.readDraft('owner',creationRows[postIds[1]].variant.id).rows.variant,creationRows[postIds[1]].variant);assert.deepEqual(session.cards,originalCards);assert.deepEqual(session.media,originalMedia);assert.equal(adapter.size(),0);
 for(const [path,hash]of Object.entries(baseline.reports))assert.equal(sha(await readFile(path)),hash,path);assert.equal(sha(JSON.stringify(JSON.parse(await readFile('.relay-data/gallery-editor-budget.json','utf8')))),baseline.ledger.sha256);
 report.provider={mode:'canned_no_network',calls,payloadBytes};report.checks={twoConfirmedPreviewDrafts:true,copyChangeCreatesSeparateImmutableDraft:true,previewOnlyRouting:true,noEventsOrOriginalEdits:true,pinnedJpegSurvivesDeselection:true,retryReturnsCreationReceiptAndCurrentSelection:true,foreignMediaDenied:true,ledgerUnchanged:true,previousReportsUnchanged:Object.keys(baseline.reports).length};report.passed=true;
}catch(error){report.error=error instanceof Error?error.message:String(error);process.exitCode=1;}
finally{await file.writeFile(JSON.stringify(report,null,2));await file.close();process.stdout.write(JSON.stringify({passed:report.passed,checks:report.checks,error:report.error??null}));}
