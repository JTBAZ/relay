import {readFileSync} from 'node:fs';
import {Script,runInNewContext} from 'node:vm';
import assert from 'node:assert/strict';
const script=readFileSync('.impeccable/mocks/decision/modal-select-confirm.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
new Script(script);
const performance=script.slice(script.indexOf('const performanceFixtures='),script.indexOf('const performanceDialog='));
const tree=script.slice(script.indexOf('const treeMemberFixtures='),script.indexOf("const workTree=$('work-tree')"));
const cross=script.slice(script.indexOf('const crossPlatforms='),script.indexOf("const crosspostDialog=$('crosspost-dialog')"));
const line=name=>script.split('\n').find(line=>line.startsWith('function '+name+'('));
runInNewContext(`${performance}\n${tree}\n${cross}
const scheduledPosts=new Map(),mediaGroups={1:['b','d','e','b','d','e']};
const member=treeMembersFor(1)[1],draft=crossDraftFor(1,member,'patreon');
draft.delivery='schedule';draft.date='2026-11-09';draft.time='19:30';
draft.captions.patreon='Exact Patreon caption';draft.selected.add('bluesky');draft.captions.bluesky='Exact Bluesky caption';
const review=buildCrosspostReview(1,member,draft),posts=buildCrossScheduledPosts(review,member);
assert.equal(review.delivery,'schedule');assert.equal(review.timeZone,'Europe/Berlin');assert.equal(posts.length,2);
assert.equal(posts[0].caption,'Exact Patreon caption');assert.deepEqual(Array.from(posts[0].media),['b']);
assert.equal(posts[1].caption,'Exact Bluesky caption');assert.equal(posts[1].media.length,0);
assert.equal(posts[1].destinations[0].platform,'Bluesky');assert.equal(posts[0].destinations[0].status,'Scheduled');
assert.equal(posts[0].date,'2026-11-09');assert.equal(posts[0].time,'19:30');
draft.captions.patreon='Unconfirmed later edit';draft.media.clear();draft.date='2026-12-09';
assert.equal(posts[0].caption,'Exact Patreon caption');assert.equal(posts[0].date,'2026-11-09');assert.equal(posts[0].media.length,1);
draft.prepared=Object.fromEntries(review.targets.map(target=>[target.key,target]));
posts.forEach(registerCrossScheduled);posts.forEach(registerCrossScheduled);
assert.equal(scheduledPosts.size,2);assert.equal(memberPresence(1,member,'patreon').state,'scheduled');
assert.match(crossGapText(1,member,'Patreon'),/^Scheduled/);assert.equal(crossGapAction(1,member,'Patreon'),'View scheduled post');
assert.equal(galleryPresence(1,'patreon').posted,1);assert.equal(galleryPresence(1,'patreon').scheduled,1);
assert.equal(performancePostsFor(1).length,5);assert.match(buildCrosspostReview(1,member,draft).error,/scheduled/);
assert.equal(scheduledPosts.get(posts[0].id).destinations[0].time,'19:30');
const blue=scheduledPosts.get(posts[1].id);blue.destinations[0].platform='Patreon';assert.equal(memberPresence(1,member,'bluesky').state,'ready');
draft.selected=new Set(['bluesky']);
const secondReview=buildCrosspostReview(1,member,draft),secondPosts=buildCrossScheduledPosts(secondReview,member);
assert.ok(!secondReview.error);assert.notEqual(secondPosts[0].id,blue.id);
secondPosts.forEach(registerCrossScheduled);assert.equal(scheduledPosts.size,3);
assert.equal(crossScheduledPost(1,member.id,'bluesky').id,secondPosts[0].id);
assert.equal(blue.destinations[0].platform,'Patreon');assert.equal(blue.date,'2026-11-09');
${line('validatePostDestinationMedia')}
assert.match(validatePostDestinationMedia(posts[0],{destinations:[{platform:'Bluesky'}]}).error,/text-only/);
assert.equal(validatePostDestinationMedia(posts[1],{destinations:[{platform:'Bluesky'}]}),null);
assert.equal(validatePostDestinationMedia(posts[0],{destinations:[{platform:'Patreon'}]}),null);
assert.equal(validatePostDestinationMedia({...posts[0],media:['a','b','c','d','e']},{destinations:[{platform:'X'}]}).index,0);
${line('removeScheduledPost')}
${line('restoreCanceledPost')}
const canceled=removeScheduledPost(posts[0].id);assert.equal(memberPresence(1,member,'patreon').state,'scheduled');
restoreCanceledPost(canceled);assert.equal(memberPresence(1,member,'patreon').state,'scheduled');
const nodes=new Proxy({},{get:()=>({hidden:false,textContent:'',focus(){}})});
const $=id=>nodes[id],closeDayInspector=()=>{},renderEditedRail=()=>{},showScheduleUndo=()=>{},eventCalendarTarget=()=>({focus(){}}),document={querySelector:()=>({focus(){}})};
${line('undoCrossScheduledBatch')}
undoCrossScheduledBatch({ids:posts.map(post=>post.id),post:posts[0]});
assert.equal(scheduledPosts.size,1);assert.equal(memberPresence(1,member,'patreon').state,'ready');
assert.equal(memberPresence(1,member,'bluesky').state,'scheduled');assert.ok(scheduledPosts.has(secondPosts[0].id));
undoCrossScheduledBatch({ids:secondPosts.map(post=>post.id),post:secondPosts[0]});
assert.equal(scheduledPosts.size,0);assert.equal(memberPresence(1,member,'bluesky').state,'ready');
assert.equal(draft.prepared.patreon.caption,'Exact Patreon caption');assert.equal(performancePostsFor(1).length,5);
for(const [date,time,field] of [['2026-02-30','18:00','date'],['','18:00','date'],['2026-12-01','','time'],['2026-12-01','24:00','time'],['2026-10-20','18:00','date'],['2026-10-21','12:59','time']]){
 const result=validateCrossTiming({delivery:'schedule',date,time});assert.equal(result.field,field);assert.ok(result.error);
}
assert.equal(validateCrossTiming({delivery:'schedule',date:'2026-12-01',time:'00:00'}).time,'00:00');
assert.equal(Object.keys(validateCrossTiming({delivery:'prepare',date:'',time:''})).length,0);
`,{assert,Intl,structuredClone,works:[{art:'a'},{art:'b'},{art:'c'}]});
console.log('Cross-post schedule: timing validation, reviewed payload isolation, media, scheduled/published distinction, duplicate protection, cancellation and batch Undo passed.');
