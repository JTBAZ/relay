(() => {
  const filters = { image: true, textEnabled: false, text: '', linkEnabled: false, link: '' };
  const tray = document.querySelector('[data-filter-tray]');
  const filterToggle = document.querySelector('[data-filter-toggle]');
  const chipsHost = document.querySelector('[data-filter-chips]');
  const feedback = document.querySelector('[data-feedback]');

  const escapeText = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const getChips = () => [
    filters.image ? ['image', 'Contains image'] : null,
    filters.textEnabled ? ['text', `Text: ${filters.text}`] : null,
    filters.linkEnabled ? ['link', `Link: ${filters.link}`] : null
  ].filter(Boolean);

  function renderFilterChips() {
    const host = document.querySelector('[data-filter-chips]');
    host.innerHTML = getChips().map(([key, label]) => `<button type="button" class="filter-chip" data-remove-filter="${key}" aria-label="Remove ${escapeText(label)} filter">${escapeText(label)} <span aria-hidden="true">×</span></button>`).join('');
  }

  function syncFilterInputs(focusName) {
    tray.innerHTML = `<div class="filter-option"><label class="check"><input type="checkbox" name="image" ${filters.image ? 'checked' : ''}>Contains image</label></div>
      <div class="filter-option"><label class="check"><input type="checkbox" name="textEnabled" ${filters.textEnabled ? 'checked' : ''}>Text contains</label>${filters.textEnabled ? `<input class="filter-input" name="text" aria-label="Text contains" placeholder="Words to match" maxlength="200" value="${escapeText(filters.text)}">` : ''}</div>
      <div class="filter-option"><label class="check"><input type="checkbox" name="linkEnabled" ${filters.linkEnabled ? 'checked' : ''}>Link matches</label>${filters.linkEnabled ? `<input class="filter-input" name="link" aria-label="Link matches" placeholder="patreon.com/ava" maxlength="500" value="${escapeText(filters.link)}">` : ''}</div>
      <div class="filter-actions"><span class="quiet">Match all filters</span><button type="button" data-filter-done>Done</button></div>`;
    renderFilterChips();
    if (focusName) tray.querySelector(`[name="${focusName}"]`)?.focus({ preventScroll: true });
  }

  filterToggle.addEventListener('click', () => {
    tray.hidden = !tray.hidden;
    filterToggle.setAttribute('aria-expanded', String(!tray.hidden));
    if (!tray.hidden) tray.querySelector('input:not(:disabled)')?.focus({ preventScroll: true });
  });

  tray.addEventListener('change', event => {
    const { name, checked } = event.target;
    if (name === 'image') filters.image = checked;
    if (name === 'textEnabled') filters.textEnabled = checked;
    if (name === 'linkEnabled') filters.linkEnabled = checked;
    if (['image', 'textEnabled', 'linkEnabled'].includes(name)) syncFilterInputs(filters.textEnabled && name === 'textEnabled' ? 'text' : filters.linkEnabled && name === 'linkEnabled' ? 'link' : name);
  });
  tray.addEventListener('input', event => {
    if (event.target.name === 'text' || event.target.name === 'link') {
      const { name, value, selectionStart } = event.target;
      filters[name] = value;
      syncFilterInputs(name);
      const input = tray.querySelector(`[name="${name}"]`);
      input?.setSelectionRange(selectionStart, selectionStart);
    }
  });
  chipsHost.addEventListener('click', event => {
    const remove = event.target.closest('[data-remove-filter]');
    if (!remove) return;
    filters[remove.dataset.removeFilter === 'image' ? 'image' : remove.dataset.removeFilter === 'text' ? 'textEnabled' : 'linkEnabled'] = false;
    renderFilterChips();
    filterToggle.focus({ preventScroll: true });
  });
  tray.addEventListener('click', event => {
    if (!event.target.closest('[data-filter-done]')) return;
    const message = document.querySelector('[data-filter-error]');
    if (filters.textEnabled && !filters.text.trim()) {
      message.textContent = 'Enter text for this filter, or turn it off.';
      tray.querySelector('[name="text"]')?.focus({ preventScroll: true });
      return;
    }
    if (filters.linkEnabled && !filters.link.trim()) {
      message.textContent = 'Enter a link for this filter, or turn it off.';
      tray.querySelector('[name="link"]')?.focus({ preventScroll: true });
      return;
    }
    message.textContent = '';
    tray.hidden = true;
    filterToggle.setAttribute('aria-expanded', 'false');
    filterToggle.focus({ preventScroll: true });
  });
  tray.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    tray.hidden = true;
    filterToggle.setAttribute('aria-expanded', 'false');
    filterToggle.focus({ preventScroll: true });
    event.preventDefault();
    event.stopPropagation();
  });
  syncFilterInputs();

  document.querySelectorAll('[data-release]').forEach(release => {
    const body = release.querySelector('[data-release-body]');
    const toggle = release.querySelector('[data-release-toggle]');
    toggle.addEventListener('click', () => {
      const opening = body.hidden;
      if (opening && document.body.classList.contains('release-sequence')) {
        document.querySelectorAll('[data-release-body]').forEach(other => {
          other.hidden = true;
          other.closest('[data-release]').querySelector('[data-release-toggle]').setAttribute('aria-expanded', 'false');
        });
      }
      body.hidden = !opening;
      toggle.setAttribute('aria-expanded', String(!body.hidden));
      if (!body.hidden) body.querySelector('button, input, select')?.focus({ preventScroll: true });
    });
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const panel = event.target.closest('.settings-panel:not([hidden])');
    if (!panel) return;
    panel.hidden = true;
    const trigger = document.querySelector(`[aria-controls="${panel.id}"]`);
    trigger?.setAttribute('aria-expanded', 'false');
    trigger?.focus({ preventScroll: true });
    event.preventDefault();
    event.stopPropagation();
  });

  document.addEventListener('click', event => {
    const panelButton = event.target.closest('[data-panel-toggle]');
    if (panelButton) {
      const panel = document.getElementById(panelButton.getAttribute('aria-controls'));
      panel.hidden = !panel.hidden;
      panelButton.setAttribute('aria-expanded', String(!panel.hidden));
      return;
    }
    const imageButton = event.target.closest('[data-sample-image]');
    if (imageButton) {
      const frame = imageButton.closest('.teaser-layout').querySelector('.art-sample');
      frame.dataset.image = imageButton.dataset.sampleImage;
      imageButton.parentElement.querySelectorAll('[data-sample-image]').forEach(item => item.setAttribute('aria-pressed', String(item === imageButton)));
      return;
    }
    const destination = event.target.closest('[data-destination]');
    if (destination) {
      const active = destination.getAttribute('aria-pressed') === 'true';
      destination.setAttribute('aria-pressed', String(!active));
      refreshPlan();
      return;
    }
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'preview') feedback.textContent = 'Preview updated for this sketch. Nothing is prepared or published.';
    if (action === 'save') feedback.textContent = 'Saved in this sketch. Future posts still need review.';
    if (action === 'add-route') feedback.textContent = 'This comparison keeps the same two sample releases in each layout.';
  });

  document.addEventListener('change', event => {
    const control = event.target;
    if (control.matches('[data-style],[data-focus]')) {
      const panel = control.closest('.settings-panel');
      const frame = panel.querySelector('.art-sample');
      if (control.hasAttribute('data-style')) frame.dataset.style = control.value;
      if (control.hasAttribute('data-focus')) frame.dataset.focus = control.value;
      refreshPlan();
    }
    if (control.matches('[data-date-mode]')) {
      const release = control.closest('[data-release]');
      const delay = release.querySelector('[data-delay-wrapper]');
      const date = release.querySelector('[data-selected-date]');
      if (delay) delay.hidden = control.value !== 'delay';
      if (date) { date.hidden = control.value === 'delay'; date.textContent = control.options[control.selectedIndex].textContent; }
      refreshPlan();
    }
    if (control.matches('[data-coach-toggle]')) {
      const release = control.closest('[data-release]');
      const settings = release.querySelector('[data-panel="coach"]');
      const button = release.querySelector('[data-panel-toggle="coach"]');
      button.disabled = !control.checked;
      if (!control.checked) { settings.hidden = true; button.setAttribute('aria-expanded', 'false'); }
      refreshPlan();
    }
    if (control.matches('[data-teaser-toggle]')) {
      const release = control.closest('[data-release]');
      const settings = release.querySelector('[data-panel="teaser"]');
      const button = release.querySelector('[data-panel-toggle="teaser"]');
      button.disabled = !control.checked;
      if (!control.checked) { settings.hidden = true; button.setAttribute('aria-expanded', 'false'); }
      refreshPlan();
    }
    if (control.matches('[data-delay]')) {
      const unit = control.parentElement.querySelector('[data-day-unit]');
      if (unit) unit.textContent = Number(control.value) === 1 ? 'day' : 'days';
      refreshPlan();
    }
    if (control.matches('input[type="time"]')) refreshPlan();
    if (control.matches('[data-copy-mode]')) {
      const preview = control.closest('.description').querySelector('[data-description-preview]');
      preview.textContent = control.value === 'source' ? 'The original source description will be kept.' : control.value === 'edit' ? 'A sample description can be edited in this sketch.' : 'Choose a saved sample draft in a live workflow.';
    }
  });

  document.querySelectorAll('[data-teaser-toggle], [data-coach-toggle]').forEach(input => {
    const release = input.closest('[data-release]');
    const button = release.querySelector(`[data-panel-toggle="${input.hasAttribute('data-teaser-toggle') ? 'teaser' : 'coach'}"]`);
    button.disabled = !input.checked;
  });

  function refreshPlan() {
    document.querySelectorAll('[data-release]').forEach(release => {
      const id = release.dataset.release;
      const destinations = [...release.querySelectorAll('[data-destination][aria-pressed="true"]')].map(button => button.dataset.destination === 'x' ? 'X · Ava Studio' : 'DeviantArt · AvaArt').join(' + ') || 'No destination selected';
      const delay = release.querySelector('[data-delay]')?.value || '0';
      const dateMode = release.querySelector('[data-date-mode]')?.value || 'delay';
      const dateLabel = dateMode === 'delay' ? `After ${delay} ${Number(delay) === 1 ? 'day' : 'days'}` : release.querySelector('[data-date-mode] option:checked').textContent;
      const teaser = release.querySelector('[data-teaser-toggle]').checked;
      const coach = release.querySelector('[data-coach-toggle]').checked;
      const time = release.querySelector('input[type="time"]')?.value;
      const summary = `${dateLabel}${time ? ` · ${time}` : ''} · ${teaser ? 'Teaser' : 'Original'}${coach ? ' · Coach' : ''} · Keep original`;
      release.querySelector('[data-release-summary]').textContent = summary;
      document.querySelectorAll(`[data-plan-item="${id}"]`).forEach(item => {
        item.querySelector('.plan-route').textContent = destinations;
        item.querySelector('.plan-summary').textContent = summary;
      });
    });
  }
  refreshPlan();
})();
