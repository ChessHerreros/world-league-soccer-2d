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

    // Host listens for Guest inputs over WebRTC / Server signaling
    if (netManager.getIsHost()) {
      netManager.onGuestInput((guestInput: any) => {
        if (!this.isOnlineMode || this.players.length < 2) return;
        const guestPlayer = this.players[1]; // Guest player entity in Host game loop
        if (guestPlayer && guestInput) {
          guestPlayer.update(TICK, guestInput.moveX, guestInput.moveY, guestInput.sprint);
          if (guestInput.dash && guestPlayer.canDash()) {
            this.performDash(guestPlayer, guestInput.moveX, guestInput.moveY);
          }
          if (guestInput.dribble && guestPlayer.canDribble()) {
            this.dribble(guestPlayer, guestInput.dribble);
          }
          if (guestInput.kick && guestPlayer.canKick() && Math.hypot(this.ball.position.x - guestPlayer.position.x, this.ball.position.y - guestPlayer.position.y) <= guestPlayer.kickRadius) {
            this.kick(guestPlayer);
          }
        }
      });
    }

    netManager.onRoomStateUpdate((roomState: any) => {
      if (!this.isOnlineMode || !roomState) return;

      // Sync Scores & Time from Authoritative Server / State
      this.blueScore = roomState.blueScore;
      this.redScore = roomState.redScore;
      this.options.onScore?.(this.blueScore, this.redScore);

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

      // GUEST: Mirror Host's physics state exactly!
      if (!netManager.getIsHost()) {
        // Sync Ball Position & Velocity from Host
        if (roomState.ball) {
          this.ball.position.set(roomState.ball.x, roomState.ball.y);
          this.ball.velocity.set(roomState.ball.vx, roomState.ball.vy);
        }

        // Sync Host & Guest player entities
        if (Array.isArray(roomState.players)) {
          const hostData = roomState.players[0];  // Host is index 0 on Host
          const guestData = roomState.players[1]; // Guest is index 1 on Host

          // Local Guest player entity (rendered at index 0 on Guest screen)
          if (guestData && this.players[0]) {
            this.players[0].position.set(guestData.x, guestData.y);
            this.players[0].velocity.set(guestData.vx, guestData.vy);
            this.players[0].name = guestData.name;
            this.players[0].jerseyNumber = guestData.jerseyNumber;
          }

          // Remote Host player entity (rendered at index 1 on Guest screen)
          if (hostData) {
            if (!this.players[1]) {
              this.players[1] = new Player({ position: new Vec2(hostData.x, hostData.y), team: hostData.team });
            }
            this.players[1].position.set(hostData.x, hostData.y);
            this.players[1].velocity.set(hostData.vx, hostData.vy);
            this.players[1].name = hostData.name;
            this.players[1].jerseyNumber = hostData.jerseyNumber;
          }
        }
      }
    });
  }

  configureAndStart(config: MatchConfig & { isDemo?: boolean; isOnline?: boolean }): void {
    this.matchConfig = config;
    this.isDemoMode = !!config.isDemo;
    this.isOnlineMode = !!config.isOnline;
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

      this.players.length = 0;
      const hostPlayer = new Player({
        position: new Vec2(Math.floor(this.arena.width * 0.22), this.arena.height / 2),
        team: "blue",
      });
      hostPlayer.jerseyNumber = config.jerseyNumber || 10;
      hostPlayer.name = config.playerName || "Host";

      const guestPlayer = new Player({
        position: new Vec2(Math.floor(this.arena.width * 0.78), this.arena.height / 2),
        team: "red",
      });
      guestPlayer.jerseyNumber = 9;
      guestPlayer.name = "Invitado";

      if (this.netManager && !this.netManager.getIsHost()) {
        // Guest puts their own entity at index 0 and Host entity at index 1
        this.players.push(guestPlayer);
        this.players.push(hostPlayer);
      } else {
        // Host puts Host at index 0 and Guest at index 1
        this.players.push(hostPlayer);
        this.players.push(guestPlayer);
      }

      this.options.onScore?.(0, 0);
      this.resetMatchPositions();
      if (!this.running) this.start();
      return;
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
        }

        this.renderer.render(
          this.arena,
          this.players,
          this.ball,
          this.blueScore,
          this.redScore,
          delta,
          null,
          0,
          null,
          true // isReplay = true!
        );
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
          if (this.isExtraTime) {
            this.options.onTimeUpdate?.("EXTRA TIME", 0, true);
          } else if (this.matchConfig.duration > 0) {
            this.matchTimeRemaining = Math.max(0, this.matchTimeRemaining - delta);
            const totalSec = Math.ceil(this.matchTimeRemaining);
            const mins = Math.floor(totalSec / 60);
            const secs = totalSec % 60;
            const formatted = `${mins}:${secs < 10 ? "0" : ""}${secs}`;
            this.options.onTimeUpdate?.(formatted, totalSec, false);

            if (this.matchTimeRemaining <= 0) {
              if (this.blueScore === this.redScore) {
                // Tie match enters Extra Time (Golden Goal)!
                this.isExtraTime = true;
                this.options.onTimeUpdate?.("EXTRA TIME", 0, true);
              } else {
                this.triggerGameOver();
              }
            }
          } else {
            this.options.onTimeUpdate?.("∞", 0, false);
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
        goalBanner
      );
    }

    this.input.clearFrame();
    requestAnimationFrame(this.frame);
  };

  private update(dt: number): void {
    const p1 = this.players[0];

    if (this.isOnlineMode && this.netManager) {
      const isHost = this.netManager.getIsHost();
      const p1Movement = this.input.movementP1();
      const p1WantSprint = this.input.down("shift");
      const spacePressed = this.input.consumePressed(" ") || this.input.consumeReleased(" ");
      const qPressed = this.input.consumePressed("q");
      const ePressed = this.input.consumePressed("e");
      const cPressed = this.input.consumePressed("c");

      const myInput = {
        moveX: p1Movement.x,
        moveY: p1Movement.y,
        sprint: p1WantSprint,
        kick: spacePressed,
        dribble: qPressed ? ("right" as const) : ePressed ? ("left" as const) : null,
        dash: cPressed,
      };

      if (!isHost) {
        // GUEST: Send input to Host via WebRTC/Server, and predict local player movement
        this.netManager.sendInput(myInput);
        if (p1) {
          p1.update(dt, p1Movement.x, p1Movement.y, p1WantSprint);
          if (cPressed && p1.canDash()) {
            this.performDash(p1, p1Movement.x, p1Movement.y);
          }
          if (spacePressed && p1.canKick() && Math.hypot(this.ball.position.x - p1.position.x, this.ball.position.y - p1.position.y) <= p1.kickRadius) {
            this.kick(p1);
          }
        }
        return;
      } else {
        // HOST: Process Host player (p1) locally
        if (p1) {
          p1.update(dt, p1Movement.x, p1Movement.y, p1WantSprint);
          if (cPressed && p1.canDash()) {
            this.performDash(p1, p1Movement.x, p1Movement.y);
          }
          if ((qPressed || ePressed) && p1.canDribble()) {
            this.dribble(p1, qPressed ? "right" : "left");
          }
          if (spacePressed && p1.canKick() && Math.hypot(this.ball.position.x - p1.position.x, this.ball.position.y - p1.position.y) <= p1.kickRadius) {
            this.kick(p1);
          }
        }

        // Broadcast current physics state & match timer to Guest
        this.netManager.broadcastHostState({
          blueScore: this.blueScore,
          redScore: this.redScore,
          timeRemaining: this.matchTimeRemaining,
          isExtraTime: this.isExtraTime,
          ball: {
            x: this.ball.position.x,
            y: this.ball.position.y,
            vx: this.ball.velocity.x,
            vy: this.ball.velocity.y,
          },
          players: this.players.map((p) => ({
            x: p.position.x,
            y: p.position.y,
            vx: p.velocity.x,
            vy: p.velocity.y,
            stamina: p.stamina,
            isSprinting: p.isSprinting,
            jerseyNumber: p.jerseyNumber,
            name: p.name,
            team: p.team,
            customColor: p.customColor,
            borderStyle: p.borderStyle,
            pattern: p.pattern,
          })),
        });
      }
    } else if (this.isDemoMode) {
      // In background demo match, P1 is driven by Bot AI as well!
      const p1Action = this.botBrain.update(dt, p1, this.players, this.ball, this.arena, 0);
      p1.update(dt, p1Action.moveX, p1Action.moveY, p1Action.sprint);
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
      p1.update(dt, p1Movement.x, p1Movement.y, p1WantSprint);
    }

    // Update all non-P1 players (Human P2 for Local 2P or Bot AI)
    this.players.forEach((player, index) => {
      if (index === 0) return; // Skip P1 (handled above)

      if (!this.isOnlineMode && !this.isDemoMode && this.matchConfig.mode === "LOCAL_2P" && index === this.players.length / 2) {
        // Human Player 2 controlling first Red team player in Local 2P
        const p2Movement = this.input.movementP2();
        const p2WantSprint = this.input.down("shift") || this.input.down("r");
        player.update(dt, p2Movement.x, p2Movement.y, p2WantSprint);

        if (this.input.consumePressed("enter") || this.input.consumePressed("k")) {
          this.kick(player);
        }
        if (this.input.consumePressed("l") && player.canDash()) {
          const p2Move = this.input.movementP2();
          this.performDash(player, p2Move.x, p2Move.y);
        }
      } else if (!this.isOnlineMode) {
        // AI Bot controlling teammates and opponents in offline modes!
        const botAction = this.botBrain.update(dt, player, this.players, this.ball, this.arena, index);
        player.update(dt, botAction.moveX, botAction.moveY, botAction.sprint);

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
    const inDribbleRange = distToBall <= p1.kickRadius + 22;

    const spacePressed = this.input.consumePressed(" ") || this.input.consumeReleased(" ");
    const isSpaceDown = this.input.down(" ");

    const qPressed = this.input.consumePressed("q");
    const ePressed = this.input.consumePressed("e");
    const qDown = this.input.down("q");
    const eDown = this.input.down("e");

    const shouldDribbleQ = (qPressed || (qDown && inDribbleRange)) && p1.canDribble();
    const shouldDribbleE = (ePressed || (eDown && inDribbleRange)) && p1.canDribble();

    if (shouldDribbleQ) {
      this.dribble(p1, "right");
    } else if (shouldDribbleE) {
      this.dribble(p1, "left");
    }

    if (this.input.consumePressed("c") && p1.canDash()) {
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

    if (distance > player.kickRadius + 22) return;

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

    // Blend lateral perpendicular vector (-fy, fx) with forward vector for forward-left / forward-right skill move
    const forwardBias = 0.45;
    let dragX = side === "left" ? (-fy + fx * forwardBias) : (fy + fx * forwardBias);
    let dragY = side === "left" ? (fx + fy * forwardBias) : (-fx + fy * forwardBias);

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