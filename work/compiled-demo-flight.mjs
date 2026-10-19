import {config} from 'dotenv';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
config({quiet:true});
const database=new URL(process.env.DATABASE_URL);
if(!['127.0.0.1','localhost'].includes(database.hostname)||database.pathname!=='/relay_dev')throw Error('Expected local demo database');
Object.assign(process.env,{NODE_ENV:'development',LIBRARY_EDITOR_ARCHITECTURE:'compiled',LIBRARY_EDITOR_INTERPRETER_MODEL:'gpt-6-sol',RELAY_GALLERY_EDITOR_AI_ENABLED:'1',RELAY_SPLIT_WORKER_PROCESS:'1'});
const {prisma}=await import('../dist/src/lib/db.js');
const {createApp}=await import('../dist/src/server.js');
const {relayServerConfigFromEnv}=await import('../dist/src/relay-server-env.js');
const {loadPostNaming}=await import('../dist/src/gallery-editor/naming.js');
const {resolveLibraryPosts}=await import('../dist/src/gallery-editor/context.js');
const {app}=createApp({...relayServerConfigFromEnv(),prisma});
const server=app.listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${server.address().port}`,creator='rcx_pilot_dev_ava';
const ids=['green_1_main','green_1_teaser','green_1_closeup','green_2_main','green_2_teaser','green_2_closeup','blue_main','blue_teaser'].map(x=>'ce_demo_post_'+x);
let cookie='',token='',pendingUndo;
const report={checkedAt:new Date().toISOString(),architecture:'compiled',model:'gpt-6-sol',authenticated:true,realProvider:true,transport:'isolated local authenticated API; default pilot process unchanged',guided:false,openEnded:false};
async function request(path,body,method=body===undefined?'GET':'POST'){
 const response=await fetch(base+path,{method,signal:AbortSignal.timeout(95000),headers:{'Content-Type':'application/json',Origin:'http://localhost:3001',...(cookie?{Cookie:cookie}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 if(response.headers.getSetCookie().length)cookie=response.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
 const json=await response.json();if(!response.ok)throw Object.assign(new Error('Demo request failed'),{code:json.error?.code??'demo_request',status:response.status});return json.data;
}
async function snapshot(){return {naming:await loadPostNaming(prisma,creator,ids),posts:(await resolveLibraryPosts(prisma,creator,ids)).resolvedPosts};}
try{
 const login=await request('/api/v1/auth/login',{email:'creator_dev_ava@pilot.relay.test',password:process.env.RELAY_PILOT_UX_DEV_PASSWORD||'pilot-ux-dev-only'});token=login.token||'';
 const before=await snapshot();assert.equal(before.posts.length,8,'Existing demo fixtures required; no reseeding');
 const context={selectedPostIds:[ids[0]],loadedPostIds:ids};
 let session=await request('/api/v1/gallery/editor/sessions',{context});
 session=await request(`/api/v1/gallery/editor/sessions/${session.id}/turn`,{revision:session.revision,context,message:'Rename this whole work to Meadow study for this test. Keep every custom post title as an exception.'});
 assert.equal(session.cart.actions.length,1);assert.equal(session.cart.actions[0].kind,'rename_work');assert.equal(session.cart.actions[0].workId,'ce_demo_work_green_1');assert.equal(session.cart.actions[0].title,'Meadow study');
 assert.deepEqual(await snapshot(),before);
 const applied=await request(`/api/v1/gallery/editor/sessions/${session.id}/apply`,{revision:session.revision,idempotencyKey:crypto.randomUUID()});pendingUndo=applied.receipt.id;
 const after=await snapshot();assert.equal(after.naming[ids[0]].effectiveTitle,'Meadow study');assert.equal(after.naming[ids[1]].mode,'inherit_work');assert.equal(after.naming[ids[2]].effectiveTitle,before.naming[ids[2]].effectiveTitle);
 for(const id of ids.slice(3))assert.deepEqual(after.naming[id],before.naming[id]);
 assert.equal((await request(`/api/v1/gallery/editor/sessions/${session.id}`)).lastReceipt.id,pendingUndo);
 await request(`/api/v1/gallery/editor/commits/${pendingUndo}/undo`,{});pendingUndo=undefined;assert.deepEqual(await snapshot(),before);report.guided=true;
 session=await request('/api/v1/gallery/editor/sessions',{context});
 session=await request(`/api/v1/gallery/editor/sessions/${session.id}/turn`,{revision:session.revision,context,message:"I'm organising this selected post for an evening viewing. Add the tag evening-notes to the post and leave its title alone."});
 assert.ok(session.cart.actions.length);assert.ok(session.cart.actions.every(a=>a.kind==='tags'&&a.postId===ids[0]&&!a.mediaId&&a.add.includes('evening-notes')&&a.remove.length===0));
 const existing=structuredClone(session.cart.actions),manual={id:crypto.randomUUID(),kind:'rename_post',postId:ids[0],title:'Manual test title'};
 session=await request(`/api/v1/gallery/editor/sessions/${session.id}`,{revision:session.revision,actions:[...existing,manual],context},'PATCH');
 session=await request(`/api/v1/gallery/editor/sessions/${session.id}/turn`,{revision:session.revision,context,message:'Also add soft-light to this post. Keep the title I just set manually and the evening-notes tag.'});
 assert.deepEqual(session.cart.actions.find(a=>a.id===manual.id),manual);assert.equal(session.cart.actionOrigins[manual.id],'manual');
 assert.ok(session.cart.actions.some(a=>a.kind==='tags'&&a.postId===ids[0]&&!a.mediaId&&a.add.includes('soft-light')));
 assert.ok(session.cart.actions.some(a=>a.kind==='tags'&&a.add.includes('evening-notes')));assert.deepEqual(await snapshot(),before);
 const second=await request(`/api/v1/gallery/editor/sessions/${session.id}/apply`,{revision:session.revision,idempotencyKey:crypto.randomUUID()});pendingUndo=second.receipt.id;
 const final=await snapshot();assert.equal(final.naming[ids[0]].effectiveTitle,'Manual test title');assert.ok(final.posts.find(p=>p.postId===ids[0]).tags.includes('soft-light'));
 await request(`/api/v1/gallery/editor/commits/${pendingUndo}/undo`,{});pendingUndo=undefined;assert.deepEqual(await snapshot(),before);report.openEnded=true;report.originalDemoStateRestored=true;
}catch(error){report.errorCode=error.code??'assertion_failed';report.failureMessage=error.code?'Demo request failed.':String(error.message).slice(0,500);process.exitCode=1;}
finally{
 if(pendingUndo){try{await request(`/api/v1/gallery/editor/commits/${pendingUndo}/undo`,{});report.cleanupUndo=true;}catch{report.cleanupUndo=false;}}
 await writeFile('work/compiled-demo-flight.json',JSON.stringify(report,null,2)+'\n');
 await new Promise(resolve=>server.close(resolve));await prisma.$disconnect();console.log(JSON.stringify(report));
}
