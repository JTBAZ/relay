import type { Application, Request, Response } from "express";
import type { PrismaClient } from "@prisma/client";
import { errorEnvelope, successEnvelope } from "../contracts/api.js";
import { getDistributionPlanById } from "../distribution/post-distribution-service.js";
import { RhythmError } from "./contract.js";
import { rhythmBootstrap, saveRhythm, setRhythmStatus, saveDescription, confirmRhythm, reconcileRhythms, listRhythmRuns, rhythmAction, prepareRhythmPlan, retryRhythmAction } from "./service.js";
export const RHYTHMS_BASE='/api/v1/creator/posting-rhythms';
export function registerPostingRhythmRoutes(app:Application,options:{prisma:PrismaClient;traceId:(req:Request)=>string;authorize:(req:Request,res:Response,mutation:boolean)=>Promise<string|null>}){
  const db=options.prisma;
  const route=(method:'get'|'post'|'put'|'patch',path:string,handler:(creatorId:string,req:Request)=>Promise<unknown>)=>{
    app[method](RHYTHMS_BASE+path,async(req:Request,res:Response)=>{
      const trace=options.traceId(req);res.setHeader('Cache-Control','private, no-store');
      try{const creatorId=await options.authorize(req,res,method!=='get');if(!creatorId)return;
        const out=await handler(creatorId,req);return res.json(successEnvelope(out,trace));
      }catch(err){if(err instanceof RhythmError)return res.status(err.status).json(errorEnvelope(err.code,err.message,trace));
        return res.status(503).json(errorEnvelope('RHYTHM_UNAVAILABLE','Posting Rhythms is unavailable. Please try again.',trace));}
    });
  };
  const version=(req:Request)=>{if(!Number.isInteger(req.body?.version)||req.body.version<1)throw new RhythmError('Reload the current rhythm version.');return Number(req.body.version);};
  const id=(req:Request,key='id')=>{const value=String(req.params[key]||'');if(!value||value.length>160)throw new RhythmError('Invalid rhythm identifier.');return value;};
  route('get','/bootstrap',c=>rhythmBootstrap(db,c));
  route('get','/runs',async c=>({enrollments:await listRhythmRuns(db,c)}));
  route('post','',async(c,r)=>({rhythm:await saveRhythm(db,c,r.body?.config)}));
  route('put','/:id',async(c,r)=>({rhythm:await saveRhythm(db,c,r.body?.config,id(r),version(r))}));
  route('patch','/:id/status',async(c,r)=>({rhythm:await setRhythmStatus(db,c,id(r),version(r),r.body?.status)}));
  route('post','/drafts',async(c,r)=>({draft:await saveDescription(db,c,r.body?.name,r.body?.fields)}));
  route('post','/:id/confirm',async(c,r)=>{if(r.body?.postId!==null&&(typeof r.body?.postId!=='string'||r.body.postId.length>160))throw new RhythmError('Choose a source post.');const result=await confirmRhythm(db,c,id(r),version(r),r.body.postId);await reconcileRhythms(db,{creatorId:c});return {confirmed:result};});
  route('post','/reconcile',c=>reconcileRhythms(db,{creatorId:c}));
  route('get','/actions/:id',async(c,r)=>{const a=await rhythmAction(db,c,id(r),true);return {...a,plan:a.run.planId?await getDistributionPlanById(db,c,a.run.planId):null};});
  route('post','/actions/:id/retry',async(c,r)=>{await retryRhythmAction(db,c,id(r));return {ready:true};});
  route('post','/actions/:id/prepare',async(c,r)=>{const media=r.body?.previewMediaId;if(media!==undefined&&(typeof media!=='string'||media.length>160))throw new RhythmError('Invalid preview image.');return {plan:await prepareRhythmPlan(db,c,id(r),media)};});
}
