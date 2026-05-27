/* ============================
   SERENE — Meditation App
   ============================ */

// ── Sound Engine (Web Audio API) ─────────────────────────────────
const Sound = (() => {
  let ctx = null, nodes = [], chirpTid = null;

  const init = () => {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  };

  const stop = () => {
    clearTimeout(chirpTid);
    nodes.forEach(n => { try { n.stop ? n.stop() : n.disconnect(); } catch {} });
    nodes = [];
  };

  const mkNoise = (c, type = 'white') => {
    const sr = c.sampleRate, len = sr * 4;
    const buf = c.createBuffer(1, len, sr), d = buf.getChannelData(0);
    if (type === 'brown') {
      let l = 0;
      for (let i = 0; i < len; i++) { const w = Math.random()*2-1; d[i] = (l = (l + .02*w)/1.02) * 3.5; }
    } else {
      for (let i = 0; i < len; i++) d[i] = Math.random()*2-1;
    }
    const s = c.createBufferSource(); s.buffer = buf; s.loop = true; return s;
  };

  const play = (id) => {
    stop();
    if (id === 'none') return;
    const c = init();
    const out = c.createGain(); out.connect(c.destination);

    if (id === 'rain') {
      const n = mkNoise(c, 'white');
      const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 2600; f1.Q.value = 0.6;
      const f2 = c.createBiquadFilter(); f2.type = 'lowpass';  f2.frequency.value = 380;
      const g1 = c.createGain(); g1.gain.value = 0.14;
      const g2 = c.createGain(); g2.gain.value = 0.18;
      n.connect(f1); f1.connect(g1); g1.connect(out);
      n.connect(f2); f2.connect(g2); g2.connect(out);
      out.gain.value = 1; n.start();
      nodes.push(n, out);
    }
    else if (id === 'ocean') {
      // Use scheduled automation instead of AudioParam connections (more iOS-compatible)
      const n = mkNoise(c, 'brown');
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
      n.connect(f); f.connect(out); n.start();
      const wave = 13; // seconds per wave cycle  (≈ 0.077 Hz)
      let t = c.currentTime;
      out.gain.setValueAtTime(0.45, t);
      for (let i = 0; i < 55; i++) {
        f.frequency.linearRampToValueAtTime(680, t + wave * 0.45);
        out.gain.linearRampToValueAtTime(0.82, t + wave * 0.45);
        f.frequency.linearRampToValueAtTime(160, t + wave * 0.85);
        out.gain.linearRampToValueAtTime(0.18, t + wave * 0.85);
        f.frequency.linearRampToValueAtTime(400, t + wave);
        out.gain.linearRampToValueAtTime(0.45, t + wave);
        t += wave;
      }
      nodes.push(n, f, out);
    }
    else if (id === 'forest') {
      const w  = mkNoise(c, 'white');
      const f  = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 650; f.Q.value = 2.5;
      const wg = c.createGain(); wg.gain.value = 0.065;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.13;
      const lg  = c.createGain();        lg.gain.value       = 0.028;
      lfo.connect(lg); lg.connect(wg.gain); lfo.start();
      w.connect(f); f.connect(wg); wg.connect(out); out.gain.value = 1.4; w.start();
      // Bird chirps
      const bo = c.createOscillator(); bo.type = 'sine'; bo.frequency.value = 1400;
      const bg = c.createGain(); bg.gain.value = 0;
      bo.connect(bg); bg.connect(out); bo.start();
      let alive = true;
      const chirp = () => {
        if (!alive) return;
        bo.frequency.setValueAtTime(1100 + Math.random()*700, c.currentTime);
        bg.gain.cancelScheduledValues(c.currentTime);
        bg.gain.setValueAtTime(0.055, c.currentTime);
        bg.gain.linearRampToValueAtTime(0, c.currentTime + 0.22);
        chirpTid = setTimeout(chirp, 1400 + Math.random()*2600);
      };
      chirpTid = setTimeout(chirp, 700);
      nodes.push(w, lfo, bo, out, { stop: () => { alive = false; } });
    }
    else if (id === 'fire') {
      // Crackling fire: schedule irregular amplitude bursts with a recurring batch scheduler
      const n = mkNoise(c, 'brown');
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
      n.connect(f); f.connect(out); out.gain.value = 0.42; n.start();
      let alive = true;
      const schedFire = () => {
        if (!alive) return;
        const now = c.currentTime;
        let t = now;
        while (t < now + 4) {
          const dur = 0.06 + Math.random() * 0.16;
          out.gain.linearRampToValueAtTime(0.18 + Math.random() * 0.52, t + dur);
          t += dur;
        }
        chirpTid = setTimeout(schedFire, 3200);
      };
      schedFire();
      nodes.push(n, f, out, { stop: () => { alive = false; } });
    }
    else if (id === 'space') {
      [[55, 0.18], [82.4, 0.09], [57.3, 0.11]].forEach(([freq, gain]) => {
        const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
        const g = c.createGain(); g.gain.value = gain;
        o.connect(g); g.connect(out); o.start(); nodes.push(o);
      });
      const trem = c.createOscillator(); trem.frequency.value = 0.17;
      const tg   = c.createGain();       tg.gain.value        = 0.06;
      trem.connect(tg); tg.connect(out.gain); trem.start();
      out.gain.value = 0.2; nodes.push(trem, out);
    }
  };

  // Short tonal cue — used by breathing exercises for phase transitions
  const tone = (f0, f1, dur, vol = 0.13) => {
    const c = init();
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, c.currentTime);
    o.frequency.linearRampToValueAtTime(f1, c.currentTime + dur * 0.75);
    g.gain.setValueAtTime(0, c.currentTime);
    g.gain.linearRampToValueAtTime(vol, c.currentTime + 0.04);
    g.gain.setValueAtTime(vol, c.currentTime + dur * 0.55);
    g.gain.linearRampToValueAtTime(0, c.currentTime + dur);
    o.connect(g); g.connect(c.destination);
    o.start(); o.stop(c.currentTime + dur + 0.05);
  };

  return { play, stop, tone };
})();

