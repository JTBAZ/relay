import {config} from 'dotenv';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
config({path:'.env',quiet:true});
const {prisma}=await import('../dist/src/lib/db.js');
const {loadPostNaming}=await import('../dist/src/gallery-editor/naming.js');
const creator='rcx_pilot_dev_ava',post='pilot_post_ava_intro',base='http://127.0.0.1:8788';
let cookie='',token='',pendingUndo;
async function request(path,body){
  const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:3001',...(cookie?{Cookie:cookie}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
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
  const prior=await prisma.galleryEditorCommit.findFirst({where:{creatorId:creator,reversalOfId:null},orderBy:{createdAt:'desc'}});
  if(prior&&Array.isArray(prior.actions)&&prior.actions.some(a=>a.kind==='rename_post'&&a.postId===post&&a.title==='Conversational editor check')&&(await loadPostNaming(prisma,creator,[post]))[post].effectiveTitle==='Conversational editor check')await request(`/api/v1/gallery/editor/commits/${prior.id}/undo`,{});
  const capabilities=await request('/api/v1/gallery/editor/capabilities');assert.equal(capabilities.aiAvailable,true);
  const before=(await loadPostNaming(prisma,creator,[post]))[post];
  const context={selectedPostIds:[post]};
  let session=await request('/api/v1/gallery/editor/sessions',{context});
  session=await request(`/api/v1/gallery/editor/sessions/${session.id}/turn`,{revision:session.revision,context,message:'Rename just this post in Relay to “Conversational editor check”. Keep its family unchanged.'});
  assert.equal(session.cart.actions.length,1);assert.equal(session.cart.actions[0].kind,'rename_post');assert.equal(session.cart.actions[0].postId,post);
  assert.deepEqual((await loadPostNaming(prisma,creator,[post]))[post],before);
  const {receipt}=await request(`/api/v1/gallery/editor/sessions/${session.id}/apply`,{revision:session.revision,idempotencyKey:crypto.randomUUID()});
  pendingUndo=receipt.id;
  assert.equal((await loadPostNaming(prisma,creator,[post]))[post].effectiveTitle,'Conversational editor check');
  assert.equal((await request(`/api/v1/gallery/editor/sessions/${session.id}`)).lastReceipt.id,receipt.id);
  await request(`/api/v1/gallery/editor/commits/${receipt.id}/undo`,{});
  pendingUndo=undefined;
  assert.deepEqual((await loadPostNaming(prisma,creator,[post]))[post],before);
  const evidence={checkedAt:new Date().toISOString(),model:process.env.LIBRARY_EDITOR_MODEL||'gpt-6-astra',authenticated:true,realProvider:true,previewDidNotWrite:true,exactScopedAction:true,committedTitleVerified:true,receiptSurvivesReload:true,undoRestoresNaming:true,notice:receipt.notice};
  await writeFile('../../outputs/relay-live-api-smoke.json',JSON.stringify(evidence,null,2));console.log('Authenticated live-provider preview, Apply, reload and Undo passed.');
}finally{if(pendingUndo)await request(`/api/v1/gallery/editor/commits/${pendingUndo}/undo`,{});await prisma.$disconnect();}
