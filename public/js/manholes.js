// ============================================================ MANHOLE MAPS
// A satellite map per project where the crew records manholes: type (company-wide presets), position, status,
// photos, notes and survey details. Google Maps is used when the company has a key; otherwise free Esri satellite
// imagery through the map engine the app already has. Both sit behind one small "engine" interface, so other
// viewers (e.g. Google 3D Tiles / CesiumJS) can be added later without touching the rest.

// ---- icon library (one consistent stroke style; each has a searchable name)
const MH_ICONS = {
  hydrant: ['Fire Hydrant', '<path d="M9 21h6M8 21V10h8v11M7 10h10M9 10V7a3 3 0 0 1 6 0v3M5 13h3M16 13h3M12 4V3"/>'],
  tap: ['Water Tap', '<path d="M4 9h9a3 3 0 0 1 3 3v2M4 6v6M8 9V6h4M16 18c0 1.1-.9 2-2 2s-2-.9-2-2c0-1.4 2-3.5 2-3.5s2 2.1 2 3.5Z"/>'],
  drop: ['Water Drop', '<path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11Z"/><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5"/>'],
  drain: ['Drain', '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 4v16M12 4v16M16 4v16"/>'],
  pipe: ['Sewer Pipe', '<path d="M3 9h12a4 4 0 0 1 4 4v8M3 15h9a1 1 0 0 1 1 1v5M3 7v10M17 21h4"/>'],
  question: ['Question Mark', '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 0 1 5 .2c0 1.8-2.5 2.3-2.5 4"/><path d="M12 17h.01"/>'],
  valve: ['Valve', '<path d="M3 8v8l9-4-9-4ZM21 8v8l-9-4 9-4ZM12 12V5M9 5h6"/>'],
  cover: ['Manhole Cover', '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/>'],
  warning: ['Warning', '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17h.01"/>'],
  bolt: ['Electricity', '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>'],
  gas: ['Gas', '<path d="M12 3s5 4.5 5 10a5 5 0 0 1-10 0c0-2.4 1.4-4 2.5-5 .3 2 1.2 3 2.5 3 0-3-1-5.5 0-8Z"/>'],
  telecom: ['Telecommunications', '<path d="M12 12v9M8 21h8M8.5 8.5a5 5 0 0 1 7 0M5.6 5.6a9 9 0 0 1 12.8 0"/><circle cx="12" cy="11" r="1.5"/>'],
  chamber: ['Inspection Chamber', '<rect x="5" y="5" width="14" height="14" rx="1"/><rect x="9" y="9" width="6" height="6"/>'],
  pump: ['Pumping Station', '<circle cx="12" cy="13" r="6"/><path d="M12 13 15 10M6 13H3M21 13h-3M12 7V3"/>'],
  meter: ['Meter', '<rect x="4" y="5" width="16" height="14" rx="3"/><path d="M8 13a4 4 0 0 1 8 0M12 13l2-2"/>'],
  cable: ['Cable', '<path d="M4 18c4 0 4-12 8-12s4 12 8 12"/><circle cx="4" cy="18" r="1.5"/><circle cx="20" cy="18" r="1.5"/>'],
  fibre: ['Fibre Optic', '<path d="M3 12h4l3-6 4 12 3-6h4"/>'],
  lamp: ['Street Light', '<path d="M9 21h6M12 21V8M12 8a4 4 0 0 1 4-4h2M18 4v3"/>'],
  tree: ['Tree', '<path d="M12 21v-6M7 15h10l-5-11-5 11Z"/>'],
  flag: ['Flag', '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'],
  star: ['Star', '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/>'],
  grid: ['Grating', '<rect x="4" y="6" width="16" height="12" rx="1"/><path d="M4 10h16M4 14h16M9 6v12M15 6v12"/>'],
  arrow: ['Flow Direction', '<path d="M4 12h14M13 6l6 6-6 6"/>'],
  cross: ['Cross Connection', '<path d="M12 3v18M3 12h18"/><circle cx="12" cy="12" r="3"/>'],
  gully: ['Road Gully', '<rect x="6" y="4" width="12" height="16" rx="1"/><path d="M9 7v10M12 7v10M15 7v10"/>'],
  outfall: ['Outfall', '<path d="M3 8h8v4H3zM11 10h3"/><path d="M14 13c2 0 2 3 4 3s2-3 4-3M14 18c2 0 2 3 4 3"/>'],
  interceptor: ['Interceptor', '<rect x="3" y="7" width="18" height="10" rx="2"/><path d="M9 7v10M15 7v10"/>'],
  soakaway: ['Soakaway', '<circle cx="12" cy="12" r="8"/><path d="M8 12h.01M12 12h.01M16 12h.01M10 9h.01M14 9h.01M10 15h.01M14 15h.01"/>'],
};
const mhIcon = (k, size = 18) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(MH_ICONS[k] || MH_ICONS.cover)[1]}</svg>`;
const MH_ST = { not_started: ['Not started', '#868e96'], in_progress: ['In progress', '#f59f00'], completed: ['Completed', '#30a46c'] };
const MH_SURVEY_FIELDS = [['coverLevel', 'Cover level', 'm', 'num'], ['invertLevel', 'Invert level', 'm', 'num'], ['depth', 'Depth', 'm', 'num'], ['diameter', 'Diameter', 'mm', 'num'],
  ['material', 'Material', '', 'text', ['Brick', 'Concrete', 'Precast concrete', 'Plastic', 'Cast iron', 'Clay', 'Unknown']], ['pipeDirection', 'Pipe direction', '', 'text', ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']],
  ['pipeDiameter', 'Pipe diameter', 'mm', 'num'], ['pipesIn', 'Pipes in', '', 'int'], ['pipesOut', 'Pipes out', '', 'int'],
  ['condition', 'Condition', '', 'text', ['Good', 'Fair', 'Poor', 'Collapsed', 'Not inspected']], ['accessibility', 'Accessibility', '', 'text', ['Accessible', 'Under vehicle', 'Seized', 'Buried', 'Not found', 'Locked']],
  ['observations', 'Additional observations', '', 'long']];
const MH_EXPORT_FIELDS = [['ref', 'Ref'], ['type', 'Type'], ['lat', 'Latitude'], ['lng', 'Longitude'], ['status', 'Status'], ['description', 'Description'], ['coverLevel', 'Cover level'], ['invertLevel', 'Invert level'],
  ['depth', 'Depth'], ['diameter', 'Diameter'], ['material', 'Material'], ['pipeDirection', 'Pipe direction'], ['pipeDiameter', 'Pipe diameter'], ['pipesIn', 'Pipes in'], ['pipesOut', 'Pipes out'],
  ['condition', 'Condition'], ['accessibility', 'Accessibility'], ['observations', 'Observations'], ['notes', 'Notes'], ['photos', 'Photo count'], ['createdBy', 'Recorded by'], ['createdAt', 'Recorded'], ['updatedAt', 'Last updated']];
const MH_EXPORT_DEFAULT = ['ref', 'type', 'lat', 'lng', 'status', 'coverLevel', 'invertLevel', 'depth', 'condition'];

const mhPreset = (r) => S.mhPresets[r.presetId] || (r.type ? { name: r.type.name, color: r.type.color, icon: r.type.icon } : { name: 'Unknown', color: '#868e96', icon: 'question' });
const mhPresetList = () => Object.values(S.mhPresets).sort((a, b) => (a.category || '').localeCompare(b.category || '') || (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name));
const mhOnMap = (mapId) => Object.values(S.manholes).filter((r) => r.mapId === mapId && !r.deleted);
const fmtLL = (v) => (Number(v) || 0).toFixed(6);

// ---- the map engine: Google when a key is set, otherwise MapLibre with Esri World Imagery
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
function esriStyle(layer) {
  const ras = (id, url, max = 19) => ({ type: 'raster', tiles: [url], tileSize: 256, maxzoom: max, attribution: id === 'img' ? 'Imagery © Esri, Maxar, Earthstar Geographics' : '' });
  if (layer === 'roadmap') return 'https://tiles.openfreemap.org/styles/liberty';
  const sources = { img: ras('img', `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, 19) };
  const layers = [{ id: 'img', type: 'raster', source: 'img' }];
  if (layer === 'hybrid') {
    sources.roads = ras('roads', `${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`, 19); sources.places = ras('places', `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`, 19);
    layers.push({ id: 'roads', type: 'raster', source: 'roads' }, { id: 'places', type: 'raster', source: 'places' });
  }
  return { version: 8, sources, layers };
}
let gmapsP = null;
// Google shows a watermarked "for development purposes only" map when billing is off or the key is wrong: switch to the free map instead.
function mhGoogleBroken(why) {
  if (window.__cdGmFailed) return; window.__cdGmFailed = true;
  toast(`${why} — showing the free satellite map instead`, true);
  if (MH.id && MH.eng && MH.eng.kind === 'google') VIEWS.mhmap.mount(MH.id);
}

