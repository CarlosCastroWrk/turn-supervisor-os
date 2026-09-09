// Property portal page script. Lives in its own file on purpose: the site's
// Content-Security-Policy is script-src 'self', which forbids scripts written
// inside the HTML — an inline version of this file loaded but never ran, and
// Joseph and Paige saw four zeros. Keep every script for portal.html here.
(() => {
  const token = new URLSearchParams(location.search).get('k') || '';
  const LABELS = { approved: 'Approved', passed: 'Passed', 'crew-done': 'Crew done', working: 'Working', open: 'Released', none: '—' };
  const DONE = ['passed', 'approved'];
  let units = [];
  let filter = 'all';
  let query = '';
  const picked = new Set();

  const el = (id) => document.getElementById(id);

  // Everything rendered into innerHTML goes through esc() — unit numbers and
  // statuses come from the server payload, never trust them as markup.
  const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const tradeChip = (trade, status) =>
    `<span class="chip ${esc(status)}">${esc(trade)} ${esc(LABELS[status] || status)}</span>`;

  const matches = (u) => {
    if (query && !u.n.toLowerCase().includes(query)) return false;
    if (filter === 'all') return u.p !== 'none' || u.c !== 'none';
    if (filter === 'cb') return Boolean(u.cb);
    if (filter === 'ready') return u.p === 'passed' || u.c === 'passed' || (u.pr || 0) > 0 || (u.cr || 0) > 0;
    if (filter === 'paint-done') return DONE.includes(u.p);
    if (filter === 'clean-done') return DONE.includes(u.c);
    if (filter === 'approved') return u.p === 'approved' || u.c === 'approved';
    if (filter === 'working') return ['working', 'crew-done'].includes(u.p) || ['working', 'crew-done'].includes(u.c);
    return true;
  };

  const renderBar = () => {
    el('walkCount').textContent = `${picked.size} selected`;
    el('walkbar').classList.toggle('show', picked.size > 0);
  };

  const unitRow = (u) => `
      <div class="unit${picked.has(u.n) ? ' picked' : ''}" data-n="${esc(u.n)}">
        <strong>${esc(u.n)}${u.partial ? '<small style="color:#9b5b00"> partial</small>' : ''}</strong>
        <span class="chips">
          ${tradeChip('Paint', u.p)}
          ${tradeChip('Clean', u.c)}
          ${(u.pr || 0) > 0 && u.p !== 'passed' ? `<span class="chip passed">Paint · ${Number(u.pr)} room${u.pr === 1 ? '' : 's'} ready</span>` : ''}
          ${(u.cr || 0) > 0 && u.c !== 'passed' ? `<span class="chip passed">Clean · ${Number(u.cr)} room${u.cr === 1 ? '' : 's'} ready</span>` : ''}
          ${u.bk ? '<span class="chip open">On hold</span>' : ''}
          ${u.cb ? '<span class="chip cb">Callback</span>' : ''}
        </span>
      </div>`;

  // One home per unit, ordered the way a property manager reads the day:
  // needs attention -> ready for you -> moving -> waiting -> finished.
  const classify = (u) => {
    if (u.cb) return 'cb';
    if (u.p === 'passed' || u.c === 'passed' || (u.pr || 0) > 0 || (u.cr || 0) > 0) return 'ready';
    if (['working', 'crew-done'].includes(u.p) || ['working', 'crew-done'].includes(u.c)) return 'progress';
    if (u.bk) return 'hold';
    const active = [u.p, u.c].filter((s) => s !== 'none');
    if (active.length > 0 && active.every((s) => s === 'approved')) return 'done';
    return 'open';
  };

  const SECTIONS = [
    ['cb', '🔴 Callbacks'],
    ['ready', '🟢 Ready for your walk'],
    ['progress', '🔵 Being worked on'],
    ['hold', '🟠 On hold / blocked'],
    ['open', '⚪ Released — not started'],
    ['done', '✅ Fully approved'],
  ];

  const render = () => {
    const rows = units.filter(matches);
    if (filter === 'all') {
      el('list').innerHTML = SECTIONS.map(([key, label]) => {
        const group = rows.filter((u) => classify(u) === key);
        if (group.length === 0) return '';
        return `<h2 class="group-h">${label} · ${group.length}</h2>${group.map(unitRow).join('')}`;
      }).join('')
        || '<div class="empty">Nothing recorded yet today.</div>';
    } else {
      el('list').innerHTML = rows.map(unitRow).join('')
        || '<div class="empty">Nothing matches this view yet.</div>';
    }
    renderBar();
  };

  const load = async () => {
    try {
      const response = await fetch(`/api/portal/view?k=${encodeURIComponent(token)}&t=${Date.now()}`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) {
        el('sub').textContent = body.error || 'This link is not valid.';
        return;
      }
      if (body.empty) { el('empty').hidden = false; return; }
      const p = body.payload;
      units = (p.units || []).slice().sort((a, b) =>
        a.n.localeCompare(b.n, undefined, { numeric: true }));
      el('prop').textContent = `${p.propertyName} — Turn Progress`;
      el('sub').textContent = `Live from ${(p.supervisor || 'the supervisor').split(' ')[0]}'s Turn OS · read-only`;
      el('empty').hidden = true;
      el('counts').hidden = false;
      el('filters').hidden = false;
      el('q').hidden = false;
      el('pickHint').hidden = false;
      const count = (pred) => units.filter(pred).length;
      el('cWorking').textContent = count((u) => u.p === 'working' || u.c === 'working');
      el('cPaintDone').textContent = count((u) => DONE.includes(u.p));
      el('cCleanDone').textContent = count((u) => DONE.includes(u.c));
      el('cApproved').textContent = count((u) => classify(u) === 'done');
      const updated = new Date(body.updatedAt);
      el('updated').textContent = `Updated ${updated.toLocaleString([], { hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' })}`;
      render();
    } catch {
      el('sub').textContent = 'Could not reach the portal. Pull to refresh.';
    }
  };

  el('filters').addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    filter = button.dataset.f;
    for (const other of el('filters').querySelectorAll('button')) {
      other.classList.toggle('on', other === button);
    }
    render();
  });
  el('q').addEventListener('input', (event) => {
    query = event.target.value.trim().toLowerCase();
    render();
  });
  el('list').addEventListener('click', (event) => {
    const row = event.target.closest('.unit');
    if (!row) return;
    const n = row.dataset.n;
    if (picked.has(n)) picked.delete(n); else picked.add(n);
    render();
  });
  el('walkClear').addEventListener('click', () => { picked.clear(); render(); });

  const requestWalk = async (name) => {
    if (picked.size === 0) return;
    const unitsList = [...picked].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    try {
      const response = await fetch(`/api/portal/request-walk?k=${encodeURIComponent(token)}`, {
        body: JSON.stringify({ name, units: unitsList }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const body = await response.json();
      if (!response.ok) { alert(body.error || 'Could not send. Text the supervisor instead.'); return; }
      picked.clear();
      render();
      el('updated').textContent = `Walk request sent — ${name} · ${unitsList.join(', ')}`;
    } catch {
      alert('Could not send. Text the supervisor instead.');
    }
  };
  el('walkJoseph').addEventListener('click', () => void requestWalk('Joseph'));
  el('walkPaige').addEventListener('click', () => void requestWalk('Paige'));

  load();
  setInterval(load, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
})();
