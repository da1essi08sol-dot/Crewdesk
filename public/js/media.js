/* Photos, file attachments, the full-screen viewer and the profile-picture cropper. */
'use strict';

const IMG_NAME_RE = /\.(jpe?g|png|webp|heic|heif|gif)$/i;
const isImageFile = (f) => /^image\//.test(f.type || '') || IMG_NAME_RE.test(f.name || '');
const DOC_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.txt,.csv,.rtf';
const DOC_RE = /\.(pdf|docx?|xlsx?|pptx?|odt|ods|txt|csv|rtf)$/i;

// Opens the camera or photo library on phones (two big buttons); the file picker on computers.
function choosePhotos({ multiple = true, title = 'Add photos', selfie = false } = {}) {
  return new Promise((resolve) => {
    const finish = (files) => {
      const all = [...(files || [])];
      const ok = all.filter(isImageFile);
      if (all.length && !ok.length) toast('That isn’t a photo — pick a picture from your camera roll', true);
      if (ok.length) resolve(multiple ? ok : ok.slice(0, 1));
    };
    if (!isTouch()) return pickInput('image/*', multiple, finish);
    sheet(`${sheetHead(title)}
      <div class="pick-options">
        <label class="pick-btn">${ic('camera')}<span>Take photo</span><small>Open the camera</small>
          <input type="file" accept="image/*" capture="${selfie ? 'user' : 'environment'}" data-pick aria-label="Take a photo with the camera"></label>
        <label class="pick-btn">${ic('gallery')}<span>Photo library</span><small>${multiple ? 'Choose one or more' : 'Choose a photo'}</small>
          <input type="file" accept="image/*" ${multiple ? 'multiple' : ''} data-pick aria-label="Choose from your photo library"></label>
      </div>`, (sh, close) => {
      $$('[data-pick]', sh).forEach((inp) => inp.addEventListener('change', () => { const files = [...inp.files]; close(); finish(files); }));
    });
  });
}
function pickInput(accept, multiple, cb) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = accept; inp.multiple = multiple; inp.style.display = 'none';
  inp.onchange = () => { cb(inp.files); inp.remove(); };
  document.body.appendChild(inp); inp.click();
}

// Shrinks photos on the device before upload (quick on mobile data) and fixes sideways photos.
async function loadBitmap(file) {
  if (window.createImageBitmap) { try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (_) { /* fall back */ } }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => { resolve(img); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(/hei[cf]/i.test(file.type + file.name) ? 'This browser can’t open HEIC photos — try from your phone, or save it as JPEG' : 'Could not read that photo')); };
    img.src = url;
  });
}
function drawScaled(src, max, square = false, quality = 0.82) {
  const W = src.width, H = src.height;
  let sx = 0, sy = 0, sw = W, sh = H;
  if (square) { const m = Math.min(W, H); sx = (W - m) / 2; sy = (H - m) / 2; sw = sh = m; }
  const k = Math.min(1, max / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw * k)); c.height = Math.max(1, Math.round(sh * k));
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
  g.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return { data: c.toDataURL('image/jpeg', quality), w: c.width, h: c.height };
}
async function processPhoto(file, { max = 1600, thumb = 480, square = false } = {}) {
  const bmp = await loadBitmap(file);
  const full = drawScaled(bmp, max, square);
  const small = thumb ? drawScaled(bmp, thumb, square, 0.74) : null;
  if (bmp.close) bmp.close();
  return { data: full.data, w: full.w, h: full.h, thumb: small && small.data, takenAt: file.lastModified || 0 };
}
const readAsDataURL = (file) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(new Error('Could not read that file')); r.readAsDataURL(file); });

