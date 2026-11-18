import type { TimelineData, VideoData } from './types.ts';

// PRNG for audio noise
const rotl = (x: number, k: number) => (x << k) | (x >>> (32 - k));
const hash = (s: string | number): number => {
  s = String(s);
  let h = 0x9e3779b1;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x85ebca6b);
    h ^= h >>> 13;
  }
  return h >>> 0;
};

const rng = (seed: string | number) => {
  const s = typeof seed === 'number' ? seed >>> 0 : hash(seed);
  let a = (s ^ 0xa5a5a5a5) >>> 0;
  let b = (Math.imul(s, 0x27d4eb2d) >>> 0) || 1;
  let c = (0x165667b1 ^ s) >>> 0;
  let d = (rotl(s, 7) >>> 0) || 7;

  const r = () => {
    const res = Math.imul(rotl(Math.imul(b, 5), 7), 9) >>> 0;
    const t = b << 9;
    c ^= a;
    d ^= b;
    b ^= c;
    a ^= d;
    c ^= t;
    d = rotl(d, 11);
    return res / 4294967296;
  };
  for (let i = 0; i < 8; i++) r();
  return r;
};

const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);

export interface SoundKitOptions {
  voiceover?: boolean;
  from?: number;
  lead?: number;
  dest?: AudioNode;
}

export interface SoundKit {
  play: (name: string, t: number, o?: any) => void;
  pad: (t0: number, t1: number, bpm?: number, g?: number) => void;
  voice: (time: number, p: any) => void;
  hiss: (time: number, p: any) => void;
  hz: (n: string | number) => number;
  audioContext: BaseAudioContext;
}

