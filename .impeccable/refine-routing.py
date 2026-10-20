from pathlib import Path
import json

p = Path('docs/studio/posting-recipe-build-plans/demo/recipe-editor.html')
s = p.read_text(encoding='utf-8')
logos = json.loads(Path('.impeccable/routing-logo-paths.json').read_text(encoding='utf-8-sig'))
platforms = "  const platformPaths=" + json.dumps(logos, separators=(',', ':')) + ";\n"
platforms += '''  const platformIcon=name=>name==='patreon'?'<svg class="platform-logo patreon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="14.5" cy="9.5" r="6.5"/><rect x="3" y="3" width="3.5" height="18" rx="1"/></svg>':`<svg class="platform-logo ${name}" viewBox="0 0 24 24" aria-hidden="true"><path d="${platformPaths[name]}"/></svg>`;
'''
s = s.replace('  const accounts=[', platforms+'  const accounts=[')
s = s.replace("const paths={plus:", "const paths={library:'M2 3h4v11H2zM7 3h3v11H7zM11 4l3-1 2 10-3 1z',plus:")
s = s.replace('<p id="sequence-summary">Each release keeps its own timing and treatment.</p>', '')
s = s.replace("$('notify-email').setAttribute('aria-pressed'", "$('source-logo').innerHTML=cfg.source?platformIcon('patreon'):'';$('source').classList.toggle('has-logo',!!cfg.source);$('notify-email').setAttribute('aria-pressed'")
# Keep the row's destination controls in the reading path, ahead of its details.
start = s.index('      return `<article class="release ')
end = s.index("    }).join('');", start)
old = s[start:end]
target_start = old.index('<fieldset class="field-group">')
target_end = old.index('</fieldset>', target_start)+len('</fieldset>')
targets = old[target_start:target_end].replace('<fieldset class="field-group">','<fieldset class="field-group release-destinations">').replace('<legend class="label">Also send it to…</legend>', '<legend class="sr-only">Destinations for release ${i+1}</legend>').replace('<span class="platform-dot"></span>', "${platformIcon(a.cls==='da'?'deviantart':a.cls)}")
body_start = old.index('<div id="${r.id}-content"')
body = old[body_start:].replace(targets, '') # original string differs; strip exact original next
body = body.replace(old[target_start:target_end], '')
header = '''      return `<article class="release ${active?'is-active':''} ${newRouteId===r.id?'is-new':''}" data-route-id="${r.id}"><span class="release-number" aria-hidden="true">${i+1}</span><div class="release-header">'''+targets+'''<button class="release-toggle" data-action="edit-release" data-route="${r.id}" id="${r.id}-toggle" aria-label="${active?'Hide':'Edit'} release ${i+1} details. ${esc(destinations)}. ${esc(timeSentence(r))}" aria-expanded="${active}" aria-controls="${r.id}-content"><span>Details</span><span class="release-chevron">${icon('chevron')}</span></button>${cfg.routes.length>1?`<button class="icon-btn subtle-btn" data-action="remove" data-route="${r.id}" aria-label="Remove release ${i+1}">${icon('trash')}</button>`:''}${active?'':`<div class="release-context"><span>${esc(timeSentence(r))}</span><span>${r.media==='preview'?'Teaser':'Original image'} · ${r.copy==='saved'?'Saved description':esc(copyLabel)}${r.coach?' · Coach on':''}</span></div>`}${routeProblems.length?'<span class="error small release-problem">Needs attention</span>':''}</div>'''
s = s[:start]+header+body+s[end:]
s = s.replace("const name=r.media==='preview'?'Preview release':'Original artwork',destinations=", 'const destinations=')
# Inline hub wraps the complete trigger-and-destination flow; configuration schema stays unchanged.
hub = '''  function closeRecipes(){reveal('recipe-hub',false);$('recipes-toggle').setAttribute('aria-expanded','false');$('recipes-toggle').focus({preventScroll:true});}
  function refreshRecipes(){
    $('recipe-hub-error').textContent='';let stored=null;try{const value=JSON.parse(localStorage.getItem(STORE)||'null');if(validStored(value))stored=value;}catch{}
    $('load-saved').disabled=!stored;$('saved-recipe-name').textContent=stored?.name||'No saved recipe yet';return stored;
  }
  $('recipes-toggle').addEventListener('click',()=>{const open=$('recipe-hub').hidden;if(!open){closeRecipes();return;}refreshRecipes();reveal('recipe-hub',true);$('recipes-toggle').setAttribute('aria-expanded','true');$('recipes-close').focus({preventScroll:true});});
  $('recipes-close').addEventListener('click',closeRecipes);
  $('recipe-hub').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();closeRecipes();}});
  $('load-saved').addEventListener('click',()=>{const stored=refreshRecipes();if(!stored){$('recipe-hub-error').textContent='Save a recipe in this browser first.';return;}rememberUndo();cfg=clone(stored);normaliseLoaded();draftEditor=null;expanded=null;phase=1;saved=true;sim=null;hydrate();['filter-tray','test-panel','save-tray','confirm-tray','saved-result'].forEach(id=>reveal(id,false));$('filter-toggle').setAttribute('aria-expanded','false');$('test-toggle').setAttribute('aria-expanded','false');queueWorking();closeRecipes();toast('Saved recipe loaded.');});
  $('load-original').addEventListener('click',()=>{$('reset-demo').click();cfg.name='Share the original';hydrate();queueWorking();closeRecipes();toast('Template loaded.');});
  $('new-recipe').addEventListener('click',()=>{$('reset-demo').click();closeRecipes();});
'''
s = s.replace("  $('load-example').addEventListener('click',()=>{", hub+"  $('load-example').addEventListener('click',()=>{")
s = s.replace("queueWorking();toast('Example loaded.');", "queueWorking();closeRecipes();toast('Template loaded.');")
# Put source, destinations and editing controls in one visual grammar; no second route title.
css = '''
.source-account{position:relative}.source-account #source-logo{position:absolute;left:12px;top:50%;transform:translateY(-50%);display:flex;pointer-events:none}.source-account select.has-logo{padding-left:42px}.platform-logo{width:18px;height:18px;fill:currentColor;flex:none}.platform-logo.patreon{color:#ff8b78}.platform-logo.x{color:#d6e7fb}.platform-logo.deviantart{color:#89dcac}
.recipe-hub{margin-bottom:24px}.recipe-list{display:grid;gap:8px;margin-top:18px}.recipe-list>.label{margin:14px 0 0}.recipe-choice{width:100%;justify-content:space-between;padding:13px 15px;text-align:left}.recipe-choice>span:first-child{display:grid;gap:4px;min-width:0}.recipe-choice strong{font-size:14px;overflow-wrap:anywhere}.recipe-choice .small{font-weight:400;overflow-wrap:anywhere}.recipe-list>.subtle-btn{justify-self:start}.release-header{padding:16px 18px;gap:8px;flex-wrap:wrap}.release-destinations{flex:1;min-width:0}.release-toggle{flex:none;padding:8px 10px;min-height:40px;border-radius:9px;color:var(--blue);font-size:13px;font-weight:500}.release-toggle:hover{background:#26364a}.release-body .route-grid{grid-template-columns:1fr 1fr}.release-body .field-group:last-child{grid-column:auto}.release-context{flex-basis:100%;display:flex;flex-wrap:wrap;gap:4px 18px;color:var(--muted);font-size:13px;margin-top:2px;overflow-wrap:anywhere}.release-context span{min-width:0}.release-problem{flex-basis:100%}.release-number{top:22px}
@media(max-width:1000px){.release-body .modifiers{display:block}.release-body .modifier-line+.modifier-line{margin-top:6px}.release-body .treatment-note{margin-top:12px}}
@media(max-width:650px){.release-header{padding:13px 12px;gap:6px}.release-header .release-destinations{flex-basis:calc(100% - 88px)}.release-header .targets{gap:6px}.release-header .target{padding:8px;font-size:13px;max-width:100%}.release-header .target>span{min-width:0;overflow-wrap:anywhere}.release-header .handle{display:block}.release-toggle{padding:8px;gap:5px}.release-toggle>span:first-child{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}.release-body .route-grid{grid-template-columns:1fr}.release-context{display:grid;gap:4px}.release-number{top:20px}.recipe-choice{gap:12px}}
'''
s = s.replace('@media(prefers-reduced-motion:reduce)', css+'\n@media(prefers-reduced-motion:reduce)')
p.write_text(s,encoding='utf-8',newline='\n')
