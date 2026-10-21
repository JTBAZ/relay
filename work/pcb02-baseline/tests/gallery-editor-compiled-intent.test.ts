import {describe,it,expect,vi} from 'vitest';
import {compileIntent} from '../src/gallery-editor/structured-intent.js';
import {IntentEvidence} from '../src/gallery-editor/intent-evidence.js';
import {EDITOR_READ_TOOLS,runEditorIntent,type EditorReadTools} from '../src/gallery-editor/intent.js';
import {COMPILED_STRUCTURED_INTENT_SCHEMA} from '../src/gallery-editor/structured-intent.js';
import {RENAME_NOTICE,type EditorSession,type EditAction} from '../src/gallery-editor/types.js';
import type {EditorProvider,ResponseItem} from '../src/gallery-editor/provider.js';

const post=(postId:string,mode='source')=>({postId,title:'Rain',description:null,tags:[],mediaIds:postId==='p1'?['m1']:[],naming:{mode,effectiveTitle:'Rain',sourceTitle:'Source',workId:'w1',workTitle:'Rain',workTitleMode:'independent',seriesId:'s1',seriesTitle:'Field Notes',partLabel:'A',exception:mode==='custom'}});
const family={items:[post('p1'),post('p2','custom')],target:{kind:'post',id:'p1'},workIds:['w1'],seriesId:'s1',total:2,hasMore:false,nextCursor:null,complete:true};
const session=(actions:EditAction[]=[]):EditorSession=>({id:'s',creatorId:'owner',revision:2,context:{selectedPostIds:['p1']},messages:[],cart:{revision:2,actions,items:[],dependencies:{},conflicts:[],notice:RENAME_NOTICE}});
const op=(fields:Record<string,unknown>={})=>({operation:'rename',scope:'work',target:{source:'ids',ids:['w1']},excludeIds:[],unresolved:[],scopeBasis:'explicit',requestQuote:'rename the work',change:'add',actionId:null,value:'After Rain',...fields});
const intent=(operations:unknown[],fields:Record<string,unknown>={})=>({revision:2,outcome:'proposal',question:null,unresolved:[],observations:[],operations,...fields});
function evidence(){const e=new IntentEvidence();e.record('expandLibraryFamily',{kind:'post',id:'p1'},{data:family});return e;}
const final=(data:unknown)=>({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(data)}]}]});
const provider=(...results:Array<{output:ResponseItem[]}>):EditorProvider=>({respond:vi.fn(async()=>results.shift()!)});
const reads:EditorReadTools=async()=>({data:family});

