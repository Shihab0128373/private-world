// Procedural atmosphere: soft evolving music + per-location ambience (wind, crickets, water, room tone). No audio files needed.
const mtof = m => 440 * 2 ** ((m - 69) / 12);
export class AudioEngine {
  constructor() { this.ctx = null; this.mv = .5; this.av = .7; this.loc = 'museum'; }
  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const c = this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.master = c.createGain(); this.master.gain.value = .9; this.master.connect(c.destination);
    this.music = c.createGain(); this.amb = c.createGain(); this.music.connect(this.master); this.amb.connect(this.master);
    const len = c.sampleRate * 1.5, imp = c.createBuffer(2, len, c.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = imp.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3; }
    this.rev = c.createConvolver(); this.rev.buffer = imp; const rg = c.createGain(); rg.gain.value = .6; this.rev.connect(rg); rg.connect(this.music);
    const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const noise = (type, f, q) => { const s = c.createBufferSource(); s.buffer = nb; s.loop = true; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = c.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(this.amb); s.start(); return g; };
    this.layers = { wind: noise('lowpass', 420, .5), room: noise('lowpass', 180, .3), water: noise('bandpass', 1400, 1.2), crick: noise('bandpass', 4300, 18) };
    const lfo = (g, hz, depth, type = 'sine') => { const o = c.createOscillator(); o.type = type; o.frequency.value = hz; const d = c.createGain(); d.gain.value = depth; o.connect(d); d.connect(g.gain); o.start(); };
    this.crickMod = c.createGain(); // chirp pulses
    const co = c.createOscillator(); co.type = 'square'; co.frequency.value = 6.5; const cd = c.createGain(); cd.gain.value = .0; co.connect(cd); co.start(); this.cd = cd; cd.connect(this.layers.crick.gain);
    lfo(this.layers.wind, .13, .03); lfo(this.layers.water, .4, .01);
    this.setLocation(this.loc); this.chordIdx = 0; this.loop();
  }
  loop() { // chord pad every 8s + random pentatonic bells
    const c = this.ctx, chords = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 55, 60, 64], [55, 59, 62, 66]];
    const pad = () => { const t = c.currentTime, ch = chords[this.chordIdx++ % 4];
      ch.forEach((n, i) => { const o = c.createOscillator(); o.type = i % 2 ? 'triangle' : 'sine'; o.frequency.value = mtof(n); o.detune.value = (i - 1.5) * 4; const g = c.createGain(), f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.045, t + 2.5); g.gain.linearRampToValueAtTime(0, t + 9); o.connect(f); f.connect(g); g.connect(this.music); g.connect(this.rev); o.start(t); o.stop(t + 9.5); }); };
    const bell = () => { const sc = [69, 72, 74, 76, 79, 81, 84], n = sc[Math.floor(Math.random() * sc.length)], t = c.currentTime, o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = mtof(n); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.05, t + .01); g.gain.exponentialRampToValueAtTime(.0005, t + 3); o.connect(g); g.connect(this.music); g.connect(this.rev); o.start(t); o.stop(t + 3.2); };
    pad(); setInterval(pad, 8000); const b = () => { bell(); setTimeout(b, 1800 + Math.random() * 3500); }; setTimeout(b, 2000);
  }
  setLocation(id) {
    this.loc = id; if (!this.ctx) return; const t = this.ctx.currentTime, L = this.layers, r = (g, v) => g.gain.setTargetAtTime(v * this.av, t, .8);
    const cfg = { museum: { wind: 0, room: .12, water: 0, crick: 0 }, house: { wind: .08, room: .07, water: 0, crick: 0 }, garden: { wind: .22, room: 0, water: .05, crick: 0 } }[id];
    r(L.wind, cfg.wind); r(L.room, cfg.room); r(L.water, cfg.water); L.crick.gain.setTargetAtTime(id === 'garden' ? .0 : 0, t, .5); this.cd.gain.setTargetAtTime(id === 'garden' ? .05 * this.av : 0, t, .8);
    this.music.gain.setTargetAtTime(this.mv * ({ museum: .9, house: .8, garden: .6 }[id]), t, 1);
  }
  setVolumes(m, a) { this.mv = m; this.av = a; this.setLocation(this.loc); }
  chime(notes = [76, 81]) { if (!this.ctx) return; notes.forEach((n, i) => { const c = this.ctx, t = c.currentTime + i * .13, o = c.createOscillator(), g = c.createGain(); o.frequency.value = mtof(n); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.1 * this.av, t + .01); g.gain.exponentialRampToValueAtTime(.0005, t + 1.2); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 1.3); }); }
  thud() { if (!this.ctx) return; const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(45, t + .2); g.gain.setValueAtTime(.2 * this.av, t); g.gain.exponentialRampToValueAtTime(.001, t + .25); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + .3); }
}