function loadGoogleMaps(key) {
  if (window.google && window.google.maps && window.google.maps.Map) return Promise.resolve();
  return (gmapsP = gmapsP || new Promise((resolve, reject) => {
    window.__cdGmaps = () => resolve();
    const s = document.createElement('script'); s.async = true; s.onerror = () => { gmapsP = null; reject(new Error('Google Maps didn’t load')); };
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&libraries=geometry&callback=__cdGmaps&loading=async`;
    document.head.appendChild(s);
    window.gm_authFailure = () => mhGoogleBroken('Google Maps rejected the key');
  }));
}
async function mhEngine(el, view) {
  if (S.mapsKey && !window.__cdGmFailed) { try { const ok = await capi('POST', '/usage/gmaps', { kind: 'map' }).catch(() => ({ ok: true })); if (!ok.ok) throw new Error('limit'); await loadGoogleMaps(S.mapsKey); return mhGoogle(el, view); } catch (_) { /* fall back */ } }
  if (!window.maplibregl) { loadCss('/vendor/maplibre/maplibre-gl.css'); await loadScript('/vendor/maplibre/maplibre-gl-csp.js'); maplibregl.setWorkerUrl('/vendor/maplibre/maplibre-gl-csp-worker.js'); }
  return mhLibre(el, view);
}
function mhLibre(el, view) {
  let layer = view.layer || 'satellite';
  const m = new maplibregl.Map({ container: el, style: esriStyle(layer), center: [view.center.lng, view.center.lat], zoom: Math.min(view.zoom, 19.4), maxZoom: 21, attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false });
  m.touchZoomRotate.disableRotation();
  m.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), 'bottom-right');
  // 3D buildings: free OpenStreetMap building heights (OpenFreeMap), drawn over the satellite picture.
  let three = false;
  const add3d = () => {
    try {
      if (!m.getSource('ofm')) m.addSource('ofm', { type: 'vector', url: 'https://tiles.openfreemap.org/planet' });
      if (!m.getLayer('b3d')) m.addLayer({ id: 'b3d', type: 'fill-extrusion', source: 'ofm', 'source-layer': 'building', minzoom: 14,
        paint: { 'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6], 0, '#e9e4d8', 40, '#cfc6b3'],
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-opacity': 0.82 } });
    } catch (e) { console.warn('3D buildings', e); }
  };
  const markers = new Map();
  return {
    kind: 'free',
    setLayer(l) { layer = l; m.setStyle(esriStyle(l)); if (three) m.once('style.load', add3d); },
    set3d(on) {
      three = !!on;
      if (three) { if (m.isStyleLoaded()) add3d(); else m.once('load', add3d); m.dragRotate.enable(); m.touchZoomRotate.enableRotation(); m.easeTo({ pitch: 60, zoom: Math.max(m.getZoom(), 16.5), duration: 900 }); }
      else { try { if (m.getLayer('b3d')) m.removeLayer('b3d'); } catch (_) {} m.easeTo({ pitch: 0, bearing: 0, duration: 700 }); m.dragRotate.disable(); m.touchZoomRotate.disableRotation(); }
    },
    is3d: () => three,
    getView: () => ({ center: { lat: m.getCenter().lat, lng: m.getCenter().lng }, zoom: m.getZoom(), layer }),
    onViewChange(cb) { m.on('moveend', () => cb()); },
    onClick(cb) { m.on('click', (e) => cb({ lat: e.lngLat.lat, lng: e.lngLat.lng })); },
    onZoom(cb) { m.on('zoom', () => cb(m.getZoom())); },
    zoom: () => m.getZoom(),
    marker(id, ll, node, opts = {}) {
      const mk = new maplibregl.Marker({ element: node, anchor: 'center', draggable: !!opts.draggable }).setLngLat([ll.lng, ll.lat]).addTo(m);
      mk.on('dragend', () => { const p = mk.getLngLat(); opts.onDragEnd && opts.onDragEnd({ lat: p.lat, lng: p.lng }); });
      const h = { set(p) { mk.setLngLat([p.lng, p.lat]); }, setDraggable(b, fn) { mk.setDraggable(!!b); opts.onDragEnd = fn; }, remove() { mk.remove(); markers.delete(id); }, el: node };
      markers.set(id, h); return h;
    },
    flyTo(ll, z) { m.easeTo({ center: [ll.lng, ll.lat], zoom: z == null ? m.getZoom() : Math.min(z, 19.4), duration: 650 }); },
    fit(pts) { if (!pts.length) return; const b = pts.reduce((bb, p) => bb.extend([p.lng, p.lat]), new maplibregl.LngLatBounds([pts[0].lng, pts[0].lat], [pts[0].lng, pts[0].lat])); m.fitBounds(b, { padding: 70, maxZoom: 19, duration: 600 }); },
    resize() { m.resize(); },
    destroy() { m.remove(); },
    attribution: 'Esri satellite',
  };
}
function mhGoogle(el, view) {
  const g = google.maps; const TYPES = { satellite: 'satellite', hybrid: 'hybrid', roadmap: 'roadmap' };
  let layer = view.layer || 'satellite';
  const m = new g.Map(el, { center: view.center, zoom: view.zoom, mapTypeId: TYPES[layer], disableDefaultUI: true, zoomControl: true, zoomControlOptions: { position: g.ControlPosition.RIGHT_BOTTOM },
    scaleControl: true, gestureHandling: 'greedy', tilt: 0, rotateControl: false, clickableIcons: false, maxZoom: 22 });
  // HTML markers via an overlay (no Map ID needed), with our own dragging.
  class Html extends g.OverlayView {
    constructor(ll, node) { super(); this.ll = new g.LatLng(ll.lat, ll.lng); this.node = node; this.drag = false; this.setMap(m); }
    onAdd() { this.node.style.position = 'absolute'; this.getPanes().overlayMouseTarget.appendChild(this.node); this.bind(); }
    draw() { const p = this.getProjection().fromLatLngToDivPixel(this.ll); if (p) { this.node.style.left = p.x + 'px'; this.node.style.top = p.y + 'px'; } }
    onRemove() { this.node.remove(); }
    bind() {
      g.OverlayView.preventMapHitsAndGesturesFrom(this.node);
      this.node.addEventListener('pointerdown', (e) => {
        if (!this.drag) return; e.preventDefault(); e.stopPropagation(); this.node.setPointerCapture(e.pointerId);
        const proj = this.getProjection(); const start = proj.fromLatLngToDivPixel(this.ll); const sx = e.clientX, sy = e.clientY; let moved = false;
        this.node.classList.add('dragging');
        const mv = (ev) => { moved = true; const ll = proj.fromDivPixelToLatLng(new g.Point(start.x + ev.clientX - sx, start.y + ev.clientY - sy)); this.ll = ll; this.draw(); };
        const up = () => { this.node.removeEventListener('pointermove', mv); this.node.removeEventListener('pointerup', up); this.node.removeEventListener('pointercancel', up); this.node.classList.remove('dragging');
          if (moved && this.onDragEnd) this.onDragEnd({ lat: this.ll.lat(), lng: this.ll.lng() }); };
        this.node.addEventListener('pointermove', mv); this.node.addEventListener('pointerup', up); this.node.addEventListener('pointercancel', up);
      });
    }
  }
  // Google shows "For development purposes only" / "can't load Google Maps" when billing or the key is wrong.
  g.event.addListenerOnce(m, 'tilesloaded', () => setTimeout(() => { if (el.querySelector('.gm-err-container') || /development purposes only/i.test(el.innerText || '')) mhGoogleBroken('Google Maps refused the key (check billing)'); }, 1500));
  // Google Earth-style 3D: photorealistic 3D tiles drawn over the 2D map while 3D is on.
  let m3 = null, lib3 = null, pinLib = null;
  const sync3d = () => {
    if (!m3 || !lib3) return;
    m3.querySelectorAll('.mh-3dmk').forEach((x) => x.remove());
    for (const r of mhOnMap(MH.id).filter(mhVisible)) {
      const p = mhPreset(r);
      const mk = new lib3.Marker3DInteractiveElement({ position: { lat: r.lat, lng: r.lng }, altitudeMode: 'CLAMP_TO_GROUND', extruded: true, label: r.ref + (r.status === 'completed' ? ' ✓' : '') });
      mk.classList.add('mh-3dmk');
      if (pinLib && pinLib.PinElement) { try { const pin = new pinLib.PinElement({ background: p.color, borderColor: MH.sel === r.id ? '#ffffff' : '#00000055', glyphColor: '#ffffff', scale: MH.sel === r.id ? 1.4 : 1.1 }); mk.append(pin); } catch (_) {} }
      mk.addEventListener('gmp-click', (e) => { e.stopPropagation && e.stopPropagation(); if (!MH.adding) mhSelect(r.id); });
      m3.append(mk);
    }
  };
  const set3d = async (on) => {
    if (!on) { if (m3) { const c = m3.center; if (c) m.setCenter({ lat: c.lat, lng: c.lng }); m3.remove(); m3 = null; } const pad = el.querySelector('.mh-3dpad'); if (pad) pad.remove(); return; }
    if (m3) return;
    const lib = await g.importLibrary('maps3d'); const c = m.getCenter(); const phone = matchMedia('(max-width: 700px)').matches;
    m3 = new lib.Map3DElement({ center: { lat: c.lat(), lng: c.lng(), altitude: 0 }, range: Math.max(60, 591657550 / 2 ** m.getZoom() / 4), tilt: 60, heading: 0, mode: 'SATELLITE',
      qualityMode: 'FIDELITY', maxMemoryMegabytes: phone ? 768 : 2048, gestureHandling: 'GREEDY', minTilt: 0, maxTilt: 90, minAltitude: 0, defaultUIHidden: true });
    m3.className = 'mh-3d'; el.appendChild(m3);
    // our own camera pad: works the same with a mouse or a thumb
    const pad = document.createElement('div'); pad.className = 'mh-3dpad';
    const B = (a, label, svg) => `<button type="button" data-cam="${a}" aria-label="${label}" title="${label}">${svg}</button>`;
    pad.innerHTML = B('in', 'Closer', '+') + B('out', 'Further', '−') + B('left', 'Turn left', '⟲') + B('right', 'Turn right', '⟳') + B('up', 'Tilt up', '⤒') + B('down', 'Look down', '⤓') + B('orbit', 'Fly around', '◎') + B('north', 'Face north', 'N');
    el.appendChild(pad);
    const cam = (k) => {
      if (!m3) return; m3.stopCameraAnimation && m3.stopCameraAnimation();
      const cp = { center: m3.center, range: m3.range, tilt: m3.tilt, heading: m3.heading || 0 };
      if (k === 'in') cp.range = Math.max(2, cp.range * 0.6); if (k === 'out') cp.range = Math.min(20000, cp.range / 0.6);
      if (k === 'left') cp.heading = (cp.heading - 30 + 360) % 360; if (k === 'right') cp.heading = (cp.heading + 30) % 360;
      if (k === 'up') cp.tilt = Math.min(90, cp.tilt + 12); if (k === 'down') cp.tilt = Math.max(0, cp.tilt - 12);
      if (k === 'north') cp.heading = 0;
      if (k === 'orbit') return m3.flyCameraAround({ camera: cp, durationMillis: 16000, repeatCount: 1 });
      m3.flyCameraTo({ endCamera: cp, durationMillis: 450 });
    };
    let hold = 0;
    pad.addEventListener('pointerdown', (e) => { const b = e.target.closest('[data-cam]'); if (!b) return; e.preventDefault(); const k = b.dataset.cam; cam(k); if (k !== 'orbit' && k !== 'north') { clearInterval(hold); hold = setInterval(() => cam(k), 380); } });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => pad.addEventListener(ev, () => clearInterval(hold)));
    lib3 = lib; try { pinLib = await g.importLibrary('marker'); } catch (_) {}
    sync3d();
    // tap the 3D ground to add a manhole while "Add manhole" is on
    m3.addEventListener('gmp-click', (e) => { const p = e.position; if (MH.adding && p) mhMapClick({ lat: p.lat, lng: p.lng }); });
  };
  return {
    kind: 'google',
    set3d(on) { set3d(on).catch((e) => { console.warn('3D', e); toast('Google 3D couldn’t load here', true); }); },
    is3d: () => !!m3,
    sync3d,
    setLayer(l) { layer = l; m.setMapTypeId(TYPES[l] || 'satellite'); },
    getView: () => ({ center: { lat: m.getCenter().lat(), lng: m.getCenter().lng() }, zoom: m.getZoom(), layer }),
    onViewChange(cb) { m.addListener('idle', cb); },
    onClick(cb) { m.addListener('click', (e) => cb({ lat: e.latLng.lat(), lng: e.latLng.lng() })); },
    onZoom(cb) { m.addListener('zoom_changed', () => cb(m.getZoom())); },
    zoom: () => m.getZoom(),
    marker(id, ll, node, opts = {}) {
      const o = new Html(ll, node); o.drag = !!opts.draggable; o.onDragEnd = opts.onDragEnd;
      return { set(p) { o.ll = new g.LatLng(p.lat, p.lng); o.draw(); }, setDraggable(b, fn) { o.drag = !!b; o.onDragEnd = fn; }, remove() { o.setMap(null); }, el: node };
    },
    flyTo(ll, z) { m.panTo(ll); if (z != null) m.setZoom(z); },
    fit(pts) { if (!pts.length) return; const b = new g.LatLngBounds(); pts.forEach((p) => b.extend(p)); m.fitBounds(b, 70); g.event.addListenerOnce(m, 'idle', () => { if (m.getZoom() > 20) m.setZoom(20); }); },
    resize() {},
    destroy() {},
    geocode(q) { capi('POST', '/usage/gmaps', { kind: 'geo' }).catch(() => {}); return new Promise((resolve) => new g.Geocoder().geocode({ address: q, region: 'GB' }, (res, st) => resolve(st === 'OK' ? res.slice(0, 6).map((r) => ({ name: r.formatted_address, lat: r.geometry.location.lat(), lng: r.geometry.location.lng() })) : []))); },
    attribution: 'Google',
  };
}
const MH_PC = /^\s*([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})?\s*$/i;
async function mhSearchPlaces(q, eng, typing) {
  const ll = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(q);
  if (ll) return [{ name: `${ll[1]}, ${ll[2]}`, lat: Number(ll[1]), lng: Number(ll[2]), coords: true }];
  const out = [];
  const pc = MH_PC.exec(q); // UK postcodes, full or just the start (free postcodes.io)
  if (pc) {
    try {
      if (pc[2]) { const r = await (await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc[1] + pc[2])}`)).json(); if (r.result) out.push({ name: `${r.result.postcode} · ${[r.result.admin_ward, r.result.admin_district].filter(Boolean).join(', ')}`, lat: r.result.latitude, lng: r.result.longitude, pc: true }); }
      else { const r = await (await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc[1])}/autocomplete?limit=6`)).json(); for (const p of (r.result || []).slice(0, 5)) out.push({ name: p, postcode: p, pc: true }); }
    } catch (_) {}
    if (out.length) return out;
  }
  // Google only on Enter (each search counts against the free allowance); suggestions while typing come from free Photon.
  if (!typing && eng && eng.geocode) { const r = await eng.geocode(q); if (r.length) return r; }
  try {
    const v = eng ? eng.getView().center : null;
    const r = await (await fetch(`https://photon.komoot.io/api/?limit=6&lang=en&bbox=-8.8,49.8,2.0,61&q=${encodeURIComponent(q)}${v ? `&lat=${v.lat}&lon=${v.lng}` : ''}`)).json();
    for (const f of r.features || []) { const p = f.properties || {}; const street = [p.housenumber, p.street].filter(Boolean).join(' ');
      out.push({ name: [p.name && p.name !== street ? p.name : '', street, p.city || p.town || p.village || p.county, p.postcode].filter(Boolean).join(', '), lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] }); }
    if (out.length) return out;
  } catch (_) {}
  if (typing) return out;
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=gb&q=${encodeURIComponent(q)}`, { headers: { 'Accept-Language': 'en-GB' } });
    return (await r.json()).map((x) => ({ name: x.display_name, lat: Number(x.lat), lng: Number(x.lon) }));
  } catch (_) { return []; }
}

// ---- page state
const MH = { id: null, eng: null, marks: new Map(), mode: 'view', sel: null, adding: false, preset: store.get('cd_mhPreset') || '', filter: { status: new Set(), types: new Set() }, me: null, meMk: null, saveT: 0, pend: {} };
function mhRoot() { let r = $('#mh-root'); if (!r) { r = document.createElement('div'); r.id = 'mh-root'; document.body.appendChild(r); } return r; }
function mhClose() { MH.hintMode = null; const r = $("#mh-root"); if (r) { try { MH.eng && MH.eng.destroy(); } catch (_) {} r.remove(); } MH.eng = null; MH.marks.clear(); MH.id = null; MH.sel = null; MH.adding = false; document.documentElement.classList.remove('mh-on'); if (MH.watch != null) { navigator.geolocation.clearWatch(MH.watch); MH.watch = null; } }

VIEWS.mhmap = {
  manual: true,
  render(id) {
    const mp = S.mhMaps[id];
    if (!mp) return `<a class="back" href="#/files">${ic('back')}Files</a><div class="card empty"><h3>Map not found</h3><div class="small">It may have been deleted, or you don’t have access to its project.</div></div>`;
    return '<div class="mh-holder"></div>';
  },
  async mount(id) {
    const mp = S.mhMaps[id]; if (!mp) return;
    mhClose(); MH.id = id; MH.mode = store.get('cd_mhMode') === 'edit' ? 'edit' : 'view'; MH.sel = null;
    const p = S.projects[mp.projectId] || {};
    const root = mhRoot(); document.documentElement.classList.add('mh-on');
    root.innerHTML = `<div class="mh ${MH.mode === 'edit' ? 'editing' : ''}">
      <header class="mh-top">
        <a class="mh-ib" href="#/project/${mp.projectId}/maps" aria-label="Back to project">${icSize('back', 20)}</a>
        <div class="mh-title"><b class="ellipsis">${esc(mp.name)}</b><span class="ellipsis">${esc([p.ref, p.name].filter(Boolean).join(' · '))}</span></div>
        <div class="mh-mode seg" role="radiogroup" aria-label="Mode"><button class="${MH.mode === 'view' ? 'on' : ''}" data-act="mh-mode" data-m="view" role="radio" aria-checked="${MH.mode === 'view'}">${icSize('eye', 15)}View</button><button class="${MH.mode === 'edit' ? 'on' : ''}" data-act="mh-mode" data-m="edit" role="radio" aria-checked="${MH.mode === 'edit'}">${icSize('edit', 15)}Edit</button></div>
        <button class="mh-ib" data-act="mh-menu" aria-label="Map options" aria-haspopup="menu">${icSize('more', 20)}</button>
      </header>
      <div class="mh-body">
        <div class="mh-mapbox"><div id="mh-map"></div>
          <div class="mh-tools">
            <div class="mh-search"><span>${icSize('search', 16)}</span><input type="search" placeholder="Search address, place or lat, lng" data-mh-search autocomplete="off" enterkeyhint="search" aria-label="Search the map"><div class="mh-results" hidden></div></div>
            <div class="mh-toolrow">
              <button class="mh-chip" data-act="mh-coords" aria-label="Coordinates">${icSize('pin', 15)}<span class="mh-cl">Coordinates</span></button>
              <button class="mh-chip" data-act="mh-layers">${icSize('layers', 15)}<span data-layer-label></span></button>
              <button class="mh-chip${MH.want3d ? ' on' : ''}" data-act="mh-3d" aria-pressed="${!!MH.want3d}">${icSize('layers', 15)}3D</button>
              <button class="mh-chip" data-act="mh-filter" aria-label="Filter">${icSize('filter', 15)}<span class="mh-cl">Filter</span><i class="mh-fdot" hidden></i></button>
              <button class="mh-chip" data-act="mh-locate" aria-label="Show my location">${icSize('locate', 15)}Me</button>
            </div>
          </div>
          <div class="mh-modebar" aria-live="polite"></div>
          <div class="mh-add">
            <button class="mh-preset" data-act="mh-pick-preset" aria-label="Type for new manholes"></button>
            <button class="mh-addbtn" data-act="mh-add">${icSize('plus', 22)}<span>Add manhole</span></button>
          </div>
          <div class="mh-legend"></div>
        </div>
        <aside class="mh-panel" aria-label="Manhole details" hidden></aside>
      </div></div>`;
    const local = store.get('cd_mhView_' + id); let view = null; try { view = local ? JSON.parse(local) : null; } catch (_) {}
    view = view || { center: mp.center, zoom: mp.zoom, layer: mp.layer || 'satellite' };
    try {
      const r = await capi('GET', `/mh/maps/${id}`); for (const k of Object.keys(S.manholes)) if (S.manholes[k].mapId === id) delete S.manholes[k];
      for (const it of r.manholes) S.manholes[it.id] = it; S.mhMaps[id] = Object.assign(S.mhMaps[id] || {}, r.item);
    } catch (e) { toast(e.message, true); }
    if (MH.id !== id) return;
    try { MH.eng = await mhEngine($('#mh-map'), view); } catch (e) { $('#mh-map').innerHTML = `<div class="map-msg">The map couldn’t load: ${esc(e.message)}</div>`; return; }
    if (MH.id !== id) return;
    if (MH.want3d && MH.eng.set3d) MH.eng.set3d(true);
    MH.eng.onClick((ll) => mhMapClick(ll));
    MH.eng.onViewChange(() => mhViewChanged());
    MH.eng.onZoom((z) => $('#mh-root .mh') && $('#mh-root .mh').classList.toggle('far', z < 16));
    $('#mh-root .mh').classList.toggle('far', view.zoom < 16);
    mhPaintChrome(); mhSyncMarkers();
    if (!local && mhOnMap(id).length) MH.eng.fit(mhOnMap(id));
    const inp = $('[data-mh-search]'); let t = 0;
    inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => mhSearch(inp.value), 250); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(t); mhSearch(inp.value, true); } if (e.key === 'Escape') { inp.value = ''; mhSearch(''); } });
    const want = parseHash().args[1]; if (want && S.manholes[want]) mhSelect(want, true);
  },
  update(id) { if (MH.id !== id || !MH.eng) return; mhSyncMarkers(); mhPaintChrome(); if (MH.sel) mhPaintPanel(); },
};

function mhPaintChrome() {
  const root = $('#mh-root .mh'); if (!root) return;
  root.classList.toggle('editing', MH.mode === 'edit'); root.classList.toggle('adding', MH.adding);
  $$('#mh-root [data-act="mh-mode"]').forEach((b) => { const on = b.dataset.m === MH.mode; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  const lv = MH.eng ? MH.eng.getView().layer : 'satellite'; const ll = $('#mh-root [data-layer-label]'); if (ll) ll.textContent = { satellite: 'Satellite', hybrid: 'Hybrid', roadmap: 'Map' }[lv];
  const bar = $('#mh-root .mh-modebar');
  if (MH.adding || MH.hintMode !== MH.mode) { bar.classList.remove('gone'); clearTimeout(MH.hintT); if (!MH.adding) { MH.hintMode = MH.mode; MH.hintT = setTimeout(() => bar.classList.add('gone'), 2500); } }
  bar.innerHTML = MH.adding ? `${icSize('pin', 16)}<span>Tap the map where <b>${esc(mhNextRef())}</b> is — or</span><button data-act="mh-add-here">use my GPS position</button><button data-act="mh-add-cancel">Cancel</button>`
    : MH.mode === 'edit' ? `${icSize('edit', 15)}<span><b>Edit mode</b> — add, drag and edit manholes</span>` : `${icSize('eye', 15)}<span><b>View mode</b> — tap a manhole to see it</span>`;
  const pr = S.mhPresets[MH.preset] || mhPresetList().find((q) => q.name === 'Unknown') || mhPresetList()[0]; if (pr) MH.preset = pr.id;
  const pb = $('#mh-root .mh-preset'); if (pb && pr) { pb.style.setProperty('--c', pr.color); pb.innerHTML = `<span class="mh-dotic">${mhIcon(pr.icon, 16)}</span><span class="ellipsis">${esc(pr.name)}</span>${icSize('down', 14)}`; }
  const f = MH.filter; const fd = $('#mh-root .mh-fdot'); if (fd) fd.hidden = !(f.status.size || f.types.size);
  // legend: what's on this map
  const list = mhOnMap(MH.id); const types = {}; for (const r of list) { const p = mhPreset(r); types[p.name] = types[p.name] || { p, n: 0 }; types[p.name].n++; }
  const done = list.filter((r) => r.status === 'completed').length;
  const lg = $('#mh-root .mh-legend'); if (lg) lg.innerHTML = list.length ? `<b>${list.length}</b> manholes · <span style="color:#30a46c">${done} done</span>${Object.values(types).slice(0, 5).map(({ p, n }) => `<span class="lg"><i style="background:${esc(p.color)}"></i>${esc(p.name)} ${n}</span>`).join('')}` : 'No manholes yet';
}
function mhNextRef() { const mp = S.mhMaps[MH.id] || {}; const used = new Set(mhOnMap(MH.id).map((r) => r.ref)); let n = mp.seq || 0, r; do { n++; r = 'MH' + String(n).padStart(3, '0'); } while (used.has(r)); return r; }
function mhVisible(r) { const f = MH.filter; return (!f.status.size || f.status.has(r.status)) && (!f.types.size || f.types.has(r.presetId)); }
function mhMarkerNode(r) {
  const p = mhPreset(r); const st = MH_ST[r.status] || MH_ST.not_started;
  const d = document.createElement('div'); d.className = `mhm st-${r.status}${MH.sel === r.id ? ' sel' : ''}`; d.dataset.id = r.id; d.style.setProperty('--c', p.color); d.style.setProperty('--s', st[1]);
  d.innerHTML = `<span class="mhm-ic">${mhIcon(p.icon, 15)}</span><span class="mhm-ref">${esc(r.ref)}</span>${r.status === 'completed' ? `<i class="mhm-tick">${icSize('check', 9)}</i>` : ''}`;
  d.setAttribute('role', 'button'); d.setAttribute('aria-label', `${r.ref}, ${p.name}, ${st[0]}`);
  d.addEventListener('click', (e) => { e.stopPropagation(); if (MH.adding) return; mhSelect(r.id); });
  return d;
}
function mhSyncMarkers() {
  if (!MH.eng) return;
  if (MH.eng.sync3d) MH.eng.sync3d();
  const want = new Map(mhOnMap(MH.id).filter(mhVisible).map((r) => [r.id, r]));
  for (const [id, h] of MH.marks) if (!want.has(id)) { h.remove(); MH.marks.delete(id); }
  for (const [id, r] of want) {
    const sig = [r.lat, r.lng, r.ref, r.status, r.presetId, mhPreset(r).color, mhPreset(r).icon, MH.sel === id, MH.mode].join('|');
    let h = MH.marks.get(id);
    if (h && h.sig === sig) continue;
    if (h) h.remove();
    const node = mhMarkerNode(r);
    h = MH.eng.marker(id, r, node, { draggable: MH.mode === 'edit', onDragEnd: (ll) => mhMoved(id, ll) }); h.sig = sig; MH.marks.set(id, h);
    if (h.isNew !== false && MH.fresh === id) { node.classList.add('drop-in'); MH.fresh = null; }
  }
}
function mhViewChanged() {
  if (!MH.eng || !MH.id) return; const v = MH.eng.getView();
  try { store.set('cd_mhView_' + MH.id, JSON.stringify(v)); } catch (_) {}
  clearTimeout(MH.saveT); MH.saveT = setTimeout(() => { if (MH.id) capi('PATCH', `/mh/maps/${MH.id}`, { center: v.center, zoom: v.zoom, layer: v.layer }).catch(() => {}); }, 4000);
}
async function mhMapClick(ll) {
  $('#mh-root .mh-results') && ($('#mh-root .mh-results').hidden = true);
  if (MH.adding) return mhCreate(ll);
  if (MH.sel) mhSelect(null);
}
async function mhCreate(ll) {
  MH.adding = false; mhPaintChrome();
  try {
    const r = await capi('POST', `/mh/maps/${MH.id}/manholes`, { lat: ll.lat, lng: ll.lng, presetId: MH.preset });
    S.manholes[r.item.id] = r.item; const mp = S.mhMaps[MH.id]; if (mp) mp.seq = Math.max(mp.seq || 0, Number(r.item.ref.replace(/\D/g, '')) || 0);
    MH.fresh = r.item.id; mhSyncMarkers(); mhSelect(r.item.id); if (navigator.vibrate) try { navigator.vibrate(15); } catch (_) {}
    toast(`${r.item.ref} added`);
  } catch (e) { toast(e.message, true); }
}
async function mhMoved(id, ll) {
  const r = S.manholes[id]; if (!r) return;
  await mhSave(id, { lat: ll.lat, lng: ll.lng }, `${r.ref} moved`);
}
// Save some fields. If someone else changed the same fields since we last saw the record, show both and let the person choose.
async function mhSave(id, patch, okMsg) {
  const r = S.manholes[id]; if (!r) return;
  try {
    const res = await capi('PATCH', `/mh/manholes/${id}`, Object.assign({ base: r.v }, patch));
    S.manholes[id] = res.item; mhSyncMarkers(); mhPaintChrome(); if (MH.sel === id) mhPaintPanel(); if (okMsg) toast(okMsg);
    return true;
  } catch (e) {
    if (e.status === 409 && e.data && e.data.item) {
      const theirs = e.data.item; S.manholes[id] = theirs; mhSyncMarkers(); if (MH.sel === id) mhPaintPanel();
      const who = member(theirs.updatedBy).name;
      const show = (k) => { const v = k.startsWith('survey.') ? (theirs.survey || {})[k.slice(7)] : theirs[k]; const mine = k.startsWith('survey.') ? (patch.survey || {})[k.slice(7)] : patch[k]; const lbl = k.replace('survey.', '').replace(/([A-Z])/g, ' $1').toLowerCase();
        const f = (x) => (k === 'status' ? (MH_ST[x] || [x])[0] : k === 'presetId' ? ((S.mhPresets[x] || {}).name || '—') : x == null || x === '' ? '—' : String(x)); return `<div class="row between small"><span class="muted">${esc(lbl)}</span><span>${esc(who)}: <b>${esc(f(v))}</b> · you: <b>${esc(f(mine))}</b></span></div>`; };
      const ok = await confirmBox('Someone else just changed this', `${who} saved a change to ${theirs.ref} while you were editing. Keep their version, or replace it with yours?`, 'Use mine', false, `<div class="stack tight" style="margin:10px 0">${e.data.conflict.map(show).join('')}</div>`);
      if (ok) { try { const res = await capi('PATCH', `/mh/manholes/${id}`, Object.assign({ base: theirs.v, force: true }, patch)); S.manholes[id] = res.item; mhSyncMarkers(); if (MH.sel === id) mhPaintPanel(); toast('Saved your version'); } catch (e2) { toast(e2.message, true); } }
      else toast('Kept their version');
      return false;
    }
    toast(e.message, true); mhSyncMarkers(); if (MH.sel === id) mhPaintPanel(); return false;
  }
}
function mhSelect(id, fly) {
  MH.sel = id; const panel = $('#mh-root .mh-panel'); if (!panel) return;
  $$('#mh-root .mhm.sel').forEach((x) => x.classList.remove('sel'));
  if (!id) { panel.classList.add('closing'); setTimeout(() => { panel.hidden = true; panel.classList.remove('closing'); }, 200); $('#mh-root .mh').classList.remove('has-panel'); mhSyncMarkers(); setTimeout(() => MH.eng && MH.eng.resize(), 220); return; }
  const r = S.manholes[id]; if (!r) return;
  const h = MH.marks.get(id); if (h) { h.el.classList.remove('pop'); void h.el.offsetWidth; h.el.classList.add('sel', 'pop'); }
  panel.hidden = false; panel.classList.remove('closing'); $('#mh-root .mh').classList.add('has-panel');
  mhPaintPanel(true); setTimeout(() => MH.eng && MH.eng.resize(), 260);
  if (fly && MH.eng) MH.eng.flyTo(r, Math.max(MH.eng.zoom(), 19));
}
function mhField(r, f, edit) {
  const [k, label, unit, kind, opts] = f; const v = (r.survey || {})[k];
  if (!edit) return v == null || v === '' ? '' : `<div class="mh-kv"><span>${esc(label)}</span><b>${esc(String(v))}${unit ? ' ' + unit : ''}</b></div>`;
  const id = 'mhf-' + k;
  if (kind === 'long') return `<label class="field full"><span>${esc(label)}</span><textarea id="${id}" rows="2" data-mh-f="survey.${k}" placeholder="Optional">${esc(v || '')}</textarea></label>`;
  if (kind === 'text') return `<label class="field"><span>${esc(label)}</span><input id="${id}" list="${id}-l" data-mh-f="survey.${k}" value="${esc(v || '')}" placeholder="Optional" autocomplete="off">${opts ? `<datalist id="${id}-l">${opts.map((o) => `<option value="${esc(o)}">`).join('')}</datalist>` : ''}</label>`;
  return `<label class="field"><span>${esc(label)}${unit ? ` <span class="hint">(${unit})</span>` : ''}</span><input id="${id}" type="number" inputmode="decimal" step="${kind === 'int' ? 1 : 'any'}" ${kind === 'int' ? 'min="0"' : ''} data-mh-f="survey.${k}" value="${v == null ? '' : esc(String(v))}" placeholder="—"></label>`;
}
function mhPaintPanel(fresh) {
  const panel = $('#mh-root .mh-panel'); const r = S.manholes[MH.sel]; if (!panel || !r) return;
  if (r.deleted) { panel.innerHTML = `<div class="mh-ph"><button class="mh-ib" data-act="mh-close" aria-label="Close">${icSize('x', 18)}</button></div><div class="card empty small">${esc(r.ref)} was deleted by ${personName(r.deleted.by)}.<button class="btn sm" style="margin-top:10px" data-act="mh-restore" data-id="${r.id}">Restore it</button></div>`; return; }
  // don't redraw under someone typing; just mark the change
  const typing = panel.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  if (typing && !fresh) { panel.classList.add('stale'); return; }
  const p = mhPreset(r); const edit = MH.mode === 'edit'; const st = MH_ST[r.status] || MH_ST.not_started;
  const scroll = panel.querySelector('.mh-pbody') ? panel.querySelector('.mh-pbody').scrollTop : 0;
  const surveyView = MH_SURVEY_FIELDS.map((f) => mhField(r, f, false)).join('');
  panel.classList.remove('stale');
  panel.innerHTML = `<div class="mh-grab" data-act="mh-grab"></div>
    <div class="mh-ph" style="--c:${esc(p.color)}">
      <span class="mh-bigic">${mhIcon(p.icon, 22)}</span>
      <div class="grow" style="min-width:0">${edit ? `<input class="mh-ref-in" value="${esc(r.ref)}" data-mh-f="ref" maxlength="20" aria-label="Reference">` : `<b class="mh-ref">${esc(r.ref)}</b>`}
        ${edit ? `<select class="mh-type-in" data-mh-f="presetId" aria-label="Type">${mhPresetList().map((q) => `<option value="${q.id}" ${q.id === r.presetId ? 'selected' : ''}>${esc(q.name)}</option>`).join('')}${S.mhPresets[r.presetId] ? '' : `<option selected>${esc(p.name)} (removed type)</option>`}</select>` : `<span class="mh-type">${esc(p.name)}</span>`}</div>
      <button class="mh-ib" data-act="mh-close" aria-label="Close">${icSize('x', 18)}</button></div>
    <div class="mh-pbody">
      <div class="mh-status" role="radiogroup" aria-label="Status">${Object.entries(MH_ST).map(([k, [l, c]]) => `<button class="${r.status === k ? 'on' : ''}" style="--s:${c}" data-act="mh-status" data-s="${k}" role="radio" aria-checked="${r.status === k}" ${edit ? '' : 'aria-disabled="true"'}>${k === 'completed' ? icSize('check', 14) : k === 'in_progress' ? icSize('clock', 14) : '<i class="dot"></i>'}${l}</button>`).join('')}</div>
      ${edit ? '' : `<p class="tiny muted" style="margin:-4px 0 10px">Switch to <b>Edit</b> to change the status, add photos or fill in details.</p>`}
      <section class="mh-sec"><h4>Location</h4>
        ${edit ? `<div class="form-grid"><label class="field"><span>Latitude</span><input type="number" step="any" inputmode="decimal" data-mh-f="lat" value="${r.lat}"></label><label class="field"><span>Longitude</span><input type="number" step="any" inputmode="decimal" data-mh-f="lng" value="${r.lng}"></label></div>
          <div class="row wrap tight" style="margin-top:8px"><button class="btn sm" data-act="mh-move-gps">${icSize('locate', 14)}Move to my GPS position</button><span class="tiny muted">or drag the marker on the map</span></div>`
          : `<div class="mh-kv"><span>Position</span><b class="mono">${fmtLL(r.lat)}, ${fmtLL(r.lng)}</b></div>`}
        <div class="row wrap tight" style="margin-top:8px"><button class="btn sm" data-act="mh-copy" data-v="${fmtLL(r.lat)}, ${fmtLL(r.lng)}">${icSize('copy', 14)}Copy</button><a class="btn sm" href="${isIOS() ? `https://maps.apple.com/?daddr=${r.lat},${r.lng}&dirflg=d` : `https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}`}" target="_blank" rel="noopener">${icSize('route', 14)}Directions</a></div></section>
      <section class="mh-sec"><h4>Description</h4>${edit ? `<textarea rows="2" data-mh-f="description" placeholder="e.g. In footpath outside no. 14, cast iron cover">${esc(r.description || '')}</textarea>` : `<p class="pre small">${r.description ? linkify(r.description) : '<span class="muted">No description</span>'}</p>`}</section>
      <section class="mh-sec"><div class="row between"><h4>Photos <span class="muted">${(r.photos || []).length || ''}</span></h4>${edit ? `<button class="btn sm primary" data-act="mh-photo">${ic('camera')}<span>${isTouch() ? 'Take / add photo' : 'Add photos'}</span></button>` : ''}</div>
        ${(r.photos || []).length || (MH.pend[r.id] || []).length ? `<div class="mh-photos">${(r.photos || []).map((ph, i) => `<figure class="mh-pic"><button data-act="mh-photo-open" data-i="${i}" aria-label="Open photo ${i + 1}"><img src="${esc(ph.thumb)}" alt="${esc(ph.caption || r.ref + ' photo ' + (i + 1))}" loading="lazy"></button>
          <figcaption>${edit ? `<input value="${esc(ph.caption || '')}" placeholder="Add a caption" data-mh-cap="${ph.id}" maxlength="300">` : esc(ph.caption || '')}<span class="tiny muted">${esc(firstName(ph.by))} · ${esc(fmtDate(new Date(ph.at).toISOString().slice(0, 10)))}</span></figcaption>
          ${edit && (isAdmin() || ph.by === S.user.id) ? `<button class="mh-pic-x" data-act="mh-photo-del" data-p="${ph.id}" aria-label="Remove photo">${icSize('x', 12)}</button>` : ''}</figure>`).join('')}
          ${(MH.pend[r.id] || []).map((u) => `<figure class="mh-pic up"><img src="${u.preview}" alt=""><figcaption class="tiny muted">${u.failed ? 'Failed' : 'Uploading…'}</figcaption></figure>`).join('')}</div>` : `<p class="small muted">No photos yet.</p>`}</section>
      <section class="mh-sec"><h4>Survey details</h4>${edit ? `<div class="form-grid">${MH_SURVEY_FIELDS.map((f) => mhField(r, f, true)).join('')}</div>` : surveyView || '<p class="small muted">Nothing recorded yet.</p>'}</section>
      <section class="mh-sec"><h4>Notes <span class="muted">${(r.notes || []).length || ''}</span></h4>
        ${(r.notes || []).map((n) => `<div class="mh-note">${avatar(member(n.by), 'xs')}<div class="grow"><div class="tiny muted">${personName(n.by)} · ${esc(timeAgo(n.at))}</div><p class="pre small">${linkify(n.text)}</p></div>${isAdmin() || n.by === S.user.id ? `<button class="btn ghost sm icon" data-act="mh-note-del" data-n="${n.id}" aria-label="Delete note">${icSize('trash', 14)}</button>` : ''}</div>`).join('')}
        <form class="mh-noteform" data-form="mh-note"><textarea name="text" rows="1" placeholder="Add a note for the team" required maxlength="2000"></textarea><button class="btn sm primary">${icSize('send', 14)}</button></form></section>
      <section class="mh-sec"><h4>Record</h4>
        <div class="mh-kv"><span>Recorded</span><b>${esc(fmtDateTime(r.createdAt))} · ${personName(r.createdBy)}</b></div>
        <div class="mh-kv"><span>Last updated</span><b>${esc(fmtDateTime(r.updatedAt))} · ${personName(r.updatedBy)}</b></div>
        <div class="mh-kv"><span>Edited by</span><b>${avatarStack(r.editors || [], 6)}</b></div>
        <details class="mh-hist"><summary>History (${(r.history || []).length})</summary>${(r.history || []).slice().reverse().map((h) => `<div class="mh-h"><span class="tiny muted">${esc(fmtDateTime(h.at))}</span><span class="small"><b>${esc(firstName(h.by))}</b> ${esc(h.detail)}</span></div>`).join('')}</details></section>
      ${edit ? `<button class="btn block ghost danger" data-act="mh-del" style="margin:6px 0 20px">${ic('trash')}Delete ${esc(r.ref)}</button>` : ''}
    </div>`;
  const body = panel.querySelector('.mh-pbody'); if (body && !fresh) body.scrollTop = scroll;
  panel.querySelectorAll('[data-mh-f]').forEach((inp) => inp.addEventListener('change', () => mhFieldChanged(inp)));
  panel.querySelectorAll('[data-mh-cap]').forEach((inp) => inp.addEventListener('change', async () => { try { const res = await capi('PATCH', `/mh/manholes/${r.id}/photos/${inp.dataset.mhCap}`, { caption: inp.value }); S.manholes[r.id] = res.item; toast('Caption saved'); } catch (e) { toast(e.message, true); } }));
  panel.addEventListener('focusout', () => setTimeout(() => { if (panel.classList.contains('stale') && !panel.contains(document.activeElement)) mhPaintPanel(); }, 50), { once: true });
}
function mhFieldChanged(inp) {
  const r = S.manholes[MH.sel]; if (!r) return; const k = inp.dataset.mhF; let v = inp.value;
  if (k === 'lat' || k === 'lng') { v = Number(v); if (!Number.isFinite(v)) return toast('Enter a number', true); return mhSave(r.id, { lat: k === 'lat' ? v : r.lat, lng: k === 'lng' ? v : r.lng }, `${r.ref} moved`); }
  if (k.startsWith('survey.')) return mhSave(r.id, { survey: { [k.slice(7)]: v } });
  return mhSave(r.id, { [k]: v }, k === 'ref' ? 'Reference changed' : k === 'presetId' ? 'Type changed' : '');
}
A['mh-mode'] = (el) => { MH.mode = el.dataset.m; store.set('cd_mhMode', MH.mode); if (MH.mode === 'view') MH.adding = false; for (const h of MH.marks.values()) h.sig = ''; mhSyncMarkers(); mhPaintChrome(); if (MH.sel) mhPaintPanel(true); };
A['mh-close'] = () => mhSelect(null);
A['mh-add'] = () => { if (MH.mode !== 'edit') { MH.mode = 'edit'; store.set('cd_mhMode', 'edit'); for (const h of MH.marks.values()) h.sig = ''; mhSyncMarkers(); } MH.adding = !MH.adding; mhSelect(null); mhPaintChrome(); };
A['mh-add-cancel'] = () => { MH.adding = false; mhPaintChrome(); };
A['mh-add-here'] = async () => { const pos = await mhGps(); if (pos) { MH.eng.flyTo(pos, Math.max(MH.eng.zoom(), 19)); mhCreate(pos); } };
A['mh-move-gps'] = async () => { const r = S.manholes[MH.sel]; const pos = await mhGps(); if (r && pos) { await mhSave(r.id, { lat: pos.lat, lng: pos.lng }, `${r.ref} moved to your position (±${Math.round(pos.acc)} m)`); MH.eng.flyTo(pos); } };
function mhGps() {
  if (!navigator.geolocation) { toast('This device can’t share its location', true); return Promise.resolve(null); }
  toast('Finding your position…');
  return new Promise((resolve) => navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }), (e) => { toast(e.code === 1 ? 'Allow location access to use your position' : 'Couldn’t get your position', true); resolve(null); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }));
}
A['mh-locate'] = () => {
  if (!navigator.geolocation) return toast('This device can’t share its location', true);
  if (MH.watch != null) { if (MH.me) MH.eng.flyTo(MH.me, Math.max(MH.eng.zoom(), 18)); return; }
  let first = true;
  MH.watch = navigator.geolocation.watchPosition((p) => {
    MH.me = { lat: p.coords.latitude, lng: p.coords.longitude };
    if (!MH.meMk) { const d = document.createElement('div'); d.className = 'mh-me'; MH.meMk = MH.eng.marker('me', MH.me, d, {}); } else MH.meMk.set(MH.me);
    if (first) { first = false; MH.eng.flyTo(MH.me, Math.max(MH.eng.zoom(), 18)); }
  }, (e) => toast(e.code === 1 ? 'Allow location access to show where you are' : 'Couldn’t get your position', true), { enableHighAccuracy: true, maximumAge: 5000 });
};
A['mh-status'] = (el) => { const r = S.manholes[MH.sel]; if (!r) return; if (MH.mode !== 'edit') return toast('Switch to Edit mode to change the status'); if (r.status === el.dataset.s) return; mhSave(r.id, { status: el.dataset.s }, `${r.ref}: ${MH_ST[el.dataset.s][0]}`); };
A['mh-copy'] = (el) => { try { navigator.clipboard.writeText(el.dataset.v); toast('Coordinates copied'); } catch (_) { toast(el.dataset.v); } };
A['mh-del'] = async () => {
  const r = S.manholes[MH.sel]; if (!r) return;
  if (!(await confirmBox(`Delete ${r.ref}?`, 'It disappears from the map and exports. Its history and photos are kept, so it can be restored.', 'Delete'))) return;
  try { const res = await capi('DELETE', `/mh/manholes/${r.id}`); S.manholes[r.id] = res.item; mhSelect(null); mhSyncMarkers(); mhPaintChrome(); toast(`${r.ref} deleted`, false, '', { label: 'Undo', fn: () => A['mh-restore']({ dataset: { id: r.id } }) }); }
  catch (e) { toast(e.message, true); }
};
A['mh-restore'] = async (el) => { try { const res = await capi('POST', `/mh/manholes/${el.dataset.id}/restore`); S.manholes[res.item.id] = res.item; mhSyncMarkers(); mhPaintChrome(); if (MH.sel === res.item.id) mhPaintPanel(true); toast(`${res.item.ref} restored`); } catch (e) { toast(e.message, true); } };
F['mh-note'] = async (f, d) => { const r = S.manholes[MH.sel]; if (!r) return; const res = await capi('POST', `/mh/manholes/${r.id}/notes`, { text: d.text }); S.manholes[r.id] = res.item; f.reset(); mhPaintPanel(true); };
A['mh-note-del'] = async (el) => { const r = S.manholes[MH.sel]; if (!r || !(await confirmBox('Delete this note?', 'It’s removed for everyone.'))) return; try { const res = await capi('DELETE', `/mh/manholes/${r.id}/notes/${el.dataset.n}`); S.manholes[r.id] = res.item; mhPaintPanel(true); } catch (e) { toast(e.message, true); } };
A['mh-photo-open'] = (el) => { const r = S.manholes[MH.sel]; if (!r) return; openViewer((r.photos || []).map((ph) => ({ id: ph.id, url: ph.url, caption: ph.caption, by: ph.by, at: ph.at, alt: ph.caption || r.ref })), Number(el.dataset.i)); };
A['mh-photo-del'] = async (el) => { const r = S.manholes[MH.sel]; if (!r || !(await confirmBox('Remove this photo?', 'It’s deleted for everyone.', 'Remove'))) return; try { const res = await capi('DELETE', `/mh/manholes/${r.id}/photos/${el.dataset.p}`); S.manholes[r.id] = res.item; mhPaintPanel(true); } catch (e) { toast(e.message, true); } };
A['mh-photo'] = async () => {
  const r = S.manholes[MH.sel]; if (!r) return; const id = r.id;
  const files = await choosePhotos({ multiple: true, title: `Photos of ${r.ref}` }); if (!files || !files.length) return;
  const list = MH.pend[id] = MH.pend[id] || [];
  for (const file of files) {
    let ph; try { ph = await processPhoto(file, { max: 2000, thumb: 520 }); } catch (e) { toast(e.message, true); continue; }
    const u = { preview: ph.thumb || ph.data, failed: false }; list.push(u); mhPaintPanel(true);
    try { const res = await sendWithProgress('POST', `/api/c/${S.cid}/mh/manholes/${id}/photos`, { image: ph.data, thumb: ph.thumb, w: ph.w, h: ph.h, takenAt: ph.takenAt }); S.manholes[id] = res.item; list.splice(list.indexOf(u), 1); }
    catch (e) { u.failed = true; toast(e.message, true); setTimeout(() => { list.splice(list.indexOf(u), 1); if (MH.sel === id) mhPaintPanel(true); }, 2500); }
    if (MH.sel === id) mhPaintPanel(true);
  }
};
A['mh-grab'] = () => { const p = $('#mh-root .mh-panel'); if (p) p.classList.toggle('tall'); };
// search: addresses, places, or typed coordinates
let mhSeq = 0;
async function mhSearch(q, go) {
  const box = $('#mh-root .mh-results'); if (!box) return; q = q.trim();
  if (q.length < 2) { box.hidden = true; return; }
  const seq = ++mhSeq; const hits = mhOnMap(MH.id).filter((r) => r.ref.toLowerCase().includes(q.toLowerCase())).slice(0, 5);
  if (go && hits.length && hits[0].ref.toLowerCase() === q.toLowerCase()) { box.hidden = true; mhSelect(hits[0].id, true); mhBlur(); return; }
  let res = await mhSearchPlaces(q, MH.eng, !go); if (seq !== mhSeq) return;
  if (go) { // Enter: go straight to the best match
    let top = res[0]; if (top && top.postcode) { const r2 = await mhSearchPlaces(top.postcode, MH.eng, true); top = r2[0]; }
    if (top && top.lat != null) { box.hidden = true; MH.eng.flyTo(top, top.coords ? 19 : 18); mhBlur(); return; }
    if (hits.length) { box.hidden = true; mhSelect(hits[0].id, true); mhBlur(); return; }
  }
  box.hidden = false;
  box.innerHTML = (hits.map((r) => `<button data-act="mh-goto-mh" data-id="${r.id}">${mhIcon(mhPreset(r).icon, 15)}<span><b>${esc(r.ref)}</b> · ${esc(mhPreset(r).name)}</span></button>`).join('')
    + res.map((x) => `<button data-act="mh-goto" ${x.postcode ? `data-pc="${esc(x.postcode)}"` : `data-lat="${x.lat}" data-lng="${x.lng}"`}>${icSize(x.coords || x.pc ? 'pin' : 'search', 15)}<span class="ellipsis">${esc(x.name)}</span></button>`).join(''))
    || '<div class="small muted" style="padding:10px 12px">No places found</div>';
}
function mhBlur() { const i = $('[data-mh-search]'); if (i) i.blur(); }
A['mh-goto'] = async (el) => {
  if (el.dataset.pc) { const i = $('[data-mh-search]'); if (i) i.value = el.dataset.pc; return mhSearch(el.dataset.pc, true); }
  $('#mh-root .mh-results').hidden = true; mhBlur(); MH.eng.flyTo({ lat: Number(el.dataset.lat), lng: Number(el.dataset.lng) }, 18);
};
A['mh-goto-mh'] = (el) => { $('#mh-root .mh-results').hidden = true; mhSelect(el.dataset.id, true); };
A['mh-coords'] = () => {
  const v = MH.eng.getView();
  sheet(`${sheetHead('Coordinates')}<form class="stack" data-form="mh-coords"><p class="small muted" style="margin:0">Decimal degrees (WGS84), e.g. 54.776100, -1.585100.</p>
    <div class="form-grid"><label class="field"><span>Latitude</span><input name="lat" type="number" step="any" inputmode="decimal" value="${fmtLL(v.center.lat)}" required></label><label class="field"><span>Longitude</span><input name="lng" type="number" step="any" inputmode="decimal" value="${fmtLL(v.center.lng)}" required></label></div>
    <div class="err-msg" data-err></div>
    <div class="sheet-foot"><button type="submit" class="btn" name="go" value="centre">${icSize('locate', 15)}Centre map here</button>${MH.mode === 'edit' ? `<button type="submit" class="btn primary" name="go" value="add">${ic('plus')}Add manhole here</button>` : ''}</div></form>`);
};
F['mh-coords'] = async (f, d, close) => {
  const lat = Number(d.lat), lng = Number(d.lng);
  if (!(lat >= -90 && lat <= 90) || !(lng >= -180 && lng <= 180)) throw new Error('Latitude must be −90 to 90 and longitude −180 to 180');
  const add = f._submitter === 'add'; close(); MH.eng.flyTo({ lat, lng }, 19); if (add) mhCreate({ lat, lng });
};
document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('form[data-form="mh-coords"] button[name="go"]'); if (b) b.form._submitter = b.value; }, true);
A['mh-layers'] = (el) => popMenu(el, `<div class="head"><b>Map view</b></div>${[['satellite', 'Satellite'], ['hybrid', 'Hybrid (satellite + labels)'], ['roadmap', 'Standard map']].map(([k, l]) => `<button class="mi" data-act="mh-layer" data-l="${k}">${MH.eng.getView().layer === k ? icSize('check', 16) : '<span style="width:16px;display:inline-block"></span>'}${l}</button>`).join('')}
  <div class="sep"></div><div class="tiny muted" style="padding:4px 12px 8px">${MH.eng.kind === 'google' ? 'Imagery © Google' : 'Free Esri satellite imagery. Add a Google Maps key in Render to use Google.'}</div>`);
A['mh-3d'] = () => {
  MH.want3d = !MH.want3d;
  if (MH.eng && MH.eng.set3d) MH.eng.set3d(MH.want3d);
  const b = $('#mh-root [data-act="mh-3d"]'); if (b) { b.classList.toggle('on', MH.want3d); b.setAttribute('aria-pressed', MH.want3d); }
};
A['mh-layer'] = (el) => { MH.eng.setLayer(el.dataset.l); mhPaintChrome(); mhViewChanged(); };
A['mh-filter'] = (el) => {
  const f = MH.filter; const types = [...new Set(mhOnMap(MH.id).map((r) => r.presetId))].map((id) => S.mhPresets[id]).filter(Boolean);
  popMenu(el, `<div class="head"><b>Show</b></div>${Object.entries(MH_ST).map(([k, [l, c]]) => `<button class="mi" data-act="mh-f" data-k="status" data-v="${k}"><i class="cdot" style="background:${c}"></i><span class="grow">${l}</span>${f.status.has(k) ? icSize('check', 16) : ''}</button>`).join('')}
    ${types.length ? `<div class="sep"></div>${types.map((p) => `<button class="mi" data-act="mh-f" data-k="types" data-v="${p.id}"><span class="mh-dotic sm" style="--c:${esc(p.color)}">${mhIcon(p.icon, 12)}</span><span class="grow">${esc(p.name)}</span>${f.types.has(p.id) ? icSize('check', 16) : ''}</button>`).join('')}` : ''}
    <div class="sep"></div><button class="mi" data-act="mh-f-clear">${icSize('x', 16)}Show everything</button>`);
};
A['mh-f'] = (el) => { const s = MH.filter[el.dataset.k]; s.has(el.dataset.v) ? s.delete(el.dataset.v) : s.add(el.dataset.v); mhSyncMarkers(); mhPaintChrome(); };
A['mh-f-clear'] = () => { MH.filter.status.clear(); MH.filter.types.clear(); mhSyncMarkers(); mhPaintChrome(); };
A['mh-pick-preset'] = (el) => popMenu(el, `<div class="head"><b>Type for new manholes</b></div>${mhPresetList().map((p) => `<button class="mi" data-act="mh-use-preset" data-id="${p.id}"><span class="mh-dotic sm" style="--c:${esc(p.color)}">${mhIcon(p.icon, 12)}</span><span class="grow">${esc(p.name)}</span>${MH.preset === p.id ? icSize('check', 16) : ''}</button>`).join('')}
  <div class="sep"></div><button class="mi" data-act="mh-presets">${icSize('edit', 16)}Manage types…</button>`);
A['mh-use-preset'] = (el) => { MH.preset = el.dataset.id; store.set('cd_mhPreset', MH.preset); mhPaintChrome(); };
A['mh-menu'] = (el) => {
  const mp = S.mhMaps[MH.id]; if (!mp) return;
  popMenu(el, `<button class="mi" data-act="mh-export">${icSize('download', 16)}Export index, map, report or Excel…</button>
    <button class="mi" data-act="mh-activity">${icSize('clock', 16)}Activity history</button>
    <button class="mi" data-act="mh-presets">${icSize('layers', 16)}Manhole types (presets)</button>
    <button class="mi" data-act="mh-map-edit" data-id="${mp.id}">${icSize('edit', 16)}Map name, description and area</button>
    <button class="mi" data-act="mh-fit">${icSize('expand', 16)}Zoom to all manholes</button>`);
};
A['mh-fit'] = () => { const l = mhOnMap(MH.id); if (l.length) MH.eng.fit(l); else toast('No manholes on this map yet'); };
A['mh-activity'] = async () => {
  let items = []; try { items = (await capi('GET', `/mh/maps/${MH.id}/activity`)).items; } catch (e) { return toast(e.message, true); }
  sheet(`${sheetHead('Activity history')}<div class="mh-act">${items.length ? items.map((h) => `<div class="mh-h">${avatar(member(h.by), 'xs')}<div class="grow"><span class="small"><b>${personName(h.by)}</b> ${esc(h.detail)}</span><span class="tiny muted" style="display:block">${esc(fmtDateTime(h.at))}${h.mhId && S.manholes[h.mhId] && !S.manholes[h.mhId].deleted ? ` · <a href="#" data-act="mh-goto-mh" data-id="${h.mhId}" data-close>Show ${esc(h.ref)}</a>` : ''}</span></div></div>`).join('') : '<p class="small muted">Nothing yet.</p>'}</div>`, null, { wide: true });
};
A['mh-export'] = () => {
  const mp = S.mhMaps[MH.id]; let sel = []; try { sel = JSON.parse(store.get('cd_mhFields') || 'null') || MH_EXPORT_DEFAULT; } catch (_) { sel = MH_EXPORT_DEFAULT; }
  sheet(`${sheetHead('Export')}<form class="stack" data-form="mh-export"><div class="field"><span>Fields to include</span><div class="mh-fields">${MH_EXPORT_FIELDS.map(([k, l]) => `<label class="chk"><input type="checkbox" name="f" value="${k}" ${sel.includes(k) ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div></div>
    <label class="row" style="gap:8px"><span class="switch"><input type="checkbox" name="photos" checked><i></i></span><span>Include photos in the full report</span></label>
    <div class="mh-exports">
      <button class="mh-exp" name="what" value="index.pdf">${icSize('list', 22)}<b>Manhole index</b><span>PDF table of every manhole</span></button>
      <button class="mh-exp" name="what" value="map.pdf">${icSize('pin', 22)}<b>Labelled map</b><span>PDF plan with references</span></button>
      <button class="mh-exp" name="what" value="report.pdf">${icSize('file', 22)}<b>Full report</b><span>Map, index, every record and photos</span></button>
      <button class="mh-exp" name="what" value="register.xlsx">${icSize('sheet', 22)}<b>Excel register</b><span>Spreadsheet with a summary</span></button>
    </div><p class="tiny muted">${S.mapsKey ? 'Maps in PDFs use Google satellite imagery when your key allows Static Maps.' : 'Maps in PDFs are plotted from the coordinates (no satellite background until a Google key is added).'}</p></form>`, (sh) => {
    sh.addEventListener('click', (e) => { const b = e.target.closest('.mh-exp'); if (!b) return; e.preventDefault();
      const fields = $$('input[name="f"]:checked', sh).map((i) => i.value); store.set('cd_mhFields', JSON.stringify(fields));
      const photos = sh.querySelector('input[name="photos"]').checked ? '1' : '0';
      const name = `${(S.projects[mp.projectId] || {}).ref ? S.projects[mp.projectId].ref + ' ' : ''}${mp.name} ${b.value.startsWith('register') ? 'manhole register.xlsx' : b.value === 'index.pdf' ? 'manhole index.pdf' : b.value === 'map.pdf' ? 'manhole map.pdf' : 'manhole report.pdf'}`;
      const a = document.createElement('a'); a.href = `/api/c/${S.cid}/mh/maps/${mp.id}/${b.value}?fields=${fields.join(',')}&photos=${photos}`; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      toast('Preparing ' + name); });
  }, { wide: true });
};