// ── Storage helpers ──────────────────────────────────────────────
const store = {
  get: (k, def = null) => { try { const v = localStorage.getItem(k); return v !== null ? JSON.parse(v) : def; } catch { return def; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ── Data ─────────────────────────────────────────────────────────
const MOODS = [
  { emoji: '😌', label: 'Calm' },
  { emoji: '😊', label: 'Happy' },
  { emoji: '😐', label: 'Neutral' },
  { emoji: '😔', label: 'Low' },
  { emoji: '😤', label: 'Anxious' },
  { emoji: '😴', label: 'Tired' },
];

const BREATH_PATTERNS = [
  { id: 'box',       name: 'Box',        phases: [4,4,4,4], desc: 'Inhale · Hold · Exhale · Hold — 4 sec each' },
  { id: '478',       name: '4-7-8',      phases: [4,7,8,0], desc: 'Inhale 4 · Hold 7 · Exhale 8 — deep calm' },
  { id: 'calm',      name: 'Calm',       phases: [4,0,6,0], desc: 'Inhale 4 · Exhale 6 — natural relaxation' },
  { id: 'energy',    name: 'Energize',   phases: [6,0,2,0], desc: 'Inhale 6 · Exhale 2 — activating breath' },
  { id: 'triangle',  name: 'Triangle',   phases: [4,4,4,0], desc: 'Inhale 4 · Hold 4 · Exhale 4 — steady rhythm' },
  { id: 'coherent',  name: 'Coherent',   phases: [6,0,6,0], desc: 'Inhale 6 · Exhale 6 — heart rate balance' },
  { id: 'deeprest',  name: 'Deep Rest',  phases: [4,2,8,0], desc: 'Inhale 4 · Hold 2 · Exhale 8 — maximum release' },
  { id: 'power',     name: 'Power',      phases: [2,0,2,0], desc: 'Inhale 2 · Exhale 2 — rapid energising' },
];

const MEDITATIONS = [
  { id: 'guided-breath', icon: '🌬️', name: 'Guided Breath Journey', duration: 10, tag: 'Breathing', tagColor: 'teal',
    steps: [
      [0,   'Find a comfortable seat. Let your spine be tall and your shoulders soft. Close your eyes.'],
      [25,  'Take a moment to arrive. Notice any sounds around you, then gently let them fade.'],
      [60,  'Simply notice your natural breath. Don\'t change it yet — just feel it moving through you.'],
      [100, 'Feel the gentle rise of your chest and belly on each inhale… and the soft release on each exhale.'],
      [135, 'Now we begin. Breathe in slowly through your nose for 4 counts… 1… 2… 3… 4…'],
      [150, 'Hold gently at the top… 1… 2… 3… 4…'],
      [165, 'Exhale fully and slowly… 1… 2… 3… 4… release everything.'],
      [182, 'Hold at the bottom… 1… 2… 3… 4… then inhale again.'],
      [215, 'Continue this box breath rhythm. In… hold… out… hold. Let it steady your mind.'],
      [270, 'Thoughts may arise — simply notice them and return to counting your breath.'],
      [320, 'You are doing beautifully. Each cycle brings you deeper into calm.'],
      [365, 'Now we shift. Inhale for 4… hold for 7… exhale for a long, slow 8.'],
      [385, 'Breathe in… 2… 3… 4… Hold… 2… 3… 4… 5… 6… 7…'],
      [415, 'Exhale slowly… 2… 3… 4… 5… 6… 7… 8… let it all dissolve.'],
      [450, 'Again. A deep inhale… hold it… and a long, soft exhale.'],
      [495, 'This breath activates your body\'s rest response. You are safe. You are deeply calm.'],
      [530, 'Now release all counting. Let your breath return to its own natural rhythm.'],
      [560, 'Feel the stillness you have built. Rest here in the quiet of your own breath.'],
      [585, 'When you\'re ready, take one final deep breath in… and sigh it out. Gently open your eyes.'],
    ]
  },
  { id: 'body-scan',    icon: '🧘', name: 'Body Scan',        duration: 10, tag: 'Relaxation', tagColor: '',
    steps: [
      [0,   'Find a comfortable position. Close your eyes and take three deep breaths.'],
      [30,  'Bring your attention to the top of your head. Notice any sensations without judgment.'],
      [90,  'Slowly move your awareness down to your forehead and eyes. Let any tension release.'],
      [150, 'Shift to your jaw and neck. Soften any tightness you find there.'],
      [210, 'Move to your shoulders and arms. Let them feel heavy and warm.'],
      [270, 'Bring awareness to your chest and belly. Notice the natural rhythm of your breath.'],
      [330, 'Move down to your hips and lower back. Breathe into any areas of tension.'],
      [390, 'Shift your focus to your legs and feet. Feel them connected to the earth.'],
      [450, 'Now expand your awareness to your whole body at once, resting in stillness.'],
      [530, 'Gently begin to wiggle your fingers and toes. When ready, open your eyes.'],
    ]
  },
  { id: 'mindfulness',  icon: '🌿', name: 'Mindful Moment',  duration: 5,  tag: 'Focus',      tagColor: 'teal',
    steps: [
      [0,   'Sit comfortably and gently close your eyes. Rest your hands on your knees.'],
      [30,  'Take a slow breath in through your nose and out through your mouth.'],
      [60,  'Bring your full attention to this breath. Just this one.'],
      [100, 'Thoughts will arise. Simply notice them and return to the breath.'],
      [160, 'You are here. You are present. That is enough.'],
      [220, 'Continue breathing naturally, returning to this moment again and again.'],
      [270, 'Slowly open your eyes, carrying this stillness with you.'],
    ]
  },
  { id: 'loving-kind',  icon: '💜', name: 'Loving Kindness',  duration: 8,  tag: 'Compassion', tagColor: 'pink',
    steps: [
      [0,   'Sit comfortably and bring your hand to your heart.'],
      [40,  'Silently repeat: "May I be happy. May I be healthy. May I be at peace."'],
      [100, 'Now picture someone you love. Send them these same wishes from your heart.'],
      [180, '"May you be happy. May you be healthy. May you be at peace."'],
      [250, 'Think of a neutral person — someone you see but don\'t know well. Offer them kindness too.'],
      [330, 'Now expand outward to all beings everywhere. Feel your heart open wide.'],
      [410, '"May all beings be happy. May all beings be free from suffering."'],
      [450, 'Rest in this ocean of compassion and warmth.'],
    ]
  },
  { id: 'sleep',        icon: '🌙', name: 'Sleep Wind-Down',  duration: 15, tag: 'Sleep',      tagColor: '',
    steps: [
      [0,   'Lie down comfortably. Let your arms rest by your sides, palms up.'],
      [30,  'Close your eyes and let your body sink into the surface beneath you.'],
      [80,  'Inhale slowly… and exhale, releasing the day with each breath.'],
      [160, 'Imagine a warm golden light starting at your feet, melting tension away.'],
      [240, 'This light slowly moves up your legs, your belly, your chest...'],
      [340, 'Your arms feel heavy. Your shoulders drop. Your face softens.'],
      [440, 'You are safe. You are warm. There is nothing to do and nowhere to be.'],
      [560, 'Let go of every thought. Drift toward peaceful, restful sleep.'],
      [680, 'Sleep well. You deserve this rest.'],
    ]
  },
  { id: 'anxiety',      icon: '🌊', name: 'Anxiety Relief',   duration: 7,  tag: 'Calm',       tagColor: 'teal',
    steps: [
      [0,   'Place both feet flat on the floor. Feel the solid ground beneath you.'],
      [30,  'Look around and name 5 things you can see right now.'],
      [70,  'Now notice 4 things you can physically feel — the chair, your clothes, the air.'],
      [120, 'Listen for 3 sounds in your environment. Just observe them.'],
      [170, 'Notice 2 things you can smell, or simply the quality of the air.'],
      [210, 'Take one slow, deep breath. You are here. You are safe.'],
      [260, 'Continue breathing. With each exhale, release what you do not need.'],
      [340, 'The present moment is manageable. You are okay, right now, in this breath.'],
    ]
  },
  { id: 'focus',        icon: '🔮', name: 'Deep Focus',        duration: 12, tag: 'Focus',      tagColor: 'teal',
    steps: [
      [0,   'Sit tall. Take a few natural breaths and let your mind settle.'],
      [40,  'Set a clear intention for this session. What do you want to accomplish?'],
      [90,  'Breathe in clarity. Breathe out distraction.'],
      [160, 'Your mind is sharp and present. Every breath focuses you further.'],
      [240, 'If thoughts arise, gently label them "thinking" and return to your intention.'],
      [340, 'You are building concentration with each returning moment of awareness.'],
      [460, 'Feel the ease and depth of genuine focus settling in.'],
      [580, 'You are ready. Carry this clarity into your work.'],
    ]
  },
];

const AMBIENT = [
  { id: 'none',   icon: '🔇', label: 'Silent' },
  { id: 'rain',   icon: '🌧️', label: 'Rain' },
  { id: 'ocean',  icon: '🌊', label: 'Ocean' },
  { id: 'forest', icon: '🌲', label: 'Forest' },
  { id: 'fire',   icon: '🔥', label: 'Fire' },
  { id: 'space',  icon: '✨', label: 'Space' },
];

// ── State ─────────────────────────────────────────────────────────
let state = {
  screen: 'home',
  todayMood: store.get('todayMood', null),
  breathPattern: 'box',
  breathActive: false,
  breathPhase: 0,
  breathCount: 0,
  breathCycles: 0,
  breathTimer: null,
  breathPhaseTimer: null,
  medActive: null,
  medTimerInterval: null,
  medElapsed: 0,
  medGuidanceIndex: 0,
  medGuidanceTimer: null,
  medPaused: false,
  ambient: store.get('ambient', 'none'),
  journalMood: null,
  sessions: store.get('sessions', []),
  journalEntries: store.get('journalEntries', []),
  streak: computeStreak(),
};

function computeStreak() {
  const sessions = store.get('sessions', []);
  if (!sessions.length) return 0;
  const days = [...new Set(sessions.map(s => s.date))].sort().reverse();
  const today = dateStr(new Date());
  const yesterday = dateStr(new Date(Date.now() - 86400000));
  if (days[0] !== today && days[0] !== yesterday) return 0;
  let streak = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i-1]);
    const curr = new Date(days[i]);
    const diff = (prev - curr) / 86400000;
    if (diff === 1) streak++;
    else break;
  }
  return streak;
}