describe('structured intent compiler (mocked interpretation, not model accuracy)',()=>{
  it.each(['rename the work','Please call this whole work After Rain','Change the work name to After Rain'])('compiles equivalent interpreted paraphrase %s without descendant overrides',request=>{
    const result=compileIntent(intent([op({requestQuote:request})]),session(),request,evidence());
    expect(result.actions).toEqual([{id:expect.any(String),kind:'rename_work',workId:'w1',title:'After Rain'}]);
    expect(result.patch.changes).toHaveLength(1);
  });
  it('preserves a manual cart exactly while adding an unrelated operation',()=>{
    const manual:EditAction={id:'manual',kind:'rename_post',postId:'p2',title:'Keep mine'};
    const result=compileIntent(intent([op()]),session([manual]),'rename the work',evidence());
    expect(result.actions[0]).toEqual(manual);expect(result.actions).toHaveLength(2);
  });
  it('rejects accidental same-field overwrite and permits a quote-grounded explicit revision',()=>{
    const manual:EditAction={id:'manual',kind:'rename_post',postId:'p1',title:'Keep mine'};
    const edit=op({scope:'post',target:{source:'ids',ids:['p1']},requestQuote:'replace my title'});
    expect(()=>compileIntent(intent([edit]),session([manual]),'replace my title',evidence())).toThrow(/explicitly revised/);
    const result=compileIntent(intent([{...edit,change:'revise',actionId:'manual'}]),session([manual]),'replace my title',evidence());
    expect(result.actions).toEqual([{...manual,title:'After Rain'}]);
  });
  it('preserves the whole cart if any compound operation has unresolved scope',()=>{
    const manual:EditAction={id:'m',kind:'tags',postId:'p1',add:['blue'],remove:[]};
    const result=compileIntent(intent([op(),op({scope:'unresolved'})]),session([manual]),'rename the work',evidence());
    expect(result).toMatchObject({disposition:'clarification',actions:[manual],patch:{changes:[]}});
  });
  it('supports compound operations and post exclusions without dropping manual edits',()=>{
    const request='rename the work and tag the posts except p2';
    const tags={operation:'tags',scope:'post',target:{source:'ids',ids:['p1','p2']},excludeIds:['p2'],unresolved:[],scopeBasis:'explicit',requestQuote:'tag the posts except p2',change:'add',actionId:null,add:['quiet'],remove:[],observationMediaIds:[]};
    const result=compileIntent(intent([op(),tags]),session(),request,evidence());
    expect(result.actions.map(a=>a.kind)).toEqual(['rename_work','tags']);
    expect(result.actions[1]).toMatchObject({postId:'p1'});
  });
  it('requires complete family evidence, rejects stale and unowned targets',()=>{
    const e=new IntentEvidence();e.record('resolveLibraryPosts',{postIds:['p1']},{data:{resolvedPosts:[post('p1')],missingPostIds:[]}});
    expect(()=>compileIntent(intent([op()]),session(),'rename the work',e)).toThrow(/complete family/);
    expect(()=>compileIntent(intent([op()],{revision:1}),session(),'rename the work',evidence())).toThrow(/cart changed/);
    expect(()=>compileIntent(intent([op({target:{source:'ids',ids:['foreign']}})]),session(),'rename the work',evidence())).toThrow(/authorized/);
  });
  it('does not execute operations attached to a clarification or limitation',()=>{
    for(const outcome of ['clarification','limitation','no_change'])expect(()=>compileIntent(intent([op()],{outcome}),session(),'rename the work',evidence())).toThrow(/cannot change/);
  });
  it('keeps inspected media observations separate from post mutation scope',()=>{
    const e=evidence();e.record('resolveLibraryImageReferences',{mediaIds:['m1']},{data:{},images:[{mediaId:'m1',url:'data:image/png;base64,YQ=='}]});
    const tags={operation:'tags',scope:'post',target:{source:'selection',ids:[]},excludeIds:[],unresolved:[],scopeBasis:'explicit',requestQuote:'tag this post',change:'add',actionId:null,add:['blue'],remove:[],observationMediaIds:['m1']};
    const result=compileIntent(intent([tags],{observations:[{mediaId:'m1',attributes:[{kind:'color',value:'blue'}]}]}),session(),'tag this post',e);
    expect(result.actions[0]).toMatchObject({kind:'tags',postId:'p1',add:['blue']});expect(result.actions[0]).not.toHaveProperty('mediaId');
    expect(()=>compileIntent(intent([tags]),session(),'tag this post',evidence())).toThrow(/inspection/);
  });
  it('rejects invented supporting spans and treats repeated identical requests as no-change',()=>{
    expect(()=>compileIntent(intent([op()]),session(),'change something else',evidence())).toThrow(/verbatim/);
    const original:EditAction={id:'keep',kind:'rename_work',workId:'w1',title:'After Rain'};
    const result=compileIntent(intent([op()]),session([original]),'rename the work',evidence());
    expect(result).toMatchObject({disposition:'no_change',actions:[original],patch:{changes:[]}});
  });
});

