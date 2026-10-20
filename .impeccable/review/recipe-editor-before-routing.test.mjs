import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';

const html = await readFile(new URL('./recipe-editor.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const STORE = 'relay-posting-recipe-demo-v2';
const WORK = 'relay-recipe-working-draft';
const DRAFTS = 'relay-recipe-description-drafts';
function editor(t, storage = {}) {
  const window = new Window({ url: 'http://127.0.0.1:8879', settings: { enableJavaScriptEvaluation: true } });
  t.after(() => window.happyDOM.abort());
  window.document.write(html.replace(/<script>[\s\S]*?<\/script>/, ''));
  for (const [key, value] of Object.entries(storage)) window.localStorage.setItem(key, JSON.stringify(value));
  window.eval(script);
  const $ = selector => window.document.querySelector(selector);
  const click = selector => { assert.ok($(selector), selector); $(selector).click(); };
  const change = (selector, value, event = 'change') => {
    const el = $(selector); assert.ok(el, selector);
    if (el.type === 'checkbox') el.checked = value; else el.value = value;
    el.dispatchEvent(new window.Event(event, { bubbles: true }));
  };
  const save = () => { click('#save-entry'); change('#recipe-name', 'Test recipe', 'input'); click('#save-recipe'); return JSON.parse(window.localStorage.getItem(STORE)); };
  return { window, $, click, change, save };
}

test('inspecting Teaser settings preserves enabled state and saved acknowledgement', t => {
  const app = editor(t);
  app.change('#r1-teaser', true);
  app.save();
  app.click('[data-action="teaser-settings"]');
  assert.equal(app.$('#r1-teaser').checked, true);
  assert.equal(app.$('#draft-badge').textContent, 'Saved');
  assert.equal(app.$('#r1-settings').hidden, false);
  app.click('[data-action="done"]');
  assert.equal(app.$('#r1-teaser').checked, true);
});

test('Save exposes invalid trigger controls and focuses visible errors', t => {
  const app = editor(t);
  app.change('#source', ''); app.click('#save-entry');
  assert.equal(app.window.document.activeElement.id, 'source');
  assert.match(app.$('#trigger-error').textContent, /connected source/);
  app.change('#source', 'patreon-main'); app.change('#filter-text-on', true);
  app.click('#save-entry');
  assert.equal(app.$('#filter-tray').hidden, false);
  assert.equal(app.window.document.activeElement.id, 'filter-text');
  assert.match(app.$('#trigger-error').textContent, /text to match/);
  app.change('#filter-text', '$relay', 'input'); app.change('#filter-link-on', true);
  app.change('#filter-link', 'invalid', 'input'); app.click('#save-entry');
  assert.equal(app.window.document.activeElement.id, 'filter-link');
  assert.match(app.$('#trigger-error').textContent, /valid HTTPS/);
});

test('saving and one-time confirmation move focus to visible success', t => {
  const app = editor(t); app.save();
  assert.equal(app.$('#save-tray').hidden, true);
  assert.equal(app.$('#saved-result').hidden, false);
  assert.equal(app.window.document.activeElement.id, 'saved-result');
  app.click('#confirm-open'); app.$('#confirm-once').focus(); app.click('#confirm-once');
  assert.equal(app.$('#confirm-tray').hidden, true);
  assert.match(app.$('#saved-result').textContent, /Plan confirmed/);
  assert.equal(app.window.document.activeElement.id, 'saved-result');
});

test('final preferences and example loading reset the saved badge', t => {
  const app = editor(t); app.save();
  app.click('#save-entry'); app.change('#use-default', true);
  assert.equal(app.$('#draft-badge').textContent, 'Draft');
  app.click('#save-recipe'); app.click('#save-entry'); app.change('#always-on', true);
  assert.equal(app.$('#draft-badge').textContent, 'Draft');
  app.click('#save-recipe'); app.click('#save-entry'); app.change('#recipe-name', 'Renamed', 'input');
  assert.equal(app.$('#draft-badge').textContent, 'Draft');
  app.click('#save-recipe'); app.click('#load-example');
  assert.equal(app.$('#draft-badge').textContent, 'Draft');
  assert.equal(app.$('#local-status').textContent, 'Not saved');
});

test('release selection is presentation-only and only one editor is exposed', t => {
  const app = editor(t); app.click('#load-example'); const original = app.save();
  app.click('#r2-toggle');
  assert.equal(app.window.document.querySelectorAll('.release-body:not([hidden])').length, 1);
  assert.equal(app.$('#r2-content').hidden, false);
  assert.equal(app.$('#draft-badge').textContent, 'Saved');
  assert.deepEqual(JSON.parse(app.window.localStorage.getItem(STORE)), original);
});

test('publication receipt unlocks only the matching destination and retains keyboard focus', t => {
  const app = editor(t); app.click('#load-example'); app.click('#test-toggle');
  assert.equal(app.window.document.activeElement.id, 'test-heading');
  app.click('[data-sim-action="r1|x-main"]'); app.click('#sim-handoff');
  assert.equal(app.window.document.activeElement.id, 'receipt-time');
  assert.match(app.$('#sim-body').textContent, /Waiting for publication/);
  app.click('#sim-confirm');
  const rows = app.window.document.querySelectorAll('#sim-body tr');
  assert.match(rows[2].textContent, /Ready for review/);
  assert.match(rows[3].textContent, /Waiting for publication/);
  assert.equal(app.window.document.activeElement.id, 'test-heading');
});

test('future posts cannot edit missing original copy; available source seeds once', t => {
  const app = editor(t);
  assert.equal(app.$('#r1-description-mode option[value="custom"]').disabled, true);
  app.change('#artwork-context', 'uploaded'); app.change('#r1-description-mode', 'custom');
  assert.match(app.$('#r1-xtext').value, /moon garden/);
  app.change('#r1-xtext', 'My edited description <literal>', 'input');
  app.change('#r1-description-mode', 'source'); app.change('#r1-description-mode', 'custom');
  assert.equal(app.$('#r1-xtext').value, 'My edited description <literal>');
});

test('editing saved text creates a separate draft and never mutates the original', t => {
  const app = editor(t); app.change('#r1-description-mode', 'saved'); app.click('[data-action="edit-draft"]');
  app.change('#r1-draft-xtext', 'Different promotional text', 'input'); app.click('[data-action="save-draft"]');
  const library = JSON.parse(app.window.localStorage.getItem(DRAFTS));
  assert.match(library.promotion.x, /little preview/);
  assert.equal(library.draft1.x, 'Different promotional text');
  const config = app.save(); assert.equal(config.routes[0].preset, 'draft1');
});

test('dependent deletion is protected; independent deletion supports undo', t => {
  const app = editor(t); app.click('#load-example');
  app.click('[data-action="remove"][data-route="r1"]');
  assert.equal(app.window.document.querySelectorAll('.release').length, 3);
  assert.match(app.$('#route-error').textContent, /waits for this post/);
  app.click('[data-action="remove"][data-route="r3"]');
  assert.equal(app.window.document.querySelectorAll('.release').length, 2);
  app.click('#undo-change');
  assert.equal(app.window.document.querySelectorAll('.release').length, 3);
});

test('working draft recovery is distinct from a saved recipe', async t => {
  const app = editor(t); app.change('#r1-days', '4');
  await new Promise(resolve => setTimeout(resolve, 240));
  const working = JSON.parse(app.window.localStorage.getItem(WORK));
  assert.equal(working.routes[0].days, 4);
  assert.equal(app.window.localStorage.getItem(STORE), null);
  const recovered = editor(t, { [WORK]: working });
  assert.equal(recovered.$('#r1-days').value, '4');
  assert.notEqual(recovered.$('#draft-badge').textContent, 'Saved');
});

test('calendar rules handle leap months and hold past-relative targets', t => {
  const app = editor(t); const cfg = app.save();
  cfg.routes[0].schedule = 'last_next';
  const calendar = editor(t, { [STORE]: cfg }); calendar.click('#test-toggle');
  calendar.change('#sample-date', '2028-01-18T14:00');
  assert.match(calendar.$('#sim-body').textContent, /29 Feb/);
  calendar.change('#r1-schedule', 'first_current'); calendar.click('#test-toggle');
  assert.match(calendar.$('#sim-body').textContent, /Choose a later date/);
  assert.equal(calendar.$('[data-sim-action]'), null);
});

test('save Default and Always on do not change review authority or publish', t => {
  const app = editor(t);
  app.window.fetch = () => { throw new Error('Demo must not call the network'); };
  app.click('#save-entry'); app.change('#recipe-name', 'Reusable recipe', 'input');
  app.change('#use-default', true); app.change('#always-on', true); app.click('#save-recipe');
  const cfg = JSON.parse(app.window.localStorage.getItem(STORE));
  assert.equal(cfg.useDefault, true); assert.equal(cfg.alwaysOn, true);
  assert.match(app.$('#saved-result').textContent, /Review required/);
});
