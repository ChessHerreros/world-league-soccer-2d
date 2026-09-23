import { Ball } from "../entities/Ball";
import { Player } from "../entities/Player";
import { Vec2 } from "../math/Vec2";
import { Arena } from "../world/Arena";

function resolveCircleCollision(
  a: { position: Vec2; velocity: Vec2; radius: number; mass: number },
  b: { position: Vec2; velocity: Vec2; radius: number; mass: number },
  restitution: number
): boolean {
  const dx = b.position.x - a.position.x;
  const dy = b.position.y - a.position.y;
  const minDistance = a.radius + b.radius;
  const distanceSq = dx * dx + dy * dy;

  if (distanceSq >= minDistance * minDistance) return false;

  let distance = Math.sqrt(distanceSq);
  let nx = dx;
  let ny = dy;

  if (distance < 0.0001) {
    nx = 1;
    ny = 0;
    distance = 0.0001;
  } else {
    nx /= distance;
    ny /= distance;
  }

  const penetration = minDistance - distance;
  const totalMass = a.mass + b.mass;

  a.position.x -= nx * penetration * (b.mass / totalMass);
  a.position.y -= ny * penetration * (b.mass / totalMass);
  b.position.x += nx * penetration * (a.mass / totalMass);
  b.position.y += ny * penetration * (a.mass / totalMass);

  const relativeVelocity = (b.velocity.x - a.velocity.x) * nx +
    (b.velocity.y - a.velocity.y) * ny;

  if (relativeVelocity < 0) {
    const impulse = -(1 + restitution) * relativeVelocity / (1 / a.mass + 1 / b.mass);
    a.velocity.x -= nx * impulse / a.mass;
    a.velocity.y -= ny * impulse / a.mass;
    b.velocity.x += nx * impulse / b.mass;
    b.velocity.y += ny * impulse / b.mass;
  }

  return true;
}

function resolvePostCollision(
  circle: { position: Vec2; velocity: Vec2; radius: number },
  post: { position: Vec2; radius: number },
  restitution: number
): boolean {
  const dx = circle.position.x - post.position.x;
  const dy = circle.position.y - post.position.y;
  const minDist = circle.radius + post.radius;
  const distSq = dx * dx + dy * dy;

  if (distSq >= minDist * minDist) return false;

  let dist = Math.sqrt(distSq);
  let nx = dx;
  let ny = dy;

  if (dist < 0.0001) {
    nx = 1;
    ny = 0;
    dist = 0.0001;
  } else {
    nx /= dist;
    ny /= dist;
  }

  const penetration = minDist - dist;
  circle.position.x += nx * penetration;
  circle.position.y += ny * penetration;

  const velDot = circle.velocity.x * nx + circle.velocity.y * ny;
  if (velDot < 0) {
    const impulse = -(1 + restitution) * velDot;
    circle.velocity.x += nx * impulse;
    circle.velocity.y += ny * impulse;
  }

  return true;
}