describe('bounded economical interpretation routing',()=>{
  it('offers only metadata reads and rejects an unadvertised image read before the adapter runs',async()=>{
    const p=provider(final(intent([op()]))),read=vi.fn(reads);
    await runEditorIntent(session(),'rename the work',p,read,{architecture:'compiled'});
    const request=(p.respond as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(request.tools.map((tool:ResponseItem)=>tool.name)).toEqual(EDITOR_READ_TOOLS.map(tool=>tool.name).filter(name=>name!=='resolveLibraryImageReferences'));
    expect(request.responseSchema).toEqual(COMPILED_STRUCTURED_INTENT_SCHEMA);
    expect(request.input.some((item:ResponseItem)=>item.type==='input_image')).toBe(false);
    const instructions=request.input.filter((item:ResponseItem)=>item.role==='developer').map((item:ResponseItem)=>item.content).join('\n');
    expect(instructions).toContain('metadata-only');
    expect(instructions).not.toContain('Inspect the available requested image');
    expect(instructions).not.toContain('cite only inspected IDs');

    const visual=provider({output:[{type:'function_call',name:'resolveLibraryImageReferences',call_id:'image',arguments:'{"mediaIds":["m1"]}'}]});
    const adapter=vi.fn(reads);
    await expect(runEditorIntent(session(),'inspect the image',visual,adapter,{architecture:'compiled'})).rejects.toMatchObject({code:'invalid_tool_call'});
    expect(adapter.mock.calls.map(call=>call[0])).toEqual(['expandLibraryFamily']);
  });
  it('keeps selected media and textual tag metadata while never forwarding injected adapter images',async()=>{
    const selected={...session(),context:{selectedPostIds:['p1'],selectedMediaIds:['m1']}};
    const p=provider(final(intent([op()])));
    const metadataRead:EditorReadTools=async name=>name==='readLibraryMedia'?{data:{items:[{mediaId:'m1',postIds:['p1'],mimeType:'image/png',role:'cover',processingStatus:'READY'}]}}:{data:family};
    await runEditorIntent(selected,'rename the work',p,metadataRead,{architecture:'compiled'});
    const request=(p.respond as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const serialized=JSON.stringify(request.input);
    expect(serialized).toContain('image/png');
    expect(serialized).toContain('cover');
    expect(request.input.some((item:ResponseItem)=>item.type==='input_image')).toBe(false);

    const injected=provider(final(intent([op()])));
    const imageAdapter:EditorReadTools=async name=>name==='readLibraryMedia'?{data:{items:[]},images:[{mediaId:'m1',url:'data:image/png;base64,YQ=='}]}:{data:family};
    await expect(runEditorIntent(selected,'rename the work',injected,imageAdapter,{architecture:'compiled'})).rejects.toMatchObject({code:'image_unavailable'});
    expect(injected.respond).not.toHaveBeenCalled();
  });
  it('returns a safe limitation for model observations or visual citations without changing the cart',()=>{
    const observations=intent([],{observations:[{mediaId:'m1',attributes:[{kind:'color',value:'blue'}]}]});
    const cited=intent([{operation:'tags',scope:'post',target:{source:'selection',ids:[]},excludeIds:[],unresolved:[],scopeBasis:'explicit',requestQuote:'tag the art',change:'add',actionId:null,add:['blue'],remove:[],observationMediaIds:['m1']}]);
    for(const raw of [observations,cited]){
      const result=compileIntent(raw,session(),'tag the art',evidence(),{metadataOnly:true});
      expect(result).toMatchObject({disposition:'limitation',actions:[],patch:{changes:[]}});
      expect(result.message).toMatch(/metadata only/i);
    }
    // The default compiler retains historical evidence behavior for the legacy visual path.
    expect(()=>compileIntent(observations,session(),'tag the art',evidence())).toThrow(/inspection/);
  });
  it('keeps text-only tag proposals valid in metadata-only mode',()=>{
    const tags={operation:'tags',scope:'post',target:{source:'selection',ids:[]},excludeIds:[],unresolved:[],scopeBasis:'explicit',requestQuote:'tag this post blue',change:'add',actionId:null,add:['blue'],remove:[],observationMediaIds:[]};
    const result=compileIntent(intent([tags]),session(),'tag this post blue',evidence(),{metadataOnly:true});
    expect(result.actions).toMatchObject([{kind:'tags',postId:'p1',add:['blue']}]);
  });
  it('cannot request a fifth call',async()=>{
    const call=(i:number,name:string,args:unknown)=>({output:[{type:'function_call',name,call_id:`c${i}`,arguments:JSON.stringify(args)}]});
    const p=provider(...Array.from({length:4},(_,i)=>call(i,'resolveLibraryPosts',{postIds:['p1']})));
    await expect(runEditorIntent(session(),'read',p,reads,{architecture:'compiled'})).rejects.toMatchObject({code:'intent_call_limit'});
    expect(p.respond).toHaveBeenCalledTimes(4);
  });
  it('finishes selected-family edits in one interpretation call with application-prefetched evidence',async()=>{
    const p=provider(final(intent([op()]))),read=vi.fn(reads);
    const result=await runEditorIntent(session(),'rename the work',p,read,{architecture:'compiled'});
    expect(p.respond).toHaveBeenCalledTimes(1);expect(read).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({routing:{repairs:0,escalations:0},patch:{revision:2}});
  });
  it('repairs malformed output once and escalates only after a second contract failure',async()=>{
    const p=provider(final({}),final({})),escalation=provider(final(intent([op()])));
    const result=await runEditorIntent(session(),'rename the work',p,reads,{architecture:'compiled',escalationProvider:escalation});
    expect(result.routing).toMatchObject({repairs:1,escalations:1});expect(result.usage?.calls).toBe(3);
  });
  it('does not escalate missing intent or retry transport failures',async()=>{
    const escalation=provider(final(intent([op()])));
    const result=await runEditorIntent(session(),'rename it',provider(final(intent([],{outcome:'clarification',question:'Post, work or series?'}))),reads,{architecture:'compiled',escalationProvider:escalation});
    expect(result.disposition).toBe('clarification');expect(escalation.respond).not.toHaveBeenCalled();
    const failed={respond:vi.fn(async()=>{throw new Error('transport');})};
    await expect(runEditorIntent(session(),'rename it',failed,reads,{architecture:'compiled',escalationProvider:escalation})).rejects.toThrow('transport');
    expect(failed.respond).toHaveBeenCalledTimes(1);expect(escalation.respond).not.toHaveBeenCalled();
  });
  it('enforces a shared deadline even for an uncooperative prefetch',async()=>{
    await expect(runEditorIntent(session(),'rename it',provider(),()=>new Promise(()=>{}),{architecture:'compiled',timeoutMs:10})).rejects.toMatchObject({code:'intent_timeout'});
  });
  it('does not accept invented or image-bearing tool calls',async()=>{
    const p=provider({output:[{type:'function_call',name:'publish',call_id:'x',arguments:'{}'}]});
    await expect(runEditorIntent(session(),'publish it',p,reads,{architecture:'compiled'})).rejects.toMatchObject({code:'invalid_tool_call'});
    const visual=provider({output:[{type:'function_call',name:'resolveLibraryImageReferences',call_id:'x',arguments:JSON.stringify({mediaIds:['m1']})}]});
    await expect(runEditorIntent(session(),'inspect',visual,reads,{architecture:'compiled'})).rejects.toMatchObject({code:'invalid_tool_call'});
  });
});
