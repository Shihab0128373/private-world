// Real peer-to-peer voice chat over WebRTC. Signalling is relayed through the room's socket; media is direct (or via TURN).
export class Voice {
  constructor(net, onState) { this.net = net; this.onState = onState; this.pc = null; this.track = null; this.stream = null; this.muted = false; this.state = 'idle'; this.pending = []; this.ice = [{ urls: 'stun:stun.l.google.com:19302' }]; this.host = false; this.volume = 1; this.ac = null;
    this.audio = Object.assign(document.createElement('audio'), { autoplay: true }); this.audio.playsInline = true; document.body.appendChild(this.audio);
    net.on('signal', m => this.onSignal(m));
    net.on('peer-joined', () => { this.set('connecting'); if (this.host) this.offer(); else net.send('signal', { need: 1 }); });
    net.on('peer-left', () => { this.close(); this.set('idle'); });
  }
  init(iceServers, host) { this.ice = iceServers; this.host = host; if (this.peerOnline) this.host ? this.offer() : this.net.send('signal', { need: 1 }); }
  set(s) { if (s !== this.state) { this.state = s; this.onState?.(s); } }
  close() { if (this.pc) { this.pc.onconnectionstatechange = this.pc.onicecandidate = this.pc.ontrack = null; this.pc.close(); this.pc = null; } this.pending = []; this.remote = null; this.remoteAn = null; }
  make() {
    this.close(); const pc = this.pc = new RTCPeerConnection({ iceServers: this.ice });
    const tr = pc.addTransceiver('audio', { direction: 'sendrecv' }); this.sender = tr.sender; if (this.track) this.sender.replaceTrack(this.track).catch(() => {});
    pc.onicecandidate = e => e.candidate && this.net.send('signal', { c: e.candidate });
    pc.ontrack = e => { this.remote = e.streams[0] || new MediaStream([e.track]); this.audio.srcObject = this.remote; this.audio.volume = this.volume; this.audio.play().catch(() => this.onState?.('tap')); this.remoteAn = this.analyser(this.remote); };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState; if (pc !== this.pc) return;
      if (s === 'connected') { this.set('connected'); clearTimeout(this.rt); }
      else if (s === 'connecting') this.set('connecting');
      else if (s === 'disconnected' || s === 'failed') { this.set('reconnecting'); clearTimeout(this.rt); this.rt = setTimeout(() => this.recover(), s === 'failed' ? 300 : 3000); }
    };
    return pc;
  }
  recover() { if (!this.net.socket?.connected) { this.rt = setTimeout(() => this.recover(), 1500); return; } this.host ? this.offer() : this.net.send('signal', { need: 1 }); }
  async offer() { try { const pc = this.make(); await pc.setLocalDescription(await pc.createOffer()); this.net.send('signal', { sdp: pc.localDescription }); this.set('connecting'); } catch (e) { console.warn('offer', e); this.set('failed'); } }
  async onSignal(m) {
    try {
      if (m.need) { if (this.host) this.offer(); }
      else if (m.sdp?.type === 'offer') {
        const pc = this.make(); await pc.setRemoteDescription(m.sdp); await this.flush();
        await pc.setLocalDescription(await pc.createAnswer()); this.net.send('signal', { sdp: pc.localDescription }); this.set('connecting');
      } else if (m.sdp?.type === 'answer' && this.pc) { await this.pc.setRemoteDescription(m.sdp); await this.flush(); }
      else if (m.c) { if (this.pc?.remoteDescription) await this.pc.addIceCandidate(m.c).catch(() => {}); else this.pending.push(m.c); }
    } catch (e) { console.warn('signal', e); }
  }
  async flush() { for (const c of this.pending.splice(0)) await this.pc.addIceCandidate(c).catch(() => {}); }
  analyser(stream) {
    try { this.ac ||= new (window.AudioContext || window.webkitAudioContext)(); const a = this.ac.createAnalyser(); a.fftSize = 512; this.ac.createMediaStreamSource(stream).connect(a); return { a, d: new Uint8Array(a.fftSize) }; } catch { return null; }
  }
  level(an) { if (!an) return 0; an.a.getByteTimeDomainData(an.d); let m = 0; for (const v of an.d) m = Math.max(m, Math.abs(v - 128)); return m / 128; }
  levels() { return { local: this.track && !this.muted ? this.level(this.localAn) : 0, remote: this.level(this.remoteAn) }; }
  async enableMic() {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return { error: 'Voice needs a secure (https) connection.' };
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      this.track = this.stream.getAudioTracks()[0]; this.localAn = this.analyser(this.stream); this.muted = false;
      await this.sender?.replaceTrack(this.track); return { ok: true };
    } catch (e) { return { error: e.name === 'NotAllowedError' ? 'Microphone permission was denied. Allow it in your browser\'s site settings.' : e.name === 'NotFoundError' ? 'No microphone was found.' : 'Could not open the microphone.' }; }
  }
  toggleMute() { if (!this.track) return; this.muted = !this.muted; this.track.enabled = !this.muted; return this.muted; }
  setVolume(v) { this.volume = v; this.audio.volume = v; }
  get hasMic() { return !!this.track; }
}
