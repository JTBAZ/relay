import {describe,it,expect} from 'vitest';
import {IntentEvidence} from '../src/gallery-editor/intent-evidence.js';
const post=(postId:string)=>({postId,title:'T',mediaIds:['m1'],tags:[],naming:{mode:'source',workId:'w1',seriesId:'s1',workTitleMode:'independent'}});
const page=(ids:string[],hasMore:boolean,nextCursor:string|null)=>({items:ids.map(post),total:2,hasMore,nextCursor,workIds:['w1'],seriesId:'s1',target:{kind:'work',id:'w1'}});
describe('authorized compact evidence',()=>{
  it('requires rooted contiguous pages and consistent totals before family completeness',()=>{
    const e=new IntentEvidence();
    e.record('expandLibraryFamily',{kind:'work',id:'w1',cursor:'next'},{data:page(['p2'],false,null)});
    expect(e.familyComplete('work','w1')).toBe(false);
    e.record('expandLibraryFamily',{kind:'work',id:'w1'},{data:page(['p1'],true,'next')});
    expect(e.familyComplete('work','w1')).toBe(true);expect(e.familyComplete('series','s1')).toBe(true);
  });
  it('does not confuse text claims of inspection with actual thumbnails',()=>{
    const e=new IntentEvidence();
    e.record('resolveLibraryPosts',{postIds:['p1']},{data:{resolvedPosts:[post('p1')]}});
    e.record('resolveLibraryImageReferences',{mediaIds:['m1']},{data:{inspectedMediaIds:['m1'],unsupported:[{mediaId:'m1',reason:'unsupported'}]}});
    expect(e.inspected('m1')).toBe(false);expect(e.mediaPostIds('m1')).toEqual(['p1']);expect(e.hasTarget('media','m1')).toBe(true);
    e.record('resolveLibraryImageReferences',{mediaIds:['m1']},{data:{},images:[{mediaId:'m1',url:'data:image/png;base64,YQ=='}]});
    expect(e.inspected('m1')).toBe(true);expect(JSON.stringify(e.compact())).not.toContain('base64');
  });
  it('tracks complete collection membership separately from catalog pagination',()=>{
    const e=new IntentEvidence();
    e.record('readLibraryCollections',{}, {data:{items:[{id:'c',title:'C',postIds:['p1'],totalPosts:2,membershipComplete:false}],total:1,hasMore:false,nextCursor:null}});
    expect(e.collectionComplete('c')).toBe(false);
    e.record('readLibraryCollections',{collectionId:'c'},{data:page(['p1','p2'],false,null)});
    expect(e.collectionComplete('c')).toBe(true);expect(e.collectionPostIds('c')).toEqual(['p1','p2']);
  });
  it('withdraws completeness if a subsequent read shows changed membership',()=>{
    const e=new IntentEvidence();
    e.record('expandLibraryFamily',{kind:'work',id:'w1'},{data:page(['p1','p2'],false,null)});
    expect(e.familyComplete('work','w1')).toBe(true);
    e.record('expandLibraryFamily',{kind:'work',id:'w1'},{data:{...page(['p1','p2'],true,'new'),total:3}});
    expect(e.familyComplete('work','w1')).toBe(false);
  });
});
