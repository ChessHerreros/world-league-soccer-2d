import { Ball } from "../entities/Ball";
import { Player } from "../entities/Player";
import { Arena } from "../world/Arena";

export interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  color: string;
}

export interface BallParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  color: string;
  borderColor: string;
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;
  private shockwaves: Shockwave[] = [];
  private particles: BallParticle[] = [];
  private ballImages: HTMLImageElement[] = [];

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    this.ctx = ctx;
    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.loadBallAssets();
  }

  private loadBallAssets(): void {
    const assetNames = ["ball_soccer1.png", "ball_soccer2.png", "ball_soccer3.png", "ball_soccer4.png"];
    this.ballImages = assetNames.map((name) => {
      const img = new Image();
      img.src = `/assets/${name}`;
      return img;
    });
  }

  addShockwave(x: number, y: number, powerRatio: number): void {
    const maxRadius = 30 + powerRatio * 55;
    const color = powerRatio > 0.6 ? "#ff4400" : powerRatio > 0.2 ? "#ffe600" : "#ffffff";
    this.shockwaves.push({
      x,
      y,
      radius: 12,
      maxRadius,
      life: 0.28,
      maxLife: 0.28,
      color,
    });
  }

  addKickParticles(x: number, y: number, dirX: number, dirY: number, powerRatio: number, team: "blue" | "red" = "blue"): void {
    // Burst of particles scaled with shot power
    const count = Math.floor(5 + powerRatio * 7);
    const opDirX = -dirX;
    const opDirY = -dirY;

    for (let i = 0; i < count; i++) {
      this.spawnParticle(x, y, opDirX, opDirY, powerRatio, team);
    }
  }

  private spawnParticle(x: number, y: number, oppX: number, oppY: number, powerRatio: number, team: "blue" | "red" = "blue"): void {
    // Distinctive larger size on maximum power shot (powerRatio >= 0.85 -> 4.5px - 6.2px vs normal 2.0px - 3.2px)
    const isMaxPower = powerRatio >= 0.85;
    const baseRadius = isMaxPower ? (4.2 + Math.random() * 2.0) : (2.0 + Math.random() * 1.2);
    const radius = baseRadius;

    // Opposite trajectory direction
    const baseAngle = Math.atan2(oppY, oppX);
    const angle = baseAngle + (Math.random() - 0.5) * 0.5;
    const speed = (30 + Math.random() * 85) * (1 + powerRatio * 0.5);

    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    const life = 0.2 + Math.random() * 0.22;

    // Colors: pure white or exact player disc team color (#4da3ff for blue, #ff5b6e for red)
    const teamColor = team === "blue" ? "#4da3ff" : "#ff5b6e";
    const color = Math.random() > 0.45 ? "#ffffff" : teamColor;

    this.particles.push({
      x: x + (Math.random() - 0.5) * 5,
      y: y + (Math.random() - 0.5) * 5,
      vx,
      vy,
      radius,
      maxRadius: radius,
      life,
      maxLife: life,
      color,
      borderColor: color,
    });
  }

  private updateEffects(dt: number, ball?: Ball): void {
    // Continuous subtle trail generation if ball is moving fast (> 380px/s)
    if (ball) {
      const speed = ball.velocity.length();
      if (speed > 380) {
        const normVx = ball.velocity.x / speed;
        const normVy = ball.velocity.y / speed;
        const oppX = -normVx;
        const oppY = -normVy;
        const pRatio = Math.min(1, (speed - 380) / 600);

        // Spawn occasionally (35% chance per frame for 1 particle)
        if (Math.random() < 0.35) {
          const activeTeam = ball.lastKickerTeam || "blue";
          this.spawnParticle(ball.position.x, ball.position.y, oppX, oppY, pRatio, activeTeam);
        }
      }
    }

    // Update shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.life -= dt;
      const progress = 1 - Math.max(0, sw.life / sw.maxLife);
      sw.radius = 12 + (sw.maxRadius - 12) * Math.pow(progress, 0.7);
      if (sw.life <= 0) {
        this.shockwaves.splice(i, 1);
      }
    }

    // Update tiny trail particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      p.vx *= 0.90;
      p.vy *= 0.90;
      p.radius *= 0.97;

      if (p.life <= 0 || p.radius < 0.2) {
        this.particles.splice(i, 1);
      }
    }
  }

  private resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(this.canvas.clientWidth * this.dpr);
    this.canvas.height = Math.floor(this.canvas.clientHeight * this.dpr);
  }

  private camX = 600;
  private camY = 350;

  render(
    arena: Arena,
    players: Player[],
    ball: Ball,
    blueScore: number,
    redScore: number,
    dt = 1 / 60,
    countdownText: string | null = null,
    countdownProgress = 0,
    goalBanner: { team: "blue" | "red"; progress: number } | null = null,
    isReplay = false
  ): void {
    if (!isReplay) {
      this.updateEffects(dt, ball);
    }

    const ctx = this.ctx;
    const width = this.canvas.width / this.dpr;
    const height = this.canvas.height / this.dpr;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const topMargin = 72;
    const bottomMargin = 66;
    const availableWidth = Math.max(100, width - 48);
    const availableHeight = Math.max(100, height - (topMargin + bottomMargin));

    // Calculate scale to fit arena.
    // If the arena is very large (e.g. 3v3 / 4v4) or screen is small, we ensure scale is not smaller than minScale.
    const fitScale = Math.min(availableWidth / arena.width, availableHeight / arena.height);
    const minScale = Math.max(0.78, availableHeight / 720);
    
    // Scale used: if arena fits on screen, scale = fitScale (full pitch visible, no scrolling).
    // If fitScale < minScale, we zoom in to minScale and use camera tracking!
    const isCameraTracking = fitScale < minScale;
    this.scale = isCameraTracking ? minScale : fitScale;

    // Target position for camera focus (Player 1 if present, else center of field)
    const targetPlayer = players.length > 0 ? players[0] : null;
    const targetX = targetPlayer ? targetPlayer.position.x : arena.width / 2;
    const targetY = targetPlayer ? targetPlayer.position.y : arena.height / 2;

    // Lerp camera position smoothly
    const lerpSpeed = 10 * dt;
    this.camX += (targetX - this.camX) * Math.min(1, lerpSpeed);
    this.camY += (targetY - this.camY) * Math.min(1, lerpSpeed);

    if (isCameraTracking) {
      // Clamp camera focus so we don't show blank area outside stadium bounds
      const halfViewWidth = availableWidth / (2 * this.scale);
      const halfViewHeight = availableHeight / (2 * this.scale);

      const margin = 80; // Allow slight view past goal lines
      const minCamX = halfViewWidth - margin;
      const maxCamX = arena.width - halfViewWidth + margin;
      const minCamY = halfViewHeight - margin;
      const maxCamY = arena.height - halfViewHeight + margin;

      const clampedCamX = Math.max(minCamX, Math.min(maxCamX, this.camX));
      const clampedCamY = Math.max(minCamY, Math.min(maxCamY, this.camY));

      this.offsetX = width / 2 - clampedCamX * this.scale;
      this.offsetY = topMargin + availableHeight / 2 - clampedCamY * this.scale;
    } else {
      // Standard static fit mode
      this.camX = arena.width / 2;
      this.camY = arena.height / 2;
      this.offsetX = (width - arena.width * this.scale) / 2;
      this.offsetY = topMargin + (availableHeight - arena.height * this.scale) / 2;
    }

    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);

    this.drawField(arena);
    this.drawShockwaves();
    this.drawParticles();
    for (let i = 0; i < players.length; i++) {
      this.drawPlayer(players[i], ball, i === 0);
    }
    this.drawBall(ball);

    if (goalBanner) {
      this.drawGoalBanner(arena, goalBanner.team, goalBanner.progress);
    } else if (countdownText) {
      this.drawAnimatedCountdown(arena, countdownText, countdownProgress);
    }

    ctx.restore();

    if (isReplay) {
      this.drawReplayOverlay(width, height);
    }
  }

  private drawReplayOverlay(screenWidth: number, screenHeight: number): void {
    const ctx = this.ctx;
    ctx.save();

    // Position directly under the HTML HUD scoreboard (Screen Space: top center)
    const centerX = screenWidth / 2;
    const posY = 64; // Under top scoreboard bar in screen coordinates
    const badgeW = 152;
    const badgeH = 36;

    ctx.translate(centerX, posY);

    // Sleek dark pill container with subtle glowing red border
    ctx.fillStyle = "rgba(11, 15, 25, 0.92)";
    ctx.strokeStyle = "rgba(239, 68, 68, 0.85)";
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.roundRect(-badgeW / 2, 0, badgeW, badgeH, 18);
    ctx.fill();
    ctx.stroke();

    // Red Pulsing Indicator Circle (REC Dot to the left of text)
    const pulseAlpha = 0.4 + 0.6 * Math.abs(Math.sin(Date.now() / 200));
    const dotX = -badgeW / 2 + 22;
    const dotY = badgeH / 2;

    // Glowing outer pulse aura
    ctx.beginPath();
    ctx.arc(dotX, dotY, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(239, 68, 68, ${pulseAlpha})`;
    ctx.shadowColor = "#ef4444";
    ctx.shadowBlur = 12;
    ctx.fill();

    // Solid inner core for red recording dot
    ctx.beginPath();
    ctx.arc(dotX, dotY, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();

    // REPLAY Text next to the red dot
    ctx.shadowBlur = 0;
    ctx.font = "900 16px 'Outfit', system-ui, sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("REPLAY", dotX + 15, dotY + 1);

    ctx.restore();
  }

  private drawGoalBanner(arena: Arena, team: "blue" | "red", progress: number): void {
    const ctx = this.ctx;
    ctx.save();

    const centerX = arena.width / 2;
    const centerY = arena.height / 2;

    // Elastic ease-out animation for banner zoom & spring effect
    let scale = 1;
    let alpha = 1;
    let bannerYOffset = 0;

    if (progress < 0.25) {
      const p = progress / 0.25;
      // Spring bounce entry curve
      scale = 0.2 + 0.9 * Math.sin(p * Math.PI * 0.5) + Math.sin(p * Math.PI) * 0.15;
      alpha = Math.min(1, p * 1.5);
      bannerYOffset = (1 - p) * -60;
    } else if (progress > 0.8) {
      const p = (progress - 0.8) / 0.2;
      scale = 1 + p * 0.35;
      alpha = 1 - p;
    }

    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

    // Animated expanding background banner overlay
    const bannerHeight = 116;
    const teamAccent = team === "blue" ? "#38bdf8" : "#f87171";
    const teamBg = team === "blue" ? "rgba(12, 35, 64, 0.92)" : "rgba(64, 12, 22, 0.92)";

    ctx.save();
    ctx.translate(centerX, centerY + bannerYOffset);

    // Dark sleek glassmorphic banner band
    ctx.fillStyle = teamBg;
    ctx.fillRect(-arena.width / 2, -bannerHeight / 2, arena.width, bannerHeight);

    // Animated glowing top and bottom border bars
    ctx.fillStyle = teamAccent;
    ctx.fillRect(-arena.width / 2, -bannerHeight / 2 - 3, arena.width, 3);
    ctx.fillRect(-arena.width / 2, bannerHeight / 2, arena.width, 3);

    // Scaled Text with Elastic Motion
    ctx.scale(scale, scale);

    ctx.font = "900 84px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.shadowColor = teamAccent;
    ctx.shadowBlur = 18;

    // Outer dark stroke for sharp contrast
    ctx.lineWidth = 9;
    ctx.strokeStyle = "#080c14";
    ctx.strokeText("¡GOAL!", 0, -10);

    ctx.fillStyle = "#ffffff";
    ctx.fillText("¡GOAL!", 0, -10);

    // Subtitle text with clean sports typography
    const teamName = team === "blue" ? "BLUE TEAM SCORED!" : "RED TEAM SCORED!";
    ctx.font = "800 22px system-ui, -apple-system, sans-serif";
    ctx.shadowBlur = 10;
    ctx.fillStyle = teamAccent;
    ctx.fillText(teamName, 0, 36);

    ctx.restore();
    ctx.restore();
  }

  private drawAnimatedCountdown(arena: Arena, text: string, progress: number): void {
    const ctx = this.ctx;
    ctx.save();

    const centerX = arena.width / 2;
    const centerY = arena.height / 2 - 10;
    const isGo = text.includes("GO");

    // Dynamic scale animation curve: starts giant (scale 2.2), drops down quickly with spring elasticity (scale 1.0) and fades out
    const p = Math.max(0, Math.min(1, progress));
    let scale = 1;
    let alpha = 1;

    if (p < 0.25) {
      const entryP = p / 0.25;
      // Overshooting elastic bounce
      scale = 2.4 - 1.4 * Math.sin(entryP * Math.PI * 0.5) - Math.sin(entryP * Math.PI) * 0.2;
      alpha = Math.min(1, entryP * 2);
    } else {
      const exitP = (p - 0.25) / 0.75;
      scale = 1.0 - exitP * 0.15;
      alpha = 1 - Math.pow(exitP, 2.5);
    }

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.scale(scale, scale);
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

    // Dynamic shockwave ring expanding outward from behind the countdown text
    const ringRadius = 30 + p * 120;
    ctx.beginPath();
    ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
    ctx.strokeStyle = isGo ? "rgba(250, 204, 21, 0.45)" : "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = Math.max(1, 6 * (1 - p));
    ctx.stroke();

    // Sharp, elegant text typography
    ctx.font = "900 115px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const textColor = isGo ? "#facc15" : "#ffffff";
    const strokeColor = "#0f172a";

    // Text Outline
    ctx.lineWidth = 10;
    ctx.strokeStyle = strokeColor;
    ctx.strokeText(text, 0, 0);

    // Subtle drop shadow for depth without oversaturating
    ctx.shadowColor = isGo ? "rgba(250, 204, 21, 0.6)" : "rgba(255, 255, 255, 0.5)";
    ctx.shadowBlur = 20;

    // Text Fill
    ctx.fillStyle = textColor;
    ctx.fillText(text, 0, 0);

    ctx.restore();
    ctx.restore();
  }

  private drawField(arena: Arena): void {
    const ctx = this.ctx;
    const c = arena.cornerSize;

    // Field Turf Background
    ctx.fillStyle = "#1d7048";
    ctx.fillRect(0, 0, arena.width, arena.height);

    // Stripes
    ctx.globalAlpha = 0.08;
    for (let x = 0; x < arena.width; x += 80) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(x, 0, 40, arena.height);
    }
    ctx.globalAlpha = 1;

    // Corner Triangles (Out of bounds chamfers)
    ctx.fillStyle = "#0b0e14";
    // Top-Left Corner
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(c, 0);
    ctx.lineTo(0, c);
    ctx.closePath();
    ctx.fill();

    // Top-Right Corner
    ctx.beginPath();
    ctx.moveTo(arena.width, 0);
    ctx.lineTo(arena.width - c, 0);
    ctx.lineTo(arena.width, c);
    ctx.closePath();
    ctx.fill();

    // Bottom-Left Corner
    ctx.beginPath();
    ctx.moveTo(0, arena.height);
    ctx.lineTo(c, arena.height);
    ctx.lineTo(0, arena.height - c);
    ctx.closePath();
    ctx.fill();

    // Bottom-Right Corner
    ctx.beginPath();
    ctx.moveTo(arena.width, arena.height);
    ctx.lineTo(arena.width - c, arena.height);
    ctx.lineTo(arena.width, arena.height - c);
    ctx.closePath();
    ctx.fill();

    // Field Boundary Outer Lines
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 5;
    ctx.strokeRect(0, 0, arena.width, arena.height);

    // Diagonal Corner Boundary White Lines
    ctx.beginPath();
    ctx.moveTo(c, 0); ctx.lineTo(0, c);
    ctx.moveTo(arena.width - c, 0); ctx.lineTo(arena.width, c);
    ctx.moveTo(0, arena.height - c); ctx.lineTo(c, arena.height);
    ctx.moveTo(arena.width - c, arena.height); ctx.lineTo(arena.width, arena.height - c);
    ctx.stroke();

    // Halfway Line
    ctx.beginPath();
    ctx.moveTo(arena.width / 2, 0);
    ctx.lineTo(arena.width / 2, arena.height);
    ctx.stroke();

    // Center Circle
    ctx.beginPath();
    ctx.arc(arena.width / 2, arena.height / 2, 90, 0, Math.PI * 2);
    ctx.stroke();

    // Center Dot
    ctx.beginPath();
    ctx.arc(arena.width / 2, arena.height / 2, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();

    // Penalty Areas
    ctx.strokeRect(0, arena.height / 2 - 150, 150, 300);
    ctx.strokeRect(arena.width - 150, arena.height / 2 - 150, 150, 300);

    // Deep Goals Netting (65px Depth)
    const gd = arena.goalDepth;

    // Goal turf background
    ctx.fillStyle = "#0c1b2b";
    ctx.fillRect(-gd, arena.goalTop, gd, arena.goalWidth);
    ctx.fillStyle = "#2b0f16";
    ctx.fillRect(arena.width, arena.goalTop, gd, arena.goalWidth);

    // Goal Net Mesh Grid
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = 1.2;

    // Horizontal net lines
    for (let y = arena.goalTop; y <= arena.goalBottom; y += 14) {
      ctx.beginPath();
      ctx.moveTo(-gd, y); ctx.lineTo(0, y);
      ctx.moveTo(arena.width, y); ctx.lineTo(arena.width + gd, y);
      ctx.stroke();
    }

    // Vertical net lines
    for (let x = 14; x <= gd; x += 14) {
      ctx.beginPath();
      ctx.moveTo(-x, arena.goalTop); ctx.lineTo(-x, arena.goalBottom);
      ctx.moveTo(arena.width + x, arena.goalTop); ctx.lineTo(arena.width + x, arena.goalBottom);
      ctx.stroke();
    }

    // Outer Goal Net Frame Outline
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3.5;
    ctx.strokeRect(-gd, arena.goalTop, gd, arena.goalWidth);
    ctx.strokeRect(arena.width, arena.goalTop, gd, arena.goalWidth);
    ctx.restore();

    // Realistic Goal Posts Circles
    for (const post of arena.posts) {
      ctx.beginPath();
      ctx.arc(post.position.x, post.position.y, post.radius, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = "#101820";
      ctx.stroke();
    }
  }

  private drawShockwaves(): void {
    const ctx = this.ctx;
    ctx.save();
    for (const sw of this.shockwaves) {
      const alpha = sw.life / sw.maxLife;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      ctx.strokeStyle = sw.color;
      ctx.lineWidth = 4 * alpha;
      ctx.globalAlpha = alpha * 0.85;
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawParticles(): void {
    const ctx = this.ctx;
    ctx.save();
    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha * 0.75;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 4;
      ctx.fill();
    }
    ctx.restore();
  }

  private drawPlayer(player: Player, ball: Ball, isLocalPlayer = false): void {
    const ctx = this.ctx;
    const isInteractive = player.isKicking || player.isCharging || player.kickFlash > 0;

    ctx.save();

    // Outer Directional Ring (Local player always, or any player when sprinting)
    if (isLocalPlayer || player.isSprinting) {
      const ringRadius = player.radius + 6.5;
      const ringColor = player.isSprinting ? "#00e5ff" : "rgba(255, 255, 255, 0.4)";
      const notchColor = player.isSprinting ? "#00e5ff" : "#ffffff";

      if (player.isSprinting) {
        ctx.shadowColor = "#00e5ff";
        ctx.shadowBlur = 10;
      }

      ctx.beginPath();
      ctx.arc(player.position.x, player.position.y, ringRadius, 0, Math.PI * 2);
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = 3.2;
      ctx.stroke();

      // Active movement direction indicator notch (Local player ONLY)
      if (isLocalPlayer && player.isInputMoving) {
        const angle = player.lastInputAngle;
        const arcLength = 0.48; // Width of the direction pill arc
        ctx.beginPath();
        ctx.arc(player.position.x, player.position.y, ringRadius, angle - arcLength / 2, angle + arcLength / 2);
        ctx.strokeStyle = notchColor;
        ctx.lineWidth = 6.8;
        ctx.stroke();
      }

      ctx.shadowBlur = 0;
    }

    // Outer juicy glow and aura ring when charging or kicking
    if (isInteractive) {
      ctx.shadowColor = "#ffffff";
      ctx.shadowBlur = 16;

      // Pulsing outer aura ring
      const pulseRadius = player.radius + 6 + Math.sin(player.animTime * 18) * 3;
      ctx.beginPath();
      ctx.arc(player.position.x, player.position.y, pulseRadius, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.65)";
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(player.position.x, player.position.y, player.radius, 0, Math.PI * 2);

    // Turn player disc white on Space interaction!
    if (isInteractive) {
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    } else {
      ctx.save();
      ctx.clip(); // Clip pattern within player disc circle

      // Base background fill
      const baseColor = player.customColor || (player.team === "blue" ? "#4da3ff" : "#ff5b6e");
      ctx.fillStyle = baseColor;
      ctx.fillRect(player.position.x - player.radius, player.position.y - player.radius, player.radius * 2, player.radius * 2);

      // Render Pattern / Flag overlay if specified
      const px = player.position.x;
      const py = player.position.y;
      const r = player.radius;

      if (player.pattern === "spain") {
        // Spanish Flag Pattern (Red - Yellow - Red)
        ctx.fillStyle = "#aa151b"; // Spanish Red
        ctx.fillRect(px - r, py - r, r * 2, r * 0.5);
        ctx.fillStyle = "#f1bf00"; // Spanish Yellow
        ctx.fillRect(px - r, py - r * 0.5, r * 2, r * 1.0);
        ctx.fillStyle = "#aa151b"; // Spanish Red
        ctx.fillRect(px - r, py + r * 0.5, r * 2, r * 0.5);
      } else if (player.pattern === "halves") {
        ctx.fillStyle = "#111111";
        ctx.fillRect(px - r, py - r, r, r * 2);
      } else if (player.pattern === "stripes") {
        ctx.fillStyle = "#111111";
        ctx.fillRect(px - r * 0.6, py - r, r * 0.4, r * 2);
        ctx.fillRect(px + r * 0.2, py - r, r * 0.4, r * 2);
      } else if (player.pattern === "checker") {
        ctx.fillStyle = "#111111";
        ctx.fillRect(px - r, py - r, r, r);
        ctx.fillRect(px, py, r, r);
      } else if (player.pattern === "rings") {
        ctx.beginPath();
        ctx.arc(px, py, r * 0.6, 0, Math.PI * 2);
        ctx.lineWidth = 4;
        ctx.strokeStyle = "#111111";
        ctx.stroke();
      } else if (player.pattern === "sash") {
        ctx.fillStyle = "#111111";
        ctx.beginPath();
        ctx.moveTo(px - r, py - r);
        ctx.lineTo(px - r * 0.3, py - r);
        ctx.lineTo(px + r, py + r * 0.3);
        ctx.lineTo(px + r, py + r);
        ctx.closePath();
        ctx.fill();
      } else if (player.pattern === "diamond") {
        ctx.fillStyle = "#ffaa00";
        ctx.beginPath();
        ctx.moveTo(px, py - r * 0.8);
        ctx.lineTo(px + r * 0.8, py);
        ctx.lineTo(px, py + r * 0.8);
        ctx.lineTo(px - r * 0.8, py);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // Border styling (Classic, Gold, Neon, Rainbow)
    ctx.lineWidth = 4;
    if (isInteractive) {
      ctx.strokeStyle = player.team === "blue" ? "#1e70bf" : "#c72c3e";
    } else if (player.borderStyle === "gold") {
      ctx.strokeStyle = "#ffcc00";
    } else if (player.borderStyle === "neon") {
      ctx.strokeStyle = "#00f0ff";
    } else if (player.borderStyle === "rainbow") {
      ctx.strokeStyle = "#ff3399";
    } else {
      ctx.strokeStyle = "#ffffff";
    }
    ctx.stroke();

    // Render Jersey Number or Emoji Badge in the center of the disc
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (player.badgeEmoji && player.badgeEmoji.trim().length > 0) {
      ctx.font = "14px 'Outfit', sans-serif";
      ctx.fillText(player.badgeEmoji, player.position.x, player.position.y + 1);
    } else {
      ctx.font = "900 13px 'Outfit', sans-serif";
      ctx.fillStyle = isInteractive ? "#000000" : "#ffffff";
      ctx.fillText(String(player.jerseyNumber), player.position.x, player.position.y + 1);
    }
    ctx.restore();

    // 3 small solid white circles aim-indicator projecting outwards from the front of the ball (Local Human player ONLY)
    const showKickDirection = isLocalPlayer && isInteractive;
    if (showKickDirection) {
      const dx = ball.position.x - player.position.x;
      const dy = ball.position.y - player.position.y;
      const len = Math.hypot(dx, dy);
      const dirX = len > 0.0001 ? dx / len : 1;
      const dirY = len > 0.0001 ? dy / len : 0;

      // Position dots starting just outside the ball's radius (13px) projecting forward
      const startOffset = ball.radius + 6;
      const dotDistances = [startOffset, startOffset + 10, startOffset + 19];
      const dotRadii = [3.5, 2.7, 1.9];

      ctx.save();
      ctx.shadowColor = "#ffffff";
      ctx.shadowBlur = 10;
      for (let i = 0; i < 3; i++) {
        const dotX = ball.position.x + dirX * dotDistances[i];
        const dotY = ball.position.y + dirY * dotDistances[i];
        ctx.beginPath();
        ctx.arc(dotX, dotY, dotRadii[i], 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
        ctx.stroke();
      }
      ctx.restore();
    }

    // Stamina Bar Rendering (Local Human Player ONLY)
    if (isLocalPlayer && player.stamina < player.maxStamina - 0.5) {
      const barWidth = 36;
      const barHeight = 4;
      const barX = player.position.x - barWidth / 2;
      const barY = player.position.y + player.radius + 8;
      const ratio = player.stamina / player.maxStamina;

      // Background Track
      ctx.fillStyle = "rgba(10, 16, 26, 0.75)";
      ctx.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);

      // Stamina Fill
      const fillWidth = Math.max(0, barWidth * ratio);
      ctx.fillStyle = ratio > 0.4 ? "#00e5ff" : ratio > 0.2 ? "#ffe600" : "#ff3344";
      ctx.fillRect(barX, barY, fillWidth, barHeight);
    }

    ctx.restore();
  }

  private drawBall(ball: Ball): void {
    const ctx = this.ctx;
    ctx.save();

    // Subtle ambient floor shadow under the ball
    ctx.beginPath();
    ctx.ellipse(ball.position.x + 2, ball.position.y + 4, ball.radius * 0.95, ball.radius * 0.7, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.fill();

    // Glow aura around ball when charging power shot
    if (ball.chargeRatio > 0.05) {
      const red = 255;
      const green = Math.floor(230 * (1 - ball.chargeRatio * 0.85));
      ctx.shadowColor = `rgb(${red}, ${green}, 0)`;
      ctx.shadowBlur = 14 + ball.chargeRatio * 18;
    }

    // Render Kenney PNG Ball Asset if loaded
    const currentImg = this.ballImages[ball.skinIndex % this.ballImages.length];
    if (currentImg && currentImg.complete && currentImg.naturalWidth > 0) {
      ctx.save();
      ctx.translate(ball.position.x, ball.position.y);
      ctx.rotate(ball.lastMoveAngle + ball.rotation);
      const diameter = ball.radius * 2;
      ctx.drawImage(currentImg, -ball.radius, -ball.radius, diameter, diameter);
      ctx.restore();
    } else {
      // Fallback: Base White Football Sphere
      ctx.beginPath();
      ctx.arc(ball.position.x, ball.position.y, ball.radius, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();

      // Render Classic Telstar Football Pattern with Real Forward 3D Rolling Physics
      ctx.save();
      ctx.beginPath();
      ctx.arc(ball.position.x, ball.position.y, ball.radius, 0, Math.PI * 2);
      ctx.clip();

      ctx.translate(ball.position.x, ball.position.y);

      const r = ball.radius;

      // Convert world roll offset into 3D roll displacement on the sphere surface
      // Scale factor dictates how many radians the sphere rolls per pixel moved
      const rollScale = 0.045;
      const rollX = ball.rollOffsetX * rollScale;
      const rollY = ball.rollOffsetY * rollScale;

      // Dark Telstar Pentagonal Panels & Connecting Seams
      ctx.fillStyle = "#1e293b";
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 1.3;

      // Define complete 12-pentagon truncated icosahedron mesh (Top, Upper ring, Lower ring, Bottom)
      const phiStep = (Math.PI * 2) / 5;
      const latAngle1 = 1.107; // ~63.43 degrees
      const latAngle2 = Math.PI - 1.107; // ~116.57 degrees

      const pentagons3D = [
        // Top Pole (1)
        { theta: 0, phi: 0 },
        // Upper Ring (5)
        { theta: latAngle1, phi: 0 },
        { theta: latAngle1, phi: phiStep },
        { theta: latAngle1, phi: phiStep * 2 },
        { theta: latAngle1, phi: phiStep * 3 },
        { theta: latAngle1, phi: phiStep * 4 },
        // Lower Ring (5 - interleaved by half-step)
        { theta: latAngle2, phi: phiStep * 0.5 },
        { theta: latAngle2, phi: phiStep * 1.5 },
        { theta: latAngle2, phi: phiStep * 2.5 },
        { theta: latAngle2, phi: phiStep * 3.5 },
        { theta: latAngle2, phi: phiStep * 4.5 },
        // Bottom Pole (1)
        { theta: Math.PI, phi: 0 }
      ];

      const pentaRadius3D = 0.28; // Accurate Telstar pentagon size ratio

      // Project each 3D pentagon center after applying rollX and rollY
      const projectedCenters: Array<{ x: number; y: number; z: number }> = [];

      for (const p of pentagons3D) {
        // Base 3D unit vector
        const x = Math.sin(p.theta) * Math.cos(p.phi);
        const y = Math.sin(p.theta) * Math.sin(p.phi);
        const z = Math.cos(p.theta);

        // Rotate around Y axis (horizontal roll)
        const cosX = Math.cos(rollX);
        const sinX = Math.sin(rollX);
        const x1 = x * cosX + z * sinX;
        const z1 = -x * sinX + z * cosX;

        // Rotate around X axis (vertical roll)
        const cosY = Math.cos(rollY);
        const sinY = Math.sin(rollY);
        const y2 = y * cosY - z1 * sinY;
        const z2 = y * sinY + z1 * cosY;

        // Draw pentagons on the visible front hemisphere (z2 > -0.15)
        if (z2 > -0.15) {
          const projX = x1 * r;
          const projY = y2 * r;

          projectedCenters.push({ x: projX, y: projY, z: z2 });

          ctx.beginPath();
          for (let i = 0; i < 5; i++) {
            const cornerAngle = (i * Math.PI * 2) / 5 - Math.PI / 2;
            // Scale pentagon size based on z-depth perspective foreshortening
            const cornerR = pentaRadius3D * r * (0.75 + 0.25 * Math.max(0, z2));
            const px = projX + Math.cos(cornerAngle) * cornerR;
            const py = projY + Math.sin(cornerAngle) * cornerR;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
        }
      }

      // Connect visible adjacent centers with black seam lines
      for (let a = 0; a < projectedCenters.length; a++) {
        for (let b = a + 1; b < projectedCenters.length; b++) {
          const pA = projectedCenters[a];
          const pB = projectedCenters[b];
          const dist = Math.hypot(pA.x - pB.x, pA.y - pB.y);
          if (dist < r * 1.15 && pA.z > 0.1 && pB.z > 0.1) {
            ctx.beginPath();
            ctx.moveTo(pA.x, pA.y);
            ctx.lineTo(pB.x, pB.y);
            ctx.stroke();
          }
        }
      }

      ctx.restore();
    }

    // Sphere 3D Shading Overlay (Gradient mask for realistic volume & specular reflection)
    const r = ball.radius;
    const shineGrad = ctx.createRadialGradient(
      ball.position.x - r * 0.35,
      ball.position.y - r * 0.35,
      r * 0.1,
      ball.position.x,
      ball.position.y,
      r
    );
    shineGrad.addColorStop(0, "rgba(255, 255, 255, 0.45)");
    shineGrad.addColorStop(0.55, "rgba(255, 255, 255, 0)");
    shineGrad.addColorStop(1, "rgba(15, 23, 42, 0.4)");

    ctx.beginPath();
    ctx.arc(ball.position.x, ball.position.y, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = shineGrad;
    ctx.fill();

    // Outer Crisp Ball Border
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = "#0f172a";
    ctx.stroke();

    // Power circle expanding exponentially from the center of the ball when charging
    if (ball.chargeRatio > 0.01) {
      const powerRadius = ball.radius * Math.min(1, ball.chargeRatio);

      const red = 255;
      const green = Math.floor(230 * (1 - ball.chargeRatio * 0.85));
      const blue = 0;
      const mainColor = `rgb(${red}, ${green}, ${blue})`;

      // Center growing power fill
      ctx.beginPath();
      ctx.arc(ball.position.x, ball.position.y, powerRadius, 0, Math.PI * 2);
      ctx.fillStyle = mainColor;
      ctx.fill();

      // Inner white-hot energy core
      ctx.beginPath();
      ctx.arc(ball.position.x, ball.position.y, Math.max(1.5, powerRadius * 0.45), 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();

      // Juicy outer pulsing ring around the expanding circle
      const pulseRingRadius = Math.min(ball.radius + 3, powerRadius + 1.5 + Math.sin(Date.now() / 60) * 1.5);
      ctx.beginPath();
      ctx.arc(ball.position.x, ball.position.y, pulseRingRadius, 0, Math.PI * 2);
      ctx.strokeStyle = mainColor;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Power gauge arc ring on the outer boundary of the ball
      ctx.beginPath();
      ctx.arc(ball.position.x, ball.position.y, ball.radius + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ball.chargeRatio);
      ctx.strokeStyle = mainColor;
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    ctx.restore();
  }
}