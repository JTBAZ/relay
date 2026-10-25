import { readFileSync } from 'node:fs';
import { Script, runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';
const html=readFileSync('.impeccable/mocks/decision/modal-select-confirm.html','utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
new Script(script);
const performance=script.slice(script.indexOf('const performanceFixtures='),script.indexOf('const performanceDialog='));
const tree=script.slice(script.indexOf('const treeMemberFixtures='),script.indexOf("const workTree=$('work-tree')"));
const scopedPosts=script.split('\n').find(line=>line.startsWith('function performanceScopedPosts('));
const opener=script.split('\n').find(line=>line.startsWith('function openWorkTree('));
for(const state of [{mainReviewing:true,busy:false,hidden:true},{mainReviewing:false,busy:true,hidden:true},{mainReviewing:false,busy:false,hidden:false}]){
 runInNewContext(`${opener};openWorkTree(1);`,{...state,$:()=>({hidden:state.hidden}),works:new Proxy([],{get(){throw Error('Protected tree reached artwork state');}})});
}
runInNewContext(`${performance}\n${tree}\n${scopedPosts}
let performanceState={workId:1,recordIds:['garden-x-oct20','garden-patreon-oct18']};
assert.equal(performanceScopedPosts().length,2);
performanceState.recordIds=['garden-x-oct06'];assert.equal(performanceScopedPosts().length,1);
assert.equal(performanceScopedPosts()[0].metrics.likes,75);
performanceState.recordIds=['blue-x-oct19'];assert.equal(performanceScopedPosts().length,0);
performanceState.recordIds=null;assert.equal(performanceScopedPosts().length,5);
const members=treeMembersFor(1),records=treeSetRecords(1,members);
assert.equal(members.length,4);assert.equal(records.length,5);
assert.equal(treeMemberRecords(1,members[0]).length,2);
assert.equal(treeMemberRecords(0,members[0]).length,0);
assert.equal(new Set(members[0].records).size,2);
assert.equal(performanceMetricTotal(records,'likes').value,561);
assert.equal(performanceMetricTotal(records,'impressions').value,13480);
assert.equal(performanceMetricTotal(records,'impressions').reported,4);
assert.equal(treeSetRecords(1,[members[0],members[0]]).length,2);
assert.equal(performanceMetricTotal(treeMemberRecords(1,members[2]),'likes').value,0);
assert.equal(treeMemberRecords(1,members[0]).find(post=>post.platform==='Patreon').metrics.impressions,null);
assert.equal(members[1].gaps[0],'Patreon');assert.equal(treeMemberRecords(1,members[1])[0].stale,true);
assert.equal(treeMembersFor(0).length,1);assert.equal(treeMembersFor(9).length,0);assert.equal(treeMembersFor(999).length,0);
const paths=treeConnectorPaths({x:280,y:180},[{top:{x:122,y:220}},{top:{x:446,y:340}}],[{from:{x:122,y:300},to:{x:210,y:330}}]);
assert.equal(paths.branches.length,2);assert.match(paths.branches[0],/^M 280 180 C .*122 220$/);
assert.match(paths.leaves[0],/^M 122 300 C .*210 330$/);
`,{assert,Intl});
console.log('Tree: linked posts/platform records, scope isolation, totals, missing/zero values, gaps, paths, guards and syntax passed.');
