import {readFileSync} from 'node:fs';
import {runInNewContext,Script} from 'node:vm';
import assert from 'node:assert/strict';
const html=readFileSync('.impeccable/mocks/decision/modal-select-confirm.html','utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];new Script(script);
const planning=script.slice(script.indexOf('function requestedImageGrouping('),script.indexOf('function groupingControls('));
const arrangement=script.slice(script.indexOf('function rememberBatchEdit('),script.indexOf('function inspectBatchImage('));
const updateGrouping=script.split('\n').find(line=>line.startsWith('function updateImageGrouping('));
const pointerTarget=script.split('\n').find(line=>line.startsWith('function batchPointerTarget('));
assert.doesNotMatch(html.match(/\.batch-tile\.is-dragging\{([^}]*)\}/)[1],/pointer-events\s*:\s*none/);
assert.match(html,/\.batch-drag-ghost\{[^}]*pointer-events:none/);
const registration=script.split('\n').find(line=>line.startsWith('function registerScheduledPost('));
runInNewContext(`
const works=[{id:0,name:'Blue hour'},{id:1,name:'Garden studies',sourceRef:{provider:'Patreon',accountId:'ava',externalPostId:'garden'}},{id:2,name:'Final work'}],mediaGroups=[['a','c','e','d'],['b','d','e','b','d','e'],['a']],date=i=>new Date(Date.UTC(2026,10,2+i*7));
const originalMedia=JSON.stringify(mediaGroups),settings={grouping:'batch',batchSize:2,operationId:'arrange',target:'X'};
${planning}
${registration}
${pointerTarget}
const boardTarget={dataset:{batchWork:'1'}},binTarget={dataset:{binIndex:'0'}},tileTarget={dataset:{batchOrdinal:'0'},getBoundingClientRect(){return {left:80,width:84}}};
const sourceTarget={closest(selector){return selector==='[data-batch-work]'?boardTarget:selector==='[data-bin-index]'?binTarget:tileTarget;}},document={elementFromPoint(){return sourceTarget;}},batchDrag={workId:1};
const ownTarget=batchPointerTarget({clientX:95,clientY:100});assert.equal(ownTarget.before,0);assert.equal(ownTarget.index,0);
const initial=artworkBatchLayout(works[1],settings),unchanged=JSON.stringify(initial);
assert.equal(JSON.stringify(moveBatchImage(initial,0,ownTarget.index,ownTarget.before,ownTarget.after)),unchanged);
let layout=moveBatchImage(initial,1,1);assert.equal(JSON.stringify(initial),unchanged);assert.deepEqual(Array.from(layout,group=>Array.from(group)),[[0],[2,3,1],[4,5]]);
layout=moveBatchImage(layout,0,1,2);assert.deepEqual(Array.from(layout,group=>Array.from(group)),[[0,2,3,1],[4,5]]);
let outputs=artworkPostPlan([works[1]],{...settings,batchLayouts:{1:layout}});assert.equal(outputs.length,2);assert.equal(outputs[1].key,'2026-11-09');assert.deepEqual(Array.from(outputs[0].source.ordinals),[0,2,3,1]);
layout=moveBatchImage(layout,0,0,3,true);assert.deepEqual(Array.from(layout[0]),[2,3,0,1]);outputs=artworkPostPlan([works[1]],{...settings,batchLayouts:{1:layout}});assert.deepEqual(Array.from(outputs[0].media),['e','b','b','d']);assert.equal(sourceImageLabel(outputs[0].source),'Images 3, 4, 1, 2 of 6');
layout=moveBatchImage(layout,5,layout.length);assert.deepEqual(Array.from(layout,group=>Array.from(group)),[[2,3,0,1],[4],[5]]);outputs=artworkPostPlan([works[1]],{...settings,batchLayouts:{1:layout}});assert.equal(outputs.length,3);assert.equal(outputs[2].key,'2026-11-16');assert.equal(new Set(outputs.flatMap(post=>post.source.assetIds)).size,6);assert.deepEqual(Array.from(outputs.flatMap(post=>post.source.ordinals)).sort(),[0,1,2,3,4,5]);
for(const args of [[99,0],[1,-1],[1,99],[1,0,1]])assert.equal(JSON.stringify(moveBatchImage(layout,...args)),JSON.stringify(layout));
assert.equal(sourceImageLabel({ordinals:[2,3],imageCount:6}),'Images 3–4 of 6');assert.equal(sourceImageLabel({ordinals:[1,0],imageCount:6}),'Images 2, 1 of 6');assert.equal(sourceImageLabel({ordinals:[5],imageCount:6}),'Image 6 of 6');
for(const invalid of [[[0,0],[1,2,3,4,5]],[[0,1],[2,3],[4]],[[0,1],[2,3],[4,6]],[[],[0,1,2,3,4,5]]])assert.throws(()=>artworkPostPlan([works[1]],{...settings,batchLayouts:{1:invalid}}),/once/);
const withTail=artworkPostPlan([works[1],works[2]],{...settings,batchLayouts:{1:[[0,1,2,3],[4,5]]}});assert.equal(withTail.length,3);assert.equal(withTail[2].key,'2026-11-16');assert.equal(JSON.stringify(mediaGroups),originalMedia);
const scheduledPosts=new Map();for(const post of outputs)registerScheduledPost(post,settings);const saved=structuredClone(scheduledPosts.get(outputs[0].id));layout[0].reverse();assert.deepEqual(scheduledPosts.get(saved.id).source,saved.source);assert.equal(JSON.stringify(scheduledPosts.get(saved.id).media),JSON.stringify(saved.media));
let plan={...settings},busy=false,batchHistory=[],selected=new Set([1]),rebuilds=0;const expandedBatchWorks=new Set(),chosen=()=>works.filter(work=>selected.has(work.id)),escapeHtml=value=>value,icon=()=>'',focus={focus(){},getBoundingClientRect(){return {top:0,bottom:1}},scrollIntoView(){}},nodes={},$=id=>nodes[id]??=({textContent:'',getBoundingClientRect(){return {top:0,bottom:1}},querySelector(){return focus;}});function review(){rebuilds++;}
${arrangement}
${updateGrouping}
const noOpPlan=JSON.stringify(plan);applyBatchMove(1,0,ownTarget.index,ownTarget.before,ownTarget.after);assert.equal(JSON.stringify(plan),noOpPlan);assert.equal(batchHistory.length,0);assert.equal(rebuilds,0);assert.equal(nodes['action-feedback'].textContent,'Arrangement unchanged.');
applyBatchMove(1,1,1);assert.deepEqual(Array.from(plan.batchLayouts[1],group=>Array.from(group)),[[0],[2,3,1],[4,5]]);applyBatchMove(1,0,1);assert.equal(artworkPlanCounts(chosen(),plan).posts,2);assert.match(nodes['action-feedback'].textContent,/Empty batch removed/);assert.equal(batchHistory.length,2);undoBatchEdit();assert.equal(artworkPlanCounts(chosen(),plan).posts,3);undoBatchEdit();assert.equal(plan.batchLayouts[1],undefined);assert.equal(currentBatchUndo(),-1);
reorderBatchImage(1,0,1);assert.deepEqual(Array.from(plan.batchLayouts[1][0]),[1,0]);const board=batchBoardMarkup(works[1]);assert.match(board,/data-batch-image=/);assert.match(board,/Move earlier/);assert.match(board,/New batch/);assert.match(board,/source image 2 in batch 1/);assert.match(board,/2026-11-16/);const beforeBusy=JSON.stringify(plan);busy=true;applyBatchMove(1,0,2);assert.equal(JSON.stringify(plan),beforeBusy);busy=false;
plan.batchLayouts={1:[[3,2,0,1],[4,5]]};updateImageGrouping({target:{name:'images-per-post',value:'3'}});assert.equal(plan.batchSize,3);assert.equal(plan.batchLayouts[1],undefined);undoBatchEdit();assert.equal(plan.batchSize,2);assert.deepEqual(Array.from(plan.batchLayouts[1][0]),[3,2,0,1]);
const historyCount=batchHistory.length;plan={...settings,operationId:'different'};assert.equal(currentBatchUndo(),-1);undoBatchEdit();assert.equal(batchHistory.length,historyCount);
`,{assert,structuredClone});
console.log('Batch bins: lossless move/reorder/new-post, empty removal/date compaction, exact preview/source order, source isolation, frozen scheduling, Undo, busy and operation guards passed.');
