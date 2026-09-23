import { SoundEffects } from "../audio/SoundEffects";
import { BotBrain } from "../ai/BotBrain";
import { Ball } from "../entities/Ball";
import { Player } from "../entities/Player";
import { Input } from "../input/Input";
import { Physics } from "../physics/Physics";
import { Renderer } from "../render/Renderer";
import { Arena } from "../world/Arena";
import { Vec2 } from "../math/Vec2";
import { MatchConfig } from "../ui/MenuManager";

const TICK = 1 / 120;

export interface GameOptions {
  onScore?: (blue: number, red: number) => void;
  onTimeUpdate?: (formattedTime: string, secondsRemaining: number, isExtraTime: boolean) => void;
  onGameOver?: (winner: "blue" | "red" | "draw", blueScore: number, redScore: number) => void;
  onPauseToggle?: () => void;
}

export class Game {
  private readonly arena = new Arena({ width: 1200, height: 700, goalWidth: 240 });
  private readonly input = new Input();
  private readonly renderer: Renderer;
  private readonly ball = new Ball();
  private readonly players: Player[];
  private readonly botBrain = new BotBrain();
  private readonly sound = new SoundEffects();

  private blueScore = 0;
  private redScore = 0;

  private matchConfig: MatchConfig = {
    mode: "VS_AI",
    duration: 180,
    goalLimit: 5,
    skinIndex: 0,
    jerseyNumber: 29,
    badgeEmoji: "",
    customColor: null,
    borderStyle: "classic",
    pattern: "spain",
  };

  private matchTimeRemaining = 180;
  private isExtraTime = false;
  private isPaused = false;
  private isGameOver = false;
  private isDemoMode = false;
  private isOnlineMode = false;
  private netManager: any = null;

  private accumulator = 0;
  private lastTime = 0;
  private running = false;

  private countdownTimer = 3.8;
  private lastCountdownSec = 4;
  private playedGoSound = false;

