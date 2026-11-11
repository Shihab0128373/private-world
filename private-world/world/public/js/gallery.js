// Photo viewer (full-screen) + photo manager (upload / replace / move / remove) backed by the REST API.
const ROOM_NAMES = ['I · Memories', 'II · Adventures', 'III · Together', 'IV · Moments'];
export class Gallery {
  constructor(net, toast) {
    this.net = net; this.toast = toast; this.list = []; this.tab = 0; this.onChange = () => {}; this.max = 12;
    const $ = id => document.getElementById(id); this.$ = $;
    this.viewer = $('viewer'); this.vImg = $('viewer-img'); this.vCaption = $('viewer-caption');
    $('viewer-close').onclick = () => this.closeViewer(); $('viewer-prev').onclick = () => this.step(-1); $('viewer-next').onclick = () => this.step(1);
    this.viewer.onclick = e => { if (e.target === this.viewer) this.closeViewer(); };
    addEventListener('keydown', e => { if (this.viewer.hidden) return; if (e.key === 'Escape') this.closeViewer(); if (e.key === 'ArrowLeft') this.step(-1); if (e.key === 'ArrowRight') this.step(1); });
    $('mgr-close').onclick = () => $('manager').hidden = true;
    $('mgr-upload').onchange = e => this.upload([...e.target.files]).then(() => e.target.value = '');
    $('mgr-replace').onchange = e => { const f = e.target.files[0]; if (f && this.replaceId) this.replace(this.replaceId, f); e.target.value = ''; };
  }
  async api(path, opt = {}) {
    const r = await fetch(path, { ...opt, headers: { ...this.net.headers, ...(opt.headers || {}) } });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Error ${r.status}`); return j;
  }
  async refresh() { try { this.list = await this.api('/api/photos'); this.onChange(this.list); if (!this.$('manager').hidden) this.render(); } catch (e) { this.toast(e.message, 'err'); } }
  openViewer(photo) { this.vList = this.list.filter(p => p.room === photo.room); this.vi = Math.max(0, this.vList.findIndex(p => p.id === photo.id)); this.show(); this.viewer.hidden = false; }
  show() { const p = this.vList[this.vi]; this.vImg.src = `/media/thumb/${p.file}`; const big = new Image(); big.onload = () => { if (this.vList[this.vi] === p) this.vImg.src = big.src; }; big.src = `/media/full/${p.file}`; this.vCaption.textContent = p.caption || ''; this.vCaption.hidden = !p.caption; this.$('viewer-count').textContent = `${ROOM_NAMES[p.room]} — ${this.vi + 1} / ${this.vList.length}`; }
  step(d) { if (!this.vList?.length) return; this.vi = (this.vi + d + this.vList.length) % this.vList.length; this.show(); }
  closeViewer() { this.viewer.hidden = true; this.vImg.src = ''; this.vCaption.hidden = true; }
  open() { this.$('manager').hidden = false; this.render(); }
  render() {
    const $ = this.$, tabs = $('mgr-tabs'); tabs.innerHTML = '';
    ROOM_NAMES.forEach((n, i) => { const c = this.list.filter(p => p.room === i).length, b = document.createElement('button'); b.className = 'pill' + (i === this.tab ? ' on' : ''); b.textContent = `${n} (${c}/${this.max})`; b.onclick = () => { this.tab = i; this.render(); }; tabs.appendChild(b); });
    const grid = $('mgr-grid'); grid.innerHTML = '';
    const items = this.list.filter(p => p.room === this.tab);
    if (!items.length) grid.innerHTML = '<p class="muted">No photos in this room yet. Upload some below.</p>';
    for (const p of items) {
      const d = document.createElement('div'); d.className = 'ph';
      d.innerHTML = `<div class="thumb"><img loading="lazy" src="/media/thumb/${p.file}" alt=""><div class="acts"><button data-a="view">View</button><button data-a="rep">Replace</button><select data-a="mv" title="Move to room">${ROOM_NAMES.map((n, i) => `<option value="${i}" ${i === p.room ? 'selected' : ''}>${n}</option>`).join('')}</select><button data-a="del" class="danger">Remove</button></div></div><div class="ph-caption"><input maxlength="120" placeholder="Write a caption…"><button>Save</button></div>`;
      const ci = d.querySelector('.ph-caption input'), saveCap = () => this.run(() => this.api(`/api/photos/${p.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ caption: ci.value }) }), 'Caption saved');
      ci.value = p.caption || ''; d.querySelector('.ph-caption button').onclick = saveCap; ci.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') saveCap(); };
      d.querySelector('[data-a=view]').onclick = () => this.openViewer(p);
      d.querySelector('[data-a=rep]').onclick = () => { this.replaceId = p.id; $('mgr-replace').click(); };
      d.querySelector('[data-a=mv]').onchange = e => this.run(() => this.api(`/api/photos/${p.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ room: +e.target.value }) }), 'Moved');
      d.querySelector('[data-a=del]').onclick = () => confirm('Remove this photo from the museum?') && this.run(() => this.api(`/api/photos/${p.id}`, { method: 'DELETE' }), 'Removed');
      grid.appendChild(d);
    }
  }
  async run(fn, ok) { try { await fn(); this.toast(ok); await this.refresh(); } catch (e) { this.toast(e.message, 'err'); this.refresh(); } }
  async upload(files) {
    files = files.filter(f => /^image\/(jpeg|png|webp)$/.test(f.type)); if (!files.length) return this.toast('Please choose JPG, PNG or WebP images', 'err');
    const fd = new FormData(); files.forEach(f => fd.append('photos', f)); this.toast(`Uploading ${files.length} photo(s)…`);
    try { const r = await this.api(`/api/photos?room=${this.tab}`, { method: 'POST', body: fd }); this.toast(`Added ${r.added.length}${r.errors.length ? ` · ${r.errors[0]}` : ''}`, r.errors.length ? 'err' : ''); await this.refresh(); } catch (e) { this.toast(e.message, 'err'); }
  }
  replace(id, file) { if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return this.toast('Please choose a JPG, PNG or WebP image', 'err'); const fd = new FormData(); fd.append('photo', file); this.run(() => this.api(`/api/photos/${id}`, { method: 'PUT', body: fd }), 'Photo replaced'); }
}
