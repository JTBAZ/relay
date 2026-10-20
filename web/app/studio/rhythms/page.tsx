"use client";
import { Suspense, useEffect, useState } from "react";
import { StudioRouteGuard } from "@/app/components/studio/StudioRouteGuard";
import { StudioPlanGate } from "@/app/components/studio/StudioPlanGate";
import { fetchCreatorPlanAccess, type CreatorPlanAccessWire } from "@/lib/relay-api";
import { PostingRhythms } from "./PostingRhythms";
function RhythmAccess(){
  const [access,setAccess]=useState<CreatorPlanAccessWire|null>(null),[error,setError]=useState('');
  useEffect(()=>{let active=true;void fetchCreatorPlanAccess().then(a=>active&&setAccess(a)).catch(e=>active&&setError(e.message));return()=>{active=false;};},[]);
  if(error)return <p role="alert" className="p-6 text-red-300">{error}</p>;
  if(!access)return <p role="status" className="p-6">Loading Posting Rhythms…</p>;
  if(!access.capabilities.autopost.allowed)return <StudioPlanGate capability={access.capabilities.autopost} feature="autopost" featureName="Posting Rhythms" featureBenefit="Route and schedule creator-reviewed releases."/>;
  return <PostingRhythms/>;
}
export default function PostingRhythmsPage(){return <StudioRouteGuard><Suspense fallback={<p className="p-6">Loading…</p>}><RhythmAccess/></Suspense></StudioRouteGuard>;}