function resolveCornerCollision(
  circle: { position: Vec2; velocity: Vec2; radius: number },
  arena: Arena,
  restitution: number
): void {
  const c = arena.cornerSize;
  const r = circle.radius;
  const invSqrt2 = 0.70710678;

  // 1. Top-Left Corner Plane (normal: [invSqrt2, invSqrt2], point: [0, c])
  let distTL = circle.position.x * invSqrt2 + (circle.position.y - c) * invSqrt2;
  if (distTL < r) {
    const penetration = r - distTL;
    circle.position.x += invSqrt2 * penetration;
    circle.position.y += invSqrt2 * penetration;
    const velDot = circle.velocity.x * invSqrt2 + circle.velocity.y * invSqrt2;
    if (velDot < 0) {
      const impulse = -(1 + restitution) * velDot;
      circle.velocity.x += invSqrt2 * impulse;
      circle.velocity.y += invSqrt2 * impulse;
    }
  }

  // 2. Top-Right Corner Plane (normal: [-invSqrt2, invSqrt2], point: [width, c])
  let distTR = (circle.position.x - arena.width) * -invSqrt2 + (circle.position.y - c) * invSqrt2;
  if (distTR < r) {
    const penetration = r - distTR;
    circle.position.x -= invSqrt2 * penetration;
    circle.position.y += invSqrt2 * penetration;
    const velDot = circle.velocity.x * -invSqrt2 + circle.velocity.y * invSqrt2;
    if (velDot < 0) {
      const impulse = -(1 + restitution) * velDot;
      circle.velocity.x -= invSqrt2 * impulse;
      circle.velocity.y += invSqrt2 * impulse;
    }
  }

  // 3. Bottom-Left Corner Plane (normal: [invSqrt2, -invSqrt2], point: [0, height - c])
  let distBL = circle.position.x * invSqrt2 + (circle.position.y - (arena.height - c)) * -invSqrt2;
  if (distBL < r) {
    const penetration = r - distBL;
    circle.position.x += invSqrt2 * penetration;
    circle.position.y -= invSqrt2 * penetration;
    const velDot = circle.velocity.x * invSqrt2 + circle.velocity.y * -invSqrt2;
    if (velDot < 0) {
      const impulse = -(1 + restitution) * velDot;
      circle.velocity.x += invSqrt2 * impulse;
      circle.velocity.y -= invSqrt2 * impulse;
    }
  }

  // 4. Bottom-Right Corner Plane (normal: [-invSqrt2, -invSqrt2], point: [width, height - c])
  let distBR = (circle.position.x - arena.width) * -invSqrt2 + (circle.position.y - (arena.height - c)) * -invSqrt2;
  if (distBR < r) {
    const penetration = r - distBR;
    circle.position.x -= invSqrt2 * penetration;
    circle.position.y -= invSqrt2 * penetration;
    const velDot = circle.velocity.x * -invSqrt2 + circle.velocity.y * -invSqrt2;
    if (velDot < 0) {
      const impulse = -(1 + restitution) * velDot;
      circle.velocity.x -= invSqrt2 * impulse;
      circle.velocity.y -= invSqrt2 * impulse;
    }
  }
}

export class Physics {
  static playerBall(player: Player, ball: Ball): void {
    // Dampen restitution if player is dashing into the ball to avoid ultra-launching it like a cannon
    const restitution = player.isDashing ? 0.28 : 0.72;
    if (resolveCircleCollision(player, ball, restitution)) {
      ball.lastKickerTeam = player.team;
      // Cap maximum ball velocity from passive collision while dashing
      if (player.isDashing) {
        const speed = ball.velocity.length();
        if (speed > 520) {
          ball.velocity.scale(520 / speed);
        }
      }
    }
  }

  static players(a: Player, b: Player): void {
    resolveCircleCollision(a, b, 0.2);
  }

  static ballArena(ball: Ball, arena: Arena): void {
    // 1. Goal posts collision
    for (const post of arena.posts) {
      resolvePostCollision(ball, post, 0.88);
    }

    // 2. Corner chamfer diagonal walls collision
    resolveCornerCollision(ball, arena, ball.restitution);

    // 3. Boundary walls collision
    const r = ball.radius;

    if (ball.position.y - r < 0) {
      ball.position.y = r;
      ball.velocity.y = Math.abs(ball.velocity.y) * ball.restitution;
    }

    if (ball.position.y + r > arena.height) {
      ball.position.y = arena.height - r;
      ball.velocity.y = -Math.abs(ball.velocity.y) * ball.restitution;
    }

    const inGoalY = arena.isInsideGoal(ball.position.y);
    const gd = arena.goalDepth;

    if (!inGoalY && ball.position.x - r < 0) {
      ball.position.x = r;
      ball.velocity.x = Math.abs(ball.velocity.x) * ball.restitution;
    } else if (inGoalY && ball.position.x - r < -gd) {
      ball.position.x = -gd + r;
      ball.velocity.x = Math.abs(ball.velocity.x) * 0.35;
    }

    if (!inGoalY && ball.position.x + r > arena.width) {
      ball.position.x = arena.width - r;
      ball.velocity.x = -Math.abs(ball.velocity.x) * ball.restitution;
    } else if (inGoalY && ball.position.x + r > arena.width + gd) {
      ball.position.x = arena.width + gd - r;
      ball.velocity.x = -Math.abs(ball.velocity.x) * 0.35;
    }

    // Top/Bottom net walls for deep goals
    if (ball.position.x < 0 || ball.position.x > arena.width) {
      if (ball.position.y - r < arena.goalTop) {
        ball.position.y = arena.goalTop + r;
        ball.velocity.y = Math.abs(ball.velocity.y) * 0.4;
      }
      if (ball.position.y + r > arena.goalBottom) {
        ball.position.y = arena.goalBottom - r;
        ball.velocity.y = -Math.abs(ball.velocity.y) * 0.4;
      }
    }
  }

