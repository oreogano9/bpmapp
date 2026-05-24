import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  AudioLines,
  ChevronDown,
  ChevronUp,
  CircleStop,
  Drum,
  Gauge,
  Menu,
  Music2,
  Play,
  Settings,
  SlidersHorizontal,
  Speaker,
  Square,
  TimerReset,
  Volume2,
  Waves
} from 'lucide-react';
import './styles.css';

const BPM_MIN = 1;
const BPM_MAX = 500;
const DURATION_MIN = 10;
const DURATION_MAX = 3600;

const profiles = [
  { id: 'classic', label: 'Classic', icon: Speaker },
  { id: 'tone-sine', label: 'Sine', icon: Waves },
  { id: 'tone-triangle', label: 'Triangle', icon: AudioLines },
  { id: 'tone-square', label: 'Square', icon: Activity },
  { id: 'tone-saw', label: 'Saw', icon: SlidersHorizontal },
  { id: 'wood', label: 'Wood', icon: Drum },
  { id: 'electro', label: 'Electro', icon: AudioLines },
  { id: 'soft', label: 'Soft', icon: Activity },
  { id: 'metal', label: 'Metal', icon: Music2 },
  { id: 'sub', label: 'Sub', icon: SlidersHorizontal }
];

const patterns = [
  { id: 'four', label: '4 / 4', beats: [1, 0, 0, 0] },
  { id: 'three', label: '3 / 4', beats: [1, 0, 0] },
  { id: 'six', label: '6 / 8', beats: [1, 0, 0.45, 0, 0.35, 0] },
  { id: 'offbeat', label: 'Off', beats: [0.4, 1, 0.4, 1] }
];

const pitchModes = [
  { id: 'fixed', label: 'Fixed' },
  { id: 'sine-wave', label: 'Sine Wave' },
  { id: 'alternate', label: 'High / Low' },
  { id: 'ladder', label: 'Ladder' }
];

