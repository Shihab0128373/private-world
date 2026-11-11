// Persistent photo store: files on disk (DATA_DIR) + photos.json index.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
let sharp = null;
try { sharp = require('sharp'); } catch { console.warn('[photos] "sharp" not installed: images stored unresized.'); }

const MAX_PER_ROOM = 12, ROOMS = 4;
const rid = () => crypto.randomBytes(8).toString('hex');

module.exports = function createPhotoStore(DATA, SEED_DIR) {
  const FULL = path.join(DATA, 'photos'), THUMB = path.join(DATA, 'thumbs'), DB = path.join(DATA, 'photos.json');
  fs.mkdirSync(FULL, { recursive: true }); fs.mkdirSync(THUMB, { recursive: true });
  let list = fs.existsSync(DB) ? JSON.parse(fs.readFileSync(DB, 'utf8')) : null;
  const save = () => fs.writeFileSync(DB, JSON.stringify(list, null, 1));
  const count = r => list.filter(p => p.room === r).length;

  async function encode(buf) {
    if (!sharp) return { full: buf, thumb: buf, ext: 'jpg' };
    const img = sharp(buf, { failOn: 'none' }).rotate();
    return {
      full: await img.clone().resize(1800, 1800, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer(),
      thumb: await img.clone().resize(640, 640, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer(),
      ext: 'webp'
    };
  }
  async function writeFiles(buf) {
    const e = await encode(buf), file = `${rid()}.${e.ext}`;
    fs.writeFileSync(path.join(FULL, file), e.full); fs.writeFileSync(path.join(THUMB, file), e.thumb);
    return file;
  }
  const unlink = file => { for (const d of [FULL, THUMB]) try { fs.unlinkSync(path.join(d, file)); } catch {} };

  // seed-photos/captions.json:  { "photo01.jpg": "Our first trip", "photo02.jpg": { "caption": "Dhaka, 2024", "room": 1 } }
  const readCaps = () => {
    const out = {}; try {
      const raw = JSON.parse(fs.readFileSync(path.join(SEED_DIR, 'captions.json'), 'utf8'));
      for (const [k, v] of Object.entries(raw)) { if (k.startsWith('_')) continue; const o = typeof v === 'string' ? { caption: v } : v || {}; out[k] = { caption: String(o.caption ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120), room: Number.isInteger(o.room) ? o.room : undefined }; }
    } catch (e) { if (e.code !== 'ENOENT') console.warn('[photos] captions.json problem:', e.message); }
    return out;
  };
  const seedFiles = () => SEED_DIR && fs.existsSync(SEED_DIR) ? fs.readdirSync(SEED_DIR).filter(f => /\.(jpe?g|png|webp)$/i.test(f)).sort() : [];
  async function init() {
    const caps = readCaps(), files = seedFiles(); let ch = false;
    if (!list) { // first start: load every photo from seed-photos/
      list = [];
      for (let i = 0; i < files.length; i++) {
        const c = caps[files[i]] || {}, want = c.room ?? Math.floor(i * ROOMS / files.length), room = pickRoom(want);
        if (room < 0) continue;
        list.push({ id: rid(), file: await writeFiles(fs.readFileSync(path.join(SEED_DIR, files[i]))), room, caption: c.caption || '', seed: files[i], seedCap: c.caption || '', added: Date.now() + i });
      }
      console.log(`[photos] seeded ${list.length} photos`); ch = true;
    } else {
      for (const p of list) if (typeof p.caption !== 'string') { p.caption = ''; ch = true; }
      // photos newly added to seed-photos/ later (only for databases created by this version)
      if (list.some(p => p.seed)) for (let i = 0; i < files.length; i++) {
        if (list.some(p => p.seed === files[i])) continue; const c = caps[files[i]] || {}, room = pickRoom(c.room ?? -1); if (room < 0) continue;
        list.push({ id: rid(), file: await writeFiles(fs.readFileSync(path.join(SEED_DIR, files[i]))), room, caption: c.caption || '', seed: files[i], seedCap: c.caption || '', added: Date.now() + i }); ch = true;
      }
    }
    // captions.json is the source of truth for seeded photos: re-applied when you change the text there (edits made in the app stay until then)
    for (const p of list) if (p.seed && caps[p.seed] && p.seedCap !== caps[p.seed].caption) { p.caption = p.seedCap = caps[p.seed].caption; ch = true; }
    if (ch) save();
  }
  function pickRoom(want) {
    if (want >= 0 && want < ROOMS && count(want) < MAX_PER_ROOM) return want;
    for (let r = 0; r < ROOMS; r++) if (count(r) < MAX_PER_ROOM) return r;
    return -1;
  }
  return {
    init, MAX_PER_ROOM, ROOMS, FULL, THUMB,
    all: () => list.slice().sort((a, b) => a.room - b.room || a.added - b.added),
    async add(buf, room) {
      const r = pickRoom(room); if (r < 0) throw new Error('All exhibition rooms are full');
      const p = { id: rid(), file: await writeFiles(buf), room: r, caption: '', added: Date.now() };
      list.push(p); save(); return p;
    },
    async replace(id, buf) {
      const p = list.find(x => x.id === id); if (!p) throw new Error('Not found');
      const old = p.file; p.file = await writeFiles(buf); unlink(old); save(); return p;
    },
    remove(id) {
      const i = list.findIndex(x => x.id === id); if (i < 0) throw new Error('Not found');
      unlink(list[i].file); list.splice(i, 1); save();
    },
    update(id, { room, caption }) { // change caption and/or room
      const p = list.find(x => x.id === id); if (!p) throw new Error('Not found');
      if (caption !== undefined) { p.caption = String(caption).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120); save(); }
      if (room !== undefined && Number(room) !== p.room) this.move(id, Number(room));
      return p;
    },
    move(id, room) {
      const p = list.find(x => x.id === id); if (!p) throw new Error('Not found');
      if (room === p.room) return p;
      if (!(room >= 0 && room < ROOMS) || count(room) >= MAX_PER_ROOM) throw new Error('That room is full');
      p.room = room; p.added = Date.now(); save(); return p;
    }
  };
};