// ---- job photo uploads (queue, 2 at a time, with live tiles)
const uploads = {}; // jobId -> [{ key, preview, progress, failed, file }]
let uploadActive = 0; const uploadQueue = [];
function queueJobPhotos(jobId, files) {
  if (!files.length) return;
  const arr = uploads[jobId] = uploads[jobId] || [];
  for (const file of files) {
    const u = { key: Math.random().toString(36).slice(2), jobId, file, preview: URL.createObjectURL(file), progress: 0, failed: '' };
    arr.push(u); uploadQueue.push(u);
  }
  toast(files.length === 1 ? 'Uploading photo…' : `Uploading ${files.length} photos…`);
  refreshPhotoViews(jobId); pumpUploads();
}
function pumpUploads() {
  while (uploadActive < 2 && uploadQueue.length) {
    const u = uploadQueue.shift(); uploadActive++;
    uploadOne(u).finally(() => { uploadActive--; pumpUploads(); });
  }
}
async function uploadOne(u) {
  try {
    u.failed = ''; u.progress = 0.02; paintUpload(u);
    const p = await processPhoto(u.file);
    const r = await sendWithProgress('POST', `/api/c/${S.cid}/photos`, { jobId: u.jobId, image: p.data, thumb: p.thumb, w: p.w, h: p.h, takenAt: p.takenAt },
      (f) => { u.progress = 0.05 + f * 0.93; paintUpload(u); });
    S.photos[r.item.id] = r.item;
    const arr = uploads[u.jobId] || [];
    arr.splice(arr.indexOf(u), 1);
    URL.revokeObjectURL(u.preview);
    refreshPhotoViews(u.jobId);
  } catch (e) { u.failed = e.message; paintUpload(u); }
}
function paintUpload(u) {
  const el = document.querySelector(`[data-upload="${u.key}"]`);
  if (!el) return;
  const bar = el.querySelector('.prog i'); if (bar) bar.style.width = Math.round(u.progress * 100) + '%';
  el.classList.toggle('failed', !!u.failed);
  const f = el.querySelector('.fail');
  if (u.failed && !f) el.insertAdjacentHTML('beforeend', `<span class="fail">${esc(u.failed)}<br>Tap to retry</span>`);
  if (!u.failed && f) f.remove();
}
function refreshPhotoViews(jobId) {
  const box = document.getElementById('photo-gallery');
  if (box && box.dataset.job === jobId) box.innerHTML = photoGalleryInner(jobId);
  const strip = document.getElementById('photo-strip');
  if (strip && strip.dataset.job === jobId) strip.innerHTML = photoStripInner(jobId);
}
function jobPhotos(jobId) { return Object.values(S.photos).filter((p) => p.jobId === jobId).sort((a, b) => b.createdAt - a.createdAt); }
function photoAlt(p, i) {
  const j = S.jobs[p.jobId];
  return p.caption ? p.caption : `Photo ${i + 1}${j ? ' of ' + j.title : ''}, added by ${member(p.createdBy).name}`;
}
function photoTile(p, i) {
  return `<button class="photo-tile" data-act="photo-open" data-id="${p.id}" aria-label="Open photo: ${esc(photoAlt(p, i))}">
    <img src="${esc(p.thumb || p.url)}" alt="${esc(photoAlt(p, i))}" loading="lazy" decoding="async">${p.caption ? `<span class="cap" aria-hidden="true">${esc(p.caption)}</span>` : ''}</button>`;
}
function uploadTile(u) {
  return `<button class="photo-tile uploading ${u.failed ? 'failed' : ''}" data-upload="${u.key}" data-act="upload-retry" aria-label="${u.failed ? 'Upload failed, tap to retry' : 'Uploading photo'}">
    <img src="${esc(u.preview)}" alt=""><span class="prog"><i style="width:${Math.round(u.progress * 100)}%"></i></span>${u.failed ? `<span class="fail">${esc(u.failed)}<br>Tap to retry</span>` : ''}</button>`;
}
function photoGalleryInner(jobId) {
  const ps = jobPhotos(jobId); const ups = uploads[jobId] || [];
  return `<div class="photo-grid">
      <button class="add-photo-tile" data-act="photos-add" data-job="${jobId}">${ic('camera')}<span>Add photos</span></button>
      ${ups.map(uploadTile).join('')}${ps.map(photoTile).join('')}</div>
    ${!ps.length && !ups.length ? `<p class="small muted" style="text-align:center;margin:14px 0 0">No photos yet. Take before, during and after shots — everyone who can see this job can see them.</p>` : ''}`;
}
function photoStripInner(jobId) {
  const ps = jobPhotos(jobId).slice(0, 8); const ups = uploads[jobId] || [];
  return `<div class="photo-strip"><button class="add-photo-tile" data-act="photos-add" data-job="${jobId}" aria-label="Add photos">${ic('camera')}<span>Add</span></button>
    ${ups.map(uploadTile).join('')}${ps.map(photoTile).join('')}</div>`;
}
A['photos-add'] = async (el) => { const files = await choosePhotos({ multiple: true, title: 'Add job photos' }); queueJobPhotos(el.dataset.job, files); };
A['photo-open'] = (el) => { const p = S.photos[el.dataset.id]; if (!p) return; const items = viewerItemsForJob(p.jobId); openViewer(items, items.findIndex((x) => x.id === p.id)); };
A['upload-retry'] = (el) => {
  for (const arr of Object.values(uploads)) { const u = arr.find((x) => x.key === el.dataset.upload); if (u && u.failed) { u.failed = ''; u.progress = 0; uploadQueue.push(u); paintUpload(u); pumpUploads(); } }
};

