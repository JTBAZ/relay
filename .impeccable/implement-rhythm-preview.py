from pathlib import Path
import json
base=Path('docs/studio/posting-recipe-build-plans/demo')
p=base/'recipe-editor.html'
s=p.read_text(encoding='utf-8')
Path('.impeccable/review/before-rhythm-preview.html').write_text(s,encoding='utf-8')
s=s.replace('<title>Relay · Rhythm builder</title>','<title>Relay · Posting Rhythms</title>').replace('<h1 id="page-title">New rhythm</h1>','<h1 id="page-title">Posting Rhythms</h1>')
old='<button id="test-toggle" class="ghost" aria-expanded="false" aria-controls="test-panel"><span data-icon="play"></span>Test rhythm</button>'
assert old in s
s=s.replace(old,'').replace('<button id="save-entry" class="primary">','<button id="test-toggle" class="ghost" aria-haspopup="dialog" aria-expanded="false" aria-controls="rhythm-preview"><span data-icon="play"></span>Preview rhythm</button><button id="save-entry" class="primary">')
s=s.replace("$('page-title').textContent=cfg.name||'New rhythm';",'').replace('snippet','draft').replace('Snippet','Draft').replace('<span class="label">Changes</span>','<span class="label">Modify</span>')
start=s.index('    <section id="test-panel"')
end=s.index('</section>',start)+len('</section>')
sim=s[start:end].strip().replace('<button id="test-close" class="icon-btn ghost" aria-label="Close test"><span data-icon="close"></span></button>','')
s=s[:start]+s[end:]
dialog='<dialog id="rhythm-preview" aria-labelledby="preview-heading"><div class="preview-heading"><div><h2 id="preview-heading" tabindex="-1">Preview rhythm</h2><span id="preview-name" class="muted small"></span></div><button id="test-close" class="icon-btn ghost" aria-label="Close preview"><span data-icon="close"></span></button></div><div class="preview-content"><div id="rhythm-flow"></div><details id="sample-execution" class="sample-execution"><summary>Sample execution<span data-icon="chevron"></span></summary>'+sim+'</details></div><div class="preview-foot muted small">Mock artwork · no posts are sent</div></dialog>\n'
s=s.replace('<script>\n',dialog+'<script>\n',1)
logos=json.loads(Path('.impeccable/rhythm-platform-paths.json').read_text(encoding='utf-8-sig'))
pos=s.index('  const platformIcon=')
s=s[:pos]+'  Object.assign(platformPaths,'+json.dumps(logos,separators=(',',':'))+');\n'+s[pos:]
pos=s.index('  const copies=')
s=s[:pos]+"  const unconnectedPlatforms=['Instagram','Bluesky','Tumblr'];\n"+s[pos:]
needle=".join('')}</div></fieldset><button class=\"release-toggle\""
assert needle in s
s=s.replace(needle,".join('')}<span class=\"unconnected-platforms\" role=\"group\" aria-label=\"Unconnected platforms\">${unconnectedPlatforms.map(name=>`<button class=\"unconnected-platform\" disabled aria-label=\"${name} · not connected\" title=\"${name} · not connected\">${platformIcon(name.toLowerCase())}</button>`).join('')}</span></div></fieldset><button class=\"release-toggle\"",1)
old="  $('test-toggle').addEventListener('click',()=>{if(triggerErrors().length||routeErrors().length)return;const open=$('test-panel').hidden;reveal('test-panel',open);$('test-toggle').setAttribute('aria-expanded',String(open));if(open){startTest();focusSection('test-heading');}});\n  $('test-close').addEventListener('click',()=>{reveal('test-panel',false);$('test-toggle').setAttribute('aria-expanded','false');$('test-toggle').focus({preventScroll:true});});"
assert old in s
new='''  // Geometric sample artwork illustrates treatments; it is not a Previewizer export.
  const mockArtwork=()=>'<svg viewBox="0 0 160 120" role="img" aria-label="Sample artwork: abstract midnight composition"><rect width="160" height="120" fill="#23344c"/><circle cx="110" cy="36" r="27" fill="#ebcda9"/><path d="M0 120V84L72 12l88 88v20z" fill="#7994a4"/><path d="M0 120V98l49-49 71 71z" fill="#b597a7"/><circle cx="110" cy="36" r="12" fill="#23344c"/></svg>';
  function renderRhythmPreview(){
    const filters=[cfg.filters.image?'Contains image':'',cfg.filters.textOn?'Text: '+cfg.filters.text:'',cfg.filters.linkOn?'Link: '+cfg.filters.link:''].filter(Boolean);
    const branches=anchor=>cfg.routes.filter(r=>r.anchor===anchor).map(r=>{
      const n=cfg.routes.indexOf(r)+1,parent=r.anchor==='source'?'Source post':'Release '+(cfg.routes.findIndex(p=>p.id===r.anchor)+1);
      const treatment=r.media==='preview'?r.template:'Original image',kind=r.media==='preview'?(r.template==='Frosted teaser'?'frosted':r.template==='Square crop'?'square':'censored'):'';
      const draft=r.copy==='saved'?cfg.copies[r.preset]:r.copy==='custom'?r.custom:sourceText();
      const text=r.copy==='source'&&cfg.artwork!=='uploaded'?'Original description from each matching post':r.destinations.includes('x-main')?draft.x:draft.body;
      return `<li><article class="flow-release" aria-label="Release ${n}, after ${esc(parent)}"><div class="flow-route-head"><span class="badge">${n}</span><span>${icon('route')}${esc(parent)} → ${esc(timeSentence(r))}</span></div><div class="flow-post"><div class="mock-art ${kind}">${mockArtwork()}${kind==='censored'?'<span class="censor-label">Preview</span>':''}</div><div class="flow-post-copy"><div class="flow-platforms">${r.destinations.map(id=>{const a=accounts.find(a=>a.id===id);return `<span>${platformIcon(a.cls==='da'?'deviantart':a.cls)}${esc(a.name)}</span>`;}).join('')}</div><div class="small muted">${esc(treatment)} · ${r.copy==='saved'?'Draft: '+esc(draft.name):r.copy==='custom'?'Edited original':'Original description'}${r.coach?' · Coach: Engagement':''}</div><p>${esc(text)}</p></div></div></article>${cfg.routes.some(child=>child.anchor===r.id)?`<ol class="flow-branches">${branches(r.id)}</ol>`:''}</li>`;
    }).join('');
    $('preview-name').textContent=cfg.name;
    $('rhythm-flow').innerHTML=`<div class="flow-source"><div class="mock-art">${mockArtwork()}</div><div><div class="flow-platforms"><span>${platformIcon('patreon')}Patreon <span class="muted">@moonstudio</span></span></div><h3>Source post</h3><div class="flow-filters">${filters.map(f=>`<span class="chip">${esc(f)}</span>`).join('')}</div></div></div>${filters.length?'<div class="flow-condition"><span>All filters match ↓</span><span class="muted">No match → Skip</span></div>':'<div class="flow-condition"><span>Every post ↓</span></div>'}<ol class="flow-branches">${branches('source')}</ol>`;
  }
  $('test-toggle').addEventListener('click',()=>{
    if(triggerErrors().length||routeErrors().length)return;
    renderRhythmPreview();reveal('test-panel',true);startTest();$('sample-execution').open=false;
    $('rhythm-preview').showModal();document.body.classList.add('preview-open');$('test-toggle').setAttribute('aria-expanded','true');$('preview-heading').focus({preventScroll:true});
  });
  $('test-close').addEventListener('click',()=>$('rhythm-preview').close());
  $('rhythm-preview').addEventListener('close',()=>{document.body.classList.remove('preview-open');$('test-toggle').setAttribute('aria-expanded','false');$('test-toggle').focus({preventScroll:true});});
  $('rhythm-preview').addEventListener('click',e=>{if(e.target===$('rhythm-preview')){const b=e.target.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)e.target.close();}});'''
