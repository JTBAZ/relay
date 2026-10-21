import { describe, expect, it } from "vitest";
import { buildChangeCart, simulateEditorActions, TABLES, type EditorState, type Row } from "../src/gallery-editor/state.js";
import type { EditAction } from "../src/gallery-editor/types.js";

function fixture(): EditorState {
  return {scope:{posts:["a","b"],works:["w"],series:[],collections:[]},tables:{...Object.fromEntries(TABLES.map(t=>[t,[]])) as Record<typeof TABLES[number],Row[]>,
    posts:[{id:"a",creatorId:"owner"},{id:"b",creatorId:"owner"}],versions:[{postId:"a",title:"Source A",mediaIds:["m1","m2","m3"]},{postId:"b",title:"Source B",mediaIds:[]}],
    works:[{id:"w",title:"Work",titleMode:"independent",creatorId:"owner"}],workMembers:[{id:"wa",postId:"a",creativeWorkId:"w",sortOrder:1},{id:"wb",postId:"b",creativeWorkId:"w",sortOrder:0}],
    presentations:[{id:"pa",postId:"a",creatorId:"owner",titleMode:"inherit_work",relayTitle:null,mediaOrder:["m2","m1","obsolete"]}]}};
}
describe("Gallery editor exact preview",()=>{
  it("shows independent works and source posts as preserved series-name exceptions",()=>{
    const before=fixture();
    before.tables.series=[{id:"series",creatorId:"owner",title:"Series"}];
    before.tables.seriesMembers=[{id:"sw",creativeWorkId:"w",creativeSeriesId:"series",partLabel:"Part 1",sortOrder:0}];
    const actions:EditAction[]=[{id:"rename",kind:"rename_series",seriesId:"series",title:"New series"}];
    const cart=buildChangeCart(before,simulateEditorActions(before,"owner",actions),actions,1);
    expect(cart.items.find(i=>i.targetId==="a")).toMatchObject({preservedReason:"independent_work",after:{title:"Work"}});
    expect(cart.items.find(i=>i.targetId==="b")).toMatchObject({preservedReason:"source_post_title",after:{title:"Source B"}});
    expect(cart.items.find(i=>i.targetId==="w")).toMatchObject({preservedReason:"independent_work",after:{title:"Work"}});
  });
  it("reveals unchanged siblings and uses the same complete media order as Library",()=>{
    const before=fixture(), actions:EditAction[]=[{id:"rename",kind:"rename_post",postId:"a",title:"Exception"}];
    const cart=buildChangeCart(before,simulateEditorActions(before,"owner",actions),actions,1);
    expect(cart.items.find(i=>i.targetId==="b")).toMatchObject({related:true,actionIds:[],before:{title:"Source B"},after:{title:"Source B"}});
    expect(cart.items.find(i=>i.targetId==="a")).toMatchObject({exception:true,before:{mediaIds:["m2","m1","m3"]},thumbnailUrl:"/api/v1/export/media/owner/m1/thumb"});
  });
  it("keeps an explicit post exception without canceling the whole-work rename",()=>{
    const before=fixture(),actions:EditAction[]=[{id:"work",kind:"rename_work",workId:"w",title:"New work"},{id:"keep",kind:"rename_post",postId:"a",title:"Work"}];
    const after=simulateEditorActions(before,"owner",actions),cart=buildChangeCart(before,after,actions,1);
    expect(cart.items.find(i=>i.targetId==="a")).toMatchObject({exception:true,after:{title:"Work",titleMode:"custom"}});
    expect(cart.items.find(i=>i.targetId==="b")).toMatchObject({after:{title:"New work",titleMode:"inherit_work"}});
    expect(cart.items.find(i=>i.targetId==="w")).toMatchObject({after:{postIds:["b","a"]}});
  });
});
