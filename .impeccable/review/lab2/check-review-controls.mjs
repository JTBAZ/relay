import {readFileSync} from 'node:fs';
import {runInNewContext,Script} from 'node:vm';
import assert from 'node:assert/strict';
const html=readFileSync('.impeccable/mocks/decision/modal-select-confirm.html','utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];new Script(script);
const planning=script.slice(script.indexOf('function requestedImageGrouping('),script.indexOf('function groupingControls('));
const controls=script.slice(script.indexOf('function reviewScheduleValues('),script.indexOf('// End review schedule helpers.'));
const arrangement=script.slice(script.indexOf('function rememberBatchEdit('),script.indexOf('function inspectBatchImage('));
const parse=script.slice(script.indexOf('function parseIntakePlan('),script.indexOf('// Studio discovery:'));
const discovery=script.slice(script.indexOf('// Studio discovery:'),script.indexOf('// End Studio discovery.')).replace(/\$\('discovery-panel'\)\.addEventListener[\s\S]*/, '');
runInNewContext(`
const works=[{id:0,name:'Gallery work'},{id:1,name:'Garden studies',incoming:true,saved:false},{id:2,name:'New image',incoming:true,saved:false}],mediaGroups=[['a'],['a','b','c','d','e','f'],['c']],date=i=>new Date(Date.UTC(2026,10,2+i*7));
let attachments=[{id:1,status:'ready'}],plan={grouping:'batch',batchSize:2,delivery:'schedule',target:'X',operationId:'review',batchLayouts:{},batchTimes:{}},busy=false,batchHistory=[],selected=new Set([1]),rebuilds=0;
const chosen=()=>works.filter(w=>selected.has(w.id)),expandedBatchWorks=new Set(),escapeHtml=v=>String(v),icon=()=>'',focus={focus(){},getBoundingClientRect(){return {top:0,bottom:1}},scrollIntoView(){}},nodes={},$=id=>nodes[id]??=({textContent:'',hidden:false,disabled:false,innerHTML:'',getBoundingClientRect(){return {top:0,bottom:1}},querySelector(){return focus;}});
function review(){rebuilds++;renderReviewSchedule();$('next').disabled=batchScheduleInvalid();}function hideDetail(){}
${planning}
${controls}
${arrangement}
const edit=(field,value)=>updateReviewSchedule({dataset:{reviewSchedule:field},value});
const images=()=>JSON.stringify(artworkPostPlan(chosen(),plan).map(p=>p.source.ordinals));
const original=images();edit('date','2026-11-30');edit('time','19:15');edit('spacing','daily');let outputs=artworkPostPlan(chosen(),plan);assert.deepEqual(Array.from(outputs,p=>p.key),['2026-11-30','2026-12-01','2026-12-02']);assert.ok(outputs.every(p=>p.time==='19:15'));assert.equal(images(),original);
edit('spacing','custom');edit('interval','5');assert.deepEqual(Array.from(artworkPostPlan(chosen(),plan),p=>p.key),['2026-11-30','2026-12-05','2026-12-10']);edit('spacing','weekly');edit('spacing','custom');assert.equal(plan.intervalDays,5);
const valid=JSON.stringify(plan),validOutputs=JSON.stringify(artworkPostPlan(chosen(),plan));
for(const bad of ['', '0','1.5','366']){edit('interval',bad);assert.equal(batchScheduleInvalid(),true);assert.equal(nodes.next.disabled,true);assert.equal(plan.scheduleDraft.intervalDays,bad);assert.equal(JSON.stringify(artworkPostPlan(chosen(),plan)),validOutputs);assert.match(nodes['review-schedule'].innerHTML,/Preview shows the last valid schedule/);undoBatchEdit();assert.equal(JSON.stringify(plan),valid);assert.equal(batchScheduleInvalid(),false);}
edit('date','2026-10-20');assert.equal(batchScheduleInvalid(),true);edit('date','2026-12-01');assert.equal(batchScheduleInvalid(),false);
updateBatchTiming({dataset:{batchDate:'0'},value:'2026-12-20',closest(){return {dataset:{batchWork:'1'}};}});edit('date','2026-12-03');outputs=artworkPostPlan(chosen(),plan);assert.equal(outputs[0].key,'2026-12-20');assert.equal(outputs[1].key,'2026-12-08');assert.equal(reviewCustomDateCount(),1);assert.match(nodes['review-schedule'].innerHTML,/Reset custom dates/);const custom=JSON.stringify(plan);resetReviewCustomDates();assert.equal(artworkPostPlan(chosen(),plan)[0].key,'2026-12-03');assert.equal(images(),original);undoBatchEdit();assert.equal(JSON.stringify(plan),custom);
const untouched=JSON.stringify(plan),history=batchHistory.length;busy=true;edit('time','08:00');resetReviewCustomDates();assert.equal(JSON.stringify(plan),untouched);assert.equal(batchHistory.length,history);busy=false;
${parse}
assert.equal(parseIntakePlan('Save these to Relay').plan.delivery,null);assert.equal(explicitUploadScope([1],'Save these to Relay'),true);assert.equal(explicitUploadScope([1],'Tag these "Hero School"'),true);assert.equal(explicitUploadScope([1],'Save only sketches to Relay'),false);assert.equal(explicitUploadScope([1],'Find these'),false);attachments[0].status='error';assert.equal(explicitUploadScope([1],'Save these to Relay'),false);attachments=[{id:1,status:'ready'},{id:0,status:'ready',fromGallery:true}];assert.equal(explicitUploadScope([1,0],'Save these to Relay'),false);attachments=[{id:1,status:'ready'},{id:2,status:'ready'}];assert.equal(explicitUploadScope([1],'Save these to Relay'),false);assert.equal(explicitUploadScope([1,2],'Save these to Relay'),true);for(const request of ['Save the first image to Relay','Save the last image to Relay','Save Garden studies to Relay','Save 1 image to Relay','Save these sketches to Relay'])assert.equal(explicitUploadScope([1,2],request),false);works[1].saved=true;assert.equal(explicitUploadScope([1,2],'Save these to Relay'),false);works[1].saved=false;
`,{assert,structuredClone});
// Exercise the real discovery and direct-intake entry points with stage capture.
let discoveryTest=readFileSync('.impeccable/review/lab2/check-discovery.mjs','utf8');
discoveryTest=discoveryTest.replace('showStage=()=>{}','showStage=value=>stages.push(value)').replace('let intakeRequest=null,','const stages=[];let intakeRequest=null,');
discoveryTest=discoveryTest.replace("assert.equal(plan.delivery,null);assert.equal(works[3].saved,false);", "assert.equal(plan.delivery,null);assert.equal(works[3].saved,false);assert.equal(stages.at(-1),2);assert.equal(intakeRequest.skipArtworkSelection,true);for(const request of ['Save the first image to Relay','Save the last image to Relay','Save New file to Relay','Save 1 image to Relay']){intakeRequest=null;discoveryState=discoveryRoute(request,null,[3]);discoveryPrepareReview();assert.equal(stages.at(-1),1);assert.equal(intakeRequest.skipArtworkSelection,false);}intakeRequest=null;discoveryState=discoveryRoute('Save these to Relay',null,[3]);discoveryPrepareReview();assert.equal(stages.at(-1),2);intakeRequest=null;discoveryState=discoveryRoute('Save the first image to Relay',discoveryState,[3]);discoveryPrepareReview();assert.equal(stages.at(-1),1);");
// Existing discovery fixture also verifies all library/generic routing expectations.
await import('data:text/javascript,'+encodeURIComponent(discoveryTest.replaceAll("from 'node:","from 'node:")));
const direct=script.slice(script.indexOf('mainComposer.onsubmit='),script.indexOf("mainInput.addEventListener('keydown'"));
runInNewContext(`
const works=[{id:0,name:'New image',incoming:true,saved:false}],mediaGroups=[['a']],date=i=>new Date(Date.UTC(2026,10,2+i*7));
let attachments=[{id:0,status:'ready'}],plan={},busy=false,mainReviewing=false,discoveryState=null,intakeRequest=null,selected=new Set(),stages=[];
const mainInput={value:'Save these to Relay'},mainComposer={},nodes={},$=id=>nodes[id]??=({value:'',textContent:'',hidden:true}),chosen=()=>works.filter(w=>selected.has(w.id));
const closeAttachmentMenu=()=>{},renderAttachments=()=>{},intakeFeedback=()=>{},cards=()=>{},showStage=value=>stages.push(value),openModal=()=>{},discoveryStart=()=>{throw Error('unexpected discovery')},trySocialTaskRequest=()=>false,tryAssetCompositionRequest=()=>false,tryScopedRenameRequest=()=>false,tryScopedTagsRequest=()=>false,tryCaptionRequest=()=>false,tryCollectionRequest=()=>false;
${planning}
${parse}
${direct}
mainComposer.onsubmit({preventDefault(){}});assert.equal(stages.at(-1),2);assert.equal(intakeRequest.skipArtworkSelection,true);assert.equal(works[0].saved,false);assert.equal(nodes['open-demo'].textContent,'Review actions');works.push({id:1,name:'Second image',incoming:true,saved:false},{id:2,name:'Third image',incoming:true,saved:false});attachments=[0,1,2].map(id=>({id,status:'ready'}));for(const request of ['Save the first image to Relay','Save the last image to Relay','Save New image to Relay','Save 1 image to Relay']){intakeRequest=null;mainInput.value=request;mainComposer.onsubmit({preventDefault(){}});assert.equal(stages.at(-1),1);assert.equal(intakeRequest.skipArtworkSelection,false);assert.equal(nodes['open-demo'].textContent,'Review selection');}intakeRequest=null;mainInput.value='Save all these images to Relay';mainComposer.onsubmit({preventDefault(){}});assert.equal(stages.at(-1),2);
`,{assert,structuredClone,setTimeout:fn=>fn()});
console.log('Review schedule controls: defaults, custom spacing memory, invalid blocking, last-valid preview, per-batch overrides/reset/Undo, unchanged images, busy guard; explicit uploaded scope skips selection in both intake paths without saving before confirmation.');

