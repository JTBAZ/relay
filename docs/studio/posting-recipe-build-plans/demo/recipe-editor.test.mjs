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

test('the editor consistently calls the complete workflow a rhythm', t => {
  const app = editor(t);
  assert.equal(app.window.document.title, 'Relay · Posting Rhythms');
  assert.equal(app.$('#recipes-toggle').textContent.trim(), 'Rhythms');
  assert.equal(app.$('#test-toggle').textContent.trim(), 'Preview rhythm');
  assert.equal(app.$('#save-entry').textContent.trim(), 'Save rhythm');
  assert.equal(app.$('#page-title').textContent, 'Posting Rhythms');
  app.save();
  assert.match(app.$('#saved-result').textContent, /Rhythm saved/);
  assert.equal(app.$('#finish-heading').textContent, 'Save this rhythm');
});

test('inspecting Teaser settings preserves enabled state and saved acknowledgement', t => {
  const app = editor(t);
  app.change('#r1-teaser', true);
  app.save();
  app.click('[data-action="teaser-settings"]');
  assert.equal(app.$('#r1-teaser').checked, true);
  assert.equal(app.$('#draft-badge').textContent, 'Saved');
  assert.equal(app.$('#r1-preview-menu').hidden, false);
  app.click('[data-action="teaser-settings"]');
  assert.equal(app.$('#r1-teaser').checked, true);
});

test('preview selection appears on its disclosure without duplicate helper copy', t => {
  const app = editor(t); app.change('#r1-teaser', true);
  app.click('[data-action="teaser-settings"]');
  app.change('#r1-template-1', 'Square crop');
  assert.match(app.$('[data-action="teaser-settings"]').textContent, /Square crop/);
  assert.equal(app.$('#r1-teaser').checked, true);
  assert.equal(app.$('.treatment-note'), null);
  assert.equal(app.$('.reference-line'), null);
  assert.equal(app.$('.description-heading p'), null);
  assert.equal(app.$('#test-entry'), null);
  assert.equal(app.$('.page-subtitle'), null);
  app.click('[data-action="teaser-settings"]');
  assert.equal(app.$('#r1-preview-menu').hidden, true);
  assert.equal(app.window.document.activeElement.dataset.action, 'teaser-settings');
});

test('preview menu stays beside its trigger and dismisses without consuming outside actions', t => {
  const app = editor(t); app.change('#r1-teaser', true);
  app.click('[data-action="teaser-settings"]');
  assert.ok(app.$('#r1-preview-menu').closest('.modifier-line'));
  assert.equal(app.$('#r1-settings').hidden, true);
  app.$('#r1-template-0').dispatchEvent(new app.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(app.$('#r1-preview-menu').hidden, true);
  assert.equal(app.window.document.activeElement.dataset.action, 'teaser-settings');
  app.click('[data-action="teaser-settings"]'); app.click('#r1-coach');
  assert.equal(app.$('#r1-coach').checked, true);
  assert.equal(app.$('#r1-preview-menu').hidden, true);
  app.click('[data-action="teaser-settings"]'); app.click('#r1-toggle');
  assert.equal(app.$('#r1-content').hidden, true);
});

test('Coach keeps a bounded goal and optional notes; reusable copy is a draft', t => {
  const app = editor(t); app.change('#r1-coach', true);
  app.click('[data-action="coach-settings"]');
  assert.match(app.$('#r1-settings').textContent, /Help me with/);
  assert.equal(app.$('#r1-goal').value, 'engagement_optimization');
  app.change('#r1-notes', 'Keep the tone understated');
  app.change('#r1-description-mode', 'saved');
  assert.match(app.$('#r1-description-mode').textContent, /Use draft/);
  assert.match(app.$('[data-action="new-draft"]').textContent, /New draft/);
  const cfg = app.save();
  assert.equal(cfg.routes[0].coachGoal, 'engagement_optimization');
  assert.equal(cfg.routes[0].notes, 'Keep the tone understated');
  assert.equal(cfg.routes[0].copy, 'saved');
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

test('destinations lead every release while details never become recipe titles', t => {
  const app = editor(t); app.click('#load-example'); app.click('#r1-toggle');
  const row = app.$('[data-route-id="r1"]');
  assert.equal(row.querySelector('.release-header').firstElementChild.tagName, 'FIELDSET');
  assert.equal(row.querySelector('.release-destinations').textContent.includes('X'), true);
  assert.equal(row.querySelector('.release-context').textContent.includes('My promo text'), false);
  assert.equal(app.$('#source-logo svg').getAttribute('viewBox'), '0 0 24 24');
  assert.ok(row.querySelector('.platform-logo.x path').getAttribute('d').length > 20);
  assert.ok(row.querySelector('.platform-logo.deviantart path').getAttribute('d').length > 20);
  app.click('[data-action="destination"][data-route="r3"][data-account="da-main"]');
  assert.equal(app.$('#r3-content').hidden, true);
  app.click('#r3-toggle'); assert.equal(app.$('#r3-content').hidden, false);
});

test('recipe hub loads complete templates and a saved recipe without overwriting it', t => {
  const app = editor(t); app.click('#recipes-toggle');
  assert.equal(app.$('#recipe-hub').hidden, false);
  assert.equal(app.$('#load-saved').disabled, true);
  app.click('#load-example'); assert.equal(app.$('#recipe-hub').hidden, true);
  assert.equal(app.window.document.querySelectorAll('.release').length, 3);
  const saved = app.save(); app.click('#recipes-toggle'); app.click('#load-original');
  assert.equal(app.window.document.querySelectorAll('.release').length, 1);
  assert.equal(app.$('#r1-teaser').checked, false);
  assert.equal(app.$('#page-title').textContent, 'Posting Rhythms');
  app.click('#recipes-toggle'); app.click('#load-saved');
  assert.equal(app.window.document.querySelectorAll('.release').length, 3);
  assert.equal(app.$('#draft-badge').textContent, 'Saved');
  assert.equal(app.window.document.activeElement.id, 'recipes-toggle');
  assert.equal(app.window.localStorage.getItem(WORK), null);
  assert.deepEqual(JSON.parse(app.window.localStorage.getItem(STORE)), saved);
  app.click('#undo-change'); assert.equal(app.window.document.querySelectorAll('.release').length, 1);
});

test('publication receipt unlocks only the matching destination and retains keyboard focus', t => {
  const app = editor(t); app.click('#load-example'); app.click('#test-toggle');
  assert.equal(app.window.document.activeElement.id, 'preview-heading');
  app.$('#sample-execution').open = true;
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

test('platform icons invite a demo connection without changing destination eligibility', t => {
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
