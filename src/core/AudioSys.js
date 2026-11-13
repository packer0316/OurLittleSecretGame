/** 全程序化音效（WebAudio）：風聲、低頻嗡鳴、蟲鳴、腳步、遠處鐘聲與木魚聲 */
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.running = false;
    this.indoor = 0;
    this._t = 0;
    this._nextGust = 0;
    this._nextBell = 50 + Math.random() * 40;
    this._nextKnock = 35 + Math.random() * 30;
    this._nextChirp = 0;
    this.released = false;
  }

  /** 必須在使用者手勢（點擊）後呼叫 */
  init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);

    // 噪音素材
    const len = ctx.sampleRate * 3;
    this.white = ctx.createBuffer(1, len, ctx.sampleRate);
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const w = this.white.getChannelData(0), b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const n = Math.random() * 2 - 1;
      w[i] = n;
      last = (last + 0.02 * n) / 1.02;
      b[i] = last * 3.5;
    }

    // 風聲（低沉）
    const wind = this._loop(this.brown);
    const windLP = ctx.createBiquadFilter(); windLP.type = 'lowpass'; windLP.frequency.value = 420;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0.5;
    wind.connect(windLP).connect(this.windGain).connect(this.master);
    // 風嘯（穿過門窗的尖細聲）
    const howl = this._loop(this.white);
    this.howlBP = ctx.createBiquadFilter(); this.howlBP.type = 'bandpass'; this.howlBP.frequency.value = 780; this.howlBP.Q.value = 14;
    this.howlGain = ctx.createGain(); this.howlGain.gain.value = 0.0;
    howl.connect(this.howlBP).connect(this.howlGain).connect(this.master);

    // 低頻嗡鳴
    this.droneGain = ctx.createGain(); this.droneGain.gain.value = 0.07;
    for (const f of [41, 61.7, 43.2]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.start();
      o.connect(this.droneGain);
    }
    this.droneGain.connect(this.master);

    // 蟲鳴
    const cr = ctx.createOscillator(); cr.type = 'sine'; cr.frequency.value = 4350; cr.start();
    const am = ctx.createGain(); am.gain.value = 0.5;
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 23; lfo.start();
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.5;
    lfo.connect(lfoGain).connect(am.gain);
    this.cricketGate = ctx.createGain(); this.cricketGate.gain.value = 0;
    cr.connect(am).connect(this.cricketGate).connect(this.master);
  }

  _loop(buffer) {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer; s.loop = true; s.loopStart = 0; s.loopEnd = buffer.duration;
    s.start(0, Math.random() * buffer.duration);
    return s;
  }

  setVolume(v) {
    this.volume = v;
    if (this.ctx && this.running) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }
  start() {
    if (!this.ctx) return;
    this.running = true;
    this.ctx.resume?.();
    this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.8);
  }
  stop() {
    if (!this.ctx) return;
    this.running = false;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
  }

  /** indoor: 0 室外 ~ 1 室內 */
  update(dt, indoor) {
    if (!this.ctx || !this.running) return;
    const now = this.ctx.currentTime;
    this._t += dt;
    this.indoor += (indoor - this.indoor) * Math.min(1, dt * 2);
    const out = 1 - this.indoor;
    if(this.released){this.howlGain.gain.setTargetAtTime(0,now,1.5);this.droneGain.gain.setTargetAtTime(.012,now,1.5);this.windGain.gain.setTargetAtTime(.12,now,1.5);this.cricketGate.gain.setTargetAtTime(0,now,.5);return;}
    if (this._t > this._nextGust) {
      this._nextGust = this._t + 3 + Math.random() * 6;
      const gust = 0.25 + Math.random() * 0.75;
      this.windGain.gain.setTargetAtTime((0.25 + gust * 0.55) * (0.45 + 0.55 * out), now, 1.8);
      this.howlGain.gain.setTargetAtTime(gust > 0.6 ? 0.012 + 0.03 * this.indoor : 0.003, now, 2.2);
      this.howlBP.frequency.setTargetAtTime(520 + Math.random() * 700, now, 2.5);
    }
    if (this._t > this._nextChirp) {
      this._nextChirp = this._t + 0.6 + Math.random() * 3.5;
      const on = Math.random() < 0.6;
      this.cricketGate.gain.setTargetAtTime(on ? 0.011 * out * out : 0, now, 0.12);
    }
    if (this._t > this._nextBell) {
      this._nextBell = this._t + 80 + Math.random() * 80;
      this.bell(0.5 + Math.random() * 0.5);
    }
    if (this._t > this._nextKnock && this.indoor > 0.6) {
      this._nextKnock = this._t + 45 + Math.random() * 60;
      this.woodenFish(3 + Math.floor(Math.random() * 4));
    }
  }

  footstep(strength = 0.6, surface = 'dirt') {
    if (!this.ctx || !this.running) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
    const g = ctx.createGain();
    let dur = 0.13, vol = 0.22;
    if (surface === 'stone') { bp.frequency.value = 1100 + Math.random() * 500; bp.Q.value = 1.4; dur = 0.085; vol = 0.2; }
    else if (surface === 'wood') { bp.frequency.value = 260 + Math.random() * 120; bp.Q.value = 2.2; dur = 0.16; vol = 0.5; }
    else { bp.frequency.value = 380 + Math.random() * 260; bp.Q.value = 0.7; dur = 0.17; vol = 0.26; }
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(vol * strength, now + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0008, now + dur);
    src.connect(bp).connect(g).connect(this.master);
    src.start(now, Math.random() * 2.5, dur + 0.05);
    if (surface === 'wood') {
      // 木地板的低沉回響與偶爾的吱嘎聲
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(95 + Math.random() * 25, now);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.22 * strength, now);
      og.gain.exponentialRampToValueAtTime(0.0008, now + 0.2);
      o.connect(og).connect(this.master); o.start(now); o.stop(now + 0.22);
      if (Math.random() < 0.16) this.creak();
    }
  }

  creak() {
    const ctx = this.ctx, now = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    const f0 = 170 + Math.random() * 120;
    o.frequency.setValueAtTime(f0, now);
    o.frequency.linearRampToValueAtTime(f0 * (1.2 + Math.random() * 0.5), now + 0.35);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.035, now + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0008, now + 0.42);
    o.connect(bp).connect(g).connect(this.master); o.start(now); o.stop(now + 0.45);
  }

  click() {
    if (!this.ctx) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.white;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.35, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    src.connect(hp).connect(g).connect(this.master);
    src.start(now, 0.3, 0.05);
  }

  /** 遠方的鐘聲 */
  bell(vol = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const base = 147;
    const out = ctx.createGain(); out.gain.value = 0.045 * vol;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    out.connect(lp).connect(this.master);
    [[1, 1, 7], [2.01, 0.55, 5], [2.42, 0.4, 3.5], [3.03, 0.25, 2.4], [4.2, 0.14, 1.6]].forEach(([m, a, d]) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = base * m;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(a, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0006, now + d);
      o.connect(g).connect(out); o.start(now); o.stop(now + d + 0.1);
    });
  }

  /** 不知從哪一層樓傳來的木魚聲 */
  woodenFish(count = 4) {
    if (!this.ctx) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const out = ctx.createGain(); out.gain.value = 0.05;
    if (pan) { pan.pan.value = Math.random() * 1.6 - 0.8; out.connect(pan).connect(this.master); } else out.connect(this.master);
    const gap = 0.62 + Math.random() * 0.25;
    for (let i = 0; i < count; i++) {
      const t = now + 0.2 + i * gap;
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(640, t);
      o.frequency.exponentialRampToValueAtTime(430, t + 0.07);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(1, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 0.16);
      o.connect(g).connect(out); o.start(t); o.stop(t + 0.2);
    }
  }

  /** Authored cues; all connect to the same master volume and pause fade. */
  breathCue() {
    if(!this.ctx)return;
    const ctx=this.ctx;
    if(!this.storyBreath){
      this.storyBreath=ctx.createBuffer(1,Math.floor(ctx.sampleRate*1.24),ctx.sampleRate);
      const data=this.storyBreath.getChannelData(0);let seed=247;
      for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const t=i/ctx.sampleRate;const envelope=Math.exp(-Math.pow((t-.32)/.18,2))+.48*Math.exp(-Math.pow((t-.91)/.15,2));data[i]=(seed/4294967296*2-1)*envelope;}
    }
    const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();source.buffer=this.storyBreath;filter.type='bandpass';filter.frequency.value=840;filter.Q.value=1.1;gain.gain.value=.15;source.connect(filter).connect(gain).connect(this.master);source.start();source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
  }

  storyCue(kind) {
    if (!this.ctx) return;
    if (kind === 'release') { this.bell(0.55); return; }
    const ctx=this.ctx,t=ctx.currentTime;
    const o=ctx.createOscillator(),g=ctx.createGain();
    o.type=kind==='clue'?'sine':'triangle';
    const start=kind==='clue'?520:kind==='gate'?88:125;
    const duration=kind==='clue'?0.7:1.8;
    o.frequency.setValueAtTime(start,t);o.frequency.exponentialRampToValueAtTime(kind==='clue'?760:31,t+duration);
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(kind==='clue'?0.08:0.23,t+0.04);g.gain.exponentialRampToValueAtTime(0.0001,t+duration);
    o.connect(g).connect(this.master);o.start(t);o.stop(t+duration+0.03);
    if(kind==='gate')this.footstep(1.2,'wood');
  }
}