function dateStr(d) { return d.toISOString().split('T')[0]; }

function formatTime(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ── Navigation ─────────────────────────────────────────────────────
function navigate(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`screen-${screenId}`).classList.add('active');
  document.querySelector(`[data-screen="${screenId}"]`)?.classList.add('active');
  state.screen = screenId;
  renderScreen(screenId);
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => navigate(btn.dataset.screen));
});

// ── Toast ─────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}
document.body.insertAdjacentHTML('beforeend', '<div id="toast"></div>');

// ── Render dispatcher ─────────────────────────────────────────────
function renderScreen(id) {
  const el = document.getElementById(`screen-${id}`);
  if (id === 'home')     renderHome(el);
  if (id === 'breathe')  renderBreathe(el);
  if (id === 'meditate') renderMeditate(el);
  if (id === 'journal')  renderJournal(el);
  if (id === 'progress') renderProgress(el);
}

// ══════════════════════════════════════════════════════════════════
// HOME SCREEN
// ══════════════════════════════════════════════════════════════════
function renderHome(el) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const totalMin = state.sessions.reduce((a, s) => a + (s.duration || 0), 0);
  const todaySessions = state.sessions.filter(s => s.date === dateStr(new Date()));

  el.innerHTML = `
    <div class="home-hero">
      <div class="greeting">${greeting}</div>
      <h1>Ready to find peace?</h1>
    </div>

    <div class="streak-banner">
      <div class="streak-flame">🔥</div>
      <div class="streak-info">
        <h3>Daily Streak</h3>
        <p style="margin:0">${state.streak > 0 ? 'Keep it going!' : 'Start today!'}</p>
      </div>
      <div class="streak-days">
        <div class="num">${state.streak}</div>
        <div class="label">days</div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">How are you feeling?</div>
      <div class="mood-row" id="home-mood-row">
        ${MOODS.map((m, i) => `
          <button class="mood-pill ${state.todayMood === i ? 'selected' : ''}" data-mood="${i}">
            <span class="emoji">${m.emoji}</span>
            <span class="label">${m.label}</span>
          </button>
        `).join('')}
      </div>
    </div>

    <div class="section">
      <div class="section-title">Quick Start</div>
      <div class="quick-grid">
        <div class="quick-card" data-action="goto-breathe">
          <div class="icon">💨</div>
          <h3>Breathe</h3>
          <p>Guided breathing</p>
        </div>
        <div class="quick-card" data-action="goto-meditate">
          <div class="icon">🧘</div>
          <h3>Meditate</h3>
          <p>Guided sessions</p>
        </div>
        <div class="quick-card" data-action="goto-journal">
          <div class="icon">📔</div>
          <h3>Journal</h3>
          <p>Write your thoughts</p>
        </div>
        <div class="quick-card" data-action="goto-progress">
          <div class="icon">📊</div>
          <h3>Progress</h3>
          <p>${totalMin} min total</p>
        </div>
      </div>
    </div>
  `;

  el.querySelectorAll('.mood-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = +btn.dataset.mood;
      state.todayMood = idx;
      store.set('todayMood', idx);
      showToast(`Mood logged: ${MOODS[idx].emoji} ${MOODS[idx].label}`);
      renderHome(el);
    });
  });

  el.querySelectorAll('.quick-card').forEach(card => {
    card.addEventListener('click', () => {
      const a = card.dataset.action;
      if (a === 'goto-breathe')  navigate('breathe');
      if (a === 'goto-meditate') navigate('meditate');
      if (a === 'goto-journal')  navigate('journal');
      if (a === 'goto-progress') navigate('progress');
    });
  });
}

