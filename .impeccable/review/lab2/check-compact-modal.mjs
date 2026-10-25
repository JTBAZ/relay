import { readFileSync } from 'node:fs';

import { Script, runInNewContext } from 'node:vm';

import assert from 'node:assert/strict';



const html = readFileSync('.impeccable/mocks/decision/modal-select-confirm.html', 'utf8');

const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

new Script(script);

const functions = script.split('\n').filter(line => ['summary', 'steps', 'revise', 'transferMonth', 'flightGeometry', 'postsForDay', 'dayLabel', 'dayButton', 'scheduleCountLabel', 'clearPlannedPosts', 'registerScheduledPost', 'buildEditedPost', 'removeScheduledPost', 'restoreCanceledPost', 'calendarDays', 'restoreMovedPost', 'rebasePostProposal', 'restorePostProposal', 'postProposalSteps', 'eventChangeReceipt', 'attachmentProblem', 'galleryMatches', 'applyWorkTag'].some(name => line.startsWith(`function ${name}(`))).join('\n');

const postRequestParser=script.slice(script.indexOf('function readPostChatRequest('),script.indexOf('function renderEventChat('));

const intakeParser=script.slice(script.indexOf('function parseIntakePlan('),script.indexOf('// Studio discovery:'));

const mediaGroups = script.split('\n').find(line => line.startsWith('const mediaGroups='));

const inspectorData = script.slice(script.indexOf('const samplePosts='), script.indexOf('let inspectedDay='));

