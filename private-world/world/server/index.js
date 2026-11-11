const path = require('path'), fs = require('fs'), http = require('http');
const express = require('express'), multer = require('multer'), { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const DATA = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA, { recursive: true });
const photos = require('./photos')(DATA, path.join(__dirname, '..', 'seed-photos'));
const rooms = require('./rooms')(DATA);

const app = express(), server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e5, pingInterval: 10000, pingTimeout: 8000 });
const peerOf = (room, token) => Object.entries(room.members).find(([t]) => t !== token);

app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));
app.use('/vendor/three', express.static(path.join(__dirname, '..', 'node_modules', 'three'), { maxAge: '7d' }));
app.use('/media/full', express.static(photos.FULL, { maxAge: '365d', immutable: true }));
app.use('/media/thumb', express.static(photos.THUMB, { maxAge: '365d', immutable: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/healthz', (_, res) => res.send('ok'));
app.get('/api/config', (_, res) => {
  let iceServers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  try { if (process.env.ICE_SERVERS) iceServers = JSON.parse(process.env.ICE_SERVERS); } catch { console.warn('ICE_SERVERS is not valid JSON'); }
  res.json({ iceServers, maxPerRoom: photos.MAX_PER_ROOM });
});

// ---- Photo API (only members of a room may use it) ----
const auth = (req, res, next) => rooms.isMember(req.get('x-room'), req.get('x-token')) ? next() : res.status(403).json({ error: 'Not allowed' });
const upload = multer({
  storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 30 },
  fileFilter: (_, f, cb) => cb(null, /^image\/(jpeg|png|webp)$/.test(f.mimetype))
});
const notify = req => io.to(String(req.get('x-room')).toUpperCase().trim()).emit('photos');
const fail = (res, e, code = 400) => res.status(code).json({ error: e.message || String(e) });

app.get('/api/photos', auth, (_, res) => res.json(photos.all()));
app.post('/api/photos', auth, upload.array('photos', 30), async (req, res) => {
  if (!req.files?.length) return fail(res, new Error('No valid images (JPG, PNG or WebP only)'));
  const added = [], errors = [];
  for (const f of req.files) { try { added.push(await photos.add(f.buffer, parseInt(req.query.room ?? '-1', 10))); } catch (e) { errors.push(e.message); } }
  notify(req); res.json({ added, errors });
});
app.put('/api/photos/:id', auth, upload.single('photo'), async (req, res) => {
  try { if (!req.file) throw new Error('No valid image'); const p = await photos.replace(req.params.id, req.file.buffer); notify(req); res.json(p); } catch (e) { fail(res, e); }
});
app.patch('/api/photos/:id', auth, (req, res) => {
  try { const p = photos.update(req.params.id, req.body || {}); notify(req); res.json(p); } catch (e) { fail(res, e); }
});
app.delete('/api/photos/:id', auth, (req, res) => {
  try { photos.remove(req.params.id); notify(req); res.json({ ok: true }); } catch (e) { fail(res, e); }
});
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: err.message || 'Server error' }); });

// ---- Realtime ----
const num = v => Number.isFinite(v) && Math.abs(v) < 1000;
io.on('connection', socket => {
  let room = null, token = null, lastState = 0;

  function attach(r, tk) {
    const m = r.members[tk];
    if (m.sid && m.sid !== socket.id) io.sockets.sockets.get(m.sid)?.disconnect(true); // one live tab per player
    m.sid = socket.id; room = r; token = tk; socket.join(r.id); r.chat ||= [];
    const p = peerOf(r, tk);
    socket.to(r.id).emit('peer-joined', { name: m.name, appearance: m.appearance });
    return {
      ok: true, roomId: r.id, host: Object.keys(r.members)[0] === tk, doors: r.doors, chat: r.chat,
      peer: p ? { name: p[1].name, appearance: p[1].appearance, online: !!p[1].sid } : null
    };
  }
  socket.on('create', ({ token: tk, name } = {}, cb) => {
    if (typeof tk !== 'string' || tk.length < 16) return cb?.({ error: 'Bad token' });
    cb?.(attach(rooms.create(tk, String(name || '').slice(0, 20)), tk));
  });
  socket.on('join', ({ roomId, token: tk, name } = {}, cb) => {
    if (typeof tk !== 'string' || tk.length < 16) return cb?.({ error: 'Bad token' });
    const res = rooms.join(roomId, tk, String(name || '').slice(0, 20));
    cb?.(res.error ? { error: res.error } : attach(res.room, tk));
  });
  socket.on('appearance', a => {
    if (!room || typeof a !== 'object' || !a) return;
    room.members[token].appearance = a; rooms.persist();
    socket.to(room.id).emit('peer-appearance', a);
  });
  socket.on('state', s => {
    if (!room || !s || Date.now() - lastState < 30) return; lastState = Date.now();
    if (![s.x, s.y, s.z, s.ry].every(num)) return;
    socket.to(room.id).volatile.emit('peer-state', { x: s.x, y: s.y, z: s.z, ry: s.ry, sp: +s.sp || 0, a: s.a | 0, loc: String(s.loc).slice(0, 12), sit: !!s.sit, em: String(s.em || '').slice(0, 10) });
  });
  socket.on('emote', e => room && socket.to(room.id).emit('peer-emote', String(e).slice(0, 10)));
  socket.on('door', ({ id, open } = {}) => {
    if (!room || typeof id !== 'string') return;
    room.doors[id.slice(0, 24)] = !!open; socket.to(room.id).emit('door', { id, open: !!open });
  });
  const sent = []; // chat: sanitised, rate-limited (6 msgs / 8 s), last 30 kept in memory for late joiners
  socket.on('chat', (text, cb) => {
    if (!room || typeof text !== 'string') return cb?.({ error: 'Not in a room' });
    text = text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200); if (!text) return cb?.({ error: 'Empty message' });
    const now = Date.now(); while (sent.length && now - sent[0] > 8000) sent.shift();
    if (sent.length >= 6) return cb?.({ error: 'You are sending messages too fast' });
    sent.push(now); const msg = { name: room.members[token].name, text, t: now };
    room.chat.push(msg); if (room.chat.length > 30) room.chat.shift();
    socket.to(room.id).emit('chat', msg); cb?.({ ok: true });
  });
  socket.on('signal', msg => room && socket.to(room.id).emit('signal', msg)); // WebRTC offer/answer/ICE relay
  socket.on('disconnect', () => {
    if (!room) return;
    const m = room.members[token]; if (m && m.sid === socket.id) { m.sid = null; socket.to(room.id).emit('peer-left'); }
  });
});

photos.init().then(() => server.listen(PORT, () => console.log(`Private World running on http://localhost:${PORT}  (data: ${DATA})`)));
