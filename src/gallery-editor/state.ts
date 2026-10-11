import { createHash, randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { sanitizeOptionalPostDescriptionHtml } from "../security/sanitize-post-html.js";
import { EditorError, RENAME_NOTICE, type ChangeCart, type EditAction } from "./types.js";

export type EditorDb = PrismaClient | Prisma.TransactionClient;
export type Row = Record<string, unknown>;
export type Table = "posts" | "versions" | "presentations" | "overrides" | "works" | "workMembers" | "series" | "seriesMembers" | "collections" | "collectionPosts";
export type EditorState = { scope: { posts: string[]; works: string[]; series: string[]; collections: string[] }; tables: Record<Table, Row[]> };
export const TABLES: Table[] = ["posts", "versions", "presentations", "overrides", "works", "workMembers", "series", "seriesMembers", "collections", "collectionPosts"];
export const s = (row: Row | undefined, key: string) => typeof row?.[key] === "string" ? row[key] as string : "";
export const list = (row: Row | undefined, key: string) => Array.isArray(row?.[key]) ? row[key] as string[] : [];
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => [k, canonical(v)]));
  return value;
}
export const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
export function rowKey(table: Table, row: Row): string {
  if (table === "collectionPosts") return `${s(row,"collectionId")}:${s(row,"postId")}`;
  if (table === "versions") return s(row,"postId");
  return s(row,"id");
}
export function dependencies(state: EditorState): Record<string,string> {
  return Object.fromEntries(TABLES.map(table => [table, fingerprint([...state.tables[table]].sort((a,b) => rowKey(table,a).localeCompare(rowKey(table,b))))]));
}
function sorted(ids: Set<string>) { return [...ids].sort(); }
function required<T>(value: T | undefined, message: string): T { if (!value) throw new EditorError("INVALID_TARGET", message, 404); return value; }
function title(value: string): string { const t = value.trim(); if (!t || t.length > 500) throw new EditorError("INVALID_TITLE", "Titles must contain 1–500 characters."); return t; }
function get(state: EditorState, table: Table, id: string): Row { return required(state.tables[table].find(r => s(r,"id") === id), `${table} target is unavailable.`); }