// ══════════════════════════════════════════════════════════════════
// BREATHE SCREEN
// ══════════════════════════════════════════════════════════════════
const PHASE_NAMES = ['Inhale', 'Hold', 'Exhale', 'Hold'];
const PHASE_CSS   = ['phase-inhale', 'phase-hold', 'phase-exhale', 'phase-hold2'];

function renderBreathe(el) {
  const pat = BREATH_PATTERNS.find(p => p.id === state.breathPattern);
  const activePhasesCount = pat.phases.filter(p => p > 0).length;

  el.innerHTML = `
    <div class="breathe-container">
      <div class="breathe-title">
        <h1>Breathe</h1>
        <p>Exercises to calm your nervous system</p>
      </div>
      <div class="pattern-tabs">
        ${BREATH_PATTERNS.map(p => `
          <button class="pattern-tab ${p.id === state.breathPattern ? 'active' : ''}" data-pattern="${p.id}">
            ${p.name}
          </button>
        `).join('')}
      </div>

      <div class="breath-scene">
        <div class="breath-circle-wrap">
          <div class="breath-ring"></div>
          <div class="breath-circle" id="breath-circle">
            <div class="breath-phase" id="breath-phase-label">Ready</div>
            <div class="breath-count" id="breath-count-label"></div>
          </div>
        </div>

        <div class="breath-instruction" id="breath-instruction">Tap Start to begin</div>
        <div class="breath-pattern-desc">${pat.desc}</div>
        <div class="breath-cycles" id="breath-cycles-label">${state.breathActive ? `Cycle ${state.breathCycles + 1}` : ''}</div>

        <div style="display:flex; gap:12px">
          <button class="btn btn-primary btn-lg" id="btn-breath-start">
            ${state.breathActive ? 'Stop' : 'Start'}
          </button>
          ${state.breathActive ? '' : ''}
        </div>
      </div>
    </div>
  `;

  el.querySelectorAll('.pattern-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      if (state.breathActive) stopBreathing();
      state.breathPattern = btn.dataset.pattern;
      renderBreathe(el);
    });
  });

  el.querySelector('#btn-breath-start').addEventListener('click', () => {
    if (state.breathActive) {
      stopBreathing();
      renderBreathe(el);
    } else {
      startBreathing(el);
    }
  });

  if (state.breathActive) {
    // Re-attach running state visuals
  }
}

