import {readFileSync} from 'node:fs';
import {runInNewContext,Script} from 'node:vm';
import assert from 'node:assert/strict';
const html=readFileSync('.impeccable/mocks/decision/modal-select-confirm.html','utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];new Script(script);
const helpers=script.slice(script.indexOf('function requestedImageGrouping('),script.indexOf('function groupingControls('));
const preview=script.split('\n').find(line=>line.startsWith('function batchPreviewMarkup('));
const functions=script.split('\n').filter(line=>['registerScheduledPost','removeScheduledPost','restoreCanceledPost'].some(name=>line.startsWith('function '+name+'('))).join('\n');
runInNewContext(`
const works=[{id:0,name:'Blue hour'},{id:1,name:'Garden studies',sourceRef:{provider:'Patreon',accountId:'ava',externalPostId:'patreon-42'}},{id:2,name:'Window'},{id:3,name:'Upload',incoming:true}];
const mediaGroups=[['a','c','e','d'],['b','d','e','b','d','e'],['e'],['upload']],date=i=>new Date(Date.UTC(2026,10,2+i*7));
const scheduledPosts=new Map();let scheduleUndo=[];
${helpers}
const escapeHtml=value=>value;
${preview}
${functions}
const pairs=artworkPostPlan([works[1]],{grouping:'batch',batchSize:2,operationId:'pairs'});
assert.equal(pairs.length,3);assert.deepEqual(Array.from(pairs,post=>post.media.length),[2,2,2]);assert.deepEqual(Array.from(pairs,post=>post.key),['2026-11-02','2026-11-09','2026-11-16']);assert.deepEqual(Array.from(pairs.flatMap(post=>post.source.ordinals)),[0,1,2,3,4,5]);assert.equal(new Set(pairs.flatMap(post=>post.source.assetIds)).size,6);assert.equal(artworkPlanCounts([works[1]],{grouping:'batch',batchSize:2}).posts,3);
const batchMarkup=batchPreviewMarkup(pairs);assert.equal((batchMarkup.match(/data-media=/g)||[]).length,6);assert.match(batchMarkup,/View batch 3, source image 6/);assert.match(batchMarkup,/2026-11-16/);
mediaGroups.push(['a','b','c','d','e','f','g']);const seven={id:4,name:'Seven images'},remainder=artworkPostPlan([seven],{grouping:'batch',batchSize:2,operationId:'remainder'});assert.deepEqual(Array.from(remainder,post=>post.media.length),[2,2,2,1]);assert.deepEqual(Array.from(remainder[3].source.ordinals),[6]);assert.equal(remainder[3].key,'2026-11-23');
const thirds=artworkPostPlan([works[1]],{grouping:'batch',batchSize:4});assert.deepEqual(Array.from(thirds,post=>post.media.length),[4,2]);assert.equal(artworkPostPlan([works[1]],{grouping:'batch',batchSize:99}).length,1);assert.equal(artworkPostPlan([],{grouping:'batch',batchSize:2}).length,0);
const partitioned=artworkPostPlan([{id:5,name:'First'},{id:6,name:'Second'}],{grouping:'batch',batchSize:2});assert.equal(partitioned.length,0);
mediaGroups[5]=['a','b','c'];mediaGroups[6]=['d','e','f'];const separateSources=artworkPostPlan([{id:5,name:'First'},{id:6,name:'Second'}],{grouping:'batch',batchSize:2});assert.deepEqual(Array.from(separateSources,post=>post.media.length),[2,1,2,1]);assert.equal(separateSources[2].key,'2026-11-16');
for(const size of [0,-1,1.5,'',NaN,Infinity])assert.throws(()=>artworkPostPlan([works[1]],{grouping:'batch',batchSize:size}),/whole number/);
assert.equal(requestedImageGrouping('split images into batches of 2'),'batch');assert.equal(requestedBatchSize('batches of 2'),2);assert.equal(requestedBatchSize('3 images per post'),3);assert.equal(requestedBatchSize('-2 images per post'),null);assert.equal(requestedBatchSize('batches of 0'),null);assert.equal(requestedImageGrouping('together and batches of 2'),'conflict');
for(const output of pairs)registerScheduledPost(output,{target:'X'});assert.equal(scheduledPosts.size,3);assert.equal(scheduledPosts.get(pairs[1].id).media.length,2);const removedBatch=removeScheduledPost(pairs[1].id);assert.ok(scheduledPosts.has(pairs[0].id));restoreCanceledPost(removedBatch);assert.deepEqual(scheduledPosts.get(pairs[1].id).source,removedBatch.source);scheduledPosts.clear();
const before=JSON.stringify({works,mediaGroups}),settings={grouping:'together',operationId:'batch-1',target:'X'},items=[works[0],works[1]];
const together=artworkPostPlan(items,settings);assert.equal(together.length,2);assert.equal(together[0].media.length,4);assert.equal(together[1].media.length,6);assert.equal(together[1].key,'2026-11-09');assert.equal(scheduledPosts.size,0);
assert.equal(artworkPlanCounts(items,settings).images,10);assert.equal(artworkPlanCounts(items,settings).artworks,2);
const split=artworkPostPlan(items,{...settings,grouping:'separate'});assert.equal(split.length,10);assert.equal(new Set(split.map(post=>post.id)).size,10);assert.ok(split.every(post=>post.media.length===1));assert.equal(split[4].key,'2026-11-30');assert.equal(split[9].key,'2027-01-04');
const garden=split.filter(post=>post.work.id===1);assert.equal(new Set(garden.flatMap(post=>post.source.assetIds)).size,6);assert.equal(garden[0].media[0],garden[3].media[0]);assert.notEqual(garden[0].source.assetIds[0],garden[3].source.assetIds[0]);assert.equal(garden[0].source.externalPostId,'patreon-42');assert.equal(garden[0].source.provider,'Patreon');assert.equal(garden[5].source.ordinals[0],5);assert.ok(garden.every(post=>post.source.creativeWorkId===garden[0].source.creativeWorkId));
assert.equal(JSON.stringify({works,mediaGroups}),before);assert.equal(scheduledPosts.size,0);
for(const output of split)registerScheduledPost(output,settings);assert.equal(scheduledPosts.size,10);
for(const output of artworkPostPlan(items,{...settings,grouping:'separate'}))registerScheduledPost(output,settings);assert.equal(scheduledPosts.size,10,'replay reuses identities');
const other=artworkPostPlan(items,{...settings,operationId:'batch-2',grouping:'separate'});for(const output of other)registerScheduledPost(output,settings);assert.equal(scheduledPosts.size,20,'later batch does not replace earlier siblings');
const saved=structuredClone(scheduledPosts.get(garden[0].id));garden[0].source.assetIds.push('mutation');assert.equal(scheduledPosts.get(saved.id).source.assetIds.length,1);
const canceled=removeScheduledPost(saved.id);assert.equal(scheduledPosts.size,19);assert.ok(scheduledPosts.has(garden[1].id));assert.equal(JSON.stringify({works,mediaGroups}),before);restoreCanceledPost(canceled);assert.equal(scheduledPosts.size,20);assert.equal(scheduledPosts.get(saved.id).id,saved.id);assert.deepEqual(scheduledPosts.get(saved.id).source,saved.source);
for(const grouping of ['together','separate']){assert.equal(artworkPostPlan([works[2]],{...settings,grouping}).length,1);assert.equal(artworkPostPlan([],{...settings,grouping}).length,0);assert.equal(artworkPostPlan([works[3]],{...settings,grouping})[0].source.provider,'Upload');}
`,{assert,structuredClone});
assert.match(html,/name="artwork-grouping"/);assert.match(html,/Schedule '\+outputs.length\+' posts to/);
console.log('Artwork grouping: counts, media order, weekly dates, distinct source assets, Patreon/upload provenance, immutable snapshots, replay, independent batches, cancel and Undo passed.');
