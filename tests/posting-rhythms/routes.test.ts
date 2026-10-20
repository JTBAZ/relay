import express from 'express';
import request from 'supertest';
import {describe,it,expect,vi} from 'vitest';
import {registerPostingRhythmRoutes,RHYTHMS_BASE} from '../../src/posting-rhythms/routes.js';
import * as service from '../../src/posting-rhythms/service.js';
import type {PrismaClient} from '@prisma/client';
vi.mock('../../src/posting-rhythms/service.js',()=>({rhythmBootstrap:vi.fn(async creatorId=>({creatorId})),saveRhythm:vi.fn(async()=>({id:'saved'})),setRhythmStatus:vi.fn(),saveDescription:vi.fn(),confirmRhythm:vi.fn(),reconcileRhythms:vi.fn(),listRhythmRuns:vi.fn(async()=>[]),rhythmAction:vi.fn(),prepareRhythmPlan:vi.fn()}));
function app(){const a=express();a.use(express.json());registerPostingRhythmRoutes(a,{prisma:{}as PrismaClient,traceId:()=> 'trace',authorize:async(req,res)=>{if(req.headers.authorization!=='Bearer owner'){res.sendStatus(401);return null;}return 'creator_owner';}});return a;}
describe('Posting Rhythms HTTP boundary',()=>{
 it('rejects an unauthenticated request before accessing creator data',async()=>{expect((await request(app()).get(RHYTHMS_BASE+'/bootstrap')).status).toBe(401);});
 it('keeps GET side-effect-free and derives mutation ownership from the session',async()=>{const a=app();await request(a).get(RHYTHMS_BASE+'/runs').set('Authorization','Bearer owner').expect(200);expect(service.reconcileRhythms).not.toHaveBeenCalled();const payload={creatorId:'victim',config:{name:'Request'}};await request(a).post(RHYTHMS_BASE).set('Authorization','Bearer owner').send(payload).expect(200);expect(service.saveRhythm).toHaveBeenCalledWith({},'creator_owner',payload.config);});
 it('requires an optimistic version before changing a saved rhythm',async()=>{await request(app()).put(RHYTHMS_BASE+'/saved').set('Authorization','Bearer owner').send({config:{}}).expect(400);});
});
