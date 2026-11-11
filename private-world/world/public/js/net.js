// Socket.IO client: private room session, auto-resume after drops, REST headers for the photo API.
import { io } from '/socket.io/socket.io.esm.min.js';

export class Net {
  constructor() {
    this.h = {};
    this.token = localStorage.getItem('pw_token') || Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('pw_token', this.token);
    try { this.session = JSON.parse(localStorage.getItem('pw_session') || 'null'); } catch { this.session = null; }
    this.joined = false;
  }
  on(e, f) { (this.h[e] ||= []).push(f); return this; }
  fire(e, ...a) { (this.h[e] || []).forEach(f => f(...a)); }
  connect() {
    if (this.ready) return this.ready;
    const s = this.socket = io({ reconnection: true, reconnectionDelay: 400, reconnectionDelayMax: 4000, timeout: 8000 });
    s.on('connect', async () => {
      this.fire('status', 'online');
      if (this.joined && this.session) { const r = await this.request('join', { roomId: this.session.roomId, token: this.token, name: this.session.name }); this.fire('resumed', r); }
    });
    s.on('disconnect', () => this.fire('status', 'offline'));
    s.on('connect_error', () => this.fire('status', 'offline'));
    s.io.on('reconnect_attempt', () => this.fire('status', 'reconnecting'));
    ['peer-joined', 'peer-left', 'peer-state', 'peer-appearance', 'peer-emote', 'door', 'signal', 'photos', 'chat'].forEach(e => s.on(e, (...a) => this.fire(e, ...a)));
    return (this.ready = new Promise(res => s.connected ? res() : s.once('connect', res)));
  }
  request(ev, payload) { return new Promise(res => this.socket.timeout(8000).emit(ev, payload, (err, r) => res(err ? { error: 'The server is not responding. Please try again.' } : r))); }
  async enter(ev, payload) {
    const r = await this.request(ev, { ...payload, token: this.token });
    if (r?.ok) { this.joined = true; this.session = { roomId: r.roomId, name: payload.name }; localStorage.setItem('pw_session', JSON.stringify(this.session)); }
    return r;
  }
  create(name) { return this.enter('create', { name }); }
  join(roomId, name) { return this.enter('join', { roomId, name }); }
  chat(text) { return this.request('chat', text); }
  send(ev, data) { if (this.socket?.connected) this.socket.emit(ev, data); }
  forget() { localStorage.removeItem('pw_session'); this.session = null; this.joined = false; }
  get headers() { return { 'x-room': this.session?.roomId || '', 'x-token': this.token }; }
}
