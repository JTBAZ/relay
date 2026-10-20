from pathlib import Path
import re

p=Path('docs/studio/posting-recipe-build-plans/demo/recipe-editor.html')
s=p.read_text(encoding='utf-8')
s=s.replace('<p class="page-subtitle">Set the path once. Use it for every matching post.</p>', '')
s=s.replace('Only when all filters match', 'Match all')
s=s.replace('<p>Choose the text this release starts with.</p>', '')
s=s.replace('<p class="notice">Fictional accounts and artwork. No real publishing.</p>', '')
s=s.replace("'<p class=\"tiny muted description-note\">Uses your description when the post is uploaded.</p>'", "''")
s=s.replace('Preview original description', 'Preview text').replace('Preview descriptions', 'Preview text')
# The chosen preview type is both the displayed value and the disclosure control.
s=s.replace('aria-label="Teaser settings for release ${i+1}"', 'aria-label="Preview type for release ${i+1}: ${esc(r.template)}"')
s=s.replace("${r.media!=='preview'?'disabled':''}>Settings${icon('chevron')}", "${r.media!=='preview'?'disabled':''}>${esc(r.template)}${icon('chevron')}")
s=s.replace('aria-label="Coach settings for release ${i+1}"', 'aria-label="Coach notes for release ${i+1}"')
s=s.replace("${!r.coach?'disabled':''}>Settings${icon('chevron')}", "${!r.coach?'disabled':''}>Notes${icon('chevron')}")
s=s.replace('<span class="label">Image & assistance</span>', '<span class="label">Changes</span>')
a=s.index('      if(settingsOpen&&trayKind===\'teaser\')settings=')
b=s.index('      return `<article',a)
s=s[:a]+'''      if(settingsOpen&&trayKind==='teaser')settings=`<fieldset class="preview-types"><legend class="sr-only">Preview type</legend>${['Frosted teaser','Square crop','Censor stamp'].map((t,n)=>`<label class="preview-type ${r.template===t?'selected':''}"><input type="radio" name="${r.id}-preview-type" id="${r.id}-template-${n}" value="${t}" data-r="${r.id}" data-field="template" ${r.template===t?'checked':''}>${t}</label>`).join('')}</fieldset>`;
      if(settingsOpen&&trayKind==='coach')settings=`<label><span class="label">Coach notes</span><input id="${r.id}-notes" data-r="${r.id}" data-field="notes" value="${esc(r.notes)}" maxlength="1000" placeholder="Keep the tone understated"></label>`;
'''+s[b:]
s=re.sub(r'<p class="reference-line">.*?</p>', '', s)
s=re.sub(r'<p class="treatment-note">.*?</p>', '', s)
s=s.replace('<div class="row end"><button class="ghost small" data-action="done" data-route="${r.id}">Done</button></div>', '')
s=s.replace('<summary>Options${icon(\'chevron\')}</summary>', '<summary>${r.time===\'same\'?\'Time\':esc(r.time)}${earlier.length?` · ${r.anchor===\'source\'?\'Original post\':postLabel(earlier.find(p=>p.id===r.anchor))}`:\'\'}${icon(\'chevron\')}</summary>')
# Keep one test entry and one concise authority indicator in the persistent bar.
s=s.replace('<button id="test-entry" class="ghost">Test</button>', '')
s=s.replace("$('test-entry').disabled=$('test-toggle').disabled;", '')
s=s.replace("  $('test-entry').addEventListener('click',()=>$('test-toggle').click());\n", '')
s=s.replace('<span id="bar-status">Saving a recipe never publishes a post.</span>', '')
s=s.replace("$('bar-status').textContent=r.length?'Finish the highlighted settings before saving.':'Saving a recipe never publishes a post.';", '')
s=s.replace('<span id="finish-status" class="tiny muted">Ready for review</span>', '<span></span>')
s=s.replace("$('finish-status').textContent='Ready for review';", '')
s=s.replace('<span class="row tiny"><span data-icon="hand"></span>You finish posting on X and DeviantArt</span>', '')
# Preserve the single review-authority statement in the bar; the final summary is counts.
s=s.replace("destination posts · Review required`", "destination posts`")
css='''
.preview-types{display:flex;gap:10px;flex-wrap:wrap;margin:0;padding:0;border:0}.preview-type{display:flex;align-items:center;gap:9px;min-height:40px;padding:10px 13px;border:1px solid var(--border);border-radius:var(--control);cursor:pointer;background:var(--input)}.preview-type:hover{border-color:var(--border-hi)}.preview-type.selected{background:#1d342a;border-color:#557266}.preview-type:focus-within{outline:2px solid var(--blue);outline-offset:3px}.preview-type input{width:17px;height:17px;min-height:17px;accent-color:#4b9767;margin:0}.modifier-line .subtle-btn{max-width:72%;text-align:right}.action-status strong{white-space:nowrap}
@media(max-width:650px){.preview-types{display:grid}.action-status strong{white-space:normal}}
'''
s=s.replace('@media(prefers-reduced-motion:reduce)', css+'\n@media(prefers-reduced-motion:reduce)')
p.write_text(s,encoding='utf-8',newline='\n')