// ---- full-screen photo viewer: opens from the thumbnail, pinch to zoom, swipe sideways for the next one,
// swipe down (or tap outside the photo, press Esc, or use the phone's back gesture) to close.
let viewer = null;
function openViewer(items, index = 0) {
  closeViewer(true, true);
  const back = document.activeElement;
  const srcEl = lastTapEl && lastTapEl.isConnected ? lastTapEl : back;
  const srcImg = srcEl && srcEl.querySelector ? (srcEl.tagName === 'IMG' ? srcEl : srcEl.querySelector('img')) : null;
  const el = document.createElement('div');
  el.className = 'viewer'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Photo viewer');
  el.style.setProperty('--vbg', '0');
  document.body.appendChild(el);
  viewer = { el, items, i: Math.max(0, Math.min(index, items.length - 1)), back, srcImg, z: 1, tx: 0, ty: 0 };
  history.pushState({ cdOverlay: 'viewer' }, '', location.href);
  paintViewer(true);
  requestAnimationFrame(() => el.style.setProperty('--vbg', '1'));
  const onKey = (e) => {
    if (!viewer) return;
    if (e.key === 'Escape') closeViewer();
    else if (e.key === 'ArrowRight' && !e.target.matches('input')) stepViewer(1);
    else if (e.key === 'ArrowLeft' && !e.target.matches('input')) stepViewer(-1);
  };
  document.addEventListener('keydown', onKey); viewer.onKey = onKey;
  viewerGestures(el);
}
function vImg() { return viewer && viewer.el.querySelector('.viewer-stage img'); }
function applyZoom(anim = true) {
  const img = vImg(); if (!img) return;
  img.classList.toggle('no-anim', !anim);
  img.style.transform = `translate(${viewer.tx}px, ${viewer.ty}px) scale(${viewer.z})`;
}
function clampPan() {
  const img = vImg(); if (!img || !viewer) return;
  const w = img.offsetWidth * viewer.z, h = img.offsetHeight * viewer.z;
  const st = img.parentElement.getBoundingClientRect();
  const mx = Math.max(0, (w - st.width) / 2), my = Math.max(0, (h - st.height) / 2);
  viewer.tx = Math.max(-mx, Math.min(mx, viewer.tx)); viewer.ty = Math.max(-my, Math.min(my, viewer.ty));
}
function viewerGestures(el) {
  const pts = new Map();
  let mode = null, sx = 0, sy = 0, st = 0, startZ = 1, startD = 0, startTx = 0, startTy = 0, lastTap = 0, tapTimer = null, moved = false;
  const stage = () => el.querySelector('.viewer-stage');
  el.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.viewer-stage') || e.target.closest('.vbtn')) return;
    stage().setPointerCapture && stage().setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = false;
    if (pts.size === 1) { mode = null; sx = e.clientX; sy = e.clientY; st = Date.now(); startTx = viewer.tx; startTy = viewer.ty; }
    if (pts.size === 2) { const [a, b] = [...pts.values()]; startD = Math.hypot(a.x - b.x, a.y - b.y); startZ = viewer.z; mode = 'pinch'; }
  });
  el.addEventListener('pointermove', (e) => {
    if (!viewer || !pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const img = vImg(); if (!img) return;
    if (mode === 'pinch' && pts.size >= 2) {
      const [a, b] = [...pts.values()]; viewer.z = Math.max(1, Math.min(5, startZ * Math.hypot(a.x - b.x, a.y - b.y) / startD)); moved = true; applyZoom(false); return;
    }
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (!mode && Math.hypot(dx, dy) > 8) mode = viewer.z > 1.01 ? 'pan' : Math.abs(dy) > Math.abs(dx) ? 'dismiss' : 'swipe';
    if (!mode) return;
    moved = true;
    if (mode === 'pan') { viewer.tx = startTx + dx; viewer.ty = startTy + dy; applyZoom(false); }
    else if (mode === 'swipe') { img.classList.add('no-anim'); img.style.transform = `translateX(${dx}px)`; }
    else if (mode === 'dismiss') {
      el.classList.add('dragging'); img.classList.add('no-anim');
      img.style.transform = `translate(${dx * 0.4}px, ${dy}px) scale(${Math.max(0.7, 1 - Math.abs(dy) / 1200)})`;
      el.style.setProperty('--vbg', String(Math.max(0, 1 - Math.abs(dy) / 380)));
    }
  });
  const up = (e) => {
    if (!viewer || !pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size) return;
    const img = vImg(); const dx = e.clientX - sx, dy = e.clientY - sy; const dt = Math.max(1, Date.now() - st);
    el.classList.remove('dragging');
    if (mode === 'pinch' || mode === 'pan') { if (viewer.z < 1.05) { viewer.z = 1; viewer.tx = viewer.ty = 0; } clampPan(); applyZoom(true); mode = null; return; }
    if (mode === 'dismiss') {
      if (Math.abs(dy) > 110 || Math.abs(dy) / dt > 0.7) { closeViewer(false, false, dy); return; }
      el.style.setProperty('--vbg', '1'); if (img) { img.classList.remove('no-anim'); img.style.transform = ''; } mode = null; return;
    }
    if (mode === 'swipe') {
      if (viewer.items.length > 1 && (Math.abs(dx) > 60 || Math.abs(dx) / dt > 0.5)) { stepViewer(dx < 0 ? 1 : -1, dx); return; }
      if (img) { img.classList.remove('no-anim'); img.style.transform = ''; } mode = null; return;
    }
    if (moved) return;
    // taps: a second quick tap is ignored (no double-tap zoom — pinch to zoom instead);
    // a single tap outside the photo closes it, on the photo shows or hides the buttons
    const now = Date.now();
    if (now - lastTap < 350) { clearTimeout(tapTimer); lastTap = now; return; }
    lastTap = now;
    const onPhoto = e.target.tagName === 'IMG';
    tapTimer = setTimeout(() => { if (!viewer) return; if (onPhoto) viewer.el.classList.toggle('chrome-off'); else if (viewer.z === 1) closeViewer(); }, 280);
  };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', (e) => { if (!e.ctrlKey || !viewer) return; e.preventDefault(); viewer.z = Math.max(1, Math.min(5, viewer.z * (1 - e.deltaY / 200))); if (viewer.z === 1) viewer.tx = viewer.ty = 0; clampPan(); applyZoom(false); }, { passive: false });
}
function paintViewer(opening = false, enterFrom = 0) {
  if (!viewer) return;
  const it = viewer.items[viewer.i]; if (!it) return closeViewer();
  viewer.z = 1; viewer.tx = viewer.ty = 0;
  const who = member(it.by);
  const canEdit = it.id && S.photos[it.id] && (isAdmin() || it.by === S.user.id);
  const many = viewer.items.length > 1;
  const fname = (it.caption || 'photo').replace(/[^\w\- ]+/g, '').slice(0, 40).trim() || 'photo';
  viewer.el.innerHTML = `
    <div class="viewer-top">
      <button class="vbtn done" data-vact="close" aria-label="Close photo">Done${ic('x')}</button>
      <div class="who" style="text-align:center"><b>${esc(who.name)}</b><span>${esc(fmtDateTime(it.at))}${it.where ? ' · ' + esc(it.where) : ''}</span></div>
      <button class="vbtn" data-vact="save" aria-label="Save or share photo">${ic('download')}</button>
      ${canEdit ? `<button class="vbtn" data-vact="delete" aria-label="Delete photo">${ic('trash')}</button>` : ''}
    </div>
    <div class="viewer-stage">
      <img src="${esc(it.url)}" alt="${esc(it.alt || it.caption || 'Photo')}" draggable="false">
      ${many ? `<button class="vbtn nav prev" data-vact="prev" aria-label="Previous photo">${ic('back')}</button><button class="vbtn nav next" data-vact="next" aria-label="Next photo">${ic('right')}</button>` : ''}
    </div>
    <div class="viewer-bottom">
      ${canEdit ? `<label class="sr-only" for="vcap">Caption</label><input id="vcap" value="${esc(it.caption || '')}" placeholder="Add a caption… e.g. Before: kitchen wall" maxlength="300" enterkeyhint="done">`
        : it.caption ? `<div class="caption">${esc(it.caption)}</div>` : ''}
      <div class="vcount">${many ? `${viewer.i + 1} of ${viewer.items.length} · ` : ''}${isTouch() ? 'Swipe down to close' : 'Esc to close'}</div>
    </div>`;
  prefetchBlob(it.url).catch(() => {});
  const img = vImg();
  if (motionOK() && img) {
    if (opening && viewer.srcImg && viewer.srcImg.isConnected) {
      const from = viewer.srcImg.getBoundingClientRect();
      const run = () => { if (!viewer) return; const to = img.getBoundingClientRect(); if (!to.width) return;
        img.animate([{ transform: `translate(${from.left + from.width / 2 - (to.left + to.width / 2)}px, ${from.top + from.height / 2 - (to.top + to.height / 2)}px) scale(${Math.max(from.width / to.width, from.height / to.height)})`, opacity: 0.4, borderRadius: '12px' }, { transform: 'none', opacity: 1, borderRadius: '0' }], { duration: 480, easing: 'cubic-bezier(.32,.72,0,1)' }); };
      if (img.complete && img.naturalWidth) run(); else { img.style.opacity = '0'; img.addEventListener('load', () => { img.style.opacity = ''; run(); }, { once: true }); setTimeout(() => { img.style.opacity = ''; }, 600); }
    } else if (opening) img.animate([{ opacity: 0, transform: 'scale(.92)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.32,.72,0,1)' });
    else if (enterFrom) img.animate([{ opacity: 0.2, transform: `translateX(${enterFrom < 0 ? 60 : -60}%)` }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.32,.72,0,1)' });
  }
  viewer.el.onclick = async (e) => {
    const b = e.target.closest('[data-vact]'); if (!b) return;
    const a = b.dataset.vact;
    if (a === 'close') closeViewer();
    if (a === 'prev') stepViewer(-1);
    if (a === 'next') stepViewer(1);
    if (a === 'save') saveFile(it.url, fname + '.jpg');
    if (a === 'delete') {
      if (!(await confirmBox('Delete this photo?', 'It will be removed for everyone on the job.'))) return;
      try {
        await capi('DELETE', `/photos/${it.id}`); delete S.photos[it.id]; refreshPhotoViews(it.jobId); toast('Photo deleted');
        if (!viewer) return;
        viewer.items.splice(viewer.i, 1); if (!viewer.items.length) closeViewer(); else { viewer.i = Math.min(viewer.i, viewer.items.length - 1); paintViewer(); }
      } catch (err) { toast(err.message, true); }
    }
  };
  const cap = viewer.el.querySelector('#vcap');
  if (cap) {
    const saveCap = async () => {
      const v = cap.value.trim(); if (v === (it.caption || '')) return;
      try { const r = await capi('PATCH', `/photos/${it.id}`, { caption: v }); S.photos[it.id] = r.item; it.caption = r.item.caption; refreshPhotoViews(it.jobId); toast('Caption saved'); }
      catch (err) { toast(err.message, true); }
    };
    cap.addEventListener('change', saveCap);
    cap.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); cap.blur(); } });
  }
  const closeBtn = viewer.el.querySelector('[data-vact="close"]'); if (closeBtn && !viewer.el.contains(document.activeElement)) closeBtn.focus({ preventScroll: true });
}
function stepViewer(d, dragged = 0) {
  if (!viewer || viewer.items.length < 2) return;
  viewer.i = (viewer.i + d + viewer.items.length) % viewer.items.length;
  viewer.srcImg = null; paintViewer(false, dragged || -d);
}
function closeViewer(fromPop = false, instant = false, dy = 0) {
  if (!viewer) return;
  const v = viewer; viewer = null;
  document.removeEventListener('keydown', v.onKey);
  if (!fromPop && history.state && history.state.cdOverlay === 'viewer') { ignorePop++; history.back(); }
  const img = v.el.querySelector('.viewer-stage img');
  const done = () => { v.el.remove(); if (v.back && v.back.isConnected) v.back.focus({ preventScroll: true }); };
  if (instant || !motionOK() || !img) return done();
  v.el.classList.add('closing'); v.el.style.pointerEvents = 'none';
  const cur = img.getBoundingClientRect();
  const src = v.srcImg && v.srcImg.isConnected && v.i === v.items.indexOf(v.items[v.i]) ? v.srcImg.getBoundingClientRect() : null;
  const startT = getComputedStyle(img).transform;
  let anim;
  if (src && src.width && src.top < innerHeight && src.bottom > 0 && !dy) {
    anim = img.animate([{ transform: startT === 'none' ? 'none' : startT, opacity: 1 }, { transform: `translate(${src.left + src.width / 2 - (cur.left + cur.width / 2)}px, ${src.top + src.height / 2 - (cur.top + cur.height / 2)}px) scale(${Math.max(src.width / cur.width, src.height / cur.height)})`, opacity: 0.2 }], { duration: 380, easing: 'cubic-bezier(.32,.72,0,1)', fill: 'forwards' });
  } else {
    anim = img.animate([{ transform: startT === 'none' ? 'none' : startT, opacity: 1 }, { transform: `translateY(${dy >= 0 ? innerHeight * 0.6 : -innerHeight * 0.6}px) scale(.8)`, opacity: 0 }], { duration: 320, easing: 'cubic-bezier(.32,.72,0,1)', fill: 'forwards' });
  }
  anim.finished.then(done, done); setTimeout(done, 600);
}
function viewerItemsForJob(jobId) {
  return jobPhotos(jobId).map((p, i) => ({ id: p.id, jobId, url: p.url, caption: p.caption, by: p.createdBy, at: p.createdAt, alt: photoAlt(p, i) }));
}

