/** Synthetic fixture projection through the production simulator, with generated row IDs omitted.
 * Exact state equality is diagnostic; semantic tag synonyms still require reviewed adjudication.
 */
export async function projectEvaluationState(catalog, actions) {
  const {simulateEditorActions,effectivePostTitle,effectiveWorkTitle}=await import('../dist/src/gallery-editor/state.js');
  const owner='evaluation-owner';
  const tables={posts:[],versions:[],presentations:[],overrides:[],works:[],workMembers:[],series:[],seriesMembers:[],collections:[],collectionPosts:[]};
  for(const post of catalog.posts){
    tables.posts.push({id:post.id,creatorId:owner});
    tables.versions.push({postId:post.id,title:post.sourceTitle,description:post.description,mediaIds:post.mediaIds,tagIds:post.tags});
    tables.presentations.push({id:`presentation-${post.id}`,creatorId:owner,postId:post.id,titleMode:post.titleMode,relayTitle:post.titleMode==='custom'?post.title:null,relayDescription:null,mediaOrder:[]});
    if(post.workId)tables.workMembers.push({id:`member-${post.id}`,creatorId:owner,postId:post.id,creativeWorkId:post.workId,sortOrder:0});
  }
  for(const work of catalog.works){
    tables.works.push({id:work.id,creatorId:owner,title:work.title,titleMode:work.titleMode});
    if(work.seriesId){const series=catalog.series.find(s=>s.id===work.seriesId),position=series.workIds.indexOf(work.id);tables.seriesMembers.push({id:`series-member-${work.id}`,creatorId:owner,creativeWorkId:work.id,creativeSeriesId:work.seriesId,partLabel:work.partLabel??`Part ${String.fromCharCode(65+position)}`,sortOrder:position});}
  }
  tables.series=catalog.series.map(s=>({id:s.id,creatorId:owner,title:s.title}));
  for(const collection of catalog.collections){tables.collections.push({id:collection.id,creatorId:owner,title:collection.title});collection.postIds.forEach((postId,sortIndex)=>tables.collectionPosts.push({collectionId:collection.id,postId,sortIndex}));}
  const before={scope:{posts:catalog.posts.map(p=>p.id),works:catalog.works.map(w=>w.id),series:catalog.series.map(s=>s.id),collections:catalog.collections.map(c=>c.id)},tables};
  const after=simulateEditorActions(before,owner,actions),t=after.tables;
  const tags=(base,override)=>[...new Set([...base,...(override?.addTagIds??[])])].filter(x=>!(override?.removeTagIds??[]).includes(x)).sort();
  return {
    posts:t.posts.map(p=>{const v=t.versions.find(x=>x.postId===p.id),presentation=t.presentations.find(x=>x.postId===p.id),member=t.workMembers.find(x=>x.postId===p.id),overrides=t.overrides.filter(x=>x.postId===p.id);const postTags=tags(v.tagIds??[],overrides.find(x=>!x.mediaId));return {id:p.id,title:effectivePostTitle(after,p.id),sourceTitle:v.title,titleMode:presentation?.titleMode??'source',description:presentation?.relayDescription??v.description??null,workId:member?.creativeWorkId??null,memberLabel:member?.memberLabel??null,tags:postTags,mediaOrder:presentation?.mediaOrder?.length?presentation.mediaOrder:v.mediaIds,mediaTags:v.mediaIds.map(mediaId=>({mediaId,tags:tags(postTags,overrides.find(x=>x.mediaId===mediaId))}))};}),
    works:t.works.map(w=>{const m=t.seriesMembers.find(x=>x.creativeWorkId===w.id);return {id:w.id,title:effectiveWorkTitle(after,w.id),titleMode:w.titleMode,seriesId:m?.creativeSeriesId??null,partLabel:m?.partLabel??null};}),
    series:t.series.map(s=>({id:s.id,title:s.title,workIds:t.seriesMembers.filter(x=>x.creativeSeriesId===s.id).sort((a,b)=>a.sortOrder-b.sortOrder).map(x=>x.creativeWorkId)})),
    collections:t.collections.map(c=>({id:c.id,title:c.title,postIds:t.collectionPosts.filter(x=>x.collectionId===c.id).sort((a,b)=>a.sortIndex-b.sortIndex).map(x=>x.postId)})),
  };
}
