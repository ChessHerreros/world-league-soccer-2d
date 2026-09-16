import { Vec2 } from "../math/Vec2";

export class Ball {
  readonly position = new Vec2();
  readonly velocity = new Vec2();
  readonly radius = 13;
  readonly mass = 0.55;

  maxSpeed = 1250;
  friction = 0.992;
  restitution = 0.86;
  chargeRatio = 0;
  lastKickerTeam: "blue" | "red" | null = null;

  rotation = 0;
  lastMoveAngle = 0;
  rollOffsetX = 0;
  rollOffsetY = 0;
  skinIndex = 0; // 0: ball_soccer1, 1: ball_soccer2, 2: ball_soccer3, 3: ball_soccer4

  reset(x: number, y: number): void {
    this.position.set(x, y);
    this.velocity.set(0, 0);
    this.chargeRatio = 0;
    this.lastKickerTeam = null;
    this.rotation = 0;
    this.lastMoveAngle = 0;
    this.rollOffsetX = 0;
    this.rollOffsetY = 0;
  }

  update(dt: number): void {
    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;

    const speed = this.velocity.length();
    if (speed > 2) {
      // Accumulate rolling offsets and rotation angle smoothly along ball direction
      this.rollOffsetX += this.velocity.x * dt;
      this.rollOffsetY += this.velocity.y * dt;
      this.rotation += (speed / (this.radius * 1.5)) * dt;
      this.lastMoveAngle = Math.atan2(this.velocity.y, this.velocity.x);
    }

    const friction = Math.pow(this.friction, dt * 60);
    this.velocity.scale(friction);

    if (speed > this.maxSpeed) {
      this.velocity.scale(this.maxSpeed / speed);
    }
  }
}