export const SFX = (() => {
  const SEMI: Record<string, number> = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };

  const hz = (n: string | number): number => {
    if (typeof n === 'number') return n;
    const m = /^([A-G])(#|b)?(-?\d)$/.exec(n);
    if (!m) return 440;
    return (
      440 *
      Math.pow(
        2,
        (SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (+m[3] - 4) * 12) / 12
      )
    );
  };

  function createKit(ac: BaseAudioContext, o: SoundKitOptions = {}): SoundKit {
    const VO = !!o.voiceover;
    const SR = ac.sampleRate;
    const T0 = o.from || 0;
    const base = ac.currentTime + (o.lead || 0);

    const at = (t: number) => Math.max(0, Math.max(ac.currentTime, (Math.round((base + (t - T0)) * SR) + 0.3) / SR));
    const skip = (t: number, d: number) => (t + d <= T0) || at(t) + d < ac.currentTime;

    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 6;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.15;

    const master = ac.createGain();
    master.gain.value = 0.85;
    comp.connect(master);
    master.connect(o.dest || ac.destination);

    const mk = (g: number) => {
      const n = ac.createGain();
      n.gain.value = g;
      n.connect(comp);
      return n;
    };

    const bus: Record<string, GainNode> = {
      fx: mk(VO ? 0.78 : 0.95),
      music: mk(VO ? 0.3 : 0.62)
    };

    const nb = ac.createBuffer(1, 2 * SR, SR);
    const nd = nb.getChannelData(0);
    const nr = rng('nzwhite');
    for (let i = 0; i < nd.length; i++) nd[i] = nr() * 2 - 1;

    const safeTime = (time: number) => Math.max(0, time);

    const ramp = (p: AudioParam, v: any, t: number) => {
      t = safeTime(t);
      if (!Array.isArray(v)) {
        p.setValueAtTime(v, t);
        return;
      }
      p.setValueAtTime(v[0][1], safeTime(t + v[0][0]));
      for (let i = 1; i < v.length; i++) {
        p.exponentialRampToValueAtTime(Math.max(1e-3, v[i][1]), safeTime(t + v[i][0]));
      }
    };

    const env = (g: GainNode, t: number, peak: number, dur: number, a = 0.004, hold = 0) => {
      t = safeTime(t);
      a = Math.min(a, dur * 0.9);
      hold = Math.min(hold, dur - a);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + a);
      if (hold > 0) g.gain.setValueAtTime(peak, t + a + hold);
      g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
      g.gain.setValueAtTime(0, t + dur + 0.002);
    };

    const lvl = (p: any) => (p.gain == null ? 0.3 : p.gain) * (VO && p.soft ? 0.55 : 1);

    const route = (node: AudioNode, p: any) => {
      const pan = ac.createStereoPanner();
      pan.pan.value = clamp(p.pan || 0, -1, 1);
      node.connect(pan);
      pan.connect(bus[p.bus || 'fx']);
    };

    const filt = (p: any, t: number) => {
      if (!p.filter) return null;
      const f = ac.createBiquadFilter();
      f.type = p.filter;
      f.Q.value = p.q == null ? 0.9 : p.q;
      ramp(f.frequency, p.ff == null ? 1200 : p.ff, t);
      return f;
    };

    function voice(time: number, p: any) {
      const dur = p.dur || 0.2;
      if (skip(time, dur)) return;
      const t = at(time);
      const osc = ac.createOscillator();
      osc.type = p.type || 'sine';
      ramp(
        osc.frequency,
        Array.isArray(p.f) ? p.f.map(([d, v]: [number, any]) => [d, hz(v)]) : hz(p.f || 440),
        t
      );
      const g = ac.createGain();
      env(g, t, lvl(p), dur, p.a, p.hold);
      const f = filt(p, t);
      if (f) {
        osc.connect(f);
        f.connect(g);
      } else {
        osc.connect(g);
      }
      route(g, p);
      osc.start(t);
      osc.stop(t + dur + 0.03);
    }

    function hiss(time: number, p: any) {
      const dur = p.dur || 0.2;
      if (skip(time, dur)) return;
      const t = at(time);
      const src = ac.createBufferSource();
      src.buffer = nb;
      src.loop = true;
      const g = ac.createGain();
      env(g, t, lvl(p), dur, p.a, p.hold);
      const f = filt(p, t);
      if (f) {
        src.connect(f);
        f.connect(g);
      } else {
        src.connect(g);
      }
      route(g, p);
      src.start(t, rng('off' + time)() * 1.5);
      src.stop(t + dur + 0.03);
    }

    const S: Record<string, (t: number, g: number, o?: any) => void> = {
      slam: (t, g) => {
        voice(t, { f: [[0, 150], [0.12, 52]], dur: 0.2, gain: 0.42 * g });
        hiss(t, { dur: 0.07, filter: 'lowpass', ff: 2600, gain: 0.22 * g });
      },
      pop: (t, g, o = {}) => {
        const f = o.f || 760;
        voice(t, { f: [[0, f * 1.7], [0.05, f]], dur: 0.08, gain: 0.22 * g, soft: o.soft });
        hiss(t, { dur: 0.01, filter: 'highpass', ff: 4500, gain: 0.08 * g, soft: o.soft });
      },
      tick: (t, g, o = {}) =>
        hiss(t, { dur: 0.016, filter: 'bandpass', ff: o.f || 3800, q: 3, gain: 0.32 * g, soft: o.soft }),
      paper: (t, g) =>
        hiss(t, {
          dur: 0.28,
          filter: 'bandpass',
          ff: [[0, 700], [0.28, 3200]],
          q: 0.8,
          gain: 0.12 * g,
          a: 0.11,
          soft: true
        }),
      stamp: (t, g) => {
        voice(t, { f: [[0, 160], [0.18, 48]], dur: 0.28, gain: 0.6 * g });
        hiss(t, { dur: 0.06, filter: 'bandpass', ff: 1300, q: 1.1, gain: 0.4 * g });
        hiss(t + 0.004, { dur: 0.014, filter: 'highpass', ff: 4200, gain: 0.25 * g });
      },
      buzz: (t, g) =>
        voice(t, { type: 'square', f: 130, dur: 0.45, gain: 0.06 * g, filter: 'lowpass', ff: 900 }),
      ding: (t, g) => {
        voice(t, { f: 'E6', dur: 0.5, gain: 0.08 * g, a: 0.003 });
        voice(t + 0.08, { f: 'G#6', dur: 0.6, gain: 0.07 * g, a: 0.003 });
      },
      whoosh: (t, g) =>
        hiss(t, {
          dur: 0.35,
          filter: 'bandpass',
          ff: [[0, 260], [0.19, 2200], [0.35, 520]],
          q: 0.75,
          gain: 0.5 * g,
          a: 0.19,
          pan: 0.3
        }),
      chord: (t, g, o = {}) =>
        (o.notes || []).forEach((n: string, i: number) =>
          voice(t + i * 0.05, { f: n, dur: 1.6, gain: 0.05 * g, a: 0.01, pan: (i - 1.5) * 0.25 })
        )
    };

    function play(name: string, t: number, o: any = {}) {
      if (S[name]) S[name](t, o.gain == null ? 1 : o.gain, o);
    }

    function pad(t0: number, t1: number, bpm = 100, g = 1) {
      const bar = (60 / bpm) * 4;
      const ch = [
        ['D4', 'F#4', 'A4'],
        ['B3', 'D4', 'F#4'],
        ['G3', 'B3', 'D4'],
        ['A3', 'C#4', 'E4']
      ];
      let i = 0;
      for (let tb = t0; tb < t1 - 0.1; tb += bar, i++) {
        const len = Math.min(bar, t1 - tb);
        if (tb + len + 0.4 <= T0) continue;
        const c = ch[i % 4];
        c.forEach((n, j) =>
          voice(tb, {
            type: 'triangle',
            f: n,
            dur: len + 0.4,
            gain: 0.026 * g,
            a: 0.5,
            hold: Math.max(0, len - 0.9),
            filter: 'lowpass',
            ff: 1300,
            pan: (j - 1) * 0.3,
            bus: 'music'
          })
        );
        voice(tb, {
          f: hz(c[0]) / 2,
          dur: len + 0.2,
          gain: 0.05 * g,
          a: 0.3,
          hold: Math.max(0, len - 0.6),
          bus: 'music'
        });
        for (let b = 0; b < 8; b++) {
          const ts = tb + (b * 60) / bpm / 2;
          if (ts >= t1 - 0.05) break;
          hiss(ts, {
            dur: b % 2 ? 0.03 : 0.045,
            filter: 'highpass',
            ff: 8000,
            gain: (b % 2 ? 0.014 : 0.022) * g,
            bus: 'music'
          });
        }
      }
    }

    return { play, pad, voice, hiss, hz, audioContext: ac };
  }

  function live(
    score: (kit: SoundKit) => void,
    from = 0,
    opts: SoundKitOptions = {},
    existingCtx?: AudioContext
  ) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const ac = existingCtx || new AudioContextClass();
    const kit = createKit(ac, Object.assign({}, opts, { from, lead: 0.04 }));
    score(kit);
    return () => {
      if (!existingCtx) {
        try {
          ac.close();
        } catch (e) {}
      }
    };
  }

  async function render(
    score: (kit: SoundKit) => void,
    dur: number,
    sr = 48000,
    opts: SoundKitOptions = {}
  ) {
    const len = Math.ceil(dur * sr);
    const ac = new OfflineAudioContext(2, len, sr);
    score(createKit(ac, Object.assign({}, opts, { from: 0 })));
    const buf = await ac.startRendering();
    const L = buf.getChannelData(0);
    const Rr = buf.getChannelData(1);
    const inter = new Float32Array(len * 2);
    let peak = 0;
    for (let i = 0; i < len; i++) {
      inter[2 * i] = L[i];
      inter[2 * i + 1] = Rr[i];
      peak = Math.max(peak, Math.abs(L[i]), Math.abs(Rr[i]));
    }
    return { inter, peak, sr, frames: len, buffer: buf };
  }

  return { kit: createKit, live, render, hz };
})();