  private goalBannerTimer = 0;
  private goalScorerTeam: "blue" | "red" | null = null;
  private recentKickTimestamps: number[] = [];
  private lastQPressTime = 0;
  private lastEPressTime = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private options: GameOptions = {}
  ) {
    this.renderer = new Renderer(canvas);

    this.players = [
      new Player({
        position: new Vec2(260, this.arena.height / 2),
        team: "blue",
      }),
      new Player({
        position: new Vec2(940, this.arena.height / 2),
        team: "red",
      }),
    ];

    this.resetPositions();
  }

  setOnlineNetworkManager(netManager: any): void {
    this.netManager = netManager;
    this.isOnlineMode = true;
    SoundEffects.unlock();

    netManager.onMatchEnded((data: any) => {
      if (data) {
        this.blueScore = data.blueScore;
        this.redScore = data.redScore;
      }
      this.triggerGameOver();
    });

    netManager.onGameSound((data: any) => {
      if (!this.isOnlineMode || !data) return;
      const localSocketId = this.netManager?.getSocket()?.id;

      if (data.type === "kick") {
        if (data.playerId !== localSocketId) {
          this.sound.playKick(data.powerRatio || 0);
          if (this.ball) {
            this.renderer.addShockwave(this.ball.position.x, this.ball.position.y, data.powerRatio || 0);
          }
        }
      } else if (data.type === "dash") {
        if (data.playerId !== localSocketId) {
          this.sound.playDash();
        }
      } else if (data.type === "dribble") {
        if (data.playerId !== localSocketId) {
          this.sound.playDribble();
        }
      } else if (data.type === "post_hit") {
        this.sound.playPostHit(data.intensity || 1);
        if (this.ball) {
          this.renderer.addShockwave(this.ball.position.x, this.ball.position.y, 0.4);
        }
      } else if (data.type === "explosion") {
        this.sound.playExplosion();
        if (this.ball) {
          this.renderer.addShockwave(this.ball.position.x, this.ball.position.y, 1.3);
          this.renderer.addShockwave(this.ball.position.x, this.ball.position.y, 0.85);
        }
      } else if (data.type === "goal") {
        this.sound.playGoal(data.soundId);
        this.goalBannerTimer = 1.6;
        this.goalScorerTeam = data.scorerTeam || "blue";
      } else if (data.type === "whistle") {
        this.sound.playWhistle(data.whistleType || "start");
      }
    });

    netManager.onRoomStateUpdate((roomState: any) => {
      if (!this.isOnlineMode || !roomState) return;

      // Sync Scores & Goal Celebration from Authoritative Server
      if (roomState.blueScore !== this.blueScore || roomState.redScore !== this.redScore) {
        const scorerTeam = roomState.blueScore > this.blueScore ? "blue" : "red";
        this.blueScore = roomState.blueScore;
        this.redScore = roomState.redScore;
        this.options.onScore?.(this.blueScore, this.redScore);
        if (this.goalBannerTimer <= 0) {
          this.sound.playGoal();
          this.goalBannerTimer = 1.6;
          this.goalScorerTeam = scorerTeam;
        }
      }

      if (roomState.timeRemaining !== undefined) {
        this.matchTimeRemaining = roomState.timeRemaining;
        this.isExtraTime = !!roomState.isExtraTime;

        if (this.isExtraTime) {
          this.options.onTimeUpdate?.("EXTRA TIME", 0, true);
        } else if (this.matchConfig.duration > 0) {
          const totalSec = Math.ceil(this.matchTimeRemaining);
          const mins = Math.floor(totalSec / 60);
          const secs = totalSec % 60;
          const formatted = `${mins}:${secs < 10 ? "0" : ""}${secs}`;
          this.options.onTimeUpdate?.(formatted, totalSec, false);
        } else {
          this.options.onTimeUpdate?.("∞", 0, false);
        }
      }

      // Check Game Over from Server
      if (roomState.status === "ended" || (roomState.timeRemaining <= 0 && !this.isExtraTime && this.matchConfig.duration > 0)) {
        if (roomState.blueScore === roomState.redScore) {
          this.isExtraTime = true;
          this.options.onTimeUpdate?.("EXTRA TIME", 0, true);
        } else {
          this.triggerGameOver();
        }
      }

      // Sync server countdown state
      if (roomState.status === "countdown" && !this.isReplayingGoal && this.goalBannerTimer <= 0) {
        if (this.countdownTimer <= 0) {
          this.countdownTimer = roomState.countdownTimer || 3.8;
          this.lastCountdownSec = 4;
          this.playedGoSound = false;
        }
      }

      // Sync Ball Position, Velocity & Charge Ratio from Server (only when NOT viewing goal replay!)
      if (!this.isReplayingGoal) {
        if (roomState.ball) {
          const bDiffX = roomState.ball.x - this.ball.position.x;
          const bDiffY = roomState.ball.y - this.ball.position.y;
          const bErr = Math.hypot(bDiffX, bDiffY);
          if (bErr > 120 || roomState.status !== "playing") {
            this.ball.position.set(roomState.ball.x, roomState.ball.y);
          } else {
            this.ball.position.x += bDiffX * 0.55;
            this.ball.position.y += bDiffY * 0.55;
          }
          this.ball.velocity.set(roomState.ball.vx, roomState.ball.vy);
          this.ball.chargeRatio = roomState.ball.chargeRatio || 0;
        }

        // Sync Server Players array into Local Render Entities preserving state
        const serverPlayers: any[] = Object.values(roomState.players || {});
        const localSocketId = netManager.getSocket()?.id;

        const localSp = serverPlayers.find((sp: any) => sp.socketId === localSocketId);
        const otherSps = serverPlayers.filter((sp: any) => sp.socketId !== localSocketId);

        // Local player is always preserved at index 0 with smooth reconciliation
        if (localSp) {
          let p1 = this.players[0];
          if (!p1) {
            p1 = new Player({
              position: new Vec2(localSp.x, localSp.y),
              team: localSp.team,
            });
            this.players[0] = p1;
          }
          const diffX = localSp.x - p1.position.x;
          const diffY = localSp.y - p1.position.y;
          const errDist = Math.hypot(diffX, diffY);
          if (errDist > 80 || roomState.status !== "playing") {
            p1.position.set(localSp.x, localSp.y);
          } else {
            p1.position.x += diffX * 0.35;
            p1.position.y += diffY * 0.35;
          }
          p1.velocity.set(localSp.vx, localSp.vy);
          p1.stamina = localSp.stamina;
          p1.isSprinting = localSp.isSprinting;
          p1.isDashing = localSp.isDashing;
          p1.jerseyNumber = localSp.jerseyNumber;
          p1.name = localSp.name;
          p1.customColor = localSp.customColor;
          p1.borderStyle = localSp.borderStyle || "classic";
          p1.pattern = localSp.pattern || "spain";
        }

        // Other remote players placed at indices 1 .. n with smooth lerp
        otherSps.forEach((osp: any, idx: number) => {
          const targetIdx = idx + 1;
          let op = this.players[targetIdx];
          if (!op) {
            op = new Player({
              position: new Vec2(osp.x, osp.y),
              team: osp.team,
            });
            this.players[targetIdx] = op;
          }
          const diffX = osp.x - op.position.x;
          const diffY = osp.y - op.position.y;
          const errDist = Math.hypot(diffX, diffY);
          if (errDist > 100 || roomState.status !== "playing") {
            op.position.set(osp.x, osp.y);
          } else {
            op.position.x += diffX * 0.45;
            op.position.y += diffY * 0.45;
          }
          op.velocity.set(osp.vx, osp.vy);
          op.stamina = osp.stamina;
          op.isSprinting = osp.isSprinting;
          op.isDashing = osp.isDashing;
          op.isCharging = osp.isCharging;
          op.isKicking = osp.isKicking;
          op.chargeRatio = osp.chargeRatio || 0;
          op.jerseyNumber = osp.jerseyNumber;
        op.name = osp.name;
        op.customColor = osp.customColor;
        op.borderStyle = osp.borderStyle || "classic";
        op.pattern = osp.pattern || "spain";

        const spd = op.velocity.length();
        if (spd > 5) {
          op.isInputMoving = true;
          op.lastInputAngle = Math.atan2(op.velocity.y, op.velocity.x);
        } else {
          op.isInputMoving = false;
        }
      });

        if (this.players.length > otherSps.length + 1) {
          this.players.length = otherSps.length + 1;
        }
      }
    });
  }

  configureAndStart(config: MatchConfig & { isDemo?: boolean; isOnline?: boolean }): void {
    this.matchConfig = config;
    this.isDemoMode = !!config.isDemo;
    this.isOnlineMode = !!config.isOnline;
    this.input.reloadBindings();
    this.sound.setMuted(this.isDemoMode);
    this.ball.skinIndex = config.skinIndex;
    this.matchTimeRemaining = config.duration;
    this.isExtraTime = false;
    this.blueScore = 0;
    this.redScore = 0;
    this.isPaused = false;
    this.isGameOver = false;

    // Determine team sizes and pitch dimensions based on selected mode
    let teamCount = 1;
    let arenaWidth = 1000;
    let arenaHeight = 600;
    let goalWidth = 200;

    if (config.mode === "ONLINE") {
      teamCount = 1;
      arenaWidth = 1000;
      arenaHeight = 600;
      goalWidth = 200;
      this.arena.setSize(arenaWidth, arenaHeight, goalWidth);
      this.options.onScore?.(0, 0);
      this.resetMatchPositions();
      if (!this.running) this.start();
    }

    // Set arena dimensions dynamically
    this.arena.setSize(arenaWidth, arenaHeight, goalWidth);

    // Re-populate this.players array dynamically based on mode!
    this.players.length = 0;

    const blueStartX = Math.floor(this.arena.width * 0.22);
    const redStartX = Math.floor(this.arena.width * 0.78);

    // List of distinct jersey numbers and emojis for squad members
    const teammateNumbers = [7, 10, 8, 11];
    const opponentNumbers = [9, 10, 4, 1];
    const opponentEmojis = ["⚡", "🔥", "👑", "🎯"];

    // Opponent uniform style: Red team shares the same team pattern & border style
    // Choose red team pattern (use halves or stripes if player uses spain/custom, or contrast pattern)
    const redTeamPattern = config.pattern === "spain" ? "stripes" : config.pattern;
    const redTeamBorder = config.borderStyle;
    const redTeamColor = "#e11d48"; // Distinct unified red team color

    // Blue Team (Player 1 + Teammates)
    for (let i = 0; i < teamCount; i++) {
      const bluePlayer = new Player({
        position: new Vec2(blueStartX - i * 60, this.arena.height / 2 + (i - (teamCount - 1) / 2) * 100),
        team: "blue",
      });

      // All team members share the SAME kit style (custom color, border style, and pattern)!
      bluePlayer.customColor = config.customColor;
      bluePlayer.borderStyle = config.borderStyle;
      bluePlayer.pattern = config.pattern;

      if (i === 0) {
        // Player 1 exact number/emoji & username
        bluePlayer.jerseyNumber = config.jerseyNumber;
        bluePlayer.badgeEmoji = config.badgeEmoji;
        bluePlayer.name = config.playerName || "Jugador";
      } else {
        // Teammates share the uniform style but get distinct numbers/emojis!
        bluePlayer.jerseyNumber = teammateNumbers[(i - 1) % teammateNumbers.length];
        bluePlayer.badgeEmoji = "";
      }

      this.players.push(bluePlayer);
    }

    // Red Team (Opponents)
    for (let i = 0; i < teamCount; i++) {
      const redPlayer = new Player({
        position: new Vec2(redStartX + i * 60, this.arena.height / 2 + (i - (teamCount - 1) / 2) * 100),
        team: "red",
      });

      // Entire opponent team shares the SAME uniform kit style!
      redPlayer.customColor = redTeamColor;
      redPlayer.borderStyle = redTeamBorder;
      redPlayer.pattern = redTeamPattern;

      // Only their jersey number / emoji changes per player!
      redPlayer.jerseyNumber = opponentNumbers[i % opponentNumbers.length];
      if (i === 0) {
        redPlayer.badgeEmoji = opponentEmojis[0]; // Opponent captain emoji
      } else {
        redPlayer.badgeEmoji = "";
      }

      this.players.push(redPlayer);
    }

    this.options.onScore?.(0, 0);

    this.resetMatchPositions();

    if (!this.running) {
      this.start();
    }
  }

  setPaused(paused: boolean): void {
    this.isPaused = paused;
    if (!paused) {
      this.input.reloadBindings();
    }
  }

  togglePause(): void {
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      this.options.onPauseToggle?.();
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame(this.frame);
  }

  private replayBuffer: Array<{
    ballX: number;
    ballY: number;
    players: Array<{ x: number; y: number; isKicking: boolean; isCharging: boolean }>;
  }> = [];
  private isReplayingGoal = false;
  private replayFrames: Array<{
    ballX: number;
    ballY: number;
    players: Array<{ x: number; y: number; isKicking: boolean; isCharging: boolean }>;
  }> = [];
  private replayTimer = 0;
  private replayTotalDuration = 4.8; // 4.8 seconds duration slow-mo playback

  private recordFrame(): void {
    if (this.isReplayingGoal) return;

    this.replayBuffer.push({
      ballX: this.ball.position.x,
      ballY: this.ball.position.y,
      players: this.players.map((p) => ({
        x: p.position.x,
        y: p.position.y,
        isKicking: p.isKicking,
        isCharging: p.isCharging,
      })),
    });

    // Keep last 5.5 - 6.0 seconds of frames (600 frames at 120Hz/60Hz update rate)
    if (this.replayBuffer.length > 600) {
      this.replayBuffer.shift();
    }
  }

  private startGoalReplay(): void {
    this.isReplayingGoal = true;
    this.replayFrames = [...this.replayBuffer];
    this.replayTotalDuration = 5.2; // 5.2 seconds slow-motion replay of full build-up play!
    this.replayTimer = this.replayTotalDuration;
  }

  private frame = (time: number): void => {
    if (!this.running) return;

    let delta = (time - this.lastTime) / 1000;
    this.lastTime = time;
    delta = Math.min(delta, 0.1);

    // ESC or P key toggle pause (disabled in demo mode background)
    if (!this.isDemoMode && (this.input.consumePressed("escape") || this.input.consumePressed("p"))) {
      this.togglePause();
    }

    if (!this.isPaused && !this.isGameOver) {
      let countdownText: string | null = null;
      let countdownProgress = 0;
      let goalBanner: { team: "blue" | "red"; progress: number } | null = null;
      let isReplay = false;

      // Handle 'Y' key to skip goal replay or celebration
      if (this.input.consumePressed("y") || (this.isReplayingGoal && this.input.down("y"))) {
        if (this.isReplayingGoal || this.goalBannerTimer > 0) {
          this.skipGoalReplay();
        }
      }

      // In offline mode, keep the match timer display updated and visible during countdown / goal / replay
      if (!this.isOnlineMode) {
        if (this.isExtraTime) {
          this.options.onTimeUpdate?.("EXTRA TIME", 0, true);
        } else if (this.matchConfig.duration > 0) {
          const totalSec = Math.ceil(this.matchTimeRemaining);
          const mins = Math.floor(totalSec / 60);
          const secs = totalSec % 60;
          const formatted = `${mins}:${secs < 10 ? "0" : ""}${secs}`;
          this.options.onTimeUpdate?.(formatted, totalSec, false);
        } else {
          this.options.onTimeUpdate?.("∞", 0, false);
        }
      }

      if (this.isReplayingGoal) {
        // --- GOAL REPLAY PLAYBACK MODE ---
        this.replayTimer -= delta;

        // Advance replay frame smoothly over replayTotalDuration
        if (this.replayFrames.length > 0) {
          const progress = 1 - Math.max(0, this.replayTimer / this.replayTotalDuration);
          const idx = Math.min(this.replayFrames.length - 1, Math.floor(progress * this.replayFrames.length));
          const frameData = this.replayFrames[idx];

          if (frameData) {
            this.ball.position.set(frameData.ballX, frameData.ballY);
            frameData.players.forEach((pSnap, i) => {
              if (this.players[i]) {
                this.players[i].position.set(pSnap.x, pSnap.y);
                this.players[i].isKicking = pSnap.isKicking;
                this.players[i].isCharging = pSnap.isCharging;
              }
            });
          }
        }

        if (this.replayTimer <= 0) {
          this.isReplayingGoal = false;
          this.resetMatchPositions();
        } else {
          isReplay = true;
        }
      } else if (this.goalBannerTimer > 0) {
        this.goalBannerTimer -= delta;
        goalBanner = {
          team: this.goalScorerTeam || "blue",
          progress: Math.max(0, 1 - this.goalBannerTimer / 1.6),
        };
        if (this.goalBannerTimer <= 0) {
          this.startGoalReplay();
        }
      } else if (this.countdownTimer > 0) {
        this.countdownTimer -= delta;
        if (this.countdownTimer > 0.8) {
          const remainingInPhase = (this.countdownTimer - 0.8) % 1.0;
          countdownProgress = 1 - (remainingInPhase === 0 ? 1 : remainingInPhase);
          const sec = Math.ceil(this.countdownTimer - 0.8);
          countdownText = sec.toString();
          if (sec !== this.lastCountdownSec && sec >= 1 && sec <= 3) {
            this.lastCountdownSec = sec;
            this.sound.playCountdown(false);
          }
        } else {
          countdownProgress = 1 - (this.countdownTimer / 0.8);
          countdownText = "¡GO!";
          if (!this.playedGoSound) {
            this.playedGoSound = true;
            this.sound.playCountdown(true);
          }
        }
      } else {
        // Record live match snapshot frame for circular replay buffer
        this.recordFrame();
        // Update Match Time (In online mode, server controls match timer 100%)
        if (!this.isOnlineMode) {
          if (!this.isExtraTime && this.matchConfig.duration > 0) {
            this.matchTimeRemaining = Math.max(0, this.matchTimeRemaining - delta);
            if (this.matchTimeRemaining <= 0) {
              if (this.blueScore === this.redScore) {
                // Tie match enters Extra Time (Golden Goal)!
                this.isExtraTime = true;
                this.options.onTimeUpdate?.("EXTRA TIME", 0, true);
              } else {
                this.triggerGameOver();
              }
            }
          }
        } else {
          if (this.matchTimeRemaining <= 0 && this.matchConfig.duration > 0 && !this.isExtraTime) {
            if (this.blueScore === this.redScore) {
              this.isExtraTime = true;
              this.options.onTimeUpdate?.("EXTRA TIME", 0, true);
            } else {
              this.triggerGameOver();
            }
          }
        }

        this.accumulator += delta;
        while (this.accumulator >= TICK) {
          this.update(TICK);
          this.accumulator -= TICK;
        }
      }

      this.renderer.render(
        this.arena,
        this.players,
        this.ball,
        this.blueScore,
        this.redScore,
        delta,
        countdownText,
        countdownProgress,
        goalBanner,
        isReplay
      );
    }

    this.input.clearFrame();
    requestAnimationFrame(this.frame);
  };

  private update(dt: number): void {
    const p1 = this.players[0];

    if (this.isOnlineMode && this.netManager) {
      if (!p1) return;

      const p1Movement = this.input.movementP1();
      const p1WantSprint = this.input.isActionDown("sprint");
      const isSpaceDown = this.input.isActionDown("kick");
      const spacePressed = this.input.consumeActionPressed("kick") || this.input.consumeActionReleased("kick");
      const qPressed = this.input.consumeActionPressed("dribbleLeft");
      const ePressed = this.input.consumeActionPressed("dribbleRight");
      const qDown = this.input.isActionDown("dribbleLeft");
      const eDown = this.input.isActionDown("dribbleRight");
      const cPressed = this.input.consumeActionPressed("dash");

      // 1. Client-Side Direction Indicator & Prediction (0ms input latency!)
      const isMoving = Math.hypot(p1Movement.x, p1Movement.y) > 0.1;
      p1.isInputMoving = isMoving;
      if (isMoving) {
        p1.lastInputAngle = Math.atan2(p1Movement.y, p1Movement.x);
      }

      // Local player physics prediction so WASD moves immediately with ZERO delay
      const p1OutOfBounds = this.arena.isOutOfBounds(p1.position.x, p1.position.y);
      if (!p1.isDashing) {
        p1.update(dt, p1Movement.x, p1Movement.y, p1WantSprint, p1OutOfBounds);
        Physics.playerArena(p1, this.arena);
      } else {
        p1.update(dt, 0, 0, false, p1OutOfBounds);
      }

      // 2. Client-Side Charging & Aiming Dots Indicator
      const dx = this.ball.position.x - p1.position.x;
      const dy = this.ball.position.y - p1.position.y;
      const distToBall = Math.hypot(dx, dy);
      const nearBall = distToBall <= p1.kickRadius;
      const inDribbleRange = distToBall <= p1.kickRadius + 26;

      p1.isKicking = isSpaceDown || p1.kickFlash > 0;
      p1.updateCharge(dt, nearBall, isSpaceDown);

      // Local power glow responsiveness (takes highest between local charge and server state)
      this.ball.chargeRatio = Math.max(this.ball.chargeRatio, p1.chargeRatio);

      // 3. Audio & Visual Effects Immediate Client-Side Responsiveness
      const shouldKickLocal = (spacePressed || (isSpaceDown && nearBall)) && p1.canKick() && nearBall;
      if (shouldKickLocal) {
        p1.kick();
        this.sound.playKick(p1.chargeRatio);
        this.renderer.addShockwave(this.ball.position.x, this.ball.position.y, p1.chargeRatio);
        this.renderer.addKickParticles(this.ball.position.x, this.ball.position.y, dx, dy, p1.chargeRatio, p1.team);
      } else if (spacePressed) {
        p1.kick();
      }

      if (qPressed) this.lastQPressTime = performance.now();
      if (ePressed) this.lastEPressTime = performance.now();

      const qBuffered = (performance.now() - this.lastQPressTime) < 180;
      const eBuffered = (performance.now() - this.lastEPressTime) < 180;

      // Skill Dribble with Q / E (supports instant tap, input buffering, or holding key until in range)
      const wantDribbleQ = ((qBuffered || qDown) && inDribbleRange) && p1.canDribble();
      const wantDribbleE = ((eBuffered || eDown) && inDribbleRange) && p1.canDribble();

      let dribbleAction: "left" | "right" | null = null;
      if (wantDribbleQ) {
        this.lastQPressTime = 0;
        dribbleAction = "left";
        this.dribble(p1, "left");
      } else if (wantDribbleE) {
        this.lastEPressTime = 0;
        dribbleAction = "right";
        this.dribble(p1, "right");
      }

      // Dash skill move with C (applies instant dash impulse in movement direction)
      if (cPressed && p1.canDash()) {
        const p1Move = this.input.movementP1();
        this.performDash(p1, p1Move.x, p1Move.y);
      }

      // 4. Update timers, animations, and dead-reckoning extrapolation for remote players
      p1.animTime += dt;
      p1.kickFlash = Math.max(0, p1.kickFlash - dt);
      p1.dashFlash = Math.max(0, p1.dashFlash - dt);

      for (let i = 1; i < this.players.length; i++) {
        const op = this.players[i];
        op.position.x += op.velocity.x * dt;
        op.position.y += op.velocity.y * dt;
        op.animTime += dt;
        op.kickFlash = Math.max(0, op.kickFlash - dt);
        op.dashFlash = Math.max(0, op.dashFlash - dt);
      }

      // 5. Ball Extrapolation & 3D Rolling Offsets / Rotation Physics Animation
      this.ball.position.x += this.ball.velocity.x * dt;
      this.ball.position.y += this.ball.velocity.y * dt;
      Physics.ballArena(this.ball, this.arena);

      const bSpeed = this.ball.velocity.length();
      if (bSpeed > 2) {
        this.ball.rollOffsetX += this.ball.velocity.x * dt;
        this.ball.rollOffsetY += this.ball.velocity.y * dt;
        this.ball.rotation += (bSpeed / (this.ball.radius * 1.5)) * dt;
        this.ball.lastMoveAngle = Math.atan2(this.ball.velocity.y, this.ball.velocity.x);
      }

      // 6. Send Inputs Authoritatively to Server
      this.netManager.sendInput({
        moveX: p1Movement.x,
        moveY: p1Movement.y,
        sprint: p1WantSprint,
        kick: spacePressed,
        isHoldingSpace: isSpaceDown,
        dribble: dribbleAction,
        dash: cPressed,
      });

      return; // Authoritative state is computed and broadcast by central server!
    } else if (this.isDemoMode) {
      // In background demo match, P1 is driven by Bot AI as well!
      const p1OutOfBounds = this.arena.isOutOfBounds(p1.position.x, p1.position.y);
      const p1Action = this.botBrain.update(dt, p1, this.players, this.ball, this.arena, 0);
      p1.update(dt, p1Action.moveX, p1Action.moveY, p1Action.sprint, p1OutOfBounds);
      if (p1Action.kick && p1.canKick()) {
        const dx = this.ball.position.x - p1.position.x;
        const dy = this.ball.position.y - p1.position.y;
        if (Math.hypot(dx, dy) <= p1.kickRadius + 5) {
          this.kick(p1);
        }
      }
    } else {
      const p1Movement = this.input.movementP1();
      const p1WantSprint = this.input.down("shift");
      const p1OutOfBounds = this.arena.isOutOfBounds(p1.position.x, p1.position.y);
      p1.update(dt, p1Movement.x, p1Movement.y, p1WantSprint, p1OutOfBounds);
    }

    // Update all non-P1 players (Human P2 for Local 2P or Bot AI)
    this.players.forEach((player, index) => {
      if (index === 0) return; // Skip P1 (handled above)

      if (!this.isOnlineMode && !this.isDemoMode && this.matchConfig.mode === "LOCAL_2P" && index === this.players.length / 2) {
        // Human Player 2 controlling first Red team player in Local 2P
        const p2Movement = this.input.movementP2();
        const p2WantSprint = this.input.down("shift") || this.input.down("r");
        const p2OutOfBounds = this.arena.isOutOfBounds(player.position.x, player.position.y);
        player.update(dt, p2Movement.x, p2Movement.y, p2WantSprint, p2OutOfBounds);

        if (this.input.consumePressed("enter") || this.input.consumePressed("k")) {
          this.kick(player);
        }
        if (this.input.consumePressed("l") && player.canDash()) {
          const p2Move = this.input.movementP2();
          this.performDash(player, p2Move.x, p2Move.y);
        }
      } else if (!this.isOnlineMode) {
        // AI Bot controlling teammates and opponents in offline modes!
        const botOutOfBounds = this.arena.isOutOfBounds(player.position.x, player.position.y);
        const botAction = this.botBrain.update(dt, player, this.players, this.ball, this.arena, index);
        player.update(dt, botAction.moveX, botAction.moveY, botAction.sprint, botOutOfBounds);

        if (botAction.kick && player.canKick()) {
          const dx = this.ball.position.x - player.position.x;
          const dy = this.ball.position.y - player.position.y;
          if (Math.hypot(dx, dy) <= player.kickRadius + 5) {
            this.kick(player);
          }
        }
        if (botAction.dribbleSide && player.canDribble()) {
          this.dribble(player, botAction.dribbleSide);
        }
      }
    });

    this.ball.update(dt);

    // Arena collisions for all players
    for (const player of this.players) {
      Physics.playerArena(player, this.arena);
      Physics.playerBall(player, this.ball);
    }

    // Inter-player collisions
    for (let i = 0; i < this.players.length; i++) {
      for (let j = i + 1; j < this.players.length; j++) {
        Physics.players(this.players[i], this.players[j]);
      }
    }

    Physics.ballArena(this.ball, this.arena);

    // Player 1 Space / Charge / Dribble interactions
    const dx = this.ball.position.x - p1.position.x;
    const dy = this.ball.position.y - p1.position.y;
    const distToBall = Math.hypot(dx, dy);
    const nearBall = distToBall <= p1.kickRadius;
    const inDribbleRange = distToBall <= p1.kickRadius + 26;

    const spacePressed = this.input.consumeActionPressed("kick") || this.input.consumeActionReleased("kick");
    const isSpaceDown = this.input.isActionDown("kick");

    const qPressed = this.input.consumeActionPressed("dribbleLeft");
    const ePressed = this.input.consumeActionPressed("dribbleRight");
    const qDown = this.input.isActionDown("dribbleLeft");
    const eDown = this.input.isActionDown("dribbleRight");

    if (qPressed) this.lastQPressTime = performance.now();
    if (ePressed) this.lastEPressTime = performance.now();

    const qBuffered = (performance.now() - this.lastQPressTime) < 180;
    const eBuffered = (performance.now() - this.lastEPressTime) < 180;

    const shouldDribbleQ = ((qBuffered || qDown) && inDribbleRange) && p1.canDribble();
    const shouldDribbleE = ((eBuffered || eDown) && inDribbleRange) && p1.canDribble();

    if (shouldDribbleQ) {
      this.lastQPressTime = 0;
      this.dribble(p1, "left");
    } else if (shouldDribbleE) {
      this.lastEPressTime = 0;
      this.dribble(p1, "right");
    }

    if (this.input.consumeActionPressed("dash") && p1.canDash()) {
      const p1Move = this.input.movementP1();
      this.performDash(p1, p1Move.x, p1Move.y);
    }

    p1.isKicking = isSpaceDown || p1.kickFlash > 0;
    p1.updateCharge(dt, nearBall, isSpaceDown);

    let maxCharge = p1.chargeRatio;
    for (const p of this.players) {
      if (p !== p1) {
        const d = Math.hypot(this.ball.position.x - p.position.x, this.ball.position.y - p.position.y);
        p.updateCharge(dt, d <= p.kickRadius, false);
        if (p.chargeRatio > maxCharge) maxCharge = p.chargeRatio;
      }
    }
    this.ball.chargeRatio = maxCharge;

    const shouldKick = (spacePressed || (isSpaceDown && nearBall)) && p1.canKick();
    if (shouldKick) {
      this.kick(p1);
    }

    this.checkGoal();

    if (this.input.consumePressed("r")) {
      this.resetMatchPositions();
    }
  }

  private dribble(player: Player, side: "left" | "right"): void {
    const dx = this.ball.position.x - player.position.x;
    const dy = this.ball.position.y - player.position.y;
    const distance = Math.hypot(dx, dy);

    if (distance > player.kickRadius + 26) return;

    // Determine team sizes based on selected mode
    let teamCount = 1;
    if (this.matchConfig.mode === "VS_AI") teamCount = 1; // 1v1 (1 vs 1)
    else if (this.matchConfig.mode === "LOCAL_2P") teamCount = 2; // 2v2 (2 vs 2)
    else if (this.matchConfig.mode === "PRACTICE") teamCount = 3; // 3v3 (3 vs 3)
    else if (this.matchConfig.mode === "TOURNAMENT") teamCount = 4; // 4v4 (4 vs 4)

    // Forward direction from player center to ball center
    let fx = dx;
    let fy = dy;
    if (distance < 0.0001) {
      fx = player.team === "blue" ? 1 : -1;
      fy = 0;
    } else {
      fx /= distance;
      fy /= distance;
    }

    // Perpendicular vector calculation in screen coordinates (+Y is down):
    // LEFT turn (-90 deg) is (fy, -fx)
    // RIGHT turn (+90 deg) is (-fy, fx)
    const forwardBias = 0.45;
    let dragX = side === "left" ? (fy + fx * forwardBias) : (-fy + fx * forwardBias);
    let dragY = side === "left" ? (-fx + fy * forwardBias) : (fx + fy * forwardBias);

    const dragLen = Math.hypot(dragX, dragY);
    if (dragLen > 0.0001) {
      dragX /= dragLen;
      dragY /= dragLen;
    }

    const dragPower = 160;
    this.ball.velocity.x += dragX * dragPower;
    this.ball.velocity.y += dragY * dragPower;

    // Agile player movement shift in drag direction
    player.velocity.x += dragX * 45;
    player.velocity.y += dragY * 45;

    player.dribble();
    this.sound.playDribble();
    this.renderer.addShockwave(this.ball.position.x, this.ball.position.y, 0.15);
  }

  private performDash(player: Player, dirX: number, dirY: number): void {
    let dx = dirX;
    let dy = dirY;
    const len = Math.hypot(dx, dy);

    if (len < 0.0001) {
      dx = player.team === "blue" ? 1 : -1;
      dy = 0;
    } else {
      dx /= len;
      dy /= len;
    }

    const dashImpulse = 1050;
    player.velocity.x = dx * dashImpulse;
    player.velocity.y = dy * dashImpulse;

    player.dash();
    this.sound.playDash();
    this.renderer.addShockwave(player.position.x, player.position.y, 0.45);
  }

  private kick(player: Player): void {
    const dx = this.ball.position.x - player.position.x;
    const dy = this.ball.position.y - player.position.y;
    const distance = Math.hypot(dx, dy);

    if (distance > player.kickRadius) {
      player.resetCharge();
      this.ball.chargeRatio = 0;
      return;
    }

    const direction = new Vec2(dx, dy);
    if (direction.lengthSq() < 0.0001) {
      direction.set(player.team === "blue" ? 1 : -1, 0);
    } else {
      direction.normalize();
    }

    // Exponential power calculation: from 1.0x base kick power up to maxKickPowerMultiplier (1.65x)
    const currentCharge = player.chargeRatio;
    const powerMultiplier = 1 + currentCharge * (player.maxKickPowerMultiplier - 1);
    const strength = player.kickPower * powerMultiplier * (1 - (distance / player.kickRadius) * 0.2);

    this.ball.lastKickerTeam = player.team;
    this.ball.velocity.x += direction.x * strength;
    this.ball.velocity.y += direction.y * strength;

    // Recoil scales with kick strength (Haxball recoil feeling)
    const recoil = 35 * powerMultiplier;
    player.velocity.x -= direction.x * recoil;
    player.velocity.y -= direction.y * recoil;
    player.kick();

    // Play kick sound synthesized via Web Audio API
    this.sound.playKick(currentCharge);

    // Spawn juicy shockwave & small particles visual at ball location
    this.renderer.addShockwave(this.ball.position.x, this.ball.position.y, currentCharge);
    this.renderer.addKickParticles(this.ball.position.x, this.ball.position.y, direction.x, direction.y, currentCharge, player.team);

    // Reset charge after applying force and shockwave
    player.resetCharge();
    this.ball.chargeRatio = 0;

    // Track rapid kick spam / rebound cluster
    const now = performance.now();
    this.recentKickTimestamps.push(now);
    this.recentKickTimestamps = this.recentKickTimestamps.filter((t) => now - t < 900);

    // If 5+ kicks occur within 0.9s (space spam / cluster bounce), trigger explosion
    if (this.recentKickTimestamps.length >= 5) {
      this.triggerClusterExplosion();
    }
  }

  private triggerClusterExplosion(): void {
    // 1. The ball stops immediately and stays in the exact same spot
    this.ball.velocity.set(0, 0);
    this.ball.chargeRatio = 0;

    // 2. Blast all nearby players outwards away from the ball
    for (const p of this.players) {
      let dx = p.position.x - this.ball.position.x;
      let dy = p.position.y - this.ball.position.y;
      let dist = Math.hypot(dx, dy);

      // Only blast players within explosion range
      if (dist <= 220) {
        let nx = dx;
        let ny = dy;
        if (dist < 0.0001) {
          nx = p.team === "blue" ? -1 : 1;
          ny = 0;
          dist = 0.0001;
        } else {
          nx /= dist;
          ny /= dist;
        }

        const blastForce = 850;
        p.velocity.x = nx * blastForce;
        p.velocity.y = ny * blastForce;

        // Instant position displacement to clear the ball
        p.position.x += nx * 40;
        p.position.y += ny * 40;
        p.kickFlash = 0.35;
      }
    }

    // 3. Play explosion sound and spawn dramatic shockwaves
    this.sound.playExplosion();
    this.renderer.addShockwave(this.ball.position.x, this.ball.position.y, 1.3);
    this.renderer.addShockwave(this.ball.position.x, this.ball.position.y, 0.85);

    this.recentKickTimestamps = [];
  }

  private checkGoal(): void {
    if (this.goalBannerTimer > 0) return;

    if (this.ball.position.x < -this.ball.radius && this.arena.isInsideGoal(this.ball.position.y)) {
      this.redScore++;
      this.sound.playGoal();
      this.options.onScore?.(this.blueScore, this.redScore);
      this.goalScorerTeam = "red";
      this.goalBannerTimer = 1.6;
      this.checkGoalLimit();
    }

    if (
      this.ball.position.x > this.arena.width + this.ball.radius &&
      this.arena.isInsideGoal(this.ball.position.y)
    ) {
      this.blueScore++;
      this.sound.playGoal();
      this.options.onScore?.(this.blueScore, this.redScore);
      this.goalScorerTeam = "blue";
      this.goalBannerTimer = 1.6;
      this.checkGoalLimit();
    }
  }

  private checkGoalLimit(): void {
    if (this.isExtraTime) {
      this.triggerGameOver();
      return;
    }
    if (this.matchConfig.goalLimit > 0) {
      if (this.blueScore >= this.matchConfig.goalLimit || this.redScore >= this.matchConfig.goalLimit) {
        this.triggerGameOver();
      }
    }
  }

  private triggerGameOver(): void {
    if (this.isGameOver) return;
    this.isGameOver = true;
    const winner = this.blueScore > this.redScore ? "blue" : this.redScore > this.blueScore ? "red" : "draw";
    this.options.onGameOver?.(winner, this.blueScore, this.redScore);
  }

  private skipGoalReplay(): void {
    if (!this.isReplayingGoal && this.goalBannerTimer <= 0) return;
    this.isReplayingGoal = false;
    this.goalBannerTimer = 0;
    this.replayTimer = 0;
    this.resetMatchPositions();
    if (this.isOnlineMode && this.netManager) {
      this.netManager.skipReplay();
    }
  }

  private resetMatchPositions(): void {
    this.resetPositions();
    this.countdownTimer = 3.8;
    this.lastCountdownSec = 4;
    this.playedGoSound = false;
  }

  private resetPositions(): void {
    const blueTeam = this.players.filter((p) => p.team === "blue");
    const redTeam = this.players.filter((p) => p.team === "red");

    const blueStartX = Math.floor(this.arena.width * 0.22);
    const redStartX = Math.floor(this.arena.width * 0.78);

    blueTeam.forEach((p, i) => {
      const spacing = 110;
      const startY = this.arena.height / 2 - ((blueTeam.length - 1) * spacing) / 2;
      p.position.set(blueStartX - i * 55, startY + i * spacing);
      p.velocity.set(0, 0);
    });

    redTeam.forEach((p, i) => {
      const spacing = 110;
      const startY = this.arena.height / 2 - ((redTeam.length - 1) * spacing) / 2;
      p.position.set(redStartX + i * 55, startY + i * spacing);
      p.velocity.set(0, 0);
    });

    this.ball.reset(this.arena.width / 2, this.arena.height / 2);
  }

  private resetMatch(): void {
    this.blueScore = 0;
    this.redScore = 0;
    this.options.onScore?.(0, 0);
    this.resetPositions();
  }
}