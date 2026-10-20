import assert from 'node:assert/strict';
import { open, readFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import sharp from 'sharp';
import { registerBenchScheduleRoutes } from '../dist/src/editor-bench/schedule-routes.js';
import { createBenchDistributionVariantAdapter } from '../dist/src/editor-bench/distribution-variant-adapter.js';
const file = await open('outputs/editor-bench-previewizer-bridge-http-bpv01.json', 'wx');
const sha = v => createHash('sha256').update(v).digest('hex');
const baseline = JSON.parse(await readFile('work/bpv01-baseline/baseline.json', 'utf8'));
const report = { ticket:'BPV-01', passed:false, scope:'synthetic_http_transport_only', steps:[], checks:{}, paidCalls:0, limits:['JPEG bytes generated with sharp; browser Previewizer renderer not executed','Frontend testing deferred','No X drafts/events or publishing'] };
try {
  const texts = ['Find all my sketches and prepare them for posting to Twitter. Run them through the Previewizer first.', 'Use Square teaser for both, and keep their existing titles.', 'Exclude Autumn Orchard.'];
  const actions = [
    {kind:'selection',selection:{mode:'replace',requestQuote:texts[0],selector:{base:'catalog',all:[{field:'stage',value:'sketch',requestQuote:'sketches'}],any:[],none:[]}},preparation:{destination:'x',destinationQuote:'Twitter',previewFirst:true,previewQuote:'Run them through the Previewizer first.'}},
    {kind:'preparation_update',templateQuote:'Square teaser',copyChoice:{kind:'existing_titles',quote:'keep their existing titles'}},
    {kind:'selection',selection:{mode:'remove',requestQuote:texts[2],selector:{base:'catalog',all:[{field:'title',value:'Autumn Orchard',requestQuote:'Autumn Orchard'}],any:[],none:[]}},preparation:null},
  ];
  let calls=0, providerBytes=[];
  const adapter=createBenchDistributionVariantAdapter();
  const provider={async respond(input){providerBytes.push(Buffer.byteLength(JSON.stringify({input:input.input,tools:input.tools,responseSchema:input.responseSchema})));assert(calls<3);return {output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({result:actions[calls++]})}]}]};}};
  const app=express();app.use('/api/v1/editor-bench/schedule',express.json({limit:'112kb'}));app.use(express.json());
  registerBenchScheduleRoutes(app,{development:true,signingSecret:randomBytes(32),traceId:()=> 'bpv01-root',authenticateCreator:async req=>({creatorId:req.headers['x-proof-owner']==='foreign'?'foreign':'owner',accountId:'account'}),guardMutation:async()=>true,distributionVariantAdapter:adapter,getVariantEditProvider:async()=>provider,createEvent:async()=>{throw Error('Unexpected DB write');},readEvent:async()=>{throw Error('Unexpected DB read');}});
  const base='/api/v1/editor-bench/schedule';
  let response=await request(app).post(`${base}/conversation/session`).send({});assert.equal(response.status,201);
  let session=response.body.data;
  const originalCards=structuredClone(session.cards);
  for(let i=0;i<2;i++){response=await request(app).post(`${base}/conversation/turn`).send({sessionId:session.sessionId,revision:session.revision,latestRequest:texts[i]});assert.equal(response.status,200);session=response.body.data;}
  assert.deepEqual(session.selection.postIds,['bench_post_tide_sketch','bench_post_orchard_sketch']);
  const jpeg=await sharp({create:{width:48,height:48,channels:3,background:'#345649'}}).jpeg().toBuffer();
  const receipts=[];
  for(const postId of session.selection.postIds){
    const media=session.media.find(m=>m.postId===postId&&m.processingStatus==='ready');assert(media);
    response=await request(app).post(`${base}/conversation/preview/open`).send({sessionId:session.sessionId,revision:session.revision,postId,mediaId:media.id});assert.equal(response.status,200);
    const opened=response.body.data;assert(opened.sourceImageUrl.startsWith('data:image/svg+xml'));assert.equal(opened.initialTemplate.id,'bench_template_square');assert.equal(opened.previewStatus[postId].status,'in_progress');
    const path=`${base}/conversation/session/${session.sessionId}/preview/${opened.attempt.id}`;
    const missing=await request(app).post(`${path}/complete`).send({previewMediaId:media.id});assert.equal(missing.status,409);
    const foreign=await request(app).post(`${path}/upload`).set('x-proof-owner','foreign').set('Content-Type','image/jpeg').send(jpeg);assert.equal(foreign.status,404);
    const upload=await request(app).post(`${path}/upload`).set('Content-Type','image/jpeg').send(jpeg);assert.equal(upload.status,200);
    assert.notEqual(upload.body.data.previewMediaId,media.id);assert.equal(upload.body.data.exportHash,sha(jpeg));
    const pending=await request(app).get(`${base}/conversation/session/${session.sessionId}`);assert.equal(pending.body.data.previewStatus[postId].status,'in_progress');
    const complete=await request(app).post(`${path}/complete`).send({previewMediaId:upload.body.data.previewMediaId});assert.equal(complete.status,200);session=complete.body.data;assert.equal(session.previewStatus[postId].status,'complete');
    const retry=await request(app).post(`${path}/complete`).send({previewMediaId:upload.body.data.previewMediaId});assert.equal(retry.status,200);assert.equal(retry.body.data.reused,true);assert.deepEqual(retry.body.data.receipt,complete.body.data.receipt);
    receipts.push({...complete.body.data.receipt,attemptId:opened.attempt.id});
    report.steps.push({postId,sourceMediaId:media.id,exportHash:sha(jpeg),size:jpeg.length,openStatus:response.status,uploadStatus:upload.status,completionStatus:complete.status,retryReused:true});
  }
  assert.equal(session.previewState,'mock_previews_ready_drafts_unavailable');assert.deepEqual(session.preparation.pendingRequirements,[]);
  response=await request(app).post(`${base}/conversation/turn`).send({sessionId:session.sessionId,revision:session.revision,latestRequest:texts[2]});assert.equal(response.status,200);session=response.body.data;
  assert.deepEqual(session.selection.postIds,['bench_post_tide_sketch']);assert(session.selection.excludedPostIds.includes('bench_post_orchard_sketch'));assert.equal(session.previewStatus.bench_post_tide_sketch.status,'complete');assert(!session.previewStatus.bench_post_orchard_sketch);assert.equal(session.preparation.copyChoice.kind,'existing_titles');assert.equal(session.preparation.templateId,'bench_template_square');
  const stale=await request(app).post(`${base}/conversation/session/${session.sessionId}/preview/${receipts[1].attemptId??'removed'}/complete`).send({previewMediaId:receipts[1].previewMediaId});assert.equal(stale.status,409);
  assert.deepEqual(session.cards,originalCards);assert.equal(session.pending,null);
  const ledger=JSON.parse(await readFile('.relay-data/gallery-editor-budget.json','utf8'));assert.equal(sha(JSON.stringify(ledger)),baseline.ledger.sha256);
  for(const [path,hash] of Object.entries(baseline.reports))assert.equal(sha(await readFile(path)),hash,path);
  report.checks={explicitCompletionRequired:true,ownedBoundBytes:true,idempotentRetry:true,unchangedSourceReceiptRetainedAcrossExclusion:true,removedSourceInvalidated:true,originalCardsUnchanged:true,ledgerUnchanged:true,previousReportsUnchanged:Object.keys(baseline.reports).length};
  report.provider={mode:'canned_no_network',calls,inputBytes:providerBytes};report.passed=true;
} catch(error){report.error=error instanceof Error?error.message:String(error);process.exitCode=1;}
finally{await file.writeFile(JSON.stringify(report,null,2));await file.close();process.stdout.write(JSON.stringify({passed:report.passed,checks:report.checks,error:report.error??null}));}
