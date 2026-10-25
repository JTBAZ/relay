import { readFileSync } from 'node:fs';
import { Script, runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';

const html = readFileSync('.impeccable/mocks/decision/modal-select-confirm.html', 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
new Script(script);
const data = script.slice(script.indexOf('const performanceFixtures='), script.indexOf('const performanceDialog='));
const opener = script.split('\n').find(line => line.startsWith('function openWorkPerformance('));
for (const state of [{mainReviewing:true,busy:false,hidden:true},{mainReviewing:false,busy:true,hidden:true},{mainReviewing:false,busy:false,hidden:false}]) {
  runInNewContext(`${opener}; openWorkPerformance(0);`, {
    ...state,
    $: () => ({ hidden: state.hidden }),
    works: new Proxy([], { get() { throw new Error('Protected inspection reached artwork state'); } }),
  });
}
runInNewContext(`${data}
const garden=performancePostsFor(1),blue=performancePostsFor(0);
assert.equal(filterPerformancePosts(garden,{range:'7d'}).length,3);
assert.equal(filterPerformancePosts(garden,{range:'30d'}).length,4);
assert.equal(filterPerformancePosts(garden,{range:'90d'}).length,5);
assert.equal(filterPerformancePosts(garden,{platform:'Patreon'}).length,1);
assert.equal(filterPerformancePosts(garden,{imageOnly:true,mediaIndex:5}).length,1);
assert.equal(filterPerformancePosts(garden,{imageOnly:true,mediaIndex:5,platform:'X'}).length,0);
const total=performanceMetricTotal(filterPerformancePosts(garden,{}),'impressions');
assert.equal(total.value,6980);assert.equal(total.reported,3);assert.equal(total.total,4);
const missing=performanceMetricTotal([garden[1]],'impressions');
assert.equal(missing.value,null);assert.equal(missing.reported,0);
assert.equal(performanceMetricTotal([garden[2]],'impressions').value,0);
assert.equal(performanceMetricText(0),'0');assert.equal(performanceMetricText(null),'—');
assert.equal(performanceMetricTotal([],'likes').value,null);
assert.ok(blue.every(post=>post.id.startsWith('blue-')));
assert.equal(performancePostsFor(9).length,0);assert.equal(performancePostsFor(999).length,0);
assert.equal(performanceMetricTotal(performancePostsFor(2),'likes').value,null);
assert.equal(performanceMetricTotal(filterPerformancePosts(garden,{}).filter(post=>post.role==='teaser'),'likes').value,75);
const trend=performanceTrendData(garden,{range:'7d'});
assert.equal(trend.length,7);assert.equal(trend[0].date,'2026-10-15');assert.equal(trend[6].date,'2026-10-21');
assert.equal(performanceTrendData(garden,{range:'30d'})[0].date,'2026-09-22');
assert.equal(performanceTrendData(garden,{range:'90d'})[0].date,'2026-07-24');
assert.equal(trend[6].platforms.find(point=>point.name==='X').value,95);
assert.equal(trend[6].platforms.find(point=>point.name==='X').reported,3);
assert.equal(trend[6].platforms.find(point=>point.name==='X').total,4);
assert.equal(trend[6].platforms.find(point=>point.name==='Patreon').value,12);
const imageSix=performanceTrendData(garden,{range:'7d',imageOnly:true,mediaIndex:5});
assert.equal(imageSix[6].platforms.find(point=>point.name==='Patreon').value,12);
assert.equal(imageSix[6].platforms.find(point=>point.name==='X').value,null);
assert.equal(imageSix[6].platforms.find(point=>point.name==='X').total,1);
const zeroDay=performanceTrendData(garden.filter(post=>post.id==='garden-x-oct16'),{range:'7d'});
assert.equal(zeroDay[0].platforms[0].value,null);assert.equal(zeroDay[1].platforms[0].value,0);
const missingImpressions=performanceTrendData(garden,{range:'7d',platform:'Patreon',metric:'impressions'});
assert.ok(missingImpressions.every(day=>day.platforms[0].value===null));
const gap=performanceTrendData(garden,{range:'30d'}).find(day=>day.date==='2026-10-12');
assert.equal(gap.platforms.find(point=>point.name==='X').value,null);
assert.equal(performanceTrendSegments([{value:3},{value:null},{value:0},{value:4}]).length,2);
assert.equal(performanceTrendSegments([{value:null}]).length,0);
const blueTrend=performanceTrendData(blue,{range:'7d'});
assert.equal(blueTrend[6].platforms.find(point=>point.name==='X').value,26);
assert.equal(performanceTrendData(performancePostsFor(999))[0].platforms.length,0);
`, { assert, Intl });
console.log('Performance: post and daily activity scopes, missing/zero values, chart gaps, guard and syntax passed.');
