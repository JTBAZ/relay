from pathlib import Path
p=Path('docs/studio/posting-recipe-build-plans/demo/recipe-editor.html')
s=p.read_text(encoding='utf-8')
start=s.index('<button class="subtle-btn" data-action="teaser-settings"')
end=s.index('</button>',start)+len('</button>')
button=s[start:end].replace('aria-controls="${r.id}-settings"','aria-controls="${r.id}-preview-menu"')
replacement='<div class="preview-picker">'+button+'<div class="preview-popover" id="${r.id}-preview-menu" ${settingsOpen&&trayKind===\'teaser\'?\'\':\'hidden\'}>${settingsOpen&&trayKind===\'teaser\'?settings:\'\'}</div></div>'
s=s[:start]+replacement+s[end:]
s=s.replace('<div class="settings-panel ${settingsOpen?\'fade\':\'\'}" id="${r.id}-settings" ${settingsOpen?\'\':\'hidden\'}>${settings}</div>', '<div class="settings-panel ${settingsOpen&&trayKind===\'coach\'?\'fade\':\'\'}" id="${r.id}-settings" ${settingsOpen&&trayKind===\'coach\'?\'\':\'hidden\'}>${settingsOpen&&trayKind===\'coach\'?settings:\'\'}</div>')
marker="  document.addEventListener('click',e=>{document.querySelectorAll('.timing-menu[open]')"
idx=s.index(marker)
s=s[:idx]+'''  function closePreviewMenu(restoreFocus=false){
    if(!expanded||trayKind!=='teaser')return;
    const route=expanded;expanded=null;$(route+'-preview-menu').hidden=true;
    const trigger=document.querySelector(`[data-action="teaser-settings"][data-route="${route}"]`);trigger?.setAttribute('aria-expanded','false');if(restoreFocus)trigger?.focus({preventScroll:true});
  }
  document.addEventListener('click',e=>{if(!e.target.closest('.preview-picker'))closePreviewMenu();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&e.target.closest('.preview-picker')){e.preventDefault();closePreviewMenu(true);}});
'''+s[idx:]
css='''
.preview-picker{position:relative;display:inline-flex;flex:none}.preview-popover{position:absolute;left:calc(100% + 10px);top:0;z-index:6;width:190px;padding:8px;background:#1d2b3b;border-radius:12px;box-shadow:0 12px 26px #0006;animation:reveal .16s var(--ease)}.preview-popover .preview-types{display:grid;gap:4px}.preview-popover .preview-type{padding:9px 10px;border-color:transparent;background:transparent;white-space:nowrap}.preview-popover .preview-type:hover{background:#2a3c50}.preview-popover .preview-type.selected{background:#1d342a;border-color:#557266}
@media(max-width:1000px){.preview-popover{left:auto;right:0;top:calc(100% + 6px)}}
'''
s=s.replace('@media(prefers-reduced-motion:reduce)',css+'\n@media(prefers-reduced-motion:reduce)')
p.write_text(s,encoding='utf-8',newline='\n')