// ---- chat photo attachments
const pendingImgs = {}; // channel -> [{ data, key }]
async function addChatPhotos(ch, files) {
  const arr = pendingImgs[ch] = pendingImgs[ch] || [];
  const room = 6 - arr.length;
  if (room <= 0) return toast('You can send up to 6 photos at once', true);
  if (files.length > room) toast(`Only the first ${room} photo${room === 1 ? '' : 's'} added (6 max per message)`);
  for (const f of files.slice(0, room)) {
    try { const p = await processPhoto(f, { thumb: 0 }); arr.push({ data: p.data, key: Math.random().toString(36).slice(2) }); }
    catch (e) { toast(e.message, true); }
  }
  paintAttach(ch);
}
function paintAttach(ch) {
  const pane = document.querySelector(`.chat-pane[data-ch="${CSS.escape(ch)}"]`); if (!pane) return;
  const box = pane.querySelector('[data-attach]'); const arr = pendingImgs[ch] || [];
  box.classList.toggle('hidden', !arr.length);
  box.innerHTML = arr.map((p, i) => `<span class="attach-thumb"><img src="${p.data}" alt="Photo ${i + 1} ready to send"><button type="button" data-act="unattach" data-ch="${esc(ch)}" data-key="${p.key}" aria-label="Remove photo ${i + 1}">${ic('x')}</button></span>`).join('')
    + (arr.length ? `<span class="small muted" style="flex:none">${plural(arr.length, 'photo')} ready</span>` : '');
}
A.attach = async (el) => { const files = await choosePhotos({ multiple: true, title: 'Send photos' }); addChatPhotos(el.dataset.ch, files); };
A.unattach = (el) => { const ch = el.dataset.ch; pendingImgs[ch] = (pendingImgs[ch] || []).filter((p) => p.key !== el.dataset.key); paintAttach(ch); };