function startBreathing(el) {
  state.breathActive = true;
  state.breathCycles = 0;
  state.breathPhase = 0;
  el.querySelector('#btn-breath-start').textContent = 'Stop';
  runBreathPhase(el);
}

function stopBreathing() {
  state.breathActive = false;
  clearTimeout(state.breathPhaseTimer);
  clearInterval(state.breathTimer);
  state.breathPhase = 0;
  state.breathCycles = 0;
  state.breathCount = 0;
  const circle = document.getElementById('breath-circle');
  if (circle) { circle.className = 'breath-circle'; circle.style.setProperty('--phase-dur', ''); }
  const phaseLabel = document.getElementById('breath-phase-label');
  const countLabel = document.getElementById('breath-count-label');
  const instr = document.getElementById('breath-instruction');
  const cyclesLabel = document.getElementById('breath-cycles-label');
  if (phaseLabel) phaseLabel.textContent = 'Ready';
  if (countLabel) countLabel.textContent = '';
  if (instr) instr.textContent = 'Tap Start to begin';
  if (cyclesLabel) cyclesLabel.textContent = '';
}

function runBreathPhase(el) {
  const pat = BREATH_PATTERNS.find(p => p.id === state.breathPattern);
  if (!state.breathActive) return;

  // Skip 0-duration phases
  while (pat.phases[state.breathPhase] === 0) {
    state.breathPhase = (state.breathPhase + 1) % 4;
  }

  const duration = pat.phases[state.breathPhase];
  const phaseName = PHASE_NAMES[state.breathPhase];
  const phaseClass = PHASE_CSS[state.breathPhase];

  const circle = document.getElementById('breath-circle');
  const phaseLabel = document.getElementById('breath-phase-label');
  const countLabel = document.getElementById('breath-count-label');
  const instr = document.getElementById('breath-instruction');
  const cyclesLabel = document.getElementById('breath-cycles-label');

  if (!circle) return;

  // Animate
  circle.className = 'breath-circle';
  circle.style.setProperty('--phase-dur', `${duration}s`);
  void circle.offsetWidth; // reflow
  circle.classList.add(phaseClass);

  if (phaseLabel) phaseLabel.textContent = phaseName;
  if (instr) instr.textContent = phaseName === 'Inhale' ? 'Breathe in slowly...' : phaseName === 'Exhale' ? 'Breathe out slowly...' : 'Hold...';

  // Audio cue: rising tone = inhale, falling tone = exhale, neutral = hold
  if      (phaseName === 'Inhale') Sound.tone(330, 528, 0.55, 0.14);
  else if (phaseName === 'Exhale') Sound.tone(528, 264, 0.55, 0.14);
  else                             Sound.tone(396, 396, 0.30, 0.08);
  if (cyclesLabel) cyclesLabel.textContent = `Cycle ${state.breathCycles + 1}`;

  // Countdown
  let remaining = duration;
  if (countLabel) countLabel.textContent = remaining;
  clearInterval(state.breathTimer);
  state.breathTimer = setInterval(() => {
    remaining--;
    if (countLabel) countLabel.textContent = remaining > 0 ? remaining : '';
  }, 1000);

  state.breathPhaseTimer = setTimeout(() => {
    clearInterval(state.breathTimer);
    const nextPhase = (state.breathPhase + 1) % 4;
    if (nextPhase === 0) state.breathCycles++;
    state.breathPhase = nextPhase;
    runBreathPhase(el);
  }, duration * 1000);
}