s=s.replace(old,new)
css='''
/* The workspace title stays stable when a named rhythm is loaded. */
.page-head h1{font-size:24px;font-weight:600;letter-spacing:-.015em}.unconnected-platforms{display:inline-flex;align-items:center;gap:4px;margin-left:8px;padding-left:12px;border-left:1px solid var(--border)}.unconnected-platform{width:36px;min-height:38px;padding:8px;border-color:transparent;background:transparent;color:#8995a5}.unconnected-platform:disabled{opacity:.65}.unconnected-platform .platform-logo{width:20px;height:20px;fill:currentColor}
body.preview-open{overflow:hidden}#rhythm-preview{width:min(880px,calc(100vw - 32px));max-height:88dvh;padding:0;border:0;border-radius:14px;color:var(--fg);background:var(--surface);box-shadow:0 24px 80px #0008;overscroll-behavior:contain}#rhythm-preview[open]{display:flex;flex-direction:column;animation:reveal .2s var(--ease)}#rhythm-preview::backdrop{background:#070d16bb}.preview-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:20px 24px;border-bottom:1px solid var(--border)}.preview-heading h2{font-size:20px}.preview-heading [tabindex]:focus-visible{outline-offset:4px}.preview-content{padding:24px;overflow:auto;overscroll-behavior:contain}.preview-foot{padding:12px 24px;border-top:1px solid var(--border)}.flow-source{display:flex;align-items:center;gap:18px}.flow-source h3{margin-top:5px}.flow-filters{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.mock-art{position:relative;width:112px;flex:none;overflow:hidden;border-radius:8px;aspect-ratio:4/3;background:#23344c}.mock-art svg{display:block;width:100%;height:100%;object-fit:cover}.mock-art.frosted svg{filter:blur(7px);transform:scale(1.15)}.mock-art.square{aspect-ratio:1}.mock-art.square svg{width:134%;max-width:none;transform:translateX(-12%)}.censor-label{position:absolute;inset:40% 0 auto;background:#101925;color:#e8edf4;text-align:center;font-size:11px;font-weight:650;padding:3px;letter-spacing:.04em}.flow-condition{display:flex;gap:12px;justify-content:space-between;margin:20px 0 0 24px;font-size:13px;color:var(--mint)}.flow-branches{list-style:none;margin:0;padding:12px 0 0 24px;border-left:1px solid var(--border-hi)}.flow-branches>li{position:relative;padding:10px 0}.flow-branches>li:before{content:"";position:absolute;left:-24px;top:30px;width:24px;border-top:1px solid var(--border-hi)}.flow-release{padding:14px 16px;background:var(--input);border-radius:10px}.flow-route-head{display:flex;align-items:center;gap:10px;margin-bottom:12px;color:var(--muted);font-size:13px}.flow-route-head>span:last-child{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.flow-route-head .badge{padding:2px 7px;flex:none;color:var(--fg)}.flow-post{display:flex;gap:16px}.flow-post-copy{min-width:0;display:grid;align-content:start;gap:7px}.flow-post-copy p{font-size:13px;line-height:1.6;white-space:pre-line;overflow-wrap:anywhere;max-width:65ch}.flow-platforms{display:flex;gap:16px;flex-wrap:wrap;font-weight:600}.flow-platforms>span{display:inline-flex;align-items:center;gap:7px}.flow-platforms .platform-logo{width:18px;height:18px}.flow-branches .flow-branches{margin-top:2px}.sample-execution{margin-top:24px;border-top:1px solid var(--border);padding-top:16px}.sample-execution>summary{display:flex;align-items:center;gap:8px;cursor:pointer;color:var(--blue);min-height:40px;list-style:none}.sample-execution>summary::-webkit-details-marker{display:none}#test-panel{padding:16px 0 0;border:0;background:transparent}.sample-execution .test-head{margin-bottom:16px}
@media(max-width:650px){.page-head h1{font-size:22px}.unconnected-platforms{margin-left:0}.action-bar{flex-wrap:wrap}.action-bar>.row{margin-left:auto}.action-status{flex:1 0 100%}body{padding-bottom:155px}.flow-condition{margin-left:0;flex-wrap:wrap}.preview-heading,.preview-content{padding:16px}.preview-foot{padding:12px 16px}.flow-branches{padding-left:12px}.flow-branches>li:before{left:-12px;width:12px}.flow-branches .flow-branches{padding-left:0;border-left:0}.flow-branches .flow-branches>li:before{display:none}.flow-source{align-items:flex-start;gap:12px}.flow-source .mock-art{width:78px}.flow-release{padding:12px}.flow-post{flex-direction:column;gap:12px}.flow-post .mock-art{width:100%;max-width:160px}.flow-route-head>span:last-child{font-size:12px}}
'''
s=s.replace('@media(prefers-reduced-motion:reduce)',css+'\n@media(prefers-reduced-motion:reduce)',1)
p.write_text(s,encoding='utf-8')
t=base/'recipe-editor.test.mjs'
v=t.read_text(encoding='utf-8').replace('Relay · Rhythm builder','Relay · Posting Rhythms').replace("'Test rhythm'","'Preview rhythm'").replace("'New rhythm');","'Posting Rhythms');").replace("app.$('#page-title').textContent, 'Share the original'","app.$('#page-title').textContent, 'Posting Rhythms'").replace('snippet','draft').replace('Snippet','Draft')
v=v.replace("app.click('#test-toggle');\n  assert.equal(app.window.document.activeElement.id, 'test-heading');","app.click('#test-toggle');\n  assert.equal(app.window.document.activeElement.id, 'preview-heading');\n  app.$('#sample-execution').open = true;")
v+='''

test('preview shows dependency branches and treatments without changing saved configuration', t => {
  const app = editor(t); app.click('#load-example'); const saved = app.save();
  app.click('#test-toggle');
  assert.equal(app.$('#rhythm-preview').open, true);
  assert.equal(app.window.document.activeElement.id, 'preview-heading');
  assert.equal(app.$('#sample-execution').open, false);
  assert.equal(app.window.document.querySelectorAll('.flow-release').length, 3);
  assert.equal(app.window.document.querySelectorAll('#rhythm-flow > .flow-branches > li').length, 2);
  assert.match(app.$('.flow-branches .flow-branches .flow-route-head').textContent, /Release 1/);
  assert.ok(app.$('.mock-art.frosted'));
  assert.match(app.$('#rhythm-flow').textContent, /No match → Skip/);
  assert.deepEqual(JSON.parse(app.window.localStorage.getItem(STORE)), saved);
  app.click('#test-close');
  assert.equal(app.$('#rhythm-preview').open, false);
  assert.equal(app.window.document.activeElement.id, 'test-toggle');
});

test('unconnected logos remain unavailable and cannot enter the destination configuration', t => {
  const app = editor(t);
  const logos = [...app.window.document.querySelectorAll('.unconnected-platform')];
  assert.equal(logos.length, 3);
  for (const logo of logos) { assert.equal(logo.disabled, true); logo.click(); }
  assert.deepEqual(app.save().routes[0].destinations, ['x-main', 'da-main']);
});
'''
t.write_text(v,encoding='utf-8')
