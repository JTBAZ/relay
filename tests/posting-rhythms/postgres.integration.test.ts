import {buildCrossPostPackageFromAttempt} from "../../src/distribution/distribution-package.js";
import {expireStaleAutomationRuns} from "../../src/autopost/automation-reconcile-service.js";
// @vitest-environment node
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { seedPilotUxDevAccounts } from '../../src/pilot-ux/seed-pilot-ux-dev-accounts.js';
import { rhythmBootstrap, saveRhythm, confirmRhythm, reconcileRhythms, prepareRhythmPlan, listRhythmRuns, rhythmAction, retryRhythmAction, setRhythmStatus } from '../../src/posting-rhythms/service.js';
import { startDistributionHandoff, completeDistributionAttempt, getDistributionPlanById } from '../../src/distribution/post-distribution-service.js';
import type { RhythmConfig } from '../../src/posting-rhythms/contract.js';
const target=process.env.RHYTHM_TEST_DATABASE_URL;
const suite=target?describe:describe.skip;
suite('Posting Rhythms on isolated Postgres',()=>{
 let db:PrismaClient,creatorId:string,other:string,accountId:string,postId:string,config:RhythmConfig;
 beforeAll(async()=>{
  const u=new URL(target!);if(!['127.0.0.1','localhost'].includes(u.hostname)||!/^\/relay_rhythm_test_[a-f0-9]{16}$/.test(u.pathname))throw Error('Dedicated loopback proof database required');
  db=new PrismaClient({adapter:new PrismaPg({connectionString:target!})});
  const seeded=await seedPilotUxDevAccounts(db);creatorId=seeded.creators[0].relayCreatorId;other=seeded.creators[1].relayCreatorId;accountId=seeded.creators[0].accountId;
  const boot=await rhythmBootstrap(db,creatorId);postId=boot.posts[0].id;
  const r={id:'r1',schedule:'delay' as const,days:0,time:'same',anchor:'source',media:'original' as const,templateId:null,copy:'source' as const,description:null,descriptionName:'',coach:false,notes:'',destinations:['x','deviantart'] as ('x'|'deviantart')[]};
  config={name:'Database proof rhythm',source:boot.source!.id,timezone:'UTC',useDefault:false,alwaysOn:false,filters:{image:true,textOn:false,text:'',linkOn:false,link:''},accounts:{x:'artist',deviantart:'artist'},routes:[r,{...r,id:'r2',anchor:'r1',days:1},{...r,id:'r3',destinations:['x']}]};
 },120000);
 afterAll(async()=>{await db?.$disconnect();});
 it('saves without enrollment; isolates plans; advances only on matching publication evidence',async()=>{
  const saved=await saveRhythm(db,creatorId,config);expect(await db.creatorPostingRhythmEnrollment.count()).toBe(0);
  await confirmRhythm(db,creatorId,saved.id,saved.version,postId);
  await reconcileRhythms(db,{creatorId});
  const en=(await listRhythmRuns(db,creatorId))[0];expect(en.runs).toHaveLength(3);expect(en.runs.every(r=>r.status==='materialized')).toBe(true);
  const x=en.runs.find(r=>r.rhythmRouteId==='r1'&&r.rule.targetDestinations[0]==='x')!;
  const da=en.runs.find(r=>r.rhythmRouteId==='r1'&&r.rule.targetDestinations[0]==='deviantart')!;
  const legacy=await db.postDistributionPlan.create({data:{creatorId,postId,status:'active'}});
  const [xp,dp]=await Promise.all([prepareRhythmPlan(db,creatorId,x.id),prepareRhythmPlan(db,creatorId,da.id)]);
  expect((await db.postDistributionPlan.findUniqueOrThrow({where:{id:legacy.id}})).status).toBe('active');
  expect(xp!.variants[0].post_text).toBe((en.snapshot as {body:string}).body);
  expect(xp!.plan_id).not.toBe(dp!.plan_id);expect((await prepareRhythmPlan(db,creatorId,x.id))!.plan_id).toBe(xp!.plan_id);
  expect(await db.postDistributionPlan.count({where:{status:'active',id:{in:[xp!.plan_id,dp!.plan_id]}}})).toBe(2);
  expect(await getDistributionPlanById(db,other,xp!.plan_id)).toBeNull();await expect(rhythmAction(db,other,x.id)).rejects.toThrow();
  const attempt=await startDistributionHandoff(db,creatorId,xp!.variants[0].variant_id);
  const packet=await buildCrossPostPackageFromAttempt(db,accountId,attempt.attempt_id);expect(packet.status).toBe('ok');if(packet.status==='ok')expect((packet.package as {media:{media_id:string}[]}).media[0].media_id).toBe((en.snapshot as {mediaId:string}).mediaId);
  await reconcileRhythms(db,{creatorId});expect((await listRhythmRuns(db,creatorId))[0].runs).toHaveLength(3);
  await expect(completeDistributionAttempt(db,creatorId,attempt.attempt_id,{status:'posted',external_url:'https://x.com/wrong/status/123'})).rejects.toThrow(/account/);
  await completeDistributionAttempt(db,creatorId,attempt.attempt_id,{status:'posted',external_url:'https://x.com/artist/status/123'});
  await reconcileRhythms(db,{creatorId});await reconcileRhythms(db,{creatorId});
  const updated=(await listRhythmRuns(db,creatorId))[0],children=updated.runs.filter(r=>r.rhythmRouteId==='r2');
  expect(children).toHaveLength(1);expect(children[0].rule.targetDestinations).toEqual(['x']);
  const parent=updated.runs.find(r=>r.id===x.id)!;expect(+children[0].dueAt-+parent.receiptAt!).toBe(86400000);
  const edited=await saveRhythm(db,creatorId,{...config,name:'Changed later'},saved.id,saved.version);
  expect((await listRhythmRuns(db,creatorId))[0].snapshot).toMatchObject({config:{name:'Database proof rhythm'}});
  await expect(saveRhythm(db,creatorId,config,saved.id,saved.version)).rejects.toThrow(/another window/);
  expect(edited.version).toBe(2);
 },120000);
 it('drains Always on discovery idempotently while excluding old publications edited later',async()=>{
  const saved=await saveRhythm(db,creatorId,{...config,name:'Always on proof',alwaysOn:true,routes:[config.routes[0]]});
  const base=await db.post.findUniqueOrThrow({where:{id:postId}}),version=await db.postVersion.findFirstOrThrow({where:{postId},orderBy:{versionSeq:'desc'}});
  const now=new Date(Date.now()+1000),old=new Date(+saved.eligibleFrom-86400000);
  for(const [suffix,published]of [['new',now],['old',old]]as const){const id='rhythm_proof_'+suffix;await db.post.create({data:{id,creatorId,campaignId:base.campaignId,providerPostId:id,upstreamStatus:'active',createdAt:published,source:'PATREON',publishState:'published',isPublic:true}});await db.postVersion.create({data:{postId:id,versionSeq:1,upstreamRevision:'1',title:'Proof '+suffix,description:'New image',publishedAt:published,ingestedAt:now,mediaIds:version.mediaIds}});if(suffix==='old')await db.postVersion.create({data:{postId:id,versionSeq:2,upstreamRevision:'2',title:'Old edited later',description:'Edited',publishedAt:now,ingestedAt:now,mediaIds:version.mediaIds}});}
  await reconcileRhythms(db,{creatorId,now:new Date(+now+1000)});await reconcileRhythms(db,{creatorId,now:new Date(+now+1000)});
  const entries=await db.creatorPostingRhythmEnrollment.findMany({where:{rhythmId:saved.id}});expect(entries.map(e=>e.sourcePostId)).toEqual(['rhythm_proof_new']);
 },120000);
 it('renews unstarted reviews, holds paused descendants and resumes from preserved receipts',async()=>{
  const rhythm=await db.creatorPostingRhythm.findFirstOrThrow({where:{creatorId,name:'Changed later'}});
  const enrollment=(await listRhythmRuns(db,creatorId)).find(e=>e.rhythm.name==='Changed later')!;
  const da=enrollment.runs.find(r=>r.rhythmRouteId==='r1'&&r.rule.targetDestinations[0]==='deviantart')!;
  const oldPlan=da.planId!;
  await db.creatorDistributionRuleRun.update({where:{id:da.id},data:{expiresAt:new Date(Date.now()-1000)}});
  await expireStaleAutomationRuns(db,{creatorId});expect((await db.creatorDistributionRuleRun.findUniqueOrThrow({where:{id:da.id}})).status).toBe('materialized');
  await expect(prepareRhythmPlan(db,creatorId,da.id)).rejects.toThrow(/expired/);
  await retryRhythmAction(db,creatorId,da.id);
  const next=await prepareRhythmPlan(db,creatorId,da.id);expect(next!.plan_id).not.toBe(oldPlan);
  expect((await db.postDistributionPlan.findUniqueOrThrow({where:{id:oldPlan}})).status).toBe('archived');
  const attempt=await startDistributionHandoff(db,creatorId,next!.variants[0].variant_id);
  await expect(retryRhythmAction(db,creatorId,da.id)).rejects.toThrow(/existing publication/);
  const paused=await setRhythmStatus(db,creatorId,rhythm.id,rhythm.version,'paused');
  await completeDistributionAttempt(db,creatorId,attempt.attempt_id,{status:'posted',external_url:'https://www.deviantart.com/artist/art/Moon-123'});
  await reconcileRhythms(db,{creatorId});
  let current=(await listRhythmRuns(db,creatorId)).find(e=>e.id===enrollment.id)!;
  expect(current.runs.find(r=>r.id===da.id)!.receiptAt).not.toBeNull();
  expect(current.runs.filter(r=>r.rhythmRouteId==='r2'&&r.rule.targetDestinations[0]==='deviantart')).toHaveLength(0);
  await setRhythmStatus(db,creatorId,rhythm.id,paused.version,'active');await reconcileRhythms(db,{creatorId});
  current=(await listRhythmRuns(db,creatorId)).find(e=>e.id===enrollment.id)!;
  expect(current.runs.filter(r=>r.rhythmRouteId==='r2'&&r.rule.targetDestinations[0]==='deviantart')).toHaveLength(1);
 },120000);

 it('preserves the old configuration for delayed discovery and excludes paused publication windows',async()=>{
  const old=await saveRhythm(db,creatorId,{...config,name:'Before backlog edit',alwaysOn:true,routes:[config.routes[0]]});
  const published=new Date(+old.eligibleFrom+1);
  const changed=await saveRhythm(db,creatorId,{...config,name:'After backlog edit',alwaysOn:true,routes:[{...config.routes[0],days:5}]},old.id,old.version);
  const base=await db.post.findUniqueOrThrow({where:{id:postId}}),version=await db.postVersion.findFirstOrThrow({where:{postId},orderBy:{versionSeq:'desc'}});
  async function add(id:string,at:Date){await db.post.create({data:{id,creatorId,campaignId:base.campaignId,providerPostId:id,upstreamStatus:'active',createdAt:at,source:'PATREON',publishState:'published',isPublic:true}});await db.postVersion.create({data:{postId:id,versionSeq:1,upstreamRevision:'1',title:id,description:'New art',publishedAt:at,ingestedAt:new Date(),mediaIds:version.mediaIds}});}
  await add('rhythm_proof_backlog',published);await reconcileRhythms(db,{creatorId,now:new Date(Date.now()+1000)});
  const accepted=await db.creatorPostingRhythmEnrollment.findUniqueOrThrow({where:{rhythmId_sourcePostId:{rhythmId:old.id,sourcePostId:'rhythm_proof_backlog'}}});
  expect(accepted.snapshot).toMatchObject({version:1,config:{name:'Before backlog edit'}});
  const paused=await setRhythmStatus(db,creatorId,old.id,changed.version,'paused');
  const pauseWindow=await db.creatorPostingRhythmWindow.findFirstOrThrow({where:{rhythmId:old.id,eligibleTo:null}});
  await setRhythmStatus(db,creatorId,old.id,paused.version,'active');await add('rhythm_proof_during_pause',new Date(+pauseWindow.eligibleFrom+1));
  await reconcileRhythms(db,{creatorId,now:new Date(Date.now()+1000)});
  expect(await db.creatorPostingRhythmEnrollment.findUnique({where:{rhythmId_sourcePostId:{rhythmId:old.id,sourcePostId:'rhythm_proof_during_pause'}}})).toBeNull();
 },120000);

});
