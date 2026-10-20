// Bounded synthetic HTTP check of the existing interpreter; no product changes or publishing.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash, randomBytes} from 'node:crypto';
import express from 'express';
import request from 'supertest';
import sharp from 'sharp';
import {registerBenchScheduleRoutes} from '../dist/src/editor-bench/schedule-routes.js';
import {createBenchDistributionVariantAdapter} from '../dist/src/editor-bench/distribution-variant-adapter.js';
import {createEditorBenchRuntime} from '../dist/src/editor-bench/runtime.js';
import {BENCH_IDS} from '../dist/src/editor-bench/fixtures.js';

const live=process.argv.includes('--live');
const tag=process.argv.find(arg=>arg.startsWith('--tag='))?.slice(6)??'bgb03';
assert(/^[a-z0-9-]+$/.test(tag));
const output=`outputs/editor-bench-generic-batch-${live?'live':'preflight'}-${tag}.json`;
const outputFd=fs.openSync(output,'wx'),journalPath=output.replace(/\.json$/,'.ndjson'),journalFd=fs.openSync(journalPath,'wx');
const sha=value=>createHash('sha256').update(Buffer.isBuffer(value)||typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const ledgerPath='.relay-data/gallery-editor-budget.json';
const readLedger=()=>JSON.parse(fs.readFileSync(ledgerPath,'utf8'));
const before=readLedger();
const cost=row=>row.settled&&row.actualUsd!==null?row.actualUsd:row.reservedUsd;
const remaining=rows=>({development:Number((15-rows.filter(row=>row.phase==='development').reduce((n,row)=>n+cost(row),0)).toFixed(8)),heldout:Number((10-rows.filter(row=>row.phase==='heldout').reduce((n,row)=>n+cost(row),0)).toFixed(8))});
const baselinePaths=['work/bgb03-model-check.mjs','src/editor-bench/conversation.ts','src/editor-bench/schedule-routes.ts','src/editor-bench/runtime.ts','src/gallery-editor/provider.ts','src/gallery-editor/budget.ts','src/editor-bench/distribution-variant-adapter.ts','dist/src/editor-bench/conversation.js','dist/src/editor-bench/schedule-routes.js','dist/src/editor-bench/runtime.js','.env','web/.env.local'];
const baselineHashes=Object.fromEntries(baselinePaths.map(p=>[p,sha(fs.readFileSync(p))]));
const oldReports=Object.fromEntries(fs.readdirSync('outputs').filter(p=>/^editor-bench-.*\.json$/.test(p)&&`outputs/${p}`!==output).map(p=>[`outputs/${p}`,sha(fs.readFileSync(`outputs/${p}`))]));
const maxCalls=6,maxReservationsUsd=0.06;
const report={ticket:'BGB-03',mode:live?'live_synthetic_http':'canned_synthetic_preflight',model:'gpt-5.6-luna',reasoningEffort:'none',passed:false,maxCalls,maxReservationsUsd,pricing:{inputUsdPerMillion:0.20,cachedInputUsdPerMillion:0.02,outputUsdPerMillion:1.20,source:'https://developers.openai.com/api/docs/models/gpt-5.6-luna'},cases:[],calls:[],baseline:{ledgerRows:before.length,ledgerSha256:sha(before),remaining:remaining(before),hashes:baselineHashes},limits:['Six paid interpretation calls maximum; no automatic retries or prompt changes.','16 synthetic metadata posts only. Canned setup is labelled separately from live turns.','Generated JPEGs exercise mock export/draft routes; images are never sent to the model.','No production DB, real Library, scheduling, extension delivery or publishing; front-end testing deferred.','A failed turn stops only its dependent scenario; independent scenarios still run. This is a smoke check, not a language-quality benchmark.']};
const journal=event=>{fs.writeSync(journalFd,JSON.stringify(event)+'\n');fs.fsyncSync(journalFd);};
let paidMode=false,nextAction=null,activeCall=null,providerCalls=0,networkCalls=0;
const goal=(destinations,quotes,first=true)=>({destinations,destinationQuotes:quotes,previewFirst:first,previewQuote:first?'Previewizer first':''});
const preserve={mode:'preserve',requestQuote:null,selector:null};
const targetChange=(destination,quote)=>({kind:'selection',selection:preserve,preparation:goal([destination],[quote],false)});
const choices={kind:'preparation_update',templateQuote:'Square teaser',copyChoice:{kind:'existing_titles',quote:'keep their existing titles'}};
const chooseText='Use Square teaser and keep their existing titles.';
const selection=(text,stage,destinations,quotes,exclude=false)=>({kind:'selection',preparation:goal(destinations,quotes),selection:{mode:'replace',requestQuote:text,selector:{base:'catalog',all:[{field:stage?'stage':'title',value:stage?'sketch':'Tide line sketch',requestQuote:stage?'sketches':'Tide line sketch'}],any:[],none:exclude?[{field:'title',value:'Autumn Orchard',requestQuote:'Autumn Orchard'}]:[]}}});
const firstText='Select my sketches for X and DeviantArt drafts. Run Previewizer first.';
const seedXText='Select Tide line sketch and exclude Autumn Orchard for X drafts. Run Previewizer first.';
const seedDaText='Select Tide line sketch and exclude Autumn Orchard for DeviantArt drafts. Run Previewizer first.';
const sketches=[BENCH_IDS.posts[5],BENCH_IDS.posts[13]],oneSketch=[BENCH_IDS.posts[5]],twoArt=[BENCH_IDS.posts[0],BENCH_IDS.posts[5]],orchardExcluded=[BENCH_IDS.posts[13],BENCH_IDS.posts[14]];
const cases=[
  {id:'initial-dual-destination',setup:[],steps:[
    {text:firstText,action:selection(firstText,true,['x','deviantart'],['X','DeviantArt']),postIds:sketches,excluded:[],destinations:['x','deviantart'],ready:false},
    {text:chooseText,action:choices,postIds:sketches,excluded:[],destinations:['x','deviantart'],ready:true},
  ]},
  {id:'add-destination-and-artwork',setup:[{text:seedXText,action:selection(seedXText,false,['x'],['X'],true)},{text:chooseText,action:choices}],steps:[
    {text:'Also add DeviantArt.',action:targetChange('deviantart','DeviantArt'),postIds:oneSketch,excluded:orchardExcluded,destinations:['x','deviantart'],ready:true},
    {text:'Also add Aurora study.',action:{kind:'selection',preparation:null,selection:{mode:'add',requestQuote:'Also add Aurora study.',selector:{base:'catalog',all:[{field:'title',value:'Aurora study',requestQuote:'Aurora study'}],any:[],none:[]}}},postIds:twoArt,excluded:orchardExcluded,destinations:['x','deviantart'],ready:true},
  ]},
  {id:'reverse-addition-and-narrowing',setup:[{text:seedDaText,action:selection(seedDaText,false,['deviantart'],['DeviantArt'],true)},{text:chooseText,action:choices}],steps:[
    {text:'Also add X.',action:targetChange('x','X'),postIds:oneSketch,excluded:orchardExcluded,destinations:['deviantart','x'],ready:true},
    {text:'Remove DeviantArt.',action:targetChange('deviantart','DeviantArt'),postIds:oneSketch,excluded:orchardExcluded,destinations:['x'],ready:true},
  ]},
];
const snapshot=s=>({revision:s.revision,selection:s.selection,preparation:s.preparation,matrixCells:s.matrixCells,confirmedDrafts:s.confirmedDrafts});
const actualAction=result=>{try{return JSON.parse(result.output.filter(item=>item.type==='message').flatMap(item=>item.content??[]).filter(part=>part.type==='output_text').map(part=>part.text).join('')).result;}catch{return null;}};
try {
  let runtime=null;
  if(live){const preflightPath=`outputs/editor-bench-generic-batch-preflight-${tag}.json`;assert(fs.existsSync(preflightPath),'Run the no-cost preflight first.');const preflight=JSON.parse(fs.readFileSync(preflightPath,'utf8'));assert(preflight.passed);assert.deepEqual(preflight.baseline.hashes,baselineHashes,'The preflight and live harness/source must match.');assert(remaining(before).development>=maxReservationsUsd);runtime=await createEditorBenchRuntime({repoRoot:process.cwd(),env:{...process.env,NODE_ENV:'development',RELAY_EDITOR_BENCH_LIVE:'1'},fetch:async(url,init)=>{
    assert.equal(String(url),'https://api.openai.com/v1/responses');const body=JSON.parse(init.body);assert.equal(body.model,'gpt-5.6-luna');assert.deepEqual(body.reasoning,{effort:'none'});assert.equal(body.store,false);assert.equal(body.max_output_tokens,3000);assert.deepEqual(body.tools,[]);assert(!JSON.stringify(body).includes('input_image'));assert(++networkCalls<=maxCalls);
    const added=readLedger().slice(before.length);assert(added.length<=maxCalls);assert(added.reduce((n,row)=>n+row.reservedUsd,0)<=maxReservationsUsd);journal({event:'transport-started',call:activeCall?.number,model:body.model,maxOutputTokens:body.max_output_tokens});
    const response=await fetch(url,init);if(activeCall)activeCall.providerHttpStatus=response.status;journal({event:'transport-returned',call:activeCall?.number,status:response.status});return response;
  }});assert(runtime.status.enabled&&runtime.editorProvider);assert.equal(runtime.status.model,report.model);assert.equal(runtime.status.reasoningEffort,report.reasoningEffort);}
  const provider={async respond(payload){
    assert(nextAction,'No canned oracle action for this step.');assert.deepEqual(payload.tools,[]);
    const supplied=JSON.parse(payload.input[1].content[0].text),serialized=JSON.stringify({input:payload.input,tools:payload.tools,responseSchema:payload.responseSchema});
    assert.equal(supplied.catalog.posts.length,16);assert(!Object.hasOwn(supplied,'matrixCells'));assert(!Object.hasOwn(supplied,'confirmedDrafts'));assert(Buffer.byteLength(serialized)<=24576);
    // Same conservative reserve inputs as the existing provider, without using paid transport in preflight.
    const body={model:report.model,store:false,input:payload.input,tools:payload.tools,parallel_tool_calls:false,max_output_tokens:3000,include:['reasoning.encrypted_content'],text:{format:{type:'json_schema',name:'library_edit_proposal',strict:true,schema:payload.responseSchema}}};
    const reserveCeiling=((Buffer.byteLength(JSON.stringify(body))+1024)*0.20+3000*1.20)/1e6;assert(reserveCeiling<=0.01);
    if(!paidMode){const result={output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({result:nextAction})}]}]};nextAction=null;return result;}
    assert(++providerCalls<=maxCalls);const started=Date.now();activeCall={number:providerCalls,inputBytes:Buffer.byteLength(serialized),inputSha256:sha(serialized),reserveCeilingUsd:reserveCeiling,currentPreparation:supplied.currentPreparation};report.calls.push(activeCall);journal({event:'model-call-started',...activeCall});
    try{const result=live?await runtime.editorProvider.respond({...payload,signal:AbortSignal.any([payload.signal,AbortSignal.timeout(45000)])}):{output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({result:nextAction})}]}]};activeCall.actualAction=actualAction(result);activeCall.usage=result.usage??null;activeCall.elapsedMs=Date.now()-started;if(live)assert(result.usage?.calls===1&&Number.isFinite(result.usage.costUsd));journal({event:'model-call-completed',...activeCall});return result;}
    catch(error){activeCall.error={code:error.code??null,name:error.name,message:error.message};activeCall.elapsedMs=Date.now()-started;journal({event:'model-call-failed',...activeCall});throw error;}
    finally{nextAction=null;activeCall=null;}
  }};
  for(const scenario of cases){
    const caseReport={id:scenario.id,passed:false,setup:'canned owned synthetic state',steps:[],drafts:[]};report.cases.push(caseReport);let session;
    try{
      const adapter=createBenchDistributionVariantAdapter(),app=express();app.use(express.json());registerBenchScheduleRoutes(app,{development:true,signingSecret:randomBytes(32),traceId:()=> 'bgb02-eval',authenticateCreator:async()=>({creatorId:'bgb02-owner',accountId:'synthetic-account'}),guardMutation:async()=>true,getVariantEditProvider:async()=>provider,distributionVariantAdapter:adapter,createEvent:async()=>{throw Error('Unexpected production DB write');},readEvent:async()=>{throw Error('Unexpected production DB read');}});
      const base='/api/v1/editor-bench/schedule';
      const post=async(path,body,status=200)=>{const r=await request(app).post(base+path).send(body);assert.equal(r.status,status,path+': '+JSON.stringify({status:r.status,error:r.body.error,message:r.body.message}));return r.body.data;};
      session=await post('/conversation/session',{},201);const original=sha({cards:session.cards,media:session.media});
      const turn=async(step,paid)=>{paidMode=paid;nextAction=step.action;const r=await request(app).post(base+'/conversation/turn').send({sessionId:session.sessionId,revision:session.revision,latestRequest:step.text});assert.equal(nextAction,null,'Interpreter was not called.');return r;};
      for(const setup of scenario.setup){const r=await turn(setup,false);assert.equal(r.status,200);assert(['selected','preparation_updated'].includes(r.body.data?.status));session=r.body.data;}
      caseReport.setup=scenario.setup.length?'Canned selection and existing-title choices; only the following turns use the model.':'Fresh empty mock session; both turns use the model.';
      for(const step of scenario.steps){const previous=structuredClone(session),turnReport={text:step.text,requestSha256:sha(step.text),before:snapshot(previous),passed:false};caseReport.steps.push(turnReport);const r=await turn(step,true);const data=r.body.data;Object.assign(turnReport,{httpStatus:r.status,status:data?.status??null,diagnostic:data?.diagnostic??null,message:data?.message??null,after:data?snapshot(data):null,callNumber:providerCalls});journal({event:'turn-result',case:scenario.id,...turnReport});
        assert.equal(r.status,200);assert.equal(data.status,step.action.kind==='preparation_update'?'preparation_updated':'selected');assert.deepEqual(data.selection,{postIds:step.postIds,excludedPostIds:step.excluded});assert.deepEqual(data.preparation.destinations,step.destinations);assert.equal(data.revision,previous.revision+1);assert.equal(data.pending,null);assert(!data.reviewToken);assert.equal(adapter.draftSize(),0);assert.equal(sha({cards:data.cards,media:data.media}),original);assert.equal(data.matrixCells.length,step.postIds.length*step.destinations.length);
        if(step.ready){assert.equal(data.preparation.templateId,'bench_template_square');assert.deepEqual(data.preparation.copyChoice,{kind:'existing_titles'});}else{assert.equal(data.preparation.templateId,null);assert.equal(data.preparation.copyChoice,null);}session=data;turnReport.passed=true;
      }
      // Explicitly simulate review/confirmation on mock JPEGs. No model call, browser, schedule or publishing.
      for(const postId of session.selection.postIds){const media=session.media.find(row=>row.postId===postId&&row.processingStatus==='ready'&&row.mimeType.startsWith('image/'));assert(media);const opened=await post('/conversation/preview/open',{sessionId:session.sessionId,revision:session.revision,postId,mediaId:media.id});const jpeg=await sharp({create:{width:16,height:16,channels:3,background:'#314159'}}).jpeg().toBuffer(),previewPath=`/conversation/session/${session.sessionId}/preview/${opened.attempt.id}`;const upload=await request(app).post(base+previewPath+'/upload').set('Content-Type','image/jpeg').send(jpeg);assert.equal(upload.status,200);const previewId=upload.body.data.previewMediaId;session=await post(previewPath+'/complete',{previewMediaId:previewId});
        for(const destination of session.preparation.destinations){const path='/conversation/'+(destination==='x'?'x':'deviantart')+'-draft';const count=adapter.draftSize();const review=await post(path+'/review',{sessionId:session.sessionId,revision:session.revision,postId});assert.equal(adapter.draftSize(),count);assert.equal(review.review.destination,destination);assert.equal(review.review.copyText,session.cards.find(card=>card.postId===postId).title);session=await post(path+'/confirm',{sessionId:session.sessionId,reviewToken:review.reviewToken},201);const saved=session.receipt;assert.equal(saved.destination,destination);assert.equal(saved.previewMediaId,previewId);assert.equal(saved.exportHash,sha(jpeg));assert.equal(saved.variant.scheduledFor,null);assert.equal(saved.variant.destination,destination);assert.equal(adapter.readDraftState('bgb02-owner',saved.variant.id).event,null);caseReport.drafts.push({postId,destination,previewSha256:sha(jpeg),copyText:saved.copyText,unscheduled:true,manualPublishing:true});}
      }
      assert(session.matrixCells.every(cell=>cell.status==='confirmed'));assert.equal(sha({cards:session.cards,media:session.media}),original);caseReport.final=snapshot(session);caseReport.originalsUnchanged=true;caseReport.reviewReadOnly=true;caseReport.passed=true;
    }catch(error){caseReport.failure={name:error.name,code:error.code??null,message:error.message};caseReport.actual=session?snapshot(session):null;journal({event:'scenario-failed',case:scenario.id,failure:caseReport.failure});}
  }
  report.passed=report.cases.every(item=>item.passed);report.skippedDependentTurns=maxCalls-providerCalls;
}catch(error){report.passed=false;report.failure={name:error.name,code:error.code??null,message:error.message};}
finally{
  try{const after=readLedger();assert.deepEqual(after.slice(0,before.length),before);const added=after.slice(before.length);const reserved=added.reduce((n,row)=>n+row.reservedUsd,0);assert(added.length<=maxCalls&&reserved<=maxReservationsUsd);if(!live)assert.equal(added.length,0);else assert.equal(added.length,networkCalls);for(const[p,h]of Object.entries(baselineHashes))assert.equal(sha(fs.readFileSync(p)),h,'Changed protected file '+p);for(const[p,h]of Object.entries(oldReports))assert.equal(sha(fs.readFileSync(p)),h,'Changed prior report '+p);assert.deepEqual(after.filter(row=>row.phase==='heldout'),before.filter(row=>row.phase==='heldout'));
    report.budget={ledgerPath,initialRows:before.length,finalRows:after.length,previousRowsUnchanged:true,heldoutRowsUnchanged:true,providerCalls,networkCalls,paidCalls:added.length,reservationsUsd:reserved,actualUsd:added.every(row=>row.settled&&row.actualUsd!==null)?added.reduce((n,row)=>n+row.actualUsd,0):null,remaining:remaining(after),ledgerSha256:sha(after),newRows:added.map(({id,model,phase,reservedUsd,actualUsd,settled})=>({id,model,phase,reservedUsd,actualUsd,settled}))};report.protectedFilesUnchanged=true;report.priorReportsPreserved=Object.keys(oldReports).length;
  }catch(error){report.passed=false;report.auditFailure={name:error.name,message:error.message};}
  journal({event:'run-completed',passed:report.passed,budget:report.budget??null});fs.writeFileSync(outputFd,JSON.stringify(report,null,2)+'\n');fs.closeSync(outputFd);fs.closeSync(journalFd);console.log(JSON.stringify({passed:report.passed,output,cases:report.cases.map(item=>({id:item.id,passed:item.passed,steps:item.steps.map(s=>({status:s.status,passed:s.passed})),failure:item.failure??null})),budget:report.budget??null,failure:report.failure??report.auditFailure??null}));if(!report.passed)process.exitCode=1;
}
