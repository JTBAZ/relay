import {readFileSync} from 'node:fs';
import {runInNewContext,Script} from 'node:vm';
import assert from 'node:assert/strict';
const html=readFileSync('.impeccable/mocks/decision/modal-select-confirm.html','utf8'),script=html.match(/<script>([\s\S]*?)<\/script>/)[1];new Script(script);
const planning=script.slice(script.indexOf('function requestedImageGrouping('),script.indexOf('function groupingControls('));
const arrangement=script.slice(script.indexOf('function rememberBatchEdit('),script.indexOf('function inspectBatchImage('));
const registration=script.split('\n').find(line=>line.startsWith('function registerScheduledPost('));
const grouping=script.split('\n').find(line=>line.startsWith('function updateImageGrouping('));
const confirm=script.split('\n').find(line=>line.startsWith('function confirmPlan('));
runInNewContext(`
const works=[{id:0,name:'Blue hour'},{id:1,name:'Garden studies',sourceRef:{provider:'Patreon',accountId:'ava',externalPostId:'garden'}}],mediaGroups=[['a','c'],['b','d','e','b','d','e']],date=i=>new Date(Date.UTC(2026,10,2+i*7));
const settings={grouping:'batch',batchSize:2,operationId:'timing',target:'X',delivery:'schedule'};
${planning}
${registration}
let plan={...settings},busy=false,batchHistory=[],selected=new Set([1]),rebuilds=0;
const expandedBatchWorks=new Set(),chosen=()=>works.filter(work=>selected.has(work.id)),escapeHtml=v=>String(v).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'),icon=()=>'',focus={focus(){},getBoundingClientRect(){return {top:0,bottom:1}},scrollIntoView(){}},nodes={},$=id=>nodes[id]??=({textContent:'',getBoundingClientRect(){return {top:0,bottom:1}},querySelector(){return focus;}});function review(){rebuilds++;}
${arrangement}
${grouping}
${confirm}
const edit=(batch,field,value)=>updateBatchTiming({dataset:{[field==='date'?'batchDate':'batchTime']:String(batch)},value,closest(){return {dataset:{batchWork:'1'}};}});
edit(0,'date','2026-12-04');edit(0,'time','19:30');let outputs=artworkPostPlan(chosen(),plan);assert.equal(outputs.length,3);assert.equal(outputs[0].key,'2026-12-04');assert.equal(outputs[0].time,'19:30');assert.equal(outputs[1].key,'2026-11-09');assert.equal(outputs[1].time,'18:00');assert.match(outputScheduleLabel(outputs[0]),/4 December 2026 · 19:30/);assert.equal(batchScheduleInvalid(),false);
const markup=batchSchedulePreview(works[1],outputs);assert.ok(markup.indexOf('Batch 2')<markup.indexOf('Batch 1'));assert.match(markup,/2026-12-04T19:30/);assert.match(batchBoardMarkup(works[1]),/data-batch-date="0"/);assert.match(batchBoardMarkup(works[1]),/Batch 1 time/);
undoBatchEdit();assert.equal(artworkPostPlan(chosen(),plan)[0].time,'18:00');undoBatchEdit();assert.equal(artworkPostPlan(chosen(),plan)[0].key,'2026-11-02');
for(const value of ['', '2026-02-30','2026-10-20']){edit(0,'date',value);assert.equal(batchScheduleInvalid(),true);confirmPlan();assert.match(outputScheduleLabel(artworkPostPlan(chosen(),plan)[0]),/Choose a valid/);undoBatchEdit();assert.equal(batchScheduleInvalid(),false);}
edit(0,'date','2026-10-21');edit(0,'time','13:00');assert.equal(batchScheduleInvalid(),true);edit(0,'time','13:01');assert.equal(batchScheduleInvalid(),false);edit(0,'time','24:00');assert.equal(batchScheduleInvalid(),true);edit(0,'time','');assert.equal(batchScheduleInvalid(),true);edit(0,'time','19:45');assert.equal(batchScheduleInvalid(),false);
plan={...settings,batchTimes:{1:[null,{date:'2026-12-05',time:'20:15'}]}};batchHistory=[];applyBatchMove(1,0,1);applyBatchMove(1,1,1);outputs=artworkPostPlan(chosen(),plan);assert.equal(outputs.length,2);assert.equal(outputs[0].key,'2026-12-05');assert.equal(outputs[0].time,'20:15');assert.deepEqual(Array.from(outputs[0].source.ordinals),[2,3,0,1]);assert.equal(outputs[1].key,'2026-11-09');undoBatchEdit();assert.equal(plan.batchTimes[1][1].time,'20:15');
plan={...settings,batchTimes:{1:[{date:'2026-12-04',time:'19:30'}]}};applyBatchMove(1,5,3);outputs=artworkPostPlan(chosen(),plan);assert.equal(outputs[0].key,'2026-12-04');assert.equal(outputs[3].key,'2026-11-23');assert.equal(outputs[3].time,'18:00');reorderBatchImage(1,0,1);assert.equal(artworkPostPlan(chosen(),plan)[0].time,'19:30');
const savedPlan=structuredClone(plan);updateImageGrouping({target:{name:'images-per-post',value:'3'}});assert.equal(plan.batchTimes[1],undefined);undoBatchEdit();assert.equal(JSON.stringify(plan),JSON.stringify(savedPlan));
const before=JSON.stringify(plan),history=batchHistory.length;busy=true;edit(0,'time','17:00');assert.equal(JSON.stringify(plan),before);assert.equal(batchHistory.length,history);busy=false;
plan.batchTimes[0]=[{date:'',time:''}];assert.equal(batchScheduleInvalid(),false);selected.add(0);assert.equal(batchScheduleInvalid(),true);selected.delete(0);
const scheduledPosts=new Map();outputs=artworkPostPlan(chosen(),plan);registerScheduledPost(outputs[0],plan);const stored=scheduledPosts.get(outputs[0].id);assert.equal(stored.date,'2026-12-04');assert.equal(stored.time,'19:30');assert.equal(stored.destinations[0].time,'19:30');const source=JSON.stringify(stored.source);plan.batchTimes[1][0].time='07:00';assert.equal(stored.time,'19:30');assert.equal(JSON.stringify(stored.source),source);
`,{assert,structuredClone});
assert.match(script,/queue=artworkPostPlan\(chosen\(\),snapshot\)\.sort/);
assert.match(script,/querySelectorAll\('button,input,select,summary'\)/);
assert.match(script,/discoveryState.batchTimes=structuredClone\(plan.batchTimes\|\|\{\}\)/);
assert.match(script,/batchTimes:structuredClone\(state.batchTimes\|\|\{\}\)/);
console.log('Batch timing: independent dates/times, chronological preview, invalid/past blocking, Undo/regroup, timing retention through moves/new bins, source isolation, busy guard and exact frozen calendar record passed.');