runInNewContext(`

let selected=new Set([0,1,2,3,4,5,6,7]), busy=false, stage=2;

let inspectedDay='2026-10-23',intakeRequest=null;

const escapeHtml=value=>value;

let plan={rename:true,delivery:'schedule',target:'X',tag:null};

const works=Array.from({length:8},(_,id)=>({id,name:'Work '+id,sketch:id>5}));

const chosen=()=>works.filter(w=>selected.has(w.id)),dateLabel=i=>'Date '+i,date=i=>new Date(Date.UTC(2026,10,2+i*7));

function cards(){} function review(){}

${mediaGroups}
${script.slice(script.indexOf('function requestedImageGrouping('),script.indexOf('function groupingControls('))}

${inspectorData}

${functions}

${postRequestParser}

${intakeParser}

const input={value:'Drop all the sketches',focus(){}},feedback={textContent:''};

revise(input,feedback);

assert.equal(selected.size,6);

assert.equal(steps(works[0],0).length,2);

assert.equal(steps(works[0],0)[0].details.length,1);

assert.equal(steps(works[1],1)[1].media.length,6);

assert.equal(steps(works[4],4)[1].media.length,1);

assert.match(summary(),/6 posts to X from 18 images/);

input.value='Drop everything except sketches';revise(input,feedback);

assert.equal(selected.size,6);assert.equal(input.value,'Drop everything except sketches');

input.value='Tag these "Hero School"';revise(input,feedback);

assert.equal(plan.tag,'Hero School');assert.equal(steps(works[0],0).length,1);

assert.equal(plan.delivery,null);

input.value='Prepare drafts instead';revise(input,feedback);

assert.equal(plan.delivery,'draft');assert.equal(steps(works[0],0)[1].label,'Prepare draft');

assert.match(summary(),/Tag and prepare 6 drafts/);

input.value='Rename only';revise(input,feedback);

input.value='Remove rename';revise(input,feedback);

assert.equal(plan.rename,true);assert.match(feedback.textContent,/no actions/);

input.value='Post to Patreon instead';revise(input,feedback);

assert.equal(steps(works[0],0)[0].details[0][1],'Work 0 \u2014 Patreon.png');

assert.equal(attachmentProblem({type:'text/plain',size:1},0),'Choose a PNG, JPG, WebP, or GIF image.');

assert.match(attachmentProblem({type:'image/png',size:11*1024*1024},0),/under 10 MB/);

assert.match(attachmentProblem({type:'image/jpeg',size:1},8),/up to 8/);

assert.equal(attachmentProblem({type:'image/webp',size:1024},2),'');

const taggedWork={tags:['Existing']};applyWorkTag(taggedWork,'Hero School');applyWorkTag(taggedWork,'Hero School');applyWorkTag(taggedWork,null);assert.deepEqual(Array.from(taggedWork.tags),['Existing','Hero School']);
const galleryWork={name:'Garden studies',collection:'October studies',tags:['Hero School']};
assert.equal(galleryMatches(galleryWork,'GARDEN studies'),true);assert.equal(galleryMatches(galleryWork,'  garden   October '),true);assert.equal(galleryMatches(galleryWork,'hero school'),true);assert.equal(galleryMatches(galleryWork,'night'),false);assert.equal(galleryMatches(galleryWork,'   '),true);
assert.equal(parseIntakePlan('Tag this "Hero School"').plan.tag,'Hero School');
const attachedPlan=parseIntakePlan('Save these to my gallery and schedule one image each Monday on X.');

assert.equal(attachedPlan.plan.grouping,'separate');assert.equal(parseIntakePlan('Schedule weekly to X together and separate posts').error,'Choose whether images stay together or become separate posts.');assert.equal(attachedPlan.plan.delivery,'schedule');assert.equal(attachedPlan.plan.rename,false);assert.equal(attachedPlan.plan.target,'X');

assert.equal(parseIntakePlan('Prepare drafts for Patreon').plan.delivery,'draft');

assert.equal(parseIntakePlan('Save these to my gallery').plan.delivery,null);

assert.ok(parseIntakePlan('Make a teaser from these').error);assert.ok(parseIntakePlan('Schedule weekly').error);assert.ok(parseIntakePlan('Save to gallery but do not schedule weekly to X').error);

assert.ok(parseIntakePlan('Schedule these tomorrow on X').error);

assert.ok(parseIntakePlan('Schedule weekly at 22:00 on X').error);

assert.equal(parseIntakePlan('Save these to gallery and tag them "Hero School"').plan.tag,'Hero School');

intakeRequest={ids:[0]};works[0].incoming=true;works[0].filename='Work 0.png';plan=attachedPlan.plan;selected=new Set([0]);

assert.deepEqual(Array.from(steps(works[0],0),s=>s.label),['Save to gallery','Schedule 4 posts to X']);

assert.match(summary(),/Schedule 4 posts to X from 4 images.*Save new images/);

plan.tag='October';assert.match(summary(),/Tag and schedule 4 posts to X from 4 images.*Save new images/);plan.delivery='draft';assert.match(summary(),/tag \u201cOctober\u201d and prepare drafts for X/);plan={rename:false,delivery:'schedule',target:'X',tag:null};works[0].saved=true;assert.equal(steps(works[0],0).length,1);intakeRequest=null;selected=new Set([0,1,2,3,4,5]);

const november=transferMonth(new Date(Date.UTC(2026,10,2)));

assert.equal(november.offset,6);assert.equal(november.days,30);assert.equal(november.key,'2026-11');

const december=transferMonth(new Date(Date.UTC(2026,11,7)));

assert.equal(december.offset,1);assert.equal(december.days,31);

const octoberDays=calendarDays('2026-10-23');assert.equal(octoberDays.length,42);assert.equal(octoberDays[0],'2026-09-28');assert.equal(octoberDays[41],'2026-11-08');

assert.ok(calendarDays('2028-02-01').includes('2028-02-29'));

assert.equal(calendarDays('2026-12-01')[41],'2027-01-10');

for(const zoom of [.45,.85,1]){

 const from={left:178*zoom,top:240*zoom,height:51*zoom};

 const to={left:1200*zoom,top:200*zoom,width:25*zoom,height:23*zoom};

 const geometry=flightGeometry(from,to,zoom);

 assert.ok(Math.abs(geometry.left+110+geometry.dx-1212.5)<1e-8);

 assert.ok(Math.abs(geometry.top+22+geometry.dy-211.5)<1e-8);

}

const dayPosts=postsForDay('2026-10-23');

const chatBase=structuredClone(dayPosts[0]),chatMove=readPostChatRequest(chatBase,'Move this to next Friday at 19:00');

assert.equal(chatMove.post.id,chatBase.id);assert.equal(chatMove.post.date,'2026-10-30');assert.equal(chatMove.post.time,'19:00');assert.equal(chatMove.post.destinations[0].status,'Draft');assert.equal(chatBase.time,'12:00');

assert.equal(postProposalSteps(chatBase,chatMove.post).length,2);

assert.match(eventChangeReceipt(postProposalSteps(chatBase,chatMove.post)),/^Moved to .*30 Oct 2026.*19:00$/);

assert.equal(eventChangeReceipt([{kind:'caption',label:'Caption',value:'New caption'}]),'Caption updated');

assert.equal(eventChangeReceipt([{kind:'time',label:'Time',value:'18:00 \u00b7 Europe/Berlin'}]),'Time updated \u00b7 18:00');

const chatCorrection=readPostChatRequest(chatMove.post,'Actually, make it Saturday at 18:00');

assert.equal(chatCorrection.post.date,'2026-10-31');assert.equal(chatCorrection.post.time,'18:00');

assert.equal(readPostChatRequest(chatCorrection.post,'Actually make it Saturday at 20:00').post.date,'2026-10-31');

assert.ok(readPostChatRequest(chatBase,'Move all posts to next Friday at 19:00').error);

assert.ok(readPostChatRequest(chatBase,'Move this to next Friday at 25:00').error);

assert.equal(readPostChatRequest(chatBase,'Switch to X').post.destinations[0].platform,'X');

assert.ok(readPostChatRequest(chatBase,'Shorten the caption').post.caption.length<chatBase.caption.length);

const chatRebase=rebasePostProposal(chatBase,chatMove.post,{...chatBase,title:'A manual title edit'});

assert.equal(chatRebase.title,'A manual title edit');assert.equal(chatRebase.date,'2026-10-30');

scheduledPosts.set(chatBase.id,{...chatMove.post,caption:'A later caption edit'});

const chatUndo=restorePostProposal(chatBase,chatMove.post);assert.equal(chatUndo.date,chatBase.date);assert.equal(chatUndo.time,'12:00');assert.equal(chatUndo.caption,'A later caption edit');

scheduledPosts.set(chatBase.id,chatBase);

const edited=buildEditedPost(dayPosts[1],{title:'  Garden, revised  ',caption:'New caption',date:'2026-11-04',destinations:[{platform:'Patreon',account:'Ava\u2019s studio',time:'19:30',status:'Scheduled'},{platform:'X',account:'Ava\u2019s studio',time:'09:15',status:'Scheduled'}]});

assert.equal(edited.title,'Garden, revised');assert.equal(edited.caption,'New caption');assert.equal(edited.date,'2026-11-04');assert.equal(edited.time,'09:15');

assert.equal(edited.media.length,6);assert.equal(edited.id,dayPosts[1].id);assert.equal(dayPosts[1].date,'2026-10-23');assert.equal(dayPosts[1].title,'Garden studies');

edited.destinations[0].time='20:00';assert.equal(dayPosts[1].destinations[0].time,'18:00');

assert.equal(buildEditedPost(dayPosts[0],{title:'Draft',caption:'',date:'2026-11-04',destinations:dayPosts[0].destinations}).destinations[0].status,'Draft');

assert.equal(dayPosts.length,2);

assert.equal(dayPosts[0].time,'12:00');assert.equal(dayPosts[1].time,'18:00');

assert.equal(dayPosts[1].destinations.length,2);

assert.equal(dayPosts[1].destinations[1].time,'18:30');

assert.equal(dayPosts[1].media.length,6);

const canceled=removeScheduledPost('oct23-garden');

assert.equal(postsForDay('2026-10-23').length,1);

assert.equal(postsForDay('2026-10-23')[0].id,'oct23-notes');

assert.equal(canceled.media.length,6);assert.equal(canceled.destinations[1].time,'18:30');

assert.equal(removeScheduledPost('oct23-garden'),null);

const recovered=restoreCanceledPost(canceled);

assert.equal(postsForDay('2026-10-23').length,2);

assert.equal(recovered.date,'2026-10-23');assert.equal(recovered.destinations[0].status,'Scheduled');

assert.notEqual(recovered,canceled);assert.notEqual(recovered.destinations,canceled.destinations);

recovered.caption='A later edit';restoreCanceledPost(canceled);

assert.equal(scheduledPosts.get(canceled.id).caption,'A later edit');

const previous=structuredClone(recovered);scheduledPosts.set(previous.id,{...recovered,date:'2026-11-04',caption:'Edited after the move'});

const movedBack=restoreMovedPost(previous);assert.equal(movedBack.date,'2026-10-23');assert.equal(movedBack.caption,'Edited after the move');assert.equal(movedBack.destinations[1].time,'18:30');

assert.equal(restoreMovedPost({id:'missing',date:'2026-10-23'}),null);

assert.equal(postsForDay('2026-10-23').length,2);

assert.equal(postsForDay('2026-10-22').length,0);

assert.match(dayButton('2026-10-21',21,'today scheduled',false,false),/aria-current="date"/);

assert.match(dayButton('2026-10-23',23,'',false,false),/class=" scheduled inspected-day" aria-pressed="true"/);

assert.doesNotMatch(dayButton('2026-10-22',22,'',false,false),/scheduled|today|inspected-day/);

const item={work:works[0],key:'2026-11-02'};

registerScheduledPost(item,{target:'X'});registerScheduledPost(item,{target:'X'});

assert.equal(postsForDay('2026-11-02').length,1);

assert.match(dayButton('2026-11-02',2,'plan-date',true,false),/class="plan-date scheduled"/);

assert.equal(postsForDay('2026-11-02')[0].destinations[0].platform,'X');

clearPlannedPosts();assert.equal(postsForDay('2026-11-02').length,0);

assert.equal(postsForDay('2026-10-23').length,2);

`, { assert, structuredClone });

console.log('Compact modal: script syntax and selection/action self-checks passed.');

