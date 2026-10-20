// Bounded HTTP proof over synthetic metadata; no real DB, renderer or posting.
import assert from 'node:assert/strict';
import {open,readFile} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import express from 'express';
import request from 'supertest';
import {registerBenchScheduleRoutes} from '../dist/src/editor-bench/schedule-routes.js';
import {createBenchDistributionVariantAdapter} from '../dist/src/editor-bench/distribution-variant-adapter.js';
import {BENCH_IDS,createBenchOwnedCatalog} from '../dist/src/editor-bench/fixtures.js';
import {createEditorBenchRuntime} from '../dist/src/editor-bench/runtime.js';
const live=process.argv.includes('--live');
const path=`outputs/editor-bench-preparation-context-${live?'live':'preflight'}-bpc01.json`;
const file=await open(path,'wx');
const sha=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const ledgerPath='.relay-data/gallery-editor-budget.json';
const before=JSON.parse(await readFile(ledgerPath,'utf8'));
const texts=[
  'Find all my sketches and prepare them for posting to Twitter. Run them through the Previewizer first.',
  'Use Square teaser for both, and keep their existing titles.',
  'Exclude Autumn Orchard.',
];
const actions=[
  {kind:'selection',selection:{mode:'replace',requestQuote:texts[0],selector:{base:'catalog',all:[{field:'stage',value:'sketch',requestQuote:'sketches'}],any:[],none:[]}},preparation:{destination:'x',destinationQuote:'Twitter',previewFirst:true,previewQuote:'Run them through the Previewizer first.'}},
  {kind:'preparation_update',templateQuote:'Square teaser',copyChoice:{kind:'existing_titles',quote:'keep their existing titles'}},
  {kind:'selection',selection:{mode:'remove',requestQuote:texts[2],selector:{base:'catalog',all:[{field:'title',value:'Autumn Orchard',requestQuote:'Autumn Orchard'}],any:[],none:[]}},preparation:null},
];
const report={ticket:'BPC-01',date:'2026-10-19',mode:live?'live_synthetic_http':'canned_synthetic_http',passed:false,calls:[],turns:[],checks:{},limits:['16 synthetic posts only','Context captured; no Previewizer/render/export/upload/draft/event/publication','Frontend execution deferred']};
let calls=0,index=0;
try {
  const runtime=live?await createEditorBenchRuntime({repoRoot:process.cwd(),env:{...process.env,NODE_ENV:'development',RELAY_EDITOR_BENCH_LIVE:'1'}}):null;
  if(live) assert(runtime.status.enabled&&runtime.editorProvider&&runtime.status.remainingUsd>=0.03);
  const provider={async respond(payload){
    assert(++calls<=3);
    const serialized=JSON.stringify({input:payload.input,tools:payload.tools,responseSchema:payload.responseSchema});
    assert(Buffer.byteLength(serialized)<=24576); assert.deepEqual(payload.tools,[]);
    const supplied=JSON.parse(payload.input[1].content[0].text);
    assert.equal(supplied.catalog.posts.length,16);
    assert.deepEqual(supplied.catalog.posts,createBenchOwnedCatalog().posts);
    assert.deepEqual(supplied.catalog.collections,createBenchOwnedCatalog().collections.map(({id,title})=>({id,title})));
    if(index===0)assert.equal(supplied.currentPreparation,null);
    else {assert.equal(supplied.currentPreparation.goal,'preview_first_x_drafts');assert.equal(supplied.currentPreparation.destination,'x');if(index===2){assert.equal(supplied.currentPreparation.template,'Square teaser');assert.equal(supplied.currentPreparation.copyChoice.kind,'existing_titles');}}
    const result=live?await runtime.editorProvider.respond(payload):{output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({result:actions[index]})}]}]};
    let actual=null;try { actual=JSON.parse(result.output.filter(x=>x.type==='message').flatMap(x=>x.content??[]).filter(x=>x.type==='output_text').map(x=>x.text).join('')).result; } catch {}
    report.calls.push({expectedKind:actions[index].kind,actualKind:['selection','preparation_update','preparation_cancel','clarification','rename','tags','posting'].includes(actual?.kind)?actual.kind:'invalid',inputBytes:Buffer.byteLength(serialized),inputSha256:sha(serialized),usage:result.usage??null});
    if(live) assert(result.usage?.calls===1&&Number.isFinite(result.usage.costUsd));
    return result;
  }};
  const adapter=createBenchDistributionVariantAdapter();
  const app=express();app.use(express.json());
  registerBenchScheduleRoutes(app,{development:true,signingSecret:randomBytes(32),traceId:()=> 'bpc01-proof',authenticateCreator:async req=>({creatorId:req.headers['x-proof-owner']==='foreign'?'foreign':'owner',accountId:'proof-account'}),guardMutation:async()=>true,getVariantEditProvider:async()=>provider,distributionVariantAdapter:adapter,createEvent:async()=>{throw Error('Unexpected DB write');},readEvent:async()=>{throw Error('Unexpected DB read');}});
  const start=await request(app).post('/api/v1/editor-bench/schedule/conversation/session').send({});assert.equal(start.status,201);
  let session=start.body.data;
  const originalCards=structuredClone(session.cards);
  let chosenCopy=null;
  for(index=0;index<texts.length;index++){
    const result=await request(app).post('/api/v1/editor-bench/schedule/conversation/turn').send({sessionId:session.sessionId,revision:session.revision,latestRequest:texts[index]});
    const data=result.body.data;
    report.turns.push({requestSha256:sha(texts[index]),httpStatus:result.status,status:data?.status??null,diagnostic:data?.diagnostic??null,message:typeof data?.message==='string'?data.message.slice(0,400):null,passed:false});
    assert.equal(result.status,200);assert(data.preparation);assert.equal(data.preparation.goal,'preview_first_x_drafts');assert.equal(data.preparation.destination,'x');
    assert.deepEqual(data.selection.postIds,index<2?[BENCH_IDS.posts[5],BENCH_IDS.posts[13]]:[BENCH_IDS.posts[5]]);
    if(index<2)assert.deepEqual(data.selection.excludedPostIds,[]);
    else {assert(data.selection.excludedPostIds.includes(BENCH_IDS.posts[13]));assert(!data.selection.excludedPostIds.includes(BENCH_IDS.posts[5]));}
    assert.equal(data.revision,session.revision+1);assert.equal(data.pending,null);assert(!data.reviewToken);assert.equal(adapter.size(),0);
    assert.deepEqual(data.cards,originalCards);
    if(index===0){assert.equal(data.preparation.templateId,null);assert.equal(data.preparation.copyChoice,null);}
    else {assert.equal(data.preparation.templateId,'bench_template_square');assert.equal(data.preparation.copyChoice.kind,'existing_titles');if(index===1)chosenCopy=structuredClone(data.preparation.copyChoice);else assert.deepEqual(data.preparation.copyChoice,chosenCopy);}
    assert(data.preparation.pendingRequirements.length>0);
    session=data;report.turns.at(-1).passed=true;
  }
  const refreshed=await request(app).get(`/api/v1/editor-bench/schedule/conversation/session/${session.sessionId}`);assert.equal(refreshed.status,200);assert.deepEqual(refreshed.body.data.preparation,session.preparation);assert.deepEqual(refreshed.body.data.selection,session.selection);
  const stale=await request(app).post('/api/v1/editor-bench/schedule/conversation/turn').send({sessionId:session.sessionId,revision:0,latestRequest:'Select Aurora Study.'});assert.equal(stale.status,409);
  const foreign=await request(app).get(`/api/v1/editor-bench/schedule/conversation/session/${session.sessionId}`).set('x-proof-owner','foreign');assert.equal(foreign.status,404);
  assert.equal(calls,3);
  report.checks={bothStageSketchesSelected:true,tagOnlyUnderselectionAvoided:true,templateAndExistingTitleChoicesPersist:true,followupExclusionsPersist:true,previewFirstXGoalPreserved:true,readOnlySnapshotRecovery:true,foreignAndStaleNoExtraCall:true,fixtureCardsUnchanged:true,previewExportDraftEventPublicationWrites:0};report.passed=true;
} catch(error){report.failure={name:error?.name??'Error',code:error?.code??null,stage:index,message:'Stopped at the first failure without retry'};process.exitCode=1;}
finally{
  const after=JSON.parse(await readFile(ledgerPath,'utf8'));assert.deepEqual(after.slice(0,before.length),before);
  const added=after.slice(before.length);const reserved=added.reduce((n,r)=>n+r.reservedUsd,0);
  report.budget={initialRows:before.length,finalRows:after.length,previousRowsUnchanged:true,providerCalls:calls,paidCalls:added.length,reservationsUsd:reserved,actualUsd:added.every(r=>r.settled&&r.actualUsd!==null)?added.reduce((n,r)=>n+r.actualUsd,0):null,ledgerSha256:sha(after),newRows:added.map(({id,model,phase,reservedUsd,actualUsd,settled})=>({id,model,phase,reservedUsd,actualUsd,settled}))};
  assert(added.length<=3&&reserved<=0.03);if(!live)assert.equal(added.length,0);
  await file.writeFile(JSON.stringify(report,null,2)+'\n');await file.close();console.log(JSON.stringify({passed:report.passed,path,turns:report.turns,budget:report.budget}));
}
