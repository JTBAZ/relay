import { readFile, writeFile } from 'node:fs/promises';

const base = new URL('./mocks/decision/open-studio.html', import.meta.url);
const target = new URL('./mocks/decision/open-studio-refined.html', import.meta.url);
let html = await readFile(base, 'utf8');
html = html.replace('<title>Relay · Open Studio concept</title>', '<title>Relay · Open Studio refinement</title>');
const css = `
.conversation{height:265px;display:block;padding:36px 36px 37px}
.chat-area{min-width:0;max-width:none;width:100%;height:100%;margin:0}
.composer{width:100%;height:100%;margin:0;border-radius:28px;padding:22px 24px 17px;display:flex;flex-direction:column;background:#111a15;border-color:#3d5546}
.composer textarea{display:block;flex:1;min-height:50px;width:100%;border:0;resize:none;background:transparent;color:var(--ink);font:18px/1.5 Arial,sans-serif;outline:0;caret-color:var(--mint)}
.composer textarea::placeholder{color:#92a497;opacity:.78;transition:opacity 180ms ease-out}.composer textarea.example-changing::placeholder{opacity:0}.composer:focus-within{outline:2px solid var(--mint);outline-offset:2px}
@media(prefers-reduced-motion:reduce){.composer textarea::placeholder{transition:none}}
.compose-actions{margin-top:8px;gap:0}.add-file{display:grid;place-items:center;width:32px;height:32px;padding:5px;border-radius:7px;color:var(--muted)}
.add-file .icon{width:21px;height:21px}.add-file:hover{background:#24362a;color:var(--ink)}.send{width:30px;height:30px}
.thumbnail{height:95px}.library-head{margin-bottom:15px}.toolbar{margin-bottom:17px}.gallery{gap:17px 14px}.gallery-clear{font-size:11px;color:var(--muted);padding:4px 0 4px 10px}.footer{margin-top:16px}
.rail .legend{bottom:18px}.rail .agenda-end{padding-top:13px}.rail .day{margin-bottom:20px}
`;
html = html.replace('</style>', `${css}</style>`);
const examples = [
  'Find everything with a sketch tag and make a plan to post it in batches to Twitter.',
  'Set up a schedule to automatically post a teaser from my Patreon to Twitter each month.',
  "Find every work in my gallery that mentions my character in the description and give it the tag 'Hero School'.",
  'Show me everything I posted last December.'
];
const conversation = `<section class="conversation" aria-label="Conversational editor">
<div class="chat-area"><div class="composer"><textarea aria-label="Message Relay" placeholder="${examples[0]}"></textarea><div class="compose-actions"><button type="button" class="add-file" aria-label="Attach files" title="Attach files"><svg class="icon" aria-hidden="true"><use href="#plus"/></svg></button><button type="button" class="send" aria-label="Send message" title="Send message"><svg class="icon" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6"/></svg></button></div></div></div>
</section>`;
html = html.replace(/<section class="conversation"[\s\S]*?<\/section>/, conversation);
html = html.replace(/<symbol id="(?:link|paper)"[\s\S]*?<\/symbol>/g, '');
html = html.replace('aria-label="Artist account">JM', 'aria-label="Artist account">AV');
html = html.replace('<span class="count">2 selected</span><button class="review">Review selection<svg class="icon"><use href="#arrow"/></svg></button>', '<span class="count">8 selected</span><button type="button" class="gallery-clear">Clear selection</button>');
const selected = new Set([0, 1, 2, 3, 4, 6, 9, 12]);
let index = 0;
html = html.replace(/<article class="art(?: selected)?">[\s\S]*?<\/article>/g, (article) => {
  const active = selected.has(index++);
  article = article.replace('class="art selected"', 'class="art"').replace(/<span class="check"[\s\S]*?<\/span>/, '');
  if (active) article = article.replace('class="art"', 'class="art selected"').replace('</div><h3>', '</div><span class="check" aria-label="Selected"><svg class="icon"><use href="#tick"/></svg></span><h3>');
  return article;
});
html = html.replace('Concept sketch · Sample content', 'Refined sketch · Sample content');
html = html.replace('</body>', `<script>
(() => {
  const input = document.querySelector('.composer textarea');
  const composer = input.closest('.composer');
  const examples = ${JSON.stringify(examples)};
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let index = 0, timer, fadeTimer, hovered = false;
  function pause() {
    clearTimeout(timer); clearTimeout(fadeTimer);
    input.classList.remove('example-changing');
  }
  function resume() {
    pause();
    if (document.hidden || reducedMotion.matches || hovered || composer.contains(document.activeElement) || input.value) return;
    timer = setTimeout(() => {
      input.classList.add('example-changing');
      fadeTimer = setTimeout(() => {
        index = (index + 1) % examples.length;
        input.placeholder = examples[index];
        input.classList.remove('example-changing');
        resume();
      }, 180);
    }, 4500);
  }
  composer.addEventListener('focusin', pause);
  composer.addEventListener('focusout', () => setTimeout(resume, 0));
  composer.addEventListener('mouseenter', () => { hovered = true; pause(); });
  composer.addEventListener('mouseleave', () => { hovered = false; resume(); });
  input.addEventListener('input', resume);
  document.addEventListener('visibilitychange', resume);
  reducedMotion.addEventListener('change', resume);
  resume();
})();
</script></body>`);
await writeFile(target, html, 'utf8');
console.log('Wrote .impeccable/mocks/decision/open-studio-refined.html');
