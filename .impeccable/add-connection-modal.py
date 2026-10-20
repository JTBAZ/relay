from pathlib import Path
p=Path('docs/studio/posting-recipe-build-plans/demo/recipe-editor.html')
s=p.read_text(encoding='utf-8')
Path('.impeccable/review/before-connect-modal.html').write_text(s,encoding='utf-8')
s=s.replace('.unconnected-platform:disabled{opacity:.65}', '.unconnected-platform{opacity:.65}.unconnected-platform:hover{opacity:1;color:var(--fg);background:#26364a}')
s=s.replace('<button class="unconnected-platform" disabled aria-label="${name} · not connected" title="${name} · not connected">', '<button class="unconnected-platform" data-action="connect-platform" data-route="${r.id}" data-platform="${name}" aria-label="Connect ${name}" aria-haspopup="dialog" aria-controls="connect-account" title="Connect ${name}">')
# Share the native dialog surface and motion with the rhythm preview.
s=s.replace('#rhythm-preview{', ':is(#rhythm-preview,#connect-account){').replace('#rhythm-preview[open]{', ':is(#rhythm-preview,#connect-account)[open]{').replace('#rhythm-preview::backdrop{', ':is(#rhythm-preview,#connect-account)::backdrop{')
s=s.replace('@media(prefers-reduced-motion:reduce)', '#connect-account{width:min(440px,calc(100vw - 32px))}.connection-service{display:flex;align-items:center;gap:14px;margin-bottom:18px}.connection-service>.platform-logo{width:42px;height:42px;fill:var(--fg)}.connection-service strong{display:block;font-size:16px}.connection-service span{display:block;color:var(--muted);font-size:13px}.connection-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:24px}.connection-result{display:flex;align-items:center;gap:9px;color:var(--mint);margin-top:18px}.connection-note{color:var(--muted);max-width:42ch}.connection-dialog .preview-heading{flex:none}.connection-dialog .preview-content{padding:24px}\n@media(prefers-reduced-motion:reduce)',1)
dialog='<dialog id="connect-account" class="connection-dialog" aria-labelledby="connect-heading" aria-describedby="connect-note"><div class="preview-heading"><h2 id="connect-heading" tabindex="-1">Connect account</h2><button id="connect-close" class="icon-btn ghost" aria-label="Close connection"><span data-icon="close"></span></button></div><div class="preview-content"><div class="connection-service"><span id="connect-logo" aria-hidden="true"></span><div><strong id="connect-platform-name"></strong><span id="connect-account-status">Not connected</span></div></div><p id="connect-note" class="connection-note"></p><div id="connect-result" class="connection-result" role="status" hidden><span data-icon="check"></span><span>Demo account connected · @moonstudio</span></div><div class="connection-actions"><button id="connect-cancel" class="ghost">Cancel</button><button id="connect-confirm" class="primary">Connect account</button></div></div></dialog>\n'
s=s.replace('<script>\n',dialog+'<script>\n',1)
s=s.replace("    if(b.dataset.action==='edit-release')", "    if(b.dataset.action==='connect-platform'){openConnection(b);return;}\n    if(b.dataset.action==='edit-release')",1)
pos=s.index('  // Geometric sample artwork')
logic='''  let connectionOpener=null;
  function openConnection(button){
    const name=button.dataset.platform;if(!unconnectedPlatforms.includes(name))return;
    connectionOpener=button;
    $('connect-heading').textContent='Connect '+name;$('connect-platform-name').textContent=name;
    $('connect-logo').innerHTML=platformIcon(name.toLowerCase());$('connect-account-status').textContent='Not connected';
    $('connect-note').textContent=name==='Instagram'?'Instagram support is planned. This connection is a demo.':'This connection is a demo. No account access is requested.';
    $('connect-confirm').textContent='Connect '+name;$('connect-confirm').dataset.complete='false';
    reveal('connect-result',false);reveal('connect-cancel',true);$('connect-account').showModal();document.body.classList.add('preview-open');$('connect-heading').focus({preventScroll:true});
  }
  $('connect-confirm').addEventListener('click',()=>{
    if($('connect-confirm').dataset.complete==='true'){$('connect-account').close();return;}
    $('connect-account-status').textContent='@moonstudio · demo';reveal('connect-result',true);reveal('connect-cancel',false);
    $('connect-confirm').textContent='Done';$('connect-confirm').dataset.complete='true';
  });
  for(const id of ['connect-close','connect-cancel'])$(id).addEventListener('click',()=>$('connect-account').close());
  $('connect-account').addEventListener('close',()=>{document.body.classList.remove('preview-open');connectionOpener?.focus({preventScroll:true});connectionOpener=null;});
  $('connect-account').addEventListener('click',e=>{if(e.target===$('connect-account')){const b=e.target.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)e.target.close();}});
'''
s=s[:pos]+logic+s[pos:]
p.write_text(s,encoding='utf-8')
p=Path('docs/studio/posting-recipe-build-plans/demo/recipe-editor.test.mjs')
s=p.read_text(encoding='utf-8')
start=s.index("test('unconnected logos remain unavailable")
s=s[:start]+'''test('platform icons invite a demo connection without changing destination eligibility', t => {
  const app = editor(t);
  app.window.fetch = () => { throw new Error('Connection preview must stay local'); };
  const saved = app.save();
  for (const name of ['Instagram', 'Bluesky', 'Tumblr']) {
    const selector = `[data-action="connect-platform"][data-platform="${name}"]`;
    assert.equal(app.$(selector).disabled, false);
    app.click(selector);
    assert.equal(app.$('#connect-account').open, true);
    assert.equal(app.$('#connect-heading').textContent, 'Connect ' + name);
    assert.equal(app.window.document.activeElement.id, 'connect-heading');
    assert.equal(app.$('#connect-result').hidden, true);
    if (name === 'Instagram') assert.match(app.$('#connect-note').textContent, /support is planned/);
    app.click('#connect-confirm');
    assert.equal(app.$('#connect-result').hidden, false);
    assert.equal(app.$('#connect-confirm').textContent, 'Done');
    assert.match(app.$('#connect-account-status').textContent, /demo/);
    app.click('#connect-confirm');
    assert.equal(app.$('#connect-account').open, false);
    assert.equal(app.window.document.activeElement, app.$(selector));
  }
  assert.deepEqual(JSON.parse(app.window.localStorage.getItem(STORE)), saved);
  assert.deepEqual(app.save().routes[0].destinations, ['x-main', 'da-main']);
});

test('connection cancellation and dismissal reset the modal and return focus to its icon', t => {
  const app = editor(t), selector = '[data-action="connect-platform"][data-platform="Instagram"]';
  app.click(selector); app.click('#connect-cancel');
  assert.equal(app.$('#connect-account').open, false);
  assert.equal(app.window.document.activeElement, app.$(selector));
  app.click(selector); app.click('#connect-confirm'); app.click('#connect-close');
  app.click(selector);
  assert.equal(app.$('#connect-result').hidden, true);
  assert.equal(app.$('#connect-confirm').textContent, 'Connect Instagram');
  app.click('#connect-close');
  assert.equal(app.window.document.body.classList.contains('preview-open'), false);
});
'''
p.write_text(s,encoding='utf-8')