const curveTypes = [
  { id: 'smoothstep', label: 'Smooth' },
  { id: 'ease-in', label: 'Ease In' },
  { id: 'ease-out', label: 'Ease Out' },
  { id: 'expo', label: 'Expo' },
  { id: 'sine', label: 'Sine' },
  { id: 'log', label: 'Log' }
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatTime(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hours > 0) return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function applyCurve(progress, curveType) {
  const p = clamp(progress, 0, 1);
  if (curveType === 'ease-in') return p * p;
  if (curveType === 'ease-out') return 1 - (1 - p) * (1 - p);
  if (curveType === 'expo') return p === 0 ? 0 : (Math.pow(2, 10 * (p - 1)) - 0.0009765625) / 0.9990234375;
  if (curveType === 'sine') return 0.5 - Math.cos(p * Math.PI) / 2;
  if (curveType === 'log') return Math.log1p(p * 9) / Math.log(10);
  return p * p * (3 - 2 * p);
}

function shapeProgress(progress, curveAmount, curveType) {
  const p = clamp(progress, 0, 1);
  const amount = curveAmount / 100;
  const curved = applyCurve(p, curveType);
  return p + (curved - p) * amount;
}

function getTempoAt(elapsed, mode, startBpm, targetBpm, duration, curveAmount = 0, curveType = 'smoothstep') {
  if (mode === 'oscillate') {
    const cycle = duration * 2;
    const position = ((elapsed % cycle) + cycle) % cycle;
    const rawPhase = position <= duration ? position / duration : 1 - (position - duration) / duration;
    const phase = shapeProgress(rawPhase, curveAmount, curveType);
    return startBpm + (targetBpm - startBpm) * phase;
  }

  const progress = shapeProgress(elapsed / duration, curveAmount, curveType);
  return startBpm + (targetBpm - startBpm) * progress;
}

function getProgress(elapsed, mode, duration) {
  const total = mode === 'oscillate' ? duration * 2 : duration;
  return clamp((((elapsed % total) + total) % total) / total, 0, 1);
}

function getPitchMultiplier(beatIndex, pitchMode, patternLength) {
  if (pitchMode === 'sine-wave') {
    const cycle = Math.max(4, patternLength);
    const phase = (beatIndex % cycle) / cycle;
    return 1 + Math.sin(phase * Math.PI * 2) * 0.55;
  }
  if (pitchMode === 'alternate') return beatIndex % 2 === 0 ? 1.55 : 0.58;
  if (pitchMode === 'ladder') return 0.58 + ((beatIndex % patternLength) / Math.max(1, patternLength - 1)) * 0.97;
  return 1;
}

function getContinuousPitchMultiplier(beatPhase, pitchMode, patternLength) {
  const cycle = Math.max(4, patternLength);
  const wrapped = ((beatPhase % cycle) + cycle) % cycle;
  if (pitchMode === 'sine-wave') return 1 + Math.sin(beatPhase * Math.PI * 2) * 0.55;
  if (pitchMode === 'alternate') return Math.floor(beatPhase) % 2 === 0 ? 1.55 : 0.58;
  if (pitchMode === 'ladder') return 0.58 + (wrapped / cycle) * 0.97;
  return 1;
}

function getPitchVolumeMultiplier(pitchMultiplier) {
  return pitchMultiplier < 1 ? 0.8 : 1;
}

function getToneLevelFromMultiplier(pitchMultiplier) {
  return clamp((pitchMultiplier - 0.45) / 1.1, 0, 1);
}

function isContinuousProfile(profile) {
  return profile.startsWith('tone-');
}

function getToneWaveform(profile) {
  if (profile === 'tone-triangle') return 'triangle';
  if (profile === 'tone-square') return 'square';
  if (profile === 'tone-saw') return 'sawtooth';
  return 'sine';
}

function playClick(context, destination, profile, accent, pitchMultiplier = 1) {
  const now = context.currentTime;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  const decay = profile === 'soft' ? 0.11 : 0.055;
  gain.gain.exponentialRampToValueAtTime((0.38 + accent * 0.2) * getPitchVolumeMultiplier(pitchMultiplier), now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
  gain.connect(destination);

  if (profile === 'wood' || profile === 'classic') {
    const osc = context.createOscillator();
    osc.type = profile === 'wood' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime((accent > 0.8 ? 1260 : 920) * pitchMultiplier, now);
    osc.frequency.exponentialRampToValueAtTime((accent > 0.8 ? 620 : 480) * pitchMultiplier, now + 0.045);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.07);
    return;
  }

  if (profile === 'sub') {
    const osc = context.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime((accent > 0.8 ? 132 : 96) * pitchMultiplier, now);
    osc.frequency.exponentialRampToValueAtTime(48 * pitchMultiplier, now + 0.09);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.12);
    return;
  }

  const osc = context.createOscillator();
  osc.type = profile === 'electro' ? 'square' : profile === 'metal' ? 'sawtooth' : 'sine';
  osc.frequency.setValueAtTime((profile === 'metal' ? 2100 : accent > 0.8 ? 1560 : 1040) * pitchMultiplier, now);
  osc.connect(gain);
  osc.start(now);
  osc.stop(now + (profile === 'soft' ? 0.1 : 0.045));
}