// ══════════════════════════════════════════════════════════════════
// MEDITATE SCREEN
// ══════════════════════════════════════════════════════════════════
function renderMeditate(el) {
  el.innerHTML = `
    <div class="page-header">
      <h1>Meditate</h1>
      <p>Guided sessions for every moment</p>
    </div>
    <div class="scroll-area">
      <div class="meditate-list">
        ${MEDITATIONS.map(m => `
          <div class="med-card" data-med="${m.id}">
            <div class="med-icon">${m.icon}</div>
            <div class="med-info">
              <h3>${m.name}</h3>
              <p>${m.steps[0][1].substring(0, 60)}…</p>
              <div class="med-meta">
                <span class="tag ${m.tagColor}">${m.tag}</span>
                <span class="tag">${m.duration} min</span>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    ${renderMedPlayer()}
  `;

  el.querySelectorAll('.med-card').forEach(card => {
    card.addEventListener('click', () => {
      const med = MEDITATIONS.find(m => m.id === card.dataset.med);
      openMedPlayer(med);
    });
  });

  wirePlayer();
}

function renderMedPlayer() {
  return `
    <div class="med-player" id="med-player">
      <div class="med-player-header">
        <h2 id="med-player-title">–</h2>
        <p id="med-player-subtitle" style="font-size:13px"></p>
        <div class="med-progress-bar">
          <div class="med-progress-fill" id="med-progress-fill" style="width:0%"></div>
        </div>
      </div>

      <div class="med-visual">
        <div class="med-orb"></div>
        <div class="med-guidance" id="med-guidance"></div>
        <div class="amb-section" style="width:100%">
          <div class="ambient-row" id="ambient-row">
            ${AMBIENT.map(a => `
              <button class="ambient-btn ${state.ambient === a.id ? 'active' : ''}" data-amb="${a.id}">
                <span class="amb-icon">${a.icon}</span>
                ${a.label}
              </button>
            `).join('')}
          </div>
        </div>
      </div>

      <div class="med-controls">
        <button class="btn btn-ghost btn-icon" id="btn-med-close" style="font-size:20px">✕</button>
        <div class="med-timer-display" id="med-timer">00:00</div>
        <button class="btn btn-ghost btn-icon" id="btn-med-pause" style="font-size:22px">⏸</button>
      </div>
    </div>
  `;
}

function wirePlayer() {
  document.getElementById('btn-med-close')?.addEventListener('click', closeMedPlayer);
  document.getElementById('btn-med-pause')?.addEventListener('click', toggleMedPause);
  document.querySelectorAll('.ambient-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.ambient = btn.dataset.amb;
      store.set('ambient', state.ambient);
      document.querySelectorAll('.ambient-btn').forEach(b => b.classList.toggle('active', b.dataset.amb === state.ambient));
      Sound.play(state.ambient);
      const label = btn.textContent.trim().split('\n').pop().trim();
      showToast(state.ambient === 'none' ? '🔇 Silent mode' : `${btn.querySelector('.amb-icon').textContent} ${label} playing`);
    });
  });
}

function openMedPlayer(med) {
  state.medActive = med;
  state.medElapsed = 0;
  state.medPaused = false;
  state.medGuidanceIndex = 0;
  const totalSec = med.duration * 60;

  const player = document.getElementById('med-player');
  const title = document.getElementById('med-player-title');
  const sub = document.getElementById('med-player-subtitle');
  const guidance = document.getElementById('med-guidance');
  const timer = document.getElementById('med-timer');
  const fill = document.getElementById('med-progress-fill');
  const pauseBtn = document.getElementById('btn-med-pause');

  player.classList.add('open');
  title.textContent = med.name;
  sub.textContent = `${med.duration} min · ${med.tag}`;
  guidance.textContent = med.steps[0][1];
  timer.textContent = formatTime(0);
  fill.style.width = '0%';
  pauseBtn.textContent = '⏸';

  clearInterval(state.medTimerInterval);
  state.medTimerInterval = setInterval(() => {
    if (state.medPaused) return;
    state.medElapsed++;
    timer.textContent = formatTime(state.medElapsed);
    fill.style.width = `${Math.min(100, (state.medElapsed / totalSec) * 100)}%`;

    // Update guidance
    const steps = med.steps;
    let newIdx = state.medGuidanceIndex;
    for (let i = 0; i < steps.length; i++) {
      if (state.medElapsed >= steps[i][0]) newIdx = i;
    }
    if (newIdx !== state.medGuidanceIndex) {
      state.medGuidanceIndex = newIdx;
      guidance.style.opacity = '0';
      setTimeout(() => {
        guidance.textContent = steps[newIdx][1];
        guidance.style.opacity = '1';
      }, 300);
    }

    if (state.medElapsed >= totalSec) completeMeditation(med);
  }, 1000);
}

function completeMeditation(med) {
  clearInterval(state.medTimerInterval);
  const entry = {
    id: Date.now(),
    name: med.name,
    icon: med.icon,
    duration: med.duration,
    date: dateStr(new Date()),
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };
  state.sessions.push(entry);
  store.set('sessions', state.sessions);
  state.streak = computeStreak();

  const guidance = document.getElementById('med-guidance');
  if (guidance) {
    guidance.style.opacity = '0';
    setTimeout(() => {
      guidance.textContent = '✨ Session complete. Well done.';
      guidance.style.opacity = '1';
    }, 300);
  }
  showToast(`🎉 ${med.name} complete!`);

  setTimeout(() => closeMedPlayer(), 3000);
}

function closeMedPlayer() {
  Sound.stop();
  clearInterval(state.medTimerInterval);
  state.medActive = null;
  state.medElapsed = 0;
  state.medPaused = false;
  document.getElementById('med-player')?.classList.remove('open');
}

function toggleMedPause() {
  state.medPaused = !state.medPaused;
  const btn = document.getElementById('btn-med-pause');
  if (btn) btn.textContent = state.medPaused ? '▶' : '⏸';
}

// ══════════════════════════════════════════════════════════════════
// JOURNAL SCREEN
// ══════════════════════════════════════════════════════════════════
function renderJournal(el) {
  el.innerHTML = `
    <div class="page-header">
      <h1>Journal</h1>
      <p>Write freely, without judgment</p>
    </div>
    <div class="journal-container">
      <div class="journal-new">
        <div style="font-size:11px; font-weight:600; color:var(--text-muted); margin-bottom:8px; letter-spacing:0.5px">HOW ARE YOU FEELING?</div>
        <div class="mood-row" id="journal-mood-row" style="padding:0; margin-bottom:10px">
          ${MOODS.map((m, i) => `
            <button class="mood-pill ${state.journalMood === i ? 'selected' : ''}" data-jmood="${i}">
              <span class="emoji">${m.emoji}</span>
              <span class="label">${m.label}</span>
            </button>
          `).join('')}
        </div>
        <textarea class="journal-textarea" id="journal-input" placeholder="What's on your mind?" maxlength="2000"></textarea>
        <div class="journal-save-row">
          <span class="char-count" id="char-count">0 / 2000</span>
          <button class="btn btn-primary" style="padding:10px 20px; font-size:14px" id="btn-save-entry">Save</button>
        </div>
      </div>
    </div>
    <div class="scroll-area" style="padding-top:12px">
      <div style="padding: 0 20px">
        <div class="journal-entries" id="journal-entries">
          ${renderJournalEntries()}
        </div>
      </div>
    </div>
  `;

  el.querySelectorAll('.mood-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      state.journalMood = +btn.dataset.jmood;
      el.querySelectorAll('.mood-pill').forEach(b => b.classList.toggle('selected', b.dataset.jmood == state.journalMood));
    });
  });

  const textarea = el.querySelector('#journal-input');
  const charCount = el.querySelector('#char-count');
  textarea.addEventListener('input', () => {
    charCount.textContent = `${textarea.value.length} / 2000`;
  });

  el.querySelector('#btn-save-entry').addEventListener('click', () => {
    const text = textarea.value.trim();
    if (!text) { showToast('Write something first!'); return; }
    const entry = {
      id: Date.now(),
      text,
      mood: state.journalMood,
      date: new Date().toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      dateStr: dateStr(new Date()),
    };
    state.journalEntries.unshift(entry);
    store.set('journalEntries', state.journalEntries);
    state.journalMood = null;
    textarea.value = '';
    charCount.textContent = '0 / 2000';
    el.querySelectorAll('.mood-pill').forEach(b => b.classList.remove('selected'));
    el.querySelector('#journal-entries').innerHTML = renderJournalEntries();
    wireDeleteBtns(el);
    showToast('Entry saved ✨');
  });

  wireDeleteBtns(el);
}

function renderJournalEntries() {
  if (!state.journalEntries.length) {
    return `<div class="empty-state"><div class="icon">📝</div><p>Your journal is empty.<br>Write your first entry above.</p></div>`;
  }
  return state.journalEntries.map(e => `
    <div class="journal-entry" data-id="${e.id}">
      <div class="entry-header">
        <div class="entry-mood">${e.mood !== null && e.mood !== undefined ? MOODS[e.mood].emoji : '📝'}</div>
        <div>
          <div style="font-size:13px; font-weight:600">${e.date}</div>
          <div class="entry-date">${e.time}</div>
        </div>
      </div>
      <div class="entry-text">${e.text.replace(/\n/g, '<br>')}</div>
      <button class="entry-delete" data-del="${e.id}">✕</button>
    </div>
  `).join('');
}

function wireDeleteBtns(el) {
  el.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = +btn.dataset.del;
      state.journalEntries = state.journalEntries.filter(e => e.id !== id);
      store.set('journalEntries', state.journalEntries);
      el.querySelector('#journal-entries').innerHTML = renderJournalEntries();
      wireDeleteBtns(el);
      showToast('Entry deleted');
    });
  });
}

// ══════════════════════════════════════════════════════════════════
// PROGRESS SCREEN
// ══════════════════════════════════════════════════════════════════
function renderProgress(el) {
  const totalSessions = state.sessions.length;
  const totalMin = state.sessions.reduce((a, s) => a + (s.duration || 0), 0);
  const uniqueDays = new Set(state.sessions.map(s => s.date)).size;

  // Week grid (Mon–Sun relative to today)
  const today = new Date();
  const todayStr = dateStr(today);
  const weekDays = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    weekDays.push({ str: dateStr(d), label: ['S','M','T','W','T','F','S'][d.getDay()] });
  }
  const sessionDates = new Set(state.sessions.map(s => s.date));

  // Mood distribution
  const moodCounts = Array(MOODS.length).fill(0);
  state.journalEntries.forEach(e => { if (e.mood !== null && e.mood !== undefined) moodCounts[e.mood]++; });
  const maxMood = Math.max(...moodCounts, 1);

  el.innerHTML = `
    <div class="page-header">
      <h1>Progress</h1>
      <p>Your meditation journey so far</p>
    </div>
    <div class="scroll-area">
    <div class="progress-container">

      <div class="stats-grid" style="margin-bottom:16px">
        <div class="stat-card">
          <div class="val">${state.streak}</div>
          <div class="lbl">Day Streak 🔥</div>
        </div>
        <div class="stat-card">
          <div class="val">${totalMin}</div>
          <div class="lbl">Total Minutes</div>
        </div>
        <div class="stat-card">
          <div class="val">${totalSessions}</div>
          <div class="lbl">Sessions</div>
        </div>
        <div class="stat-card">
          <div class="val">${uniqueDays}</div>
          <div class="lbl">Days Practiced</div>
        </div>
      </div>

      <div class="section">
        <div class="section-title" style="padding:0; margin-bottom:12px">This Week</div>
        <div class="card">
          <div class="week-grid">
            ${weekDays.map(d => `
              <div class="week-day">
                <div class="day-label">${d.label}</div>
                <div class="week-dot ${sessionDates.has(d.str) ? 'done' : ''} ${d.str === todayStr ? 'today' : ''}">
                  ${sessionDates.has(d.str) ? '✓' : ''}
                </div>
              </div>
            `).join('')}
          </div>
          <p style="text-align:center; font-size:13px; margin-top:12px; margin-bottom:0">
            ${Array.from(sessionDates).filter(d => weekDays.some(w => w.str === d)).length} of 7 days this week
          </p>
        </div>
      </div>

      <div class="section">
        <div class="section-title" style="padding:0; margin-bottom:12px">Mood Journal</div>
        <div class="card mood-history">
          ${MOODS.map((m, i) => `
            <div class="mood-bar-row">
              <div class="mood-bar-emoji">${m.emoji}</div>
              <div class="mood-bar-track">
                <div class="mood-bar-fill" style="width:${Math.round((moodCounts[i]/maxMood)*100)}%"></div>
              </div>
              <div class="mood-bar-count">${moodCounts[i]}</div>
            </div>
          `).join('')}
          ${state.journalEntries.length === 0 ? '<p style="text-align:center; margin-top:8px">Log your mood in Journal to see it here</p>' : ''}
        </div>
      </div>

      <div class="section">
        <div class="section-title" style="padding:0; margin-bottom:12px">Recent Sessions</div>
        <div class="card history-list">
          ${state.sessions.length === 0
            ? `<div class="empty-state" style="padding:24px"><div class="icon">🧘</div><p>Complete a session to see your history</p></div>`
            : [...state.sessions].reverse().slice(0, 10).map(s => `
                <div class="history-item">
                  <div class="history-icon">${s.icon}</div>
                  <div class="history-info">
                    <h4>${s.name}</h4>
                    <p>${s.date} · ${s.time}</p>
                  </div>
                  <div class="history-dur">${s.duration}m</div>
                </div>
              `).join('')
          }
        </div>
      </div>
    </div>
    </div>
  `;
}

// ── Init ──────────────────────────────────────────────────────────
renderScreen('home');