  static playerArena(player: Player, arena: Arena): void {
    // 1. Goal posts collision
    for (const post of arena.posts) {
      resolvePostCollision(player, post, 0.3);
    }

    // 2. Outer stadium boundary (allows player to leave the pitch to get angles on the ball, clamped at outer barrier)
    const outerMargin = arena.outerMargin ?? 85;
    const r = player.radius;

    const minX = -outerMargin + r;
    const maxX = arena.width + outerMargin - r;
    const minY = -outerMargin + r;
    const maxY = arena.height + outerMargin - r;

    if (player.position.x < minX) {
      player.position.x = minX;
      player.velocity.x = Math.max(0, player.velocity.x);
    } else if (player.position.x > maxX) {
      player.position.x = maxX;
      player.velocity.x = Math.min(0, player.velocity.x);
    }

    if (player.position.y < minY) {
      player.position.y = minY;
      player.velocity.y = Math.max(0, player.velocity.y);
    } else if (player.position.y > maxY) {
      player.position.y = maxY;
      player.velocity.y = Math.min(0, player.velocity.y);
    }

    // 3. Goal net enclosure collisions (prevent walking through back or sides of net)
    const gd = arena.goalDepth;
    const inGoalY = arena.isInsideGoal(player.position.y);

    // Left goal net enclosure (between x: -gd and 0, and y: goalTop and goalBottom)
    if (player.position.x < 0 && player.position.x > -gd - r) {
      if (inGoalY) {
        // Inside goal net: stop at back of net
        if (player.position.x - r < -gd) {
          player.position.x = -gd + r;
          player.velocity.x = Math.max(0, player.velocity.x);
        }
      } else {
        // Outside goal net: prevent walking through top or bottom net walls
        if (player.position.y + r > arena.goalTop && player.position.y < arena.goalTop + 10) {
          player.position.y = arena.goalTop - r;
          player.velocity.y = Math.min(0, player.velocity.y);
        } else if (player.position.y - r < arena.goalBottom && player.position.y > arena.goalBottom - 10) {
          player.position.y = arena.goalBottom + r;
          player.velocity.y = Math.max(0, player.velocity.y);
        }
      }
    }

    // Right goal net enclosure (between x: arena.width and arena.width + gd, and y: goalTop and goalBottom)
    if (player.position.x > arena.width && player.position.x < arena.width + gd + r) {
      if (inGoalY) {
        // Inside goal net: stop at back of net
        if (player.position.x + r > arena.width + gd) {
          player.position.x = arena.width + gd - r;
          player.velocity.x = Math.min(0, player.velocity.x);
        }
      } else {
        // Outside goal net: prevent walking through top or bottom net walls
        if (player.position.y + r > arena.goalTop && player.position.y < arena.goalTop + 10) {
          player.position.y = arena.goalTop - r;
          player.velocity.y = Math.min(0, player.velocity.y);
        } else if (player.position.y - r < arena.goalBottom && player.position.y > arena.goalBottom - 10) {
          player.position.y = arena.goalBottom + r;
          player.velocity.y = Math.max(0, player.velocity.y);
        }
      }
    }
  }
}