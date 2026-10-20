from pathlib import Path

p=Path('docs/studio/posting-recipe-build-plans/demo/recipe-editor.html')
s=p.read_text(encoding='utf-8')
s=s.replace('<span class="label">Match all</span>', '<span class="label">Only when all filters match</span>')
old='''      if(settingsOpen&&trayKind==='coach')settings=`<label><span class="label">Coach notes</span><input id="${r.id}-notes" data-r="${r.id}" data-field="notes" value="${esc(r.notes)}" maxlength="1000" placeholder="Keep the tone understated"></label>`;'''
new='''      if(settingsOpen&&trayKind==='coach')settings=`<div class="fields"><label><span class="label">Help me with</span><select id="${r.id}-goal" data-r="${r.id}" data-field="coachGoal"><option value="engagement_optimization">Engagement</option></select></label><label><span class="label">Anything else? · optional</span><input id="${r.id}-notes" data-r="${r.id}" data-field="notes" value="${esc(r.notes)}" maxlength="1000" placeholder="Keep the tone understated"></label></div>`;'''
assert old in s
s=s.replace(old,new).replace('aria-label="Coach notes for release ${i+1}"', 'aria-label="Coach goal for release ${i+1}: Engagement"').replace("${!r.coach?'disabled':''}>Notes${icon('chevron')}", "${!r.coach?'disabled':''}>Engagement${icon('chevron')}")
for a,b in [('Use saved description','Use snippet'),('Saved description for post','Snippet for post'),("'Saved description'","'Snippet'"),('Saved description ·','Snippet ·'),('Draft name','Snippet name'),('My new description','My new snippet'),('Save as new draft','Save as new snippet'),('Save draft','Save snippet'),('Edit draft','Edit snippet'),('New draft','New snippet'),('Name this draft.','Name this snippet.'),('32 saved drafts','32 snippets'),('save or cancel draft changes','save or cancel snippet changes'),('Draft saved in this browser.','Snippet saved in this browser.'),('Draft ready in this tab.','Snippet ready in this tab.')]:
 s=s.replace(a,b)
css='''
.release-header .target{min-height:46px;padding:10px 12px;font-size:14px;font-weight:650}.release-header .target .platform-logo{width:21px;height:21px}.release-header .target .handle{font-size:13px;font-weight:400}.modifier-line{justify-content:flex-start;gap:14px}.modifier-line .check{min-width:86px}.modifier-line .subtle-btn{max-width:none;text-align:left}.modifiers{width:fit-content;max-width:100%}
input[type=checkbox]{appearance:none;-webkit-appearance:none;display:inline-block;width:17px;height:17px;min-height:17px;padding:0;border:1px solid var(--border-hi);border-radius:4px;background:var(--input);cursor:pointer;flex:none}input[type=checkbox]:checked{background:var(--green);border-color:var(--green)}input[type=checkbox]:hover{border-color:var(--blue)}
@media(forced-colors:active){input[type=checkbox]{forced-color-adjust:none;background:Canvas;border-color:CanvasText}input[type=checkbox]:checked{background:Highlight;border-color:Highlight}}
@media(max-width:650px){.release-header .target{min-height:46px;padding:9px 10px;font-size:14px}.modifier-line{gap:12px}}
'''
s=s.replace('@media(prefers-reduced-motion:reduce)',css+'\n@media(prefers-reduced-motion:reduce)')
p.write_text(s,encoding='utf-8',newline='\n')