/**
 * Build dynamic sound score for given data and timeline
 */
export function buildSound(kit: SoundKit, data: VideoData, tl: TimelineData) {
  const G = 2;
  kit.pad(0, tl.D, 100, 0.7);
  kit.play('slam', tl.title, { gain: 0.4 * G });

  data.rounds.forEach((round, i) => {
    const t0 = tl.rounds[i];
    const fact = round.fact;
    kit.play('pop', t0 + 0.05, { f: 560, gain: 0.55 * G });
    kit.play('paper', t0, { gain: 0.7 * G });

    for (let x = t0 + tl.guess; x < t0 + tl.stamp - 0.1; x += 0.25) {
      kit.play('tick', x, { f: 3200, gain: 0.25 * G, soft: true });
    }

    kit.play('stamp', t0 + tl.stamp + 0.12, { gain: G });
    if (fact) {
      kit.play('ding', t0 + tl.stamp + 0.25, { gain: 1.2 * G });
    } else {
      kit.play('buzz', t0 + tl.stamp + 0.25, { gain: G });
    }

    kit.play('pop', t0 + tl.proof, { f: 800, gain: 0.35 * G, soft: true });
    kit.play('whoosh', t0 + tl.out, { gain: 0.25 * G });
  });

  data.rounds.forEach((_, j) => {
    kit.play('pop', tl.score + j * 0.12, { f: 620 + j * 70, gain: 0.4 * G, soft: true });
  });

  kit.play('chord', tl.score + 0.4, { gain: G, notes: ['D4', 'F#4', 'A4', 'D5'] });
}
