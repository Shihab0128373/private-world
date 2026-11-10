// Server-authoritative private rooms (max 2 players), persisted so restarts don't kill invites.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

module.exports = function createRooms(DATA) {
  const FILE = path.join(DATA, 'rooms.json');
  const rooms = new Map(); // id -> {id, created, last, members:{token:{name,appearance,sid}}, doors:{}}
  try {
    for (const r of JSON.parse(fs.readFileSync(FILE, 'utf8')))
      rooms.set(r.id, { ...r, doors: {}, members: Object.fromEntries(Object.entries(r.members).map(([t, m]) => [t, { ...m, sid: null }])) });
  } catch {}
  let dirty = false;
  const persist = () => { dirty = true; };
  setInterval(() => {
    const cutoff = Date.now() - 30 * 24 * 3600e3;
    for (const [id, r] of rooms) if (r.last < cutoff) { rooms.delete(id); dirty = true; }
    if (!dirty) return; dirty = false;
    const out = [...rooms.values()].map(r => ({ id: r.id, created: r.created, last: r.last,
      members: Object.fromEntries(Object.entries(r.members).map(([t, m]) => [t, { name: m.name, appearance: m.appearance }])) }));
    fs.writeFile(FILE, JSON.stringify(out), () => {});
  }, 5000).unref();

  const newId = () => { let s; do { s = Array.from(crypto.randomBytes(6), b => ALPHABET[b % 32]).join(''); } while (rooms.has(s)); return s; };
  const norm = id => String(id || '').toUpperCase().trim();
  return {
    create(token, name) {
      const r = { id: newId(), created: Date.now(), last: Date.now(), members: { [token]: { name: name || 'Player 1', appearance: null, sid: null } }, doors: {} };
      rooms.set(r.id, r); persist(); return r;
    },
    get: id => rooms.get(norm(id)),
    join(id, token, name) {
      const r = rooms.get(norm(id));
      if (!r) return { error: 'Room not found. Check the code and try again.' };
      if (!r.members[token]) {
        if (Object.keys(r.members).length >= 2) return { error: 'This room is private and already has two players.' };
        r.members[token] = { name: name || 'Player 2', appearance: null, sid: null };
      } else if (name) r.members[token].name = name;
      r.last = Date.now(); persist(); return { room: r };
    },
    isMember: (id, token) => { const r = rooms.get(norm(id)); return !!(r && token && r.members[token]); },
    persist
  };
};