// ---- preset manager (every employee)
A['mh-presets'] = () => mhPresetSheet();
function mhPresetSheet() {
  const cats = {}; for (const p of mhPresetList()) (cats[p.category || 'Other'] = cats[p.category || 'Other'] || []).push(p);
  sheet(`${sheetHead('Manhole types')}<p class="small muted" style="margin-top:0">Shared with everyone in ${esc(S.company.name)}. Anyone can add or change a type; existing manholes keep their history.</p>
    ${Object.entries(cats).map(([c, list]) => `<div class="label" style="margin:12px 0 6px">${esc(c)}</div><div class="list card flush">${list.map((p) => `<button class="item" data-act="mh-preset-edit" data-id="${p.id}"><span class="mh-dotic" style="--c:${esc(p.color)}">${mhIcon(p.icon, 16)}</span><div class="grow" style="min-width:0"><b>${esc(p.name)}</b><div class="tiny muted ellipsis">${esc(p.description || (MH_ICONS[p.icon] || [''])[0])}</div></div>${icSize('right', 16)}</button>`).join('')}</div>`).join('')}
    <button class="btn block primary" style="margin-top:14px" data-act="mh-preset-edit">${ic('plus')}New type</button>`, null, { wide: true });
}
A['mh-preset-edit'] = (el) => {
  const p = el.dataset.id ? S.mhPresets[el.dataset.id] : { name: '', color: '#0b7285', icon: 'cover', iconName: 'Manhole Cover', description: '', category: '' };
  const cats = [...new Set(Object.values(S.mhPresets).map((q) => q.category).filter(Boolean))];
  closeSheets();
  sheet(`${sheetHead(el.dataset.id ? 'Edit type' : 'New type')}<form class="stack" data-form="mh-preset" data-id="${el.dataset.id || ''}">
    <div class="mh-prev" style="--c:${esc(p.color)}"><span class="mhm"><span class="mhm-ic">${mhIcon(p.icon, 15)}</span><span class="mhm-ref">MH001</span></span><b data-prev-name>${esc(p.name || 'New type')}</b></div>
    <label class="field"><span>Name</span><input name="name" value="${esc(p.name)}" required maxlength="40" placeholder="e.g. Road gully" data-input="mhp-name"></label>
    <label class="field"><span>Category</span><input name="category" value="${esc(p.category || '')}" list="mh-cats" maxlength="40" placeholder="e.g. Drainage & water, Electricity"><datalist id="mh-cats">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label>
    <div class="field"><span>Colour</span><div class="row wrap tight">${['#e5484d', '#2f7de1', '#30a46c', '#8d5a33', '#8e4ec6', '#868e96', '#f59f00', '#0b7285', '#d6409f', '#1d2421'].map((c) => `<label class="swatch-pick"><input type="radio" name="color" value="${c}" ${c === p.color ? 'checked' : ''} class="sr-only" data-change="mhp-col"><span style="background:${c}"></span></label>`).join('')}
      <label class="swatch-pick custom" title="Any colour"><input type="color" name="custom" value="${esc(p.color)}" data-change="mhp-col"><span>${icSize('plus', 14)}</span></label></div></div>
    <div class="field"><span>Icon</span><label class="search" style="margin-bottom:8px"><input class="input" type="search" placeholder="Search icons — e.g. valve, gas, tap" data-input="mhp-icon-q" autocomplete="off">${ic('search')}</label>
      <div class="mh-iconlib">${Object.entries(MH_ICONS).map(([k, [n]]) => `<label class="mh-icopt" data-name="${esc(n.toLowerCase())}"><input type="radio" name="icon" value="${k}" ${k === p.icon ? 'checked' : ''} class="sr-only" data-change="mhp-icon"><span>${mhIcon(k, 22)}<small>${esc(n)}</small></span></label>`).join('')}</div></div>
    <label class="field"><span>Description</span><textarea name="description" rows="2" maxlength="300" placeholder="Optional">${esc(p.description || '')}</textarea></label>
    ${el.dataset.id ? `<p class="tiny muted">Made by ${personName(p.createdBy)}${p.updatedBy ? ` · last changed by ${personName(p.updatedBy)} ${esc(timeAgo(p.updatedAt))}` : ''}</p>` : ''}
    <div class="err-msg" data-err></div>
    <div class="sheet-foot">${el.dataset.id ? `<button type="button" class="btn danger" data-act="mh-preset-del" data-id="${el.dataset.id}" style="margin-right:auto">Delete</button>` : ''}<button type="button" class="btn" data-act="mh-presets" data-close>Back</button><button class="btn primary">Save</button></div></form>`, null, { wide: true });
};
I['mhp-name'] = (el) => { const b = el.closest('form').querySelector('[data-prev-name]'); if (b) b.textContent = el.value || 'New type'; };
I['mhp-icon-q'] = (el) => { const q = el.value.trim().toLowerCase(); $$('.mh-icopt', el.closest('form')).forEach((o) => { o.hidden = !!q && !o.dataset.name.includes(q); }); };
C['mhp-col'] = (el) => { const f = el.closest('form'); const v = el.type === 'color' ? el.value : el.value; if (el.type === 'color') $$('input[name="color"]', f).forEach((r) => { r.checked = false; }); f.querySelector('.mh-prev').style.setProperty('--c', v); f._color = v; };
C['mhp-icon'] = (el) => { const f = el.closest('form'); f.querySelector('.mh-prev .mhm-ic').innerHTML = mhIcon(el.value, 15); };
F['mh-preset'] = async (f, d, close) => {
  const colorV = (f.querySelector('input[name="color"]:checked') || {}).value || f._color || d.custom;
  const body = { name: d.name, category: d.category, color: colorV, icon: d.icon, iconName: (MH_ICONS[d.icon] || [''])[0], description: d.description };
  const r = f.dataset.id ? await capi('PATCH', `/mh/presets/${f.dataset.id}`, body) : await capi('POST', '/mh/presets', body);
  S.mhPresets[r.item.id] = r.item; close(); toast(f.dataset.id ? 'Type updated for everyone' : 'Type added for everyone'); mhSyncMarkers(); mhPaintChrome(); mhPresetSheet();
};
A['mh-preset-del'] = async (el) => {
  const p = S.mhPresets[el.dataset.id]; const n = Object.values(S.manholes).filter((r) => r.presetId === p.id).length;
  closeSheets();
  if (!(await confirmBox(`Delete “${p.name}”?`, `It’s removed for everyone. ${n ? `Manholes already recorded as ${p.name} keep that name, colour and icon.` : ''}`))) return mhPresetSheet();
  try { await capi('DELETE', `/mh/presets/${p.id}`); delete S.mhPresets[p.id]; toast('Type deleted'); mhPaintChrome(); mhPresetSheet(); } catch (e) { toast(e.message, true); }
};

