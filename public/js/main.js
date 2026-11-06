/* Event wiring and start-up. Loaded last. */
'use strict';

// Clicking a person's picture or name anywhere opens their profile (runs before other click handlers).
document.addEventListener('click', (e) => {
  const p = e.target.closest('[data-person]');
  if (!p || !S.company || p.closest('[data-picker]')) return;
  e.preventDefault(); e.stopPropagation();
  closeSheets(); closeMenu();
  location.hash = '#/person/' + p.dataset.person;
}, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches && e.target.matches('.person-link[data-person]')) e.target.click(); });

document.addEventListener('click', (e) => {
  if (e.target.closest('.skip-link')) { e.preventDefault(); const v = $('#view'); if (v) v.focus(); return; }
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = A[el.dataset.act]; if (!fn) return;
  const keepLink = el.tagName === 'A' && (el.dataset.close !== undefined || el.dataset.act === 'inbox-open');
  if (!keepLink && (el.tagName === 'A' || el.closest('a'))) e.preventDefault(); // e.g. a star button inside a job card link
  if (el.tagName === 'A' && el.dataset.act === 'inbox-open') e.preventDefault();
  if (el.tagName === 'BUTTON' && el.closest('a')) e.stopPropagation();
  fn(el, e);
});
document.addEventListener('change', (e) => { const el = e.target.closest('[data-change]'); if (el && C[el.dataset.change]) C[el.dataset.change](el, e); });
document.addEventListener('input', (e) => { const el = e.target.closest('[data-input]'); if (el && I[el.dataset.input]) I[el.dataset.input](el, e); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && e.target.matches('.composer textarea') && !e.isComposing) {
    e.preventDefault(); e.target.form.requestSubmit();
  }
});
document.addEventListener('submit', async (e) => {
  const f = e.target; const fn = F[f.dataset.form]; if (!fn) return;
  e.preventDefault();
  const d = Object.fromEntries(new FormData(f));
  const errBox = f.querySelector('[data-err]');
  if (errBox) errBox.textContent = '';
  $$('[aria-invalid]', f).forEach((x) => x.removeAttribute('aria-invalid'));
  const btn = f.dataset.form === 'send' ? null : f.querySelector('button:not([type=button])');
  if (btn) { btn.disabled = true; btn.classList.add('busy'); }
  const backdrop = f.closest('.sheet-backdrop');
  const close = () => { if (backdrop) { leave(backdrop); } };
  try { await fn(f, d, close); }
  catch (err) {
    const field = err.data && err.data.field && f.querySelector(`[name="${err.data.field}"]`);
    if (field) { field.setAttribute('aria-invalid', 'true'); field.focus(); }
    if (errBox) errBox.textContent = err.message; else toast(err.message, true);
  } finally { if (btn && btn.isConnected) { btn.disabled = false; btn.classList.remove('busy'); } }
});

// Drag photos onto a project's photo area or a chat (computers); paste photos into a chat.
document.addEventListener('dragover', (e) => {
  if (!S.company || !e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return;
  if (e.target.closest('[data-drop], .chat-pane')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; const pane = e.target.closest('.chat-pane'); $$('.chat-pane.drop-on').forEach((x) => { if (x !== pane) x.classList.remove('drop-on'); }); if (pane) pane.classList.add('drop-on'); }
});
document.addEventListener('drop', (e) => {
  if (!S.company || !e.dataTransfer || !e.dataTransfer.files.length) return;
  const files = [...e.dataTransfer.files].filter(isImageFile);
  const pane = e.target.closest('.chat-pane');
  if (pane) { e.preventDefault(); pane.classList.remove('drop-on'); addChatAttachments(pane.dataset.ch, e.dataTransfer.files); return; }
  const r = parseHash();
  const zone = e.target.closest('[data-drop]');
  const jobId = zone ? zone.dataset.drop : r.name === 'project' ? r.args[0] : null;
  if (jobId && S.projects[jobId]) { e.preventDefault(); if (files.length) queueJobPhotos(jobId, files); else toast('Only photos can be added here', true); }
});
document.addEventListener('paste', (e) => {
  const ta = e.target.closest && e.target.closest('.composer textarea'); if (!ta || !e.clipboardData) return;
  const files = [...e.clipboardData.files];
  if (files.length) { e.preventDefault(); addChatAttachments(ta.form.dataset.ch, files); }
});
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('.chat-pane')) $$('.chat-pane.drop-on').forEach((x) => x.classList.remove('drop-on')); });
window.addEventListener('unhandledrejection', (e) => { if (e.reason instanceof ApiError) e.preventDefault(); });

applyTheme();
boot();