function useAudioEngine({ isRunning, startBpm, targetBpm, duration, mode, curveAmount, curveType, profile, pattern, pitchMode, volume, onBeat, onTone, onComplete }) {
  const engine = useRef({
    context: null,
    master: null,
    continuous: null,
    timer: null,
    startedAtAudio: 0,
    pausedElapsed: 0,
    nextBeatTime: 0,
    beatIndex: 0,
    pitchPhase: 0,
    lastContinuousAt: 0,
    running: false
  });

  const settings = useRef({ startBpm, targetBpm, duration, mode, curveAmount, curveType, profile, pattern, pitchMode, volume, onBeat, onTone, onComplete });
  useEffect(() => {
    settings.current = { startBpm, targetBpm, duration, mode, curveAmount, curveType, profile, pattern, pitchMode, volume, onBeat, onTone, onComplete };
    if (engine.current.master) {
      engine.current.master.gain.setTargetAtTime(volume, engine.current.context.currentTime, 0.015);
    }
  }, [startBpm, targetBpm, duration, mode, curveAmount, curveType, profile, pattern, pitchMode, volume, onBeat, onTone, onComplete]);

  const ensureAudio = useCallback(async () => {
    if (!engine.current.context) {
      const context = new AudioContext();
      const master = context.createGain();
      master.gain.value = settings.current.volume;
      master.connect(context.destination);
      engine.current.context = context;
      engine.current.master = master;
    }
    if (engine.current.context.state !== 'running') {
      await engine.current.context.resume();
    }
    return engine.current.context;
  }, []);

  const getElapsed = useCallback(() => {
    const e = engine.current;
    if (!e.context || !e.running) return e.pausedElapsed;
    return e.pausedElapsed + (e.context.currentTime - e.startedAtAudio);
  }, []);

  const stopContinuousTone = useCallback((e) => {
    if (!e.continuous || !e.context) return;
    const now = e.context.currentTime;
    e.continuous.gain.gain.cancelScheduledValues(now);
    e.continuous.gain.gain.setTargetAtTime(0.0001, now, 0.02);
    e.continuous.osc.stop(now + 0.08);
    e.continuous = null;
  }, []);

  const updateContinuousTone = useCallback((e, s) => {
    if (!e.context) return;
    if (!isContinuousProfile(s.profile)) {
      stopContinuousTone(e);
      s.onTone?.(0);
      return;
    }

    const now = e.context.currentTime;
    if (!e.continuous) {
      const osc = e.context.createOscillator();
      const gain = e.context.createGain();
      osc.type = getToneWaveform(s.profile);
      osc.frequency.value = 520;
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(e.master);
      osc.start(now);
      gain.gain.setTargetAtTime(s.profile === 'tone-sine' ? 0.34 : 0.24, now, 0.035);
      e.continuous = { osc, gain };
      e.lastContinuousAt = now;
    } else {
      e.continuous.osc.type = getToneWaveform(s.profile);
    }

    const elapsed = e.pausedElapsed + (now - e.startedAtAudio);
    const currentBpm = getTempoAt(elapsed, s.mode, s.startBpm, s.targetBpm, s.duration, s.curveAmount, s.curveType);
    const dt = Math.max(0, now - e.lastContinuousAt);
    e.pitchPhase += dt * (currentBpm / 60);
    e.lastContinuousAt = now;

    const multiplier = getContinuousPitchMultiplier(e.pitchPhase, s.pitchMode, s.pattern.beats.length);
    const toneLevel = getToneLevelFromMultiplier(multiplier);
    e.continuous.osc.frequency.setTargetAtTime(520 * multiplier, now, 0.025);
    e.continuous.gain.gain.setTargetAtTime((s.profile === 'tone-sine' ? 0.34 : 0.24) * getPitchVolumeMultiplier(multiplier), now, 0.035);
    s.onTone?.(toneLevel);
  }, [stopContinuousTone]);

  const seek = useCallback((elapsed) => {
    const e = engine.current;
    const contextTime = e.context?.currentTime ?? 0;
    e.pausedElapsed = clamp(elapsed, 0, settings.current.mode === 'oscillate' ? settings.current.duration * 2 : settings.current.duration);
    e.startedAtAudio = contextTime;
    e.nextBeatTime = contextTime + 0.03;
    e.beatIndex = Math.floor(e.pausedElapsed / Math.max(0.12, 60 / getTempoAt(e.pausedElapsed, settings.current.mode, settings.current.startBpm, settings.current.targetBpm, settings.current.duration, settings.current.curveAmount, settings.current.curveType)));
    e.pitchPhase = e.beatIndex;
    e.lastContinuousAt = contextTime;
  }, []);

  const start = useCallback(async () => {
    const context = await ensureAudio();
    const e = engine.current;
    e.running = true;
    e.startedAtAudio = context.currentTime;
    e.nextBeatTime = context.currentTime + 0.02;
    e.lastContinuousAt = context.currentTime;
    if (isContinuousProfile(settings.current.profile)) {
      updateContinuousTone(e, settings.current);
    } else {
      stopContinuousTone(e);
      playClick(context, e.master, settings.current.profile, 1, getPitchMultiplier(e.beatIndex, settings.current.pitchMode, settings.current.pattern.beats.length));
    }

    clearInterval(e.timer);
    e.timer = setInterval(() => {
      const current = engine.current;
      const s = settings.current;
      const total = s.mode === 'oscillate' ? s.duration * 2 : s.duration;
      const scheduleAhead = 0.12;
      updateContinuousTone(current, s);

      while (current.nextBeatTime < current.context.currentTime + scheduleAhead) {
        const elapsed = current.pausedElapsed + (current.nextBeatTime - current.startedAtAudio);
        if (s.mode === 'linear' && elapsed > s.duration) {
          clearInterval(current.timer);
          current.running = false;
          current.pausedElapsed = s.duration;
          stopContinuousTone(current);
          s.onComplete?.();
          return;
        }

        const currentBpm = getTempoAt(elapsed, s.mode, s.startBpm, s.targetBpm, s.duration, s.curveAmount, s.curveType);
        const beatLength = Math.max(0.012, 60 / currentBpm);
        const accent = s.pattern.beats[current.beatIndex % s.pattern.beats.length];
        const pitchMultiplier = getPitchMultiplier(current.beatIndex, s.pitchMode, s.pattern.beats.length);
        if (elapsed >= 0 && elapsed <= total && accent >= 0) {
          if (!isContinuousProfile(s.profile)) {
            playClick(current.context, current.master, s.profile, accent, pitchMultiplier);
          }
          s.onBeat?.(current.beatIndex, accent, elapsed);
        }
        current.beatIndex += 1;
        current.nextBeatTime += beatLength;
      }
    }, 25);
  }, [ensureAudio, stopContinuousTone, updateContinuousTone]);

  const stop = useCallback(() => {
    const e = engine.current;
    if (e.context && e.running) {
      e.pausedElapsed += e.context.currentTime - e.startedAtAudio;
    }
    e.running = false;
    clearInterval(e.timer);
    stopContinuousTone(e);
  }, [stopContinuousTone]);

  const reset = useCallback(() => {
    const e = engine.current;
    e.pausedElapsed = 0;
    e.startedAtAudio = e.context?.currentTime ?? 0;
    e.nextBeatTime = e.startedAtAudio + 0.03;
    e.beatIndex = 0;
    e.pitchPhase = 0;
    e.lastContinuousAt = e.startedAtAudio;
  }, []);

  useEffect(() => {
    if (isRunning) start();
    else stop();
    return () => clearInterval(engine.current.timer);
  }, [isRunning, start, stop]);

  return useMemo(() => ({ getElapsed, seek, reset, ensureAudio }), [getElapsed, seek, reset, ensureAudio]);
}

