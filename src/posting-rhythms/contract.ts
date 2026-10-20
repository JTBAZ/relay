/** Posting Rhythms configuration; publishing authority stays with distribution review. */
export type RhythmDestination = "x" | "deviantart";
export type DescriptionFields = { title: string; body: string; x: string; tags: string };
export type RhythmRoute = {
  id: string; schedule: "delay" | "first_current" | "last_current" | "first_next" | "last_next";
  days: number; time: string; anchor: string; media: "original" | "preview";
  templateId: string | null; copy: "source" | "saved" | "custom";
  description: DescriptionFields | null; descriptionName: string;
  coach: boolean; notes: string; destinations: RhythmDestination[];
};
export type RhythmConfig = {
  name: string; source: string; timezone: string; useDefault: boolean; alwaysOn: boolean;
  filters: { image: boolean; textOn: boolean; text: string; linkOn: boolean; link: string };
  accounts: Partial<Record<RhythmDestination, string>>; routes: RhythmRoute[];
};
export class RhythmError extends Error {
  constructor(message: string, public readonly status = 400, public readonly code = "RHYTHM_INVALID") { super(message); }
}
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const str = (x: unknown, max: number) => typeof x === "string" && x.length <= max;
export function parseDescription(x: unknown): DescriptionFields {
  if (!record(x) || !["title", "body", "x", "tags"].every(k => str(x[k], 5000))) throw new RhythmError("Add valid description fields (up to 5,000 characters each).");
  return { title: x.title as string, body: x.body as string, x: x.x as string, tags: x.tags as string };
}
export function parseRhythmConfig(raw: unknown): RhythmConfig {
  if (!record(raw) || JSON.stringify(raw).length > 100_000) throw new RhythmError("This rhythm is too large.");
  if (!str(raw.name,80) || !(raw.name as string).trim()) throw new RhythmError("Name this rhythm.");
  if (!str(raw.source,160) || !raw.source) throw new RhythmError("Choose a connected Patreon account.");
  if (!str(raw.timezone,100)) throw new RhythmError("Choose a timezone.");
  try { new Intl.DateTimeFormat("en",{timeZone:raw.timezone as string}); } catch { throw new RhythmError("Choose a valid timezone."); }
  if (typeof raw.useDefault !== "boolean" || typeof raw.alwaysOn !== "boolean" || !record(raw.filters) || !record(raw.accounts)) throw new RhythmError("Invalid rhythm settings.");
  const f=raw.filters;
  if (!["image","textOn","linkOn"].every(k=>typeof f[k]==="boolean") || !str(f.text,200) || !str(f.link,500) || (f.textOn && !(f.text as string).trim())) throw new RhythmError("Complete the selected filters.");
  if (f.linkOn) checkedLink(f.link as string);
  const accounts: RhythmConfig["accounts"]={};
  for (const d of ["x","deviantart"] as const) if (raw.accounts[d] !== undefined) {
    if (!str(raw.accounts[d],80) || !/^[A-Za-z0-9_-]{1,80}$/.test((raw.accounts[d] as string).replace(/^@/,""))) throw new RhythmError("Enter a valid destination account handle.");
    accounts[d]=(raw.accounts[d] as string).replace(/^@/,"");
  }
  if (!Array.isArray(raw.routes) || raw.routes.length<1 || raw.routes.length>16) throw new RhythmError("Add between 1 and 16 releases.");
  const earlier=new Map<string,RhythmRoute>();
  const routes=raw.routes.map((v:unknown):RhythmRoute=>{
    if (!record(v) || !str(v.id,80) || !/^[a-zA-Z0-9_-]+$/.test(v.id as string) || earlier.has(v.id as string)) throw new RhythmError("Release IDs must be unique.");
    if (!["delay","first_current","last_current","first_next","last_next"].includes(String(v.schedule)) || !Number.isInteger(v.days) || Number(v.days)<0 || Number(v.days)>365 || !(v.time==="same" || typeof v.time==="string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v.time))) throw new RhythmError("Choose a valid release date and time.");
    if (v.anchor!=="source" && !earlier.has(String(v.anchor))) throw new RhythmError("A release can only follow the source or an earlier release.");
    if (!["original","preview"].includes(String(v.media)) || !["source","saved","custom"].includes(String(v.copy)) || typeof v.coach!=="boolean" || !str(v.notes,2000) || !str(v.descriptionName,80)) throw new RhythmError("Invalid release treatment.");
    if (v.templateId!==null && (!str(v.templateId,160) || !v.templateId) || v.media==="preview" && !v.templateId) throw new RhythmError("Choose a saved preview type.");
    if (!Array.isArray(v.destinations) || !v.destinations.length || v.destinations.length>2 || new Set(v.destinations).size!==v.destinations.length || v.destinations.some(d=> !["x","deviantart"].includes(d) || !accounts[d as RhythmDestination])) throw new RhythmError("Connect an account for each destination.");
    if (v.anchor!=="source" && v.destinations.some(d=>!earlier.get(String(v.anchor))!.destinations.includes(d))) throw new RhythmError("A dependent release must use an account selected on its predecessor.");
    const description=v.copy==="source"?null:parseDescription(v.description);
    if (description && (v.destinations.includes("x") && (!description.x.trim() || description.x.length>280) || v.destinations.includes("deviantart") && (!description.title.trim() || !description.body.trim()))) throw new RhythmError("Complete the description for each destination. X allows 280 characters.");
    const route={id:v.id,schedule:v.schedule,days:v.days,time:v.time,anchor:v.anchor,media:v.media,templateId:v.templateId,copy:v.copy,description,descriptionName:v.descriptionName,coach:v.coach,notes:v.notes,destinations:v.destinations} as RhythmRoute;
    earlier.set(route.id,route);return route;
  });
  return {name:(raw.name as string).trim(),source:raw.source as string,timezone:raw.timezone as string,useDefault:raw.useDefault,alwaysOn:raw.alwaysOn,filters:{image:f.image as boolean,textOn:f.textOn as boolean,text:f.text as string,linkOn:f.linkOn as boolean,link:f.link as string},accounts,routes};
}
function checkedLink(value:string):URL {
  let u:URL;try {u=new URL(value);}catch{throw new RhythmError("Enter a complete https:// link filter.");}
  if (!['https:','http:'].includes(u.protocol) || u.username || u.password) throw new RhythmError("Use an HTTP or HTTPS link without credentials.");
  return u;
}
export function matchesRhythm(config:RhythmConfig,source:{text:string;images:number;links?:string[]}):boolean {
  const f=config.filters;
  if (f.image && source.images<1 || f.textOn && !source.text.toLowerCase().includes(f.text.toLowerCase())) return false;
  if (!f.linkOn) return true;
  const target=checkedLink(f.link),prefix=target.pathname.replace(/\/$/,"");
  return [...(source.links??[]),...(source.text.match(/https?:\/\/[^\s<>"']+/g)??[])].some(raw=>{try{const u=new URL(raw.replace(/[),.;!?]+$/,""));return u.hostname.toLowerCase()===target.hostname.toLowerCase() && u.port===target.port && (u.pathname===prefix || u.pathname.startsWith(prefix+"/"));}catch{return false;}});
}
export function validRhythmReceipt(destination:string,raw:string,handle:string):boolean {
  try { const u=new URL(raw),h=u.hostname.toLowerCase();if(u.protocol!=="https:" || u.username || u.password)return false;
    if(destination==="x")return ['x.com','www.x.com','twitter.com','www.twitter.com'].includes(h) && new RegExp('^/'+handle+'/status/[0-9]+/?$','i').test(u.pathname);
    return ['deviantart.com','www.deviantart.com'].includes(h) && u.pathname.toLowerCase().startsWith('/'+handle.toLowerCase()+'/art/') && u.pathname.split('/').at(-1)!.length>0;
  }catch{return false;}
}
/** Elapsed days by default. An explicit clock opts into local calendar dates. */
export function rhythmDueAt(anchor:Date,route:RhythmRoute,zone:string):Date {
  if(route.schedule==='delay'&&route.time==='same')return new Date(+anchor+route.days*86400000);
  const fmt=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'numeric',hourCycle:'h23'});
  const parts=(ms:number)=>Object.fromEntries(fmt.formatToParts(new Date(ms)).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
  const p=parts(+anchor),d=new Date(Date.UTC(p.year,p.month-1,p.day));
  if(route.schedule==='delay')d.setUTCDate(d.getUTCDate()+route.days);
  else {const next=route.schedule.endsWith('next')?1:0;d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+next);if(route.schedule.startsWith('last'))d.setUTCMonth(d.getUTCMonth()+1,0);}
  const [hour,minute]=route.time==='same'?[p.hour,p.minute]:route.time.split(':').map(Number);
  const target=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate(),hour,minute),offsets=new Set<number>();
  for(let h=-36;h<=36;h+=6){const ms=target+h*3600000,q=parts(ms);offsets.add(Date.UTC(q.year,q.month-1,q.day,q.hour,q.minute)-ms);}
  const candidates=[...offsets].map(offset=>target-offset).sort((a,b)=>a-b);
  let instant=candidates.find(ms=>{const q=parts(ms);return Date.UTC(q.year,q.month-1,q.day,q.hour,q.minute)===target;});
  // A gap moves forward by its offset transition, retaining the minute within it.
  if(instant===undefined)instant=candidates.filter(ms=>{const q=parts(ms);return Date.UTC(q.year,q.month-1,q.day,q.hour,q.minute)>target;}).sort((a,b)=>a-b)[0];
  if(instant===undefined || route.schedule!=='delay' && instant<+anchor)throw new RhythmError('This month boundary is before its reference publication. Choose a later release date.');
  return new Date(route.schedule==='delay'?Math.max(+anchor,instant):instant);
}