// ---- creating maps, and the lists in a project and in Files
function mhMapSheet(preset = {}) {
  const mp = preset.id ? S.mhMaps[preset.id] : null;
  const projs = Object.values(S.projects).filter((p) => !p.archived).sort((a, b) => a.name.localeCompare(b.name));
  if (!mp && !projs.length) return toast('Create a project first — manhole maps belong to a project', true);
  sheet(`${sheetHead(mp ? 'Map details' : 'New manhole map')}<form class="stack" data-form="mh-map" data-id="${mp ? mp.id : ''}">
    ${mp ? `<div class="small muted">Project: <b>${esc(projLabel(S.projects[mp.projectId]))}</b></div>` : `<label class="field"><span>Project</span><select name="projectId" required>${preset.projectId ? '' : '<option value="">Choose a project…</option>'}${projs.map((p) => `<option value="${p.id}" ${p.id === preset.projectId ? 'selected' : ''}>${esc(projLabel(p))}</option>`).join('')}</select></label>`}
    <label class="field"><span>Map name</span><input name="name" value="${esc(mp ? mp.name : '')}" required maxlength="80" placeholder="e.g. Drainage survey — north site"></label>
    <label class="field"><span>Area <span class="hint">· optional</span></span><input name="area" value="${esc(mp ? mp.area || '' : '')}" maxlength="200" placeholder="e.g. Elm Road and car park"></label>
    <label class="field"><span>Description <span class="hint">· optional</span></span><textarea name="description" rows="2" maxlength="1000">${esc(mp ? mp.description || '' : '')}</textarea></label>
    <div class="err-msg" data-err></div>
    <div class="sheet-foot">${mp && (isAdmin() || mp.createdBy === S.user.id) ? `<button type="button" class="btn danger" data-act="mh-map-del" data-id="${mp.id}" style="margin-right:auto">Delete map</button>` : ''}<button type="button" class="btn" data-close>Cancel</button><button class="btn primary">${mp ? 'Save' : 'Create and open'}</button></div></form>`);
}
F['mh-map'] = async (f, d, close) => {
  if (f.dataset.id) { const r = await capi('PATCH', `/mh/maps/${f.dataset.id}`, { name: d.name, area: d.area, description: d.description }); S.mhMaps[r.item.id] = r.item; close(); toast('Map saved'); if (MH.id === r.item.id) { const t = $('#mh-root .mh-title b'); if (t) t.textContent = r.item.name; } return; }
  if (!d.projectId) throw new Error('Choose a project');
  const r = await capi('POST', '/mh/maps', { projectId: d.projectId, name: d.name, area: d.area, description: d.description });
  S.mhMaps[r.item.id] = r.item; close(); location.hash = '#/mhmap/' + r.item.id;
};
A['mh-new-map'] = (el) => mhMapSheet({ projectId: el.dataset.project || '' });
A['mh-map-edit'] = (el) => mhMapSheet({ id: el.dataset.id });
A['mh-map-del'] = async (el) => {
  const mp = S.mhMaps[el.dataset.id]; closeSheets();
  if (!(await confirmBox(`Delete “${mp.name}”?`, `All ${plural(S.mhCounts[mp.id] || mhOnMap(mp.id).length, 'manhole')} on it, with their photos and history, are permanently deleted. This can’t be undone.`, 'Delete map'))) return;
  try { await capi('DELETE', `/mh/maps/${mp.id}`); delete S.mhMaps[mp.id]; toast('Map deleted'); if (MH.id === mp.id) location.hash = '#/project/' + mp.projectId + '/maps'; else renderView(false); } catch (e) { toast(e.message, true); }
};
function mhMapCards(list) {
  if (!list.length) return '';
  return `<div class="cards">${list.sort((a, b) => b.updatedAt - a.updatedAt).map((mp) => { const p = S.projects[mp.projectId]; const n = S.mhCounts[mp.id] || 0;
    return `<a class="card mh-card" href="#/mhmap/${mp.id}"><span class="mh-card-ic">${mhIcon('cover', 24)}</span><div class="grow" style="min-width:0"><b class="ellipsis" style="display:block">${esc(mp.name)}</b>
      <span class="small muted ellipsis" style="display:block">${esc([p ? projLabel(p) : '', mp.area].filter(Boolean).join(' · '))}</span>
      <span class="tiny muted">${plural(n, 'manhole')} · updated ${esc(timeAgo(mp.updatedAt))}</span></div>${icSize('right', 16)}</a>`; }).join('')}</div>`;
}
function projectMapsTab(p) {
  const list = Object.values(S.mhMaps).filter((m) => m.projectId === p.id);
  return `<div class="section-head"><div><h2>Manhole maps</h2><div class="small muted">Satellite maps where the crew records manholes, photos and survey details.</div></div>
      <button class="btn primary" data-act="mh-new-map" data-project="${p.id}">${ic('plus')}<span>New manhole map</span></button></div>
    ${list.length ? mhMapCards(list) : `<div class="card empty">${mhIcon('cover', 28)}<h3>No manhole maps yet</h3><div class="small">Make one to start pinning manholes on the satellite map.</div></div>`}`;
}
// "Files": everything attached to projects you can see — manhole maps first.
VIEWS.files = {
  render() {
    const byP = {}; for (const mp of Object.values(S.mhMaps)) (byP[mp.projectId] = byP[mp.projectId] || []).push(mp);
    const photoN = {}; for (const ph of Object.values(S.photos)) photoN[ph.projectId] = (photoN[ph.projectId] || 0) + 1;
    const pids = [...new Set(Object.keys(byP).concat(Object.keys(photoN)))].filter((id) => S.projects[id]).sort((a, b) => S.projects[a].name.localeCompare(S.projects[b].name));
    return `<div class="page-head"><div><h1>Files</h1><div class="sub">Manhole maps and photos for the projects you work on.</div></div>
        <button class="btn primary" data-act="mh-new-map">${ic('plus')}<span>Create manhole map</span></button></div>
      ${pids.length ? pids.map((id) => { const p = S.projects[id]; return `<div class="section"><div class="section-head"><h2 class="row tight"><span class="team-swatch" style="background:${esc(p.color || 'var(--line-2)')};width:10px;height:10px;border-radius:50%"></span>${esc(projLabel(p))}</h2>
          ${photoN[id] ? `<a class="btn sm" href="#/project/${id}/photos">${ic('gallery')}<span>${plural(photoN[id], 'photo')}</span></a>` : ''}</div>${mhMapCards(byP[id] || []) || '<p class="small muted">No manhole maps.</p>'}</div>`; }).join('')
        : `<div class="card empty">${mhIcon('cover', 28)}<h3>Nothing here yet</h3><div class="small">Create a manhole map for a project to get started.</div></div>`}`;
  },
};
