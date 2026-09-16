import { Vec2 } from "../math/Vec2";

export type Team = "blue" | "red";

export interface PlayerConfig {
  position: Vec2;
  team: Team;
  radius?: number;
}

export class Player {
  readonly position: Vec2;
  readonly velocity = new Vec2();
  readonly team: Team;
  readonly radius: number;
  readonly mass = 1;

  maxSpeed = 420;
  acceleration = 1800;
  damping = 0.82;
  kickCooldown = 0;
  dribbleCooldown = 0;
  dashCooldown = 0;
  dashFlash = 0;
  dashStaminaCost = 50;
  kickRadius = 45;
  kickPower = 380;
  maxKickPowerMultiplier = 1.65;

  isKicking = false;
  isCharging = false;
  chargeTime = 0;
  chargeRatio = 0;
  maxChargeTime = 0.75;
  kickFlash = 0;
  animTime = 0;

  // Sprint & Stamina System
  stamina = 100;
  maxStamina = 100;
  isSprinting = false;
  staminaDrainRate = 34;
  staminaRecoveryRate = 22;

  // Customization & Inventory Properties
  jerseyNumber: number = 29;
  badgeEmoji: string = "";
  customColor: string | null = null;
  borderStyle: "gold" | "neon" | "classic" | "rainbow" = "classic";
  pattern: "classic" | "halves" | "checker" | "stripes" | "rings" | "sash" | "diamond" | "spain" = "spain";

  // Movement Direction Indicator
  lastInputAngle = 0; // 0 rad = Right (D), Math.PI/2 = Down (S), etc.
  isInputMoving = false;

  constructor(config: PlayerConfig) {
    this.position = config.position.clone();
    this.team = config.team;
    this.radius = config.radius ?? 22;
  }

  isDashing = false;
  dashTimer = 0;
  dashDuration = 0.11;
  dashSpeed = 1600;

  update(dt: number, inputX: number, inputY: number, wantSprint = false): void {
    this.animTime += dt;

    if (this.dashTimer > 0) {
      this.dashTimer = Math.max(0, this.dashTimer - dt);
      if (this.dashTimer <= 0) {
        this.isDashing = false;
      }
    }

    const isMoving = Math.hypot(inputX, inputY) > 0.1;
    this.isInputMoving = isMoving;
    if (isMoving) {
      this.lastInputAngle = Math.atan2(inputY, inputX);
    }
    if (wantSprint && isMoving && this.stamina > 2 && !this.isDashing) {
      this.isSprinting = true;
      this.stamina = Math.max(0, this.stamina - this.staminaDrainRate * dt);
    } else {
      this.isSprinting = false;
      this.stamina = Math.min(this.maxStamina, this.stamina + this.staminaRecoveryRate * dt);
    }

    if (!this.isDashing) {
      const currentAccel = this.isSprinting ? 2400 : this.acceleration;
      const currentMaxSpeed = this.isSprinting ? 570 : this.maxSpeed;

      this.velocity.x += inputX * currentAccel * dt;
      this.velocity.y += inputY * currentAccel * dt;

      const speed = this.velocity.length();
      if (speed > currentMaxSpeed) {
        this.velocity.scale(currentMaxSpeed / speed);
      }

      const damping = Math.pow(this.damping, dt * 60);
      this.velocity.scale(damping);
    }

    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;

    this.kickCooldown = Math.max(0, this.kickCooldown - dt);
    this.dribbleCooldown = Math.max(0, this.dribbleCooldown - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.kickFlash = Math.max(0, this.kickFlash - dt);
    this.dashFlash = Math.max(0, this.dashFlash - dt);
  }

  updateCharge(dt: number, nearBall: boolean, isHoldingSpace: boolean): void {
    if (isHoldingSpace) {
      this.isCharging = false;
    } else if (nearBall) {
      this.isCharging = true;
      this.chargeTime += dt;
      const normalizedTime = Math.min(1, this.chargeTime / this.maxChargeTime);
      // Exponential curve: starts slow and accelerates up to 1.0
      this.chargeRatio = (Math.exp(2.2 * normalizedTime) - 1) / (Math.exp(2.2) - 1);
    } else {
      this.resetCharge();
    }
  }

  resetCharge(): void {
    this.isCharging = false;
    this.chargeTime = 0;
    this.chargeRatio = 0;
  }

  canKick(): boolean {
    return this.kickCooldown <= 0;
  }

  kick(): void {
    this.kickCooldown = 0.22;
    this.kickFlash = 0.18;
  }

  canDribble(): boolean {
    return this.dribbleCooldown <= 0;
  }

  dribble(): void {
    this.dribbleCooldown = 0.55;
  }

  canDash(): boolean {
    return this.stamina >= 50;
  }

  dash(): void {
    this.stamina = Math.max(0, this.stamina - this.dashStaminaCost);
    this.dashCooldown = 0;
    this.dashFlash = 0.35;
    this.isDashing = true;
    this.dashTimer = this.dashDuration;
  }
}