/** Capture the entire dependency closure of touched families, not merely the loaded UI page. */
export async function loadEditorState(db: EditorDb, creatorId: string, actions: EditAction[], allowCreatedExisting=false, previousScope?:EditorState["scope"]): Promise<EditorState> {
  const postIds = new Set<string>(), workIds = new Set<string>(), seriesIds = new Set<string>(), collectionIds = new Set<string>();
  const createdSeries = new Set(actions.filter(a => a.kind === "create_series").map(a => a.seriesId));
  const createdCollections = new Set(actions.filter(a => a.kind === "create_collection").map(a => a.collectionId));
  for (const action of actions) {
    if ("postId" in action) postIds.add(action.postId);
    if ("postIds" in action) action.postIds.forEach(id => postIds.add(id));
    if ("workId" in action) workIds.add(action.workId);
    if ("seriesId" in action) seriesIds.add(action.seriesId);
    if ("collectionId" in action) collectionIds.add(action.collectionId);
  }
  const directPosts = new Set(postIds), directWorks = new Set(workIds);
  const directSeries = new Set(seriesIds), directCollections = new Set(collectionIds);
  previousScope?.posts.forEach(id=>postIds.add(id));previousScope?.works.forEach(id=>workIds.add(id));previousScope?.series.forEach(id=>seriesIds.add(id));previousScope?.collections.forEach(id=>collectionIds.add(id));
  // Expand in both directions until all inherited descendants and parents are known.
  for (let round = 0; round < 4; round++) {
    const members = await db.creativeWorkMember.findMany({ where: { creatorId, OR: [{ postId: { in: sorted(postIds) } }, { creativeWorkId: { in: sorted(workIds) } }] } });
    members.forEach(r => { postIds.add(r.postId); workIds.add(r.creativeWorkId); });
    const seriesMembers = await db.creativeSeriesMember.findMany({ where: { creatorId, OR: [{ creativeWorkId: { in: sorted(workIds) } }, { creativeSeriesId: { in: sorted(seriesIds) } }] } });
    seriesMembers.forEach(r => { workIds.add(r.creativeWorkId); seriesIds.add(r.creativeSeriesId); });
  }
  const [posts, works, series, collections] = await Promise.all([
    db.post.findMany({ where: { creatorId, id: { in: sorted(postIds) } }, select: { id:true, creatorId:true, upstreamStatus:true, source:true, publishState:true } }),
    db.creativeWork.findMany({ where: { creatorId, id: { in: sorted(workIds) } } }),
    db.creativeSeries.findMany({ where: { creatorId, id: { in: sorted(seriesIds) } } }),
    db.libraryCollection.findMany({ where: { creatorId, id: { in: sorted(collectionIds) } } })
  ]);
  for (const id of directPosts) required(posts.find(r=>r.id===id), "Post not found for this creator.");
  for (const id of directWorks) required(works.find(r=>r.id===id), "Work not found for this creator.");
  for (const id of directSeries) {
    if (createdSeries.has(id)) { const row=await db.creativeSeries.findUnique({where:{id}});if(row&&(!allowCreatedExisting||row.creatorId!==creatorId)) throw new EditorError("ID_CONFLICT","Series ID already exists.",409); }
    else required(series.find(r=>r.id===id), "Series not found for this creator.");
  }
  for (const id of directCollections) {
    if (createdCollections.has(id)) { const row=await db.libraryCollection.findUnique({where:{id}});if(row&&(!allowCreatedExisting||row.creatorId!==creatorId)) throw new EditorError("ID_CONFLICT","Collection ID already exists.",409); }
    else required(collections.find(r=>r.id===id), "Collection not found for this creator.");
  }
  const [versions, presentations, overrides, workMembers, seriesMembers, collectionPosts] = await Promise.all([
    db.postVersion.findMany({ where: {postId:{in:posts.map(r=>r.id)}}, orderBy:[{postId:"asc"},{versionSeq:"desc"}], distinct:["postId"] }),
    db.postPresentation.findMany({where:{creatorId,postId:{in:posts.map(r=>r.id)}}}),
    db.postOverride.findMany({where:{creatorId,postId:{in:posts.map(r=>r.id)}}}),
    db.creativeWorkMember.findMany({where:{creatorId,creativeWorkId:{in:works.map(r=>r.id)}}}),
    db.creativeSeriesMember.findMany({where:{creatorId,creativeWorkId:{in:works.map(r=>r.id)}}}),
    db.collectionPost.findMany({where:{collectionId:{in:collections.map(r=>r.id)}}})
  ]);
  for (const action of actions) {
    const ids = action.kind === "reorder_media" ? action.mediaIds : action.kind === "tags" && action.mediaId ? [action.mediaId] : [];
    if (ids.length) {
      const assets = await db.mediaAsset.findMany({where:{creatorId,id:{in:ids}}});
      if (new Set(ids).size !== ids.length || assets.length !== ids.length || assets.some(a=> !(("postId" in action) && (a.primaryPostId===action.postId || a.postIds.includes(action.postId))))) throw new EditorError("INVALID_MEDIA","Media must belong to this creator and post.");
    }
  }
  return clone({scope:{posts:sorted(postIds),works:sorted(workIds),series:sorted(seriesIds),collections:sorted(collectionIds)},tables:{posts, versions,presentations,overrides,works,workMembers,series,seriesMembers,collections,collectionPosts}});
}
export function effectiveWorkTitle(state: EditorState, workId: string): string {
  const work = get(state,"works",workId);
  if (s(work,"titleMode") === "inherit_series") {
    const member = required(state.tables.seriesMembers.find(r=>s(r,"creativeWorkId")===workId),"Series-inheriting work has no membership.");
    return `${s(get(state,"series",s(member,"creativeSeriesId")),"title")} — ${s(member,"partLabel")}`;
  }
  return s(work,"title");
}
export function effectivePostTitle(state: EditorState, postId: string): string {
  const p = state.tables.presentations.find(r=>s(r,"postId")===postId);
  const mode = s(p,"titleMode") || (s(p,"relayTitle").trim() ? "custom" : "source");
  if (mode === "custom") return s(p,"relayTitle");
  if (mode === "inherit_work") {
    const m = required(state.tables.workMembers.find(r=>s(r,"postId")===postId),"Post has no family to inherit.");
    return effectiveWorkTitle(state,s(m,"creativeWorkId"));
  }
  return s(state.tables.versions.find(r=>s(r,"postId")===postId),"title");
}
function presentation(state: EditorState, creatorId: string, postId: string): Row {
  let row = state.tables.presentations.find(r=>s(r,"postId")===postId);
  if (!row) { row={id:randomUUID(),creatorId,postId,titleMode:"source",relayTitle:null,relayDescription:null,mediaOrder:[],tierPreviewSettings:null,promoPreviewMediaId:null}; state.tables.presentations.push(row); }
  return row;
}
function setPostMode(state: EditorState, creatorId: string, postId: string, mode: string, customTitle?: string) {
  const p = presentation(state,creatorId,postId); p.titleMode=mode; p.relayTitle=mode==="custom" ? title(customTitle ?? "") : null;
  if (mode === "inherit_work") required(state.tables.workMembers.find(r=>s(r,"postId")===postId),"Link this post to a work before inheriting its title.");
}
/** Simulate entirely in memory. No proposal route writes artist metadata. */
export function simulateEditorActions(before: EditorState, creatorId: string, actions: EditAction[]): EditorState {
  const state = clone(before);
  if (actions.length > 100 || new Set(actions.map(a=>a.id)).size !== actions.length) throw new EditorError("INVALID_ACTIONS","Use at most 100 distinct actions.");
  for (const action of actions) {
    switch(action.kind) {
      case "rename_post": setPostMode(state,creatorId,action.postId,"custom",action.title); break;
      case "inherit_post_title": setPostMode(state,creatorId,action.postId,"inherit_work"); break;
      case "source_post_title": setPostMode(state,creatorId,action.postId,"source"); break;
      case "rename_work": {
        const work=get(state,"works",action.workId); work.title=title(action.title); work.titleMode="independent";
        for(const m of state.tables.workMembers.filter(r=>s(r,"creativeWorkId")===action.workId)) {
          const p=state.tables.presentations.find(r=>s(r,"postId")===s(m,"postId"));
          const mode=s(p,"titleMode") || (s(p,"relayTitle").trim()?"custom":"source");
          if(mode==="source") setPostMode(state,creatorId,s(m,"postId"),"inherit_work");
        } break;
      }
      case "rename_series": get(state,"series",action.seriesId).title=title(action.title); break;
      case "set_description": presentation(state,creatorId,action.postId).relayDescription=action.description===null?null:action.description===""?"":sanitizeOptionalPostDescriptionHtml(action.description)??""; break;
      case "reorder_media": {
        const attached=list(state.tables.versions.find(r=>s(r,"postId")===action.postId),"mediaIds");
        if(action.mediaIds.length!==attached.length || attached.some(id=>!action.mediaIds.includes(id))) throw new EditorError("INVALID_ORDER","Media ordering must include every current attachment exactly once.");
        presentation(state,creatorId,action.postId).mediaOrder=[...action.mediaIds]; break;
      }
      case "tags": {
        const mediaId=action.mediaId??"";
        let row=state.tables.overrides.find(r=>s(r,"postId")===action.postId && s(r,"mediaId")===mediaId);
        if(!row){row={id:randomUUID(),creatorId,postId:action.postId,mediaId,addTagIds:[],removeTagIds:[],visibility:null,discoveryEligible:false};state.tables.overrides.push(row);}
        const add=new Set(list(row,"addTagIds")),remove=new Set(list(row,"removeTagIds"));
        for(const id of action.add){if(!id.trim()||id.length>200)throw new EditorError("INVALID_TAG","Invalid tag.");add.add(id);remove.delete(id);}
        for(const id of action.remove){if(!id.trim()||id.length>200)throw new EditorError("INVALID_TAG","Invalid tag.");remove.add(id);add.delete(id);}
        row.addTagIds=[...add];row.removeTagIds=[...remove];break;
      }
      case "create_collection": state.tables.collections.push({id:action.collectionId,creatorId,title:title(action.title),description:null,coverMediaId:null,accessCeilingTierId:null,themeTagIds:[],sortOrder:state.tables.collections.length,createdAt:new Date().toISOString()});break;
      case "rename_collection": get(state,"collections",action.collectionId).title=title(action.title);break;
      case "collection_membership": {
        get(state,"collections",action.collectionId);
        const rows=state.tables.collectionPosts.filter(r=>s(r,"collectionId")===action.collectionId);
        let order=rows.reduce((m,r)=>Math.max(m,Number(r.sortIndex)+1),0);
        for(const postId of action.postIds){get(state,"posts",postId);if(action.operation==="remove")state.tables.collectionPosts=state.tables.collectionPosts.filter(r=>!(s(r,"collectionId")===action.collectionId&&s(r,"postId")===postId));else if(!rows.some(r=>s(r,"postId")===postId))state.tables.collectionPosts.push({collectionId:action.collectionId,postId,sortIndex:order++});}break;
      }
      case "reorder_collection": {
        get(state,"collections",action.collectionId);
        const rows=state.tables.collectionPosts.filter(r=>s(r,"collectionId")===action.collectionId);
        if(new Set(action.postIds).size!==action.postIds.length||rows.length!==action.postIds.length||rows.some(r=>!action.postIds.includes(s(r,"postId"))))throw new EditorError("INVALID_ORDER","Collection order must include every current member exactly once.");
        rows.forEach(r=>r.sortIndex=action.postIds.indexOf(s(r,"postId")));break;
      }
      case "create_series": state.tables.series.push({id:action.seriesId,creatorId,title:title(action.title),createdAt:new Date().toISOString()});break;
      case "link_series_work": {
        get(state,"series",action.seriesId);const work=get(state,"works",action.workId);
        const oldTitle=effectiveWorkTitle(state,action.workId);
        state.tables.seriesMembers=state.tables.seriesMembers.filter(r=>s(r,"creativeWorkId")!==action.workId);
        state.tables.seriesMembers.push({id:randomUUID(),creatorId,creativeSeriesId:action.seriesId,creativeWorkId:action.workId,partLabel:title(action.partLabel),sortOrder:action.sortOrder});
        work.titleMode=action.titleMode;if(action.titleMode==="independent")work.title=oldTitle;break;
      }
      case "unlink_series_work": {const work=get(state,"works",action.workId);work.title=title(action.title);work.titleMode="independent";state.tables.seriesMembers=state.tables.seriesMembers.filter(r=>s(r,"creativeWorkId")!==action.workId);break;}
      case "link_work_post": {
        get(state,"works",action.workId);get(state,"posts",action.postId);
        const old=state.tables.workMembers.find(r=>s(r,"postId")===action.postId);
        state.tables.workMembers=state.tables.workMembers.filter(r=>s(r,"postId")!==action.postId);
        state.tables.workMembers.push({id:s(old,"id")||randomUUID(),creatorId,postId:action.postId,creativeWorkId:action.workId,variantRole:s(old,"variantRole")||"standalone",memberLabel:action.memberLabel??null,sortOrder:action.sortOrder,linkedAt:s(old,"linkedAt")||new Date().toISOString()});
        setPostMode(state,creatorId,action.postId,action.titleMode,action.customTitle);break;
      }
      default: throw new EditorError("UNKNOWN_ACTION","Unsupported edit action.");
    }
  }
  for(const p of state.tables.posts) effectivePostTitle(state,s(p,"id"));
  return state;
}
export function buildChangeCart(before: EditorState, after: EditorState, actions: EditAction[], revision: number): ChangeCart {
  const items: ChangeCart["items"]=[];
  function postView(state:EditorState,id:string){
    const p=state.tables.presentations.find(r=>s(r,"postId")===id),v=state.tables.versions.find(r=>s(r,"postId")===id);
    const delta=state.tables.overrides.find(r=>s(r,"postId")===id&&s(r,"mediaId")==="");
    const work=state.tables.workMembers.find(r=>s(r,"postId")===id),series=state.tables.seriesMembers.find(r=>s(r,"creativeWorkId")===s(work,"creativeWorkId"));
    return {title:effectivePostTitle(state,id),sourceTitle:s(v,"title"),titleMode:s(p,"titleMode")||"source",description:p?.relayDescription??v?.description??null,mediaIds:list(p,"mediaOrder").length?list(p,"mediaOrder"):list(v,"mediaIds"),tags:[...new Set([...list(v,"tagIds").filter(t=>!list(delta,"removeTagIds").includes(t)),...list(delta,"addTagIds")])],mediaTags:state.tables.overrides.filter(r=>s(r,"postId")===id&&s(r,"mediaId")).map(r=>({mediaId:r.mediaId,add:r.addTagIds,remove:r.removeTagIds})),workId:s(work,"creativeWorkId"),memberLabel:work?.memberLabel??null,sortOrder:work?.sortOrder??0,seriesId:s(series,"creativeSeriesId"),collectionIds:state.tables.collectionPosts.filter(r=>s(r,"postId")===id).map(r=>s(r,"collectionId"))};
  }
  function affects(action:EditAction,id:string){
    if("postId"in action)return action.postId===id;
    if("postIds"in action)return action.postIds.includes(id);
    const members=[...before.tables.workMembers,...after.tables.workMembers].filter(r=>s(r,"postId")===id),workIds=members.map(r=>s(r,"creativeWorkId"));
    if("workId"in action)return workIds.includes(action.workId);
    if("seriesId"in action)return [...before.tables.seriesMembers,...after.tables.seriesMembers].some(r=>workIds.includes(s(r,"creativeWorkId"))&&s(r,"creativeSeriesId")===action.seriesId);
    return false;
  }
  for(const p of before.tables.posts){
    const id=s(p,"id"), b=effectivePostTitle(before,id),a=effectivePostTitle(after,id);
    const bp=before.tables.presentations.find(r=>s(r,"postId")===id),ap=after.tables.presentations.find(r=>s(r,"postId")===id);
    const exception=s(ap,"titleMode")==="custom";
    const changed=b!==a||fingerprint(bp??null)!==fingerprint(ap??null)||fingerprint(before.tables.overrides.filter(r=>s(r,"postId")===id))!==fingerprint(after.tables.overrides.filter(r=>s(r,"postId")===id));
    const actionIds=actions.filter(x=>affects(x,id)).map(x=>x.id);
    if(changed || actionIds.length) items.push({targetId:id,targetType:"post",title:b,before:postView(before,id),after:postView(after,id),actionIds,exception,inherited:s(ap,"titleMode")==="inherit_work"});
  }
  for(const [table,targetType] of [["works","work"],["series","series"],["collections","collection"]] as const){
    const view=(state:EditorState,row:Row)=>{const id=s(row,"id");if(table==="collections")return {title:row.title,postIds:state.tables.collectionPosts.filter(r=>s(r,"collectionId")===id).sort((a,b)=>Number(a.sortIndex)-Number(b.sortIndex)).map(r=>s(r,"postId"))};if(table==="works"){const member=state.tables.seriesMembers.find(r=>s(r,"creativeWorkId")===id);return {title:effectiveWorkTitle(state,id),titleMode:row.titleMode,seriesId:s(member,"creativeSeriesId"),partLabel:member?.partLabel??null,sortOrder:member?.sortOrder??0,postIds:state.tables.workMembers.filter(r=>s(r,"creativeWorkId")===id).map(r=>s(r,"postId"))};}return {title:row.title,workIds:state.tables.seriesMembers.filter(r=>s(r,"creativeSeriesId")===id).map(r=>s(r,"creativeWorkId"))};};
    for(const row of after.tables[table]){const id=s(row,"id"),old=before.tables[table].find(r=>s(r,"id")===id),b=old?view(before,old):null,a=view(after,row);if(fingerprint(b)!==fingerprint(a)){items.push({targetId:id,targetType,title:old?s(b as Row,"title"):s(row,"title"),before:b,after:a,actionIds:actions.filter(x=>("workId"in x&&x.workId===id)||("seriesId"in x&&x.seriesId===id)||("collectionId"in x&&x.collectionId===id)).map(x=>x.id)});}}
  }
  return {revision,actions,items,dependencies:dependencies(before),conflicts:[],notice:RENAME_NOTICE};
}