function NumberStepper({ value, min, max, onChange }) {
  return (
    <div className="stepper" aria-label="BPM stepper">
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(clamp(Number(event.target.value), min, max))}
      />
      <div className="stepperButtons">
        <button type="button" aria-label="Increase" onClick={() => onChange(clamp(value + 1, min, max))}>
          <ChevronUp size={14} />
        </button>
        <button type="button" aria-label="Decrease" onClick={() => onChange(clamp(value - 1, min, max))}>
          <ChevronDown size={14} />
        </button>
      </div>
    </div>
  );
}

function SliderRow({ label, value, min, max, accent, onChange, display }) {
  return (
    <label className="sliderRow">
      {label ? (
        <div className="rowLabel">
          <span>{label}</span>
          <strong>{display ?? value}</strong>
        </div>
      ) : null}
      <input
        style={{ '--accent': accent }}
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className="rangeLimits">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </label>
  );
}

function TempoDial({ bpm, progress, pulse, pattern, beatIndex, startBpm, targetBpm }) {
  const ticks = 96;
  return (
    <section className="dialPanel" aria-label="Current tempo visualization">
      <div className="dialReadouts">
        <span>Start <strong>{startBpm}</strong></span>
        <span>Target <strong>{targetBpm}</strong></span>
      </div>
      <div className="dial" style={{ '--progress': progress, '--pulse': pulse }}>
        {Array.from({ length: ticks }).map((_, index) => {
          const angle = (index / ticks) * 360;
          const filled = index / ticks <= progress;
          return <i key={index} className={filled ? 'filled' : ''} style={{ transform: `rotate(${angle}deg)` }} />;
        })}
        <div className="dialCore">
          <span>Current BPM</span>
          <strong>{bpm.toFixed(1)}</strong>
          <small>{pattern.label}</small>
          <div className="beatDots" aria-label="Beat position">
            {pattern.beats.map((accent, index) => (
              <b key={`${pattern.id}-${index}`} className={index === beatIndex % pattern.beats.length ? 'active' : ''} data-accent={accent > 0.8} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function RampCurve({ mode, startBpm, targetBpm, duration, elapsed, curveAmount, curveType }) {
  const points = useMemo(() => {
    const total = mode === 'oscillate' ? duration * 2 : duration;
    const low = Math.min(startBpm, targetBpm);
    const high = Math.max(startBpm, targetBpm);
    const span = Math.max(1, high - low);
    return Array.from({ length: 140 }, (_, index) => {
      const x = index / 139;
      const bpm = getTempoAt(x * total, mode, startBpm, targetBpm, duration, curveAmount, curveType);
      const normalized = (bpm - low) / span;
      const y = startBpm <= targetBpm ? 0.9 - normalized * 0.72 : 0.18 + normalized * 0.72;
      return `${x * 100},${clamp(y, 0.12, 0.9) * 100}`;
    }).join(' ');
  }, [mode, startBpm, targetBpm, duration, curveAmount, curveType]);

  const total = mode === 'oscillate' ? duration * 2 : duration;
  const marker = getProgress(elapsed, mode, duration) * 100;

  return (
    <section className="curvePanel" aria-label="Tempo ramp curve">
      <div className="panelHead">
        <span>Tempo Ramp Curve</span>
        <b>{curveAmount === 0 ? 'Straight' : `${curveAmount}% ${curveTypes.find((item) => item.id === curveType)?.label ?? 'Curve'}`}</b>
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id="curveGradient" x1="0%" x2="100%">
            <stop offset="0%" stopColor="#2f80ff" />
            <stop offset="55%" stopColor="#2dd4bf" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
        </defs>
        <g className="grid">
          {Array.from({ length: 9 }).map((_, index) => <line key={`v-${index}`} x1={index * 12.5} y1="0" x2={index * 12.5} y2="100" />)}
          {Array.from({ length: 5 }).map((_, index) => <line key={`h-${index}`} x1="0" y1={index * 25} x2="100" y2={index * 25} />)}
        </g>
        <polyline points={points} />
        <line className="marker" x1={marker} x2={marker} y1="0" y2="100" />
      </svg>
      <div className="curveFoot">
        <span>0:00</span>
        <span>{formatTime(elapsed)}</span>
        <span>{formatTime(total)}</span>
      </div>
    </section>
  );
}

function App() {
  const [mode, setMode] = useState('oscillate');
  const [startBpm, setStartBpm] = useState(1);
  const [targetBpm, setTargetBpm] = useState(309);
  const [duration, setDuration] = useState(598);
  const [curveAmount, setCurveAmount] = useState(100);
  const [curveType, setCurveType] = useState('expo');
  const [profileId, setProfileId] = useState('tone-sine');
  const [patternId, setPatternId] = useState('four');
  const [pitchMode, setPitchMode] = useState('sine-wave');
  const [volume, setVolume] = useState(0.75);
  const [isRunning, setIsRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [pulse, setPulse] = useState(0);
  const [toneLevel, setToneLevel] = useState(0);
  const [beatIndex, setBeatIndex] = useState(0);
  const tapTimes = useRef([]);

  const pattern = patterns.find((item) => item.id === patternId) ?? patterns[0];
  const currentBpm = getTempoAt(elapsed, mode, startBpm, targetBpm, duration, curveAmount, curveType);
  const total = mode === 'oscillate' ? duration * 2 : duration;
  const progress = getProgress(elapsed, mode, duration);
  const phase = mode === 'linear' ? (elapsed >= duration ? 'Complete' : 'Ramping Up') : progress < 0.5 ? 'Ramping Up' : 'Ramping Down';

  const onBeat = useCallback((index, accent, beatElapsed) => {
    setBeatIndex(index);
    setElapsed(beatElapsed);
    setPulse(accent > 0.8 ? 1 : 0.68);
  }, []);

  const onComplete = useCallback(() => {
    setIsRunning(false);
    setElapsed(duration);
  }, [duration]);

  const onTone = useCallback((level) => {
    setToneLevel(level);
  }, []);

  const audio = useAudioEngine({
    isRunning,
    startBpm,
    targetBpm,
    duration,
    mode,
    curveAmount,
    curveType,
    profile: profileId,
    pattern,
    pitchMode,
    volume,
    onBeat,
    onTone,
    onComplete
  });

  useEffect(() => {
    const channel = Math.round(clamp(toneLevel, 0, 1) * 255);
    document.documentElement.style.setProperty('--tone-bg', `rgb(${channel} ${channel} ${channel})`);
  }, [toneLevel]);

  useEffect(() => {
    let frame;
    const tick = () => {
      if (isRunning) setElapsed(audio.getElapsed());
      setPulse((value) => value * 0.88);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [audio, isRunning]);

  const seekToProgress = (value) => {
    const nextElapsed = (Number(value) / 1000) * total;
    audio.seek(nextElapsed);
    setElapsed(nextElapsed);
  };

  const reset = () => {
    setIsRunning(false);
    audio.reset();
    setElapsed(0);
    setBeatIndex(0);
  };

  const tapTempo = async () => {
    await audio.ensureAudio();
    const now = performance.now();
    tapTimes.current = [...tapTimes.current.filter((time) => now - time < 2400), now].slice(-5);
    if (tapTimes.current.length >= 2) {
      const gaps = tapTimes.current.slice(1).map((time, index) => time - tapTimes.current[index]);
      const average = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
      const tapped = clamp(Math.round(60000 / average), BPM_MIN, BPM_MAX);
      setStartBpm(tapped);
      if (targetBpm < tapped) setTargetBpm(tapped);
    }
  };

  return (
    <main className="appShell" style={{ '--tone-level': toneLevel }}>
      <header className="topBar">
        <div className="brand">
          <button className="iconButton" aria-label="Menu"><Menu size={22} /></button>
          <h1>Tempo<span>Flow</span></h1>
          <AudioLines size={24} className="brandIcon" />
        </div>
        <div className="transportStatus">
          <span className={isRunning ? 'live' : ''}>{isRunning ? 'Running' : 'Ready'}</span>
          <button className="miniTransport" type="button" onClick={() => setIsRunning((value) => !value)} aria-label={isRunning ? 'Stop' : 'Start'}>
            {isRunning ? <Square size={16} /> : <Play size={16} fill="currentColor" />}
          </button>
        </div>
        <div className="topControls">
          <Volume2 size={18} />
          <input aria-label="Global volume" type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => setVolume(Number(event.target.value))} />
          <button className="iconButton" aria-label="Settings"><Settings size={20} /></button>
        </div>
      </header>

      <section className="workspace">
        <aside className="controlPanel">
          <div className="controlGroup">
            <div className="groupTitle"><span>Flow Mode</span><Gauge size={15} /></div>
            <div className="segmented">
              <button className={mode === 'linear' ? 'active' : ''} onClick={() => setMode('linear')}>Ramp</button>
              <button className={mode === 'oscillate' ? 'active' : ''} onClick={() => setMode('oscillate')}>Wave</button>
            </div>
          </div>

          <div className="controlGroup">
            <div className="controlLine">
              <span>{mode === 'linear' ? 'Start BPM' : 'Min BPM'}</span>
              <NumberStepper value={startBpm} min={BPM_MIN} max={BPM_MAX} onChange={setStartBpm} />
            </div>
            <SliderRow label="" value={startBpm} min={BPM_MIN} max={BPM_MAX} accent="#2f80ff" onChange={setStartBpm} />
          </div>

          <div className="controlGroup">
            <div className="controlLine">
              <span>{mode === 'linear' ? 'Target BPM' : 'Max BPM'}</span>
              <NumberStepper value={targetBpm} min={BPM_MIN} max={BPM_MAX} onChange={setTargetBpm} />
            </div>
            <SliderRow label="" value={targetBpm} min={BPM_MIN} max={BPM_MAX} accent="#2dd4bf" onChange={setTargetBpm} />
          </div>

          <div className="controlGroup">
            <SliderRow label="Duration" value={duration} min={DURATION_MIN} max={DURATION_MAX} accent="#f59e0b" onChange={setDuration} display={formatTime(duration)} />
          </div>

          <div className="controlGroup">
            <SliderRow label="Ramp Smoothness" value={curveAmount} min={0} max={100} accent="#9b8cff" onChange={setCurveAmount} display={curveAmount === 0 ? 'Straight' : `${curveAmount}%`} />
            <div className="curveTypeGrid" aria-label="Curve type">
              {curveTypes.map((curve) => (
                <button key={curve.id} className={curveType === curve.id ? 'active' : ''} onClick={() => setCurveType(curve.id)}>
                  {curve.label}
                </button>
              ))}
            </div>
          </div>

          <div className="controlGroup">
            <div className="groupTitle"><span>Sound Profile</span><SlidersHorizontal size={15} /></div>
            <div className="profileGrid">
              {profiles.map((profile) => {
                const Icon = profile.icon;
                return (
                  <button key={profile.id} className={profileId === profile.id ? 'active' : ''} onClick={() => setProfileId(profile.id)}>
                    <Icon size={21} />
                    <span>{profile.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="controlGroup">
            <div className="groupTitle"><span>Accent Pattern</span><Music2 size={15} /></div>
            <div className="patternGrid">
              {patterns.map((item) => (
                <button key={item.id} className={patternId === item.id ? 'active' : ''} onClick={() => setPatternId(item.id)} aria-label={item.label}>
                  {item.beats.map((beat, index) => <i key={index} className={beat > 0.8 ? 'accent' : ''} />)}
                </button>
              ))}
            </div>
          </div>

          <div className="controlGroup">
            <div className="groupTitle"><span>Pitch Motion</span><AudioLines size={15} /></div>
            <div className="pitchModeGrid">
              {pitchModes.map((item) => (
                <button key={item.id} className={pitchMode === item.id ? 'active' : ''} onClick={() => setPitchMode(item.id)}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="transportButtons">
            <button className={isRunning ? 'stopButton' : 'startButton'} onClick={() => setIsRunning((value) => !value)}>
              {isRunning ? <CircleStop size={21} /> : <Play size={21} fill="currentColor" />}
              {isRunning ? 'Stop' : 'Start'}
            </button>
            <button className="tapButton" onClick={tapTempo}>
              <TimerReset size={20} />
              Tap
            </button>
          </div>

          <button className="resetButton" onClick={reset}>Reset Session</button>
        </aside>

        <section className="mainPanel">
          <div className="statsStrip">
            <div><span>Elapsed</span><strong>{formatTime(elapsed)}</strong></div>
            <div><span>Phase</span><strong>{phase}</strong></div>
            <div><span>Remaining</span><strong>{formatTime(mode === 'linear' ? duration - elapsed : total - (elapsed % total))}</strong></div>
            <div className="toneStat">
              <span>Tone</span>
              <strong>{Math.round(toneLevel * 100)}%</strong>
              <i aria-hidden="true"><b style={{ height: `${clamp(toneLevel, 0, 1) * 100}%` }} /></i>
            </div>
          </div>

          <TempoDial bpm={currentBpm} progress={progress} pulse={pulse} pattern={pattern} beatIndex={beatIndex} startBpm={startBpm} targetBpm={targetBpm} />
          <RampCurve mode={mode} startBpm={startBpm} targetBpm={targetBpm} duration={duration} elapsed={elapsed} curveAmount={curveAmount} curveType={curveType} />

          <div className="scrubBar">
            <span>{formatTime(elapsed)}</span>
            <input type="range" min="0" max="1000" value={Math.round(progress * 1000)} onChange={(event) => seekToProgress(event.target.value)} aria-label="Scrub playback position" />
            <span>{formatTime(total)}</span>
          </div>
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