// ---- ping attachments (photos and documents)
// Each file uploads straight away with its own progress bar; the ping links them when it's posted.
function attachmentBox(files = []) {
  return `<div class="field"><span>Attachments <span class="hint">· photos, PDF, Word, Excel, PowerPoint, text — up to 10</span></span>
    <div class="att-list" data-attlist>${files.map((f) => attRow(f)).join('')}</div>
    <div class="row wrap tight" style="margin-top:6px"><button type="button" class="btn sm" data-act="att-photos">${ic('image')}Add photos</button>
    <button type="button" class="btn sm" data-act="att-docs">${ic('clip')}Add documents</button></div></div>`;
}
function attRow(f, key) {
  const thumb = f.kind === 'image' ? `<span class="att-thumb" style="width:40px;height:40px;cursor:default"><img src="${esc(f.thumb || f.url || f.preview || '')}" alt=""></span>` : `<span class="ext" style="font:700 10px var(--font);text-transform:uppercase;color:#fff;background:var(--slate);border-radius:4px;padding:3px 4px">${esc(f.ext || 'file')}</span>`;
  return `<div class="att-row" data-file="${esc(f.id || '')}" data-key="${esc(key || f.id || '')}">${thumb}<div class="grow"><div class="ellipsis small bold">${esc(f.name)}</div><div class="tiny muted" data-st>${f.id ? fileSize(f.size || 0) : 'Uploading…'}</div>${f.id ? '' : '<div class="prog"><i></i></div>'}</div>
    <button type="button" class="btn ghost sm icon" data-act="att-remove" aria-label="Remove ${esc(f.name)}">${ic('x')}</button></div>`;
}
async function uploadAttachments(form, files) {
  const listEl = form.querySelector('[data-attlist]');
  const have = listEl.children.length;
  if (have + files.length > 10) { toast('You can attach up to 10 files', true); files = files.slice(0, Math.max(0, 10 - have)); }
  for (const file of files) {
    const key = Math.random().toString(36).slice(2);
    const isImg = isImageFile(file);
    if (!isImg && !DOC_RE.test(file.name)) { toast(`${file.name}: that file type isn’t allowed`, true); continue; }
    if (!isImg && file.size > 15 * 1024 * 1024) { toast(`${file.name} is over 15 MB`, true); continue; }
    const preview = isImg ? URL.createObjectURL(file) : '';
    listEl.insertAdjacentHTML('beforeend', attRow({ name: file.name, kind: isImg ? 'image' : 'doc', ext: (file.name.split('.').pop() || '').toLowerCase(), preview }, key));
    const row = listEl.querySelector(`[data-key="${key}"]`);
    form._pending = (form._pending || 0) + 1;
    try {
      let body;
      if (isImg) { const p = await processPhoto(file, { max: 2000, thumb: 320 }); body = { name: file.name.replace(/\.\w+$/, '') + '.jpg', data: p.data, thumb: p.thumb, w: p.w, h: p.h }; }
      else body = { name: file.name, data: await readAsDataURL(file) };
      const r = await sendWithProgress('POST', `/api/c/${S.cid}/files`, body, (x) => { const b = row && row.querySelector('.prog i'); if (b) b.style.width = Math.round(x * 100) + '%'; });
      if (row.isConnected) { row.outerHTML = attRow(r.file); }
    } catch (e) {
      if (row && row.isConnected) { row.querySelector('[data-st]').textContent = e.message; row.querySelector('[data-st]').style.color = 'var(--red)'; const pr = row.querySelector('.prog'); if (pr) pr.remove(); }
    } finally { form._pending--; if (preview) setTimeout(() => URL.revokeObjectURL(preview), 2000); }
  }
}
A['att-photos'] = async (el) => { const form = el.closest('form'); const files = await choosePhotos({ multiple: true, title: 'Attach photos' }); uploadAttachments(form, files); };
A['att-docs'] = (el) => { const form = el.closest('form'); pickInput(DOC_ACCEPT, true, (files) => uploadAttachments(form, [...files])); };
A['att-remove'] = (el) => el.closest('.att-row').remove();
const attachedIds = (form) => $$('[data-attlist] .att-row', form).map((r) => r.dataset.file).filter(Boolean);
function attStrip(files, max = 5) {
  if (!files || !files.length) return '';
  const imgs = files.filter((f) => f.kind === 'image'); const docs = files.filter((f) => f.kind !== 'image');
  const shown = imgs.slice(0, max).map((f) => `<button type="button" class="att-thumb" data-act="att-view" data-file="${f.id}" aria-label="View ${esc(f.name)}"><img src="${esc(f.thumb || f.url)}" alt="${esc(f.name)}" loading="lazy"></button>`)
    .concat(docs.slice(0, Math.max(1, max - imgs.length)).map(docChip));
  const rest = files.length - Math.min(imgs.length, max) - Math.min(docs.length, Math.max(1, max - imgs.length));
  return `<div class="att-strip">${shown.join('')}${rest > 0 ? `<span class="att-more">+${rest} more</span>` : ''}<span class="att-more">${icSize('clip', 13, 'vertical-align:-2px')} ${files.length}</span></div>`;
}
function docChip(f) {
  return `<button type="button" class="att-doc" data-act="file-open" ${fileAttrs(f)} title="Open ${esc(f.name)}"><span class="ext ${esc(f.ext)}">${esc(f.ext || 'file')}</span><span class="nm"><span class="ellipsis">${esc(f.name)}</span><span class="muted tiny">${fileSize(f.size)}</span></span></button>`;
}

// ---- profile picture cropper: drag to move, pinch / scroll / slider to zoom; outside the circle is darkened
function cropAvatar(file) {
  return new Promise(async (resolve) => {
    let bmp;
    try { bmp = await loadBitmap(file); } catch (e) { toast(e.message, true); return resolve(null); }
    const base = drawScaled(bmp, 1600, false, 0.9); if (bmp.close) bmp.close();
    let done = false;
    sheet(`${sheetHead('Position your picture')}
      <p class="small muted" style="margin-top:-6px">Drag to move. Pinch, scroll or use the slider to zoom.</p>
      <div class="crop-stage" tabindex="0" aria-label="Picture position. Use arrow keys to move and plus or minus to zoom."><img alt="" src="${base.data}"><div class="ring"></div></div>
      <div class="crop-controls">${icSize('image', 14)}<input type="range" min="0" max="1000" value="0" aria-label="Zoom">${icSize('image', 22)}</div>
      <div class="crop-preview"><canvas width="128" height="128" style="width:64px;height:64px"></canvas><canvas width="64" height="64" style="width:32px;height:32px"></canvas><span class="small muted">Preview</span></div>
      <div class="sheet-foot"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" data-crop-save>Save picture</button></div>`,
    (sh, close) => {
      const stage = $('.crop-stage', sh), img = $('img', stage), range = $('input[type=range]', sh), previews = $$('canvas', sh);
      const W = base.w, H = base.h;
      let Sz = stage.clientWidth || 300, D = Sz * 0.84, kMin = D / Math.min(W, H), kMax = kMin * 5, k = Math.max(kMin, Sz / Math.min(W, H)), x = 0, y = 0;
      const center = () => { x = (Sz - W * k) / 2; y = (Sz - H * k) / 2; };
      const clamp = () => {
        k = Math.min(kMax, Math.max(kMin, k));
        const lo = (Sz + D) / 2, hi = (Sz - D) / 2;
        x = Math.min(hi, Math.max(lo - W * k, x)); y = Math.min(hi, Math.max(lo - H * k, y));
      };
      const paint = () => {
        clamp();
        img.style.width = W + 'px'; img.style.height = H + 'px';
        img.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
        range.value = Math.round(((k - kMin) / (kMax - kMin)) * 1000);
        for (const c of previews) { const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height); const src = srcRect(); g.imageSmoothingQuality = 'high'; g.drawImage(img, src.sx, src.sy, src.s, src.s, 0, 0, c.width, c.height); }
      };
      const srcRect = () => { const off = (Sz - D) / 2; return { sx: (off - x) / k, sy: (off - y) / k, s: D / k }; };
      const zoomAt = (nk, px, py) => { const ix = (px - x) / k, iy = (py - y) / k; k = Math.min(kMax, Math.max(kMin, nk)); x = px - ix * k; y = py - iy * k; paint(); };
      img.onload = () => { Sz = stage.clientWidth; D = Sz * 0.84; kMin = D / Math.min(W, H); kMax = kMin * 5; k = Math.max(kMin, Sz / Math.min(W, H)); center(); paint(); };
      if (img.complete) img.onload();
      const pts = new Map(); let last = null, pinch = null;
      stage.addEventListener('pointerdown', (e) => { stage.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); last = { x: e.clientX, y: e.clientY }; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k }; } });
      stage.addEventListener('pointermove', (e) => {
        if (!pts.has(e.pointerId)) return;
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pts.size === 2 && pinch) {
          const [a, b] = [...pts.values()]; const r = stage.getBoundingClientRect();
          zoomAt(pinch.k * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d), (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
        } else if (pts.size === 1 && last) { x += e.clientX - last.x; y += e.clientY - last.y; last = { x: e.clientX, y: e.clientY }; paint(); }
      });
      const up = (e) => { pts.delete(e.pointerId); pinch = null; const rest = [...pts.values()][0]; last = rest ? { x: rest.x, y: rest.y } : null; };
      stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
      stage.addEventListener('wheel', (e) => { e.preventDefault(); const r = stage.getBoundingClientRect(); zoomAt(k * (e.deltaY < 0 ? 1.08 : 1 / 1.08), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
      stage.addEventListener('keydown', (e) => {
        const step = e.shiftKey ? 20 : 6;
        if (e.key === 'ArrowLeft') x -= step; else if (e.key === 'ArrowRight') x += step; else if (e.key === 'ArrowUp') y -= step; else if (e.key === 'ArrowDown') y += step;
        else if (e.key === '+' || e.key === '=') return zoomAt(k * 1.08, Sz / 2, Sz / 2); else if (e.key === '-') return zoomAt(k / 1.08, Sz / 2, Sz / 2); else return;
        e.preventDefault(); paint();
      });
      range.addEventListener('input', () => zoomAt(kMin + (range.value / 1000) * (kMax - kMin), Sz / 2, Sz / 2));
      $('[data-crop-save]', sh).onclick = () => {
        const out = document.createElement('canvas'); out.width = out.height = 512;
        const g = out.getContext('2d'); g.imageSmoothingQuality = 'high'; const s = srcRect();
        g.fillStyle = '#fff'; g.fillRect(0, 0, 512, 512);
        g.drawImage(img, s.sx, s.sy, s.s, s.s, 0, 0, 512, 512);
        done = true; close(); resolve(out.toDataURL('image/jpeg', 0.88));
      };
    }, { onClose: () => { if (!done) resolve(null); } });
  });
}
