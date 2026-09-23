export class SoundEffects {
  private static sharedCtx: AudioContext | null = null;
  private static listenersAttached = false;
  private isMuted = false;

  constructor() {
    SoundEffects.ensureGlobalUnlockListeners();
  }

  static unlock(): AudioContext | null {
    try {
      if (!SoundEffects.sharedCtx && typeof window !== "undefined") {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          SoundEffects.sharedCtx = new AudioCtx();
        }
      }
      if (SoundEffects.sharedCtx && SoundEffects.sharedCtx.state === "suspended") {
        SoundEffects.sharedCtx.resume().catch(() => {});
      }
    } catch {
      // Audio context unlock error fallback
    }
    return SoundEffects.sharedCtx;
  }

  private static ensureGlobalUnlockListeners(): void {
    if (SoundEffects.listenersAttached || typeof window === "undefined") return;
    SoundEffects.listenersAttached = true;

    const unlockHandler = () => {
      SoundEffects.unlock();
      if (SoundEffects.sharedCtx && SoundEffects.sharedCtx.state === "running") {
        window.removeEventListener("pointerdown", unlockHandler);
        window.removeEventListener("keydown", unlockHandler);
        window.removeEventListener("touchstart", unlockHandler);
        window.removeEventListener("click", unlockHandler);
      }
    };

    window.addEventListener("pointerdown", unlockHandler, { passive: true });
    window.addEventListener("keydown", unlockHandler, { passive: true });
    window.addEventListener("touchstart", unlockHandler, { passive: true });
    window.addEventListener("click", unlockHandler, { passive: true });
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted;
  }

  private initCtx(): AudioContext | null {
    if (this.isMuted) return null;
    return SoundEffects.unlock();
  }

  playKick(powerRatio = 0): void {
    try {
      const ctx = this.initCtx();
      if (!ctx || ctx.state !== "running") return;
      const now = ctx.currentTime;

      // Base kick oscillator
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const baseFreq = 140 + powerRatio * 160;
      const endFreq = 35;
      const duration = 0.12 + powerRatio * 0.12;

      osc.type = "sine";
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);

      gain.gain.setValueAtTime(0.7 + powerRatio * 0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + duration);

      // Noise layer for charged kick impact
      if (powerRatio > 0.2) {
        const bufferSize = Math.floor(ctx.sampleRate * 0.1);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.3 * powerRatio, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        noise.connect(noiseGain);
        noiseGain.connect(ctx.destination);

        noise.start(now);
      }
    } catch {
      // Audio context fallback
    }
  }

  playDribble(): void {
    try {
      const ctx = this.initCtx();
      if (!ctx || ctx.state !== "running") return;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.07);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.07);
    } catch {
      // Audio fallback
    }
  }

  playDash(): void {
    try {
      const ctx = this.initCtx();
      if (!ctx || ctx.state !== "running") return;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(750, now + 0.12);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.12);
    } catch {
      // Audio fallback
    }
  }

  playPostHit(intensity = 1): void {
    try {
      const ctx = this.initCtx();
      if (!ctx || ctx.state !== "running") return;
      const now = ctx.currentTime;

      // Metallic post "CLANG" tone
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(980, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.22);

      gain.gain.setValueAtTime(0.6 * Math.min(1.2, intensity), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.22);

      // High overtone metallic ping
      const ping = ctx.createOscillator();
      const pingGain = ctx.createGain();
      ping.type = "sine";
      ping.frequency.setValueAtTime(1760, now);
      ping.frequency.exponentialRampToValueAtTime(1200, now + 0.18);
      pingGain.gain.setValueAtTime(0.3 * Math.min(1.2, intensity), now);
      pingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      ping.connect(pingGain);
      pingGain.connect(ctx.destination);

      ping.start(now);
      ping.stop(now + 0.18);
    } catch {
      // Audio fallback
    }
  }

  playExplosion(): void {
    try {
      const ctx = this.initCtx();
      if (!ctx || ctx.state !== "running") return;
      const now = ctx.currentTime;
      const duration = 0.45;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(25, now + duration);

      gain.gain.setValueAtTime(0.8, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + duration);
    } catch {
      // Audio fallback
    }
  }

  playCountdown(isGo = false): void {
    try {
      const ctx = this.initCtx();
      if (!ctx || ctx.state !== "running") return;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      if (isGo) {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.setValueAtTime(1200, now + 0.1);
        gain.gain.setValueAtTime(0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else {
        osc.type = "sine";
        osc.frequency.setValueAtTime(440, now);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      }

      osc.connect(gain);
      gain.connect(ctx.destination);
    } catch {
      // Audio fallback
    }
  }

  playWhistle(type: "start" | "goal" | "end" = "start"): void {
    try {
      const ctx = this.initCtx();
      if (!ctx || ctx.state !== "running") return;
      const now = ctx.currentTime;

      const playChirp = (startTime: number, duration: number, freq: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, startTime);
        osc.frequency.setValueAtTime(freq + 250, startTime + duration * 0.5);
        osc.frequency.setValueAtTime(freq, startTime + duration);

        gain.gain.setValueAtTime(0.45, startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      if (type === "start") {
        playChirp(now, 0.12, 1900);
        playChirp(now + 0.16, 0.28, 2200);
      } else if (type === "end") {
        playChirp(now, 0.14, 1800);
        playChirp(now + 0.18, 0.14, 1800);
        playChirp(now + 0.36, 0.45, 2100);
      } else {
        // Goal
        playChirp(now, 0.5, 2000);
      }
    } catch {
      // Audio fallback
    }
  }

  playLobbyJoin(): void {
    try {
      const ctx = this.initCtx();
      if (!ctx || ctx.state !== "running") return;
      const now = ctx.currentTime;

      // Two-tone cheerful chime
      [523.25, 659.25].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + i * 0.09);
        gain.gain.setValueAtTime(0.3, now + i * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.09 + 0.18);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.09);
        osc.stop(now + i * 0.09 + 0.18);
      });
    } catch {
      // Audio fallback
    }
  }

  playLobbySwitch(): void {
    try {
      const ctx = this.initCtx();
      if (!ctx || ctx.state !== "running") return;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(340, now);
      osc.frequency.exponentialRampToValueAtTime(680, now + 0.08);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.08);
    } catch {
      // Audio fallback
    }
  }

  playButtonClick(): void {
    try {
      const ctx = this.initCtx();
      if (!ctx || ctx.state !== "running") return;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(700, now);
      osc.frequency.exponentialRampToValueAtTime(350, now + 0.04);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.04);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.04);
    } catch {
      // Audio fallback
    }
  }

  playGoal(soundId?: string): void {
    if (soundId && soundId !== "stadium_horn" && soundId !== "default") {
      this.playGoalSoundPreview(soundId);
      return;
    }

    try {
      const ctx = this.initCtx();
      if (!ctx || ctx.state !== "running") return;
      const now = ctx.currentTime;

      // Whistle sound + stadium horn
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(1500, now);
      osc.frequency.setValueAtTime(1800, now + 0.1);
      osc.frequency.setValueAtTime(1500, now + 0.2);

      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.5);
    } catch {
      // Audio fallback
    }
  }

  playGoalSoundPreview(soundId: string): void {
    try {
      const ctx = this.initCtx();
      if (!ctx || ctx.state !== "running") return;
      const now = ctx.currentTime;

      if (soundId === "airhorn") {
        // High pitched triple pulse MLG airhorn
        [0, 0.12, 0.24].forEach((delay) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sawtooth";
          osc.frequency.setValueAtTime(620, now + delay);
          osc.frequency.exponentialRampToValueAtTime(780, now + delay + 0.1);
          gain.gain.setValueAtTime(0.5, now + delay);
          gain.gain.exponentialRampToValueAtTime(0.01, now + delay + 0.1);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + delay);
          osc.stop(now + delay + 0.1);
        });
      } else if (soundId === "whistle_blast") {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(1800, now);
        osc.frequency.linearRampToValueAtTime(2200, now + 0.25);
        gain.gain.setValueAtTime(0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.3);
      } else if (soundId === "siren") {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.linearRampToValueAtTime(900, now + 0.2);
        osc.frequency.linearRampToValueAtTime(400, now + 0.4);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.45);
      } else if (soundId === "retro_beep") {
        [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "square";
          osc.frequency.setValueAtTime(freq, now + i * 0.08);
          gain.gain.setValueAtTime(0.3, now + i * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.08 + 0.08);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + i * 0.08);
          osc.stop(now + i * 0.08 + 0.08);
        });
      } else if (soundId === "thunder") {
        const bufferSize = Math.floor(ctx.sampleRate * 0.4);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.8, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        noise.connect(gain);
        gain.connect(ctx.destination);
        noise.start(now);
      } else {
        // Default Stadium Horn
        this.playGoal();
      }
    } catch {
      // Audio fallback
    }
  }
}
