import {config} from 'dotenv';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
config({path:'.env',quiet:true});
const {prisma}=await import('../dist/src/lib/db.js');
const {loadPostNaming}=await import('../dist/src/gallery-editor/naming.js');
const creator='rcx_pilot_dev_ava',base='http://127.0.0.1:8788';
const ids=['green_1_main','green_1_teaser','green_1_closeup','green_2_main','green_2_teaser','green_2_closeup','blue_main','blue_teaser'].map(x=>'ce_demo_post_'+x);
let cookie='',token='',pendingUndo;
async function request(path,body){
  const response=await fetch(base+path,{method:body===undefined?'GET':'POST',signal:AbortSignal.timeout(95000),headers:{'Content-Type':'application/json',Origin:'http://localhost:3001',...(cookie?{Cookie:cookie}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(response.headers.getSetCookie().length)cookie=response.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
  const json=await response.json();
  if(!response.ok)throw new Error(`${path}: ${response.status} ${json.error?.code}`);
  return json.data;
}
try{
  for(let attempt=0;attempt<40;attempt++){
    try{await fetch(base+'/health',{signal:AbortSignal.timeout(1000)});break;}catch{if(attempt===39)throw new Error('Local API did not start within 40 seconds');await new Promise(resolve=>setTimeout(resolve,1000));}
  }
  const login=await request('/api/v1/auth/login',{email:'creator_dev_ava@pilot.relay.test',password:process.env.RELAY_PILOT_UX_DEV_PASSWORD||'pilot-ux-dev-only'});token=login.token||'';
  assert.equal((await request('/api/v1/gallery/editor/capabilities')).aiAvailable,true);
  const before=await loadPostNaming(prisma,creator,ids);
  assert.equal(before[ids[0]].effectiveTitle,'Green study — Part 1','Test flight requires the original demo state; it will not reset user edits.');
  const context={selectedPostIds:[ids[0]],loadedPostIds:ids};
  let session=await request('/api/v1/gallery/editor/sessions',{context});
  session=await request(`/api/v1/gallery/editor/sessions/${session.id}/turn`,{revision:session.revision,context,message:'Rename the work Green study — Part 1 throughout Relay to Meadow study. Keep custom post titles as exceptions.'});
  assert.equal(session.cart.actions.length,1);
  assert.equal(session.cart.actions[0].kind,'rename_work');
  assert.equal(session.cart.actions[0].workId,'ce_demo_work_green_1');
  assert.equal(session.cart.actions[0].title,'Meadow study');
  assert.deepEqual(await loadPostNaming(prisma,creator,ids),before);
  assert.ok(session.cart.items.some(x=>x.targetId===ids[2]&&x.exception),'Custom title exception must be visible in the preview.');
  const {receipt}=await request(`/api/v1/gallery/editor/sessions/${session.id}/apply`,{revision:session.revision,idempotencyKey:crypto.randomUUID()});
  pendingUndo=receipt.id;
  const after=await loadPostNaming(prisma,creator,ids);
  assert.equal(after[ids[0]].effectiveTitle,'Meadow study');
  assert.equal(after[ids[1]].effectiveTitle,'Meadow study');
  assert.equal(after[ids[1]].mode,'inherit_work');
  assert.equal(after[ids[2]].effectiveTitle,'A personal close-up');
  for(const id of ids.slice(3))assert.deepEqual(after[id],before[id]);
  assert.equal((await request(`/api/v1/gallery/editor/sessions/${session.id}`)).lastReceipt.id,receipt.id);
  await request(`/api/v1/gallery/editor/commits/${receipt.id}/undo`,{});pendingUndo=undefined;
  assert.deepEqual(await loadPostNaming(prisma,creator,ids),before);
  await writeFile('../../outputs/relay-demo-test-flight.json',JSON.stringify({checkedAt:new Date().toISOString(),model:process.env.LIBRARY_EDITOR_MODEL||'gpt-6-astra',authenticated:true,realProvider:true,demoPostCount:ids.length,previewDidNotWrite:true,wholeWorkScope:true,customExceptionVisible:true,sourceTeaserSwitchedToInheritance:true,part2AndBlueUnchanged:true,receiptSurvivesReload:true,undoRestoresTitlesModesAndRelationships:true,notice:receipt.notice,transport:'authenticated API; browser routing unavailable across sandbox'},null,2)+'\n');
  console.log('Demo test flight passed: preview, whole-work Apply, preserved exceptions, reload and Undo.');
}finally{if(pendingUndo)await request(`/api/v1/gallery/editor/commits/${pendingUndo}/undo`,{});await prisma.$disconnect();}
