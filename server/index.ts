import { Server, Socket } from "socket.io";
import { createServer } from "http";

const PORT = Number(process.env.PORT) || 3001;
const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

interface PlayerInput {
  moveX: number;
  moveY: number;
  sprint: boolean;
  kick: boolean;
  isHoldingSpace: boolean;
  dribble: "left" | "right" | null;
  dash: boolean;
}

interface RoomPlayer {
  id: string;
  socketId: string;
  name: string;
  team: "blue" | "red";
  x: number;
  y: number;
  vx: number;
  vy: number;
  stamina: number;
  isSprinting: boolean;
  isKicking: boolean;
  isCharging: boolean;
  chargeTime: number;
  chargeRatio: number;
  kickCooldown: number;
  dribbleCooldown: number;
  dashCooldown: number;
  dashTimer: number;
  isDashing: boolean;
  jerseyNumber: number;
  badgeEmoji: string;
  customColor: string | null;
  borderStyle: string;
  pattern: string;
  input: PlayerInput;
}

interface RoomState {
  id: string;
  code: string;
  hostId: string;
  status: "lobby" | "countdown" | "playing" | "goal" | "ended";
  countdownTimer: number;
  goalTimer: number;
  lastScorerTeam: "blue" | "red" | null;
  blueScore: number;
  redScore: number;
  duration: number;
  timeRemaining: number;
  isExtraTime: boolean;
  ball: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    chargeRatio: number;
    lastKickerTeam: "blue" | "red" | null;
  };
  players: Record<string, RoomPlayer>;
}

const rooms: Record<string, RoomState> = {};

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return rooms[code] ? generateRoomCode() : code;
}

function resetPositions(room: RoomState): void {
  const width = 1000;
  const height = 600;

  room.ball.x = width / 2;
  room.ball.y = height / 2;
  room.ball.vx = 0;
  room.ball.vy = 0;
  room.ball.chargeRatio = 0;
  room.ball.lastKickerTeam = null;

  const playerList = Object.values(room.players);
  const blueList = playerList.filter(p => p.team === "blue");
  const redList = playerList.filter(p => p.team === "red");

  const blueStartX = Math.floor(width * 0.22);
  const redStartX = Math.floor(width * 0.78);

  blueList.forEach((p, i) => {
    p.x = blueStartX - i * 60;
    p.y = height / 2 + (i - (blueList.length - 1) / 2) * 90;
    p.vx = 0;
    p.vy = 0;
    p.stamina = 100;
    p.chargeRatio = 0;
    p.chargeTime = 0;
    p.isCharging = false;
    p.isKicking = false;
    p.isDashing = false;
    p.dashTimer = 0;
  });

  redList.forEach((p, i) => {
    p.x = redStartX + i * 60;
    p.y = height / 2 + (i - (redList.length - 1) / 2) * 90;
    p.vx = 0;
    p.vy = 0;
    p.stamina = 100;
    p.chargeRatio = 0;
    p.chargeTime = 0;
    p.isCharging = false;
    p.isKicking = false;
    p.isDashing = false;
    p.dashTimer = 0;
  });
}

function resolveCircleCollision(
  a: { x: number; y: number; vx: number; vy: number; radius: number; mass: number },
  b: { x: number; y: number; vx: number; vy: number; radius: number; mass: number },
  restitution: number
): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
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

  a.x -= nx * penetration * (b.mass / totalMass);
  a.y -= ny * penetration * (b.mass / totalMass);
  b.x += nx * penetration * (a.mass / totalMass);
  b.y += ny * penetration * (a.mass / totalMass);

  const relativeVelocity = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (relativeVelocity < 0) {
    const impulse = -(1 + restitution) * relativeVelocity / (1 / a.mass + 1 / b.mass);
    a.vx -= nx * impulse / a.mass;
    a.vy -= ny * impulse / a.mass;
    b.vx += nx * impulse / b.mass;
    b.vy += ny * impulse / b.mass;
  }

  return true;
}

function resolvePostCollision(
  circle: { x: number; y: number; vx: number; vy: number; radius: number },
  post: { x: number; y: number; radius: number },
  restitution: number
): boolean {
  const dx = circle.x - post.x;
  const dy = circle.y - post.y;
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
  circle.x += nx * penetration;
  circle.y += ny * penetration;

  const velDot = circle.vx * nx + circle.vy * ny;
  if (velDot < 0) {
    const impulse = -(1 + restitution) * velDot;
    circle.vx += nx * impulse;
    circle.vy += ny * impulse;
  }

  return true;
}

function resolveCornerCollision(
  circle: { x: number; y: number; vx: number; vy: number; radius: number },
  arenaWidth: number,
  arenaHeight: number,
  cornerSize: number,
  restitution: number
): void {
  const c = cornerSize;
  const r = circle.radius;
  const invSqrt2 = 0.70710678;

  // 1. Top-Left
  let distTL = circle.x * invSqrt2 + (circle.y - c) * invSqrt2;
  if (distTL < r) {
    const penetration = r - distTL;
    circle.x += invSqrt2 * penetration;
    circle.y += invSqrt2 * penetration;
    const velDot = circle.vx * invSqrt2 + circle.vy * invSqrt2;
    if (velDot < 0) {
      const impulse = -(1 + restitution) * velDot;
      circle.vx += invSqrt2 * impulse;
      circle.vy += invSqrt2 * impulse;
    }
  }

  // 2. Top-Right
  let distTR = (circle.x - arenaWidth) * -invSqrt2 + (circle.y - c) * invSqrt2;
  if (distTR < r) {
    const penetration = r - distTR;
    circle.x -= invSqrt2 * penetration;
    circle.y += invSqrt2 * penetration;
    const velDot = circle.vx * -invSqrt2 + circle.vy * invSqrt2;
    if (velDot < 0) {
      const impulse = -(1 + restitution) * velDot;
      circle.vx -= invSqrt2 * impulse;
      circle.vy += invSqrt2 * impulse;
    }
  }

  // 3. Bottom-Left
  let distBL = circle.x * invSqrt2 + (circle.y - (arenaHeight - c)) * -invSqrt2;
  if (distBL < r) {
    const penetration = r - distBL;
    circle.x += invSqrt2 * penetration;
    circle.y -= invSqrt2 * penetration;
    const velDot = circle.vx * invSqrt2 + circle.vy * -invSqrt2;
    if (velDot < 0) {
      const impulse = -(1 + restitution) * velDot;
      circle.vx += invSqrt2 * impulse;
      circle.vy -= invSqrt2 * impulse;
    }
  }

  // 4. Bottom-Right
  let distBR = (circle.x - arenaWidth) * -invSqrt2 + (circle.y - (arenaHeight - c)) * -invSqrt2;
  if (distBR < r) {
    const penetration = r - distBR;
    circle.x -= invSqrt2 * penetration;
    circle.y -= invSqrt2 * penetration;
    const velDot = circle.vx * -invSqrt2 + circle.vy * -invSqrt2;
    if (velDot < 0) {
      const impulse = -(1 + restitution) * velDot;
      circle.vx -= invSqrt2 * impulse;
      circle.vy -= invSqrt2 * impulse;
    }
  }
}

// 60 FPS Centralized Authoritative Game Loop
const TICK = 1 / 60;
setInterval(() => {
  for (const code in rooms) {
    const room = rooms[code];
    if (room.status === "lobby" || room.status === "ended") continue;

    // A. COUNTDOWN PHASE (3, 2, 1, ¡GO!)
    if (room.status === "countdown") {
      resetPositions(room);
      room.countdownTimer -= TICK;
      if (room.countdownTimer <= 0) {
        room.status = "playing";
        room.countdownTimer = 0;
      }
      io.to(code).emit("roomStateUpdate", room);
      continue;
    }

    // B. GOAL CELEBRATION & REPLAY PHASE
    if (room.status === "goal") {
      resetPositions(room);
      room.goalTimer -= TICK;
      if (room.goalTimer <= 0) {
        room.status = "countdown";
        room.countdownTimer = 3.8;
        room.goalTimer = 0;
        resetPositions(room);
      }
      io.to(code).emit("roomStateUpdate", room);
      continue;
    }

    // C. ACTIVE PLAYING PHASE
    // 1. Update Match Clock on Server (ONLY WHEN PLAYING!)
    if (room.isExtraTime) {
      // Golden Goal (first goal wins)
    } else if (room.duration > 0) {
      room.timeRemaining = Math.max(0, room.timeRemaining - TICK);
      if (room.timeRemaining <= 0) {
        if (room.blueScore === room.redScore) {
          room.isExtraTime = true;
        } else {
          room.status = "ended";
          const winner = room.blueScore > room.redScore ? "blue" : "red";
          io.to(code).emit("matchEnded", {
            winner,
            blueScore: room.blueScore,
            redScore: room.redScore,
          });
          io.to(code).emit("roomStateUpdate", room);
          continue;
        }
      }
    }

    // 2. Arena Dimensions & Parameters
    const width = 1000;
    const height = 600;
    const goalWidth = 200;
    const goalTop = (height - goalWidth) / 2;
    const goalBottom = goalTop + goalWidth;
    const goalDepth = 65;
    const cornerSize = 42;
    const postRadius = 8.5;
    const playerRadius = 22;
    const ballRadius = 13;
    const kickRadius = 45;

    const posts = [
      { x: 0, y: goalTop, radius: postRadius },
      { x: 0, y: goalBottom, radius: postRadius },
      { x: width, y: goalTop, radius: postRadius },
      { x: width, y: goalBottom, radius: postRadius },
    ];

    // 3. Update Ball Physics
    room.ball.x += room.ball.vx * TICK;
    room.ball.y += room.ball.vy * TICK;
    room.ball.vx *= Math.pow(0.992, TICK * 60);
    room.ball.vy *= Math.pow(0.992, TICK * 60);

    // Goal posts collision with ball
    for (const post of posts) {
      resolvePostCollision(
        { x: room.ball.x, y: room.ball.y, vx: room.ball.vx, vy: room.ball.vy, radius: ballRadius },
        post,
        0.88
      );
    }

    // Corner chamfer diagonal walls
    resolveCornerCollision(
      { x: room.ball.x, y: room.ball.y, vx: room.ball.vx, vy: room.ball.vy, radius: ballRadius },
      width,
      height,
      cornerSize,
      0.86
    );

    // Boundary walls collision
    const ballInGoalY = room.ball.y >= goalTop && room.ball.y <= goalBottom;

    if (room.ball.y - ballRadius < 0) {
      room.ball.y = ballRadius;
      room.ball.vy = Math.abs(room.ball.vy) * 0.86;
    }
    if (room.ball.y + ballRadius > height) {
      room.ball.y = height - ballRadius;
      room.ball.vy = -Math.abs(room.ball.vy) * 0.86;
    }

    if (!ballInGoalY && room.ball.x - ballRadius < 0) {
      room.ball.x = ballRadius;
      room.ball.vx = Math.abs(room.ball.vx) * 0.86;
    } else if (ballInGoalY && room.ball.x - ballRadius < -goalDepth) {
      room.ball.x = -goalDepth + ballRadius;
      room.ball.vx = Math.abs(room.ball.vx) * 0.35;
    }

    if (!ballInGoalY && room.ball.x + ballRadius > width) {
      room.ball.x = width - ballRadius;
      room.ball.vx = -Math.abs(room.ball.vx) * 0.86;
    } else if (ballInGoalY && room.ball.x + ballRadius > width + goalDepth) {
      room.ball.x = width + goalDepth - ballRadius;
      room.ball.vx = -Math.abs(room.ball.vx) * 0.35;
    }

    // Top/Bottom net walls inside goals
    if (room.ball.x < 0 || room.ball.x > width) {
      if (room.ball.y - ballRadius < goalTop) {
        room.ball.y = goalTop + ballRadius;
        room.ball.vy = Math.abs(room.ball.vy) * 0.4;
      }
      if (room.ball.y + ballRadius > goalBottom) {
        room.ball.y = goalBottom - ballRadius;
        room.ball.vy = -Math.abs(room.ball.vy) * 0.4;
      }
    }

    // Check Goal Scoring
    if (room.ball.x < -ballRadius && ballInGoalY) {
      room.redScore++;
      room.lastScorerTeam = "red";
      if (room.isExtraTime || room.redScore >= 5) {
        room.status = "ended";
        const winner = room.blueScore > room.redScore ? "blue" : "red";
        io.to(code).emit("matchEnded", {
          winner,
          blueScore: room.blueScore,
          redScore: room.redScore,
        });
      } else {
        room.status = "goal";
        room.goalTimer = 6.8; // 1.6s goal banner + 5.2s slow-mo replay
        resetPositions(room);
      }
      io.to(code).emit("roomStateUpdate", room);
      continue;
    } else if (room.ball.x > width + ballRadius && ballInGoalY) {
      room.blueScore++;
      room.lastScorerTeam = "blue";
      if (room.isExtraTime || room.blueScore >= 5) {
        room.status = "ended";
        const winner = room.blueScore > room.redScore ? "blue" : "red";
        io.to(code).emit("matchEnded", {
          winner,
          blueScore: room.blueScore,
          redScore: room.redScore,
        });
      } else {
        room.status = "goal";
        room.goalTimer = 6.8; // 1.6s goal banner + 5.2s slow-mo replay
        resetPositions(room);
      }
      io.to(code).emit("roomStateUpdate", room);
      continue;
    }

    // 4. Update Players Physics, Cooldowns, Charge & Inputs
    let highestCharge = 0;

    for (const socketId in room.players) {
      const p = room.players[socketId];
      const inp = p.input;

      p.kickCooldown = Math.max(0, p.kickCooldown - TICK);
      p.dribbleCooldown = Math.max(0, p.dribbleCooldown - TICK);
      p.dashCooldown = Math.max(0, p.dashCooldown - TICK);

      if (p.dashTimer > 0) {
        p.dashTimer = Math.max(0, p.dashTimer - TICK);
        if (p.dashTimer <= 0) {
          p.isDashing = false;
        }
      }

      const dxToBall = room.ball.x - p.x;
      const dyToBall = room.ball.y - p.y;
      const distToBall = Math.hypot(dxToBall, dyToBall);
      const nearBall = distToBall <= kickRadius;

      // Charge Logic (Exponential power buildup when near ball, reset when holding space)
      if (inp.isHoldingSpace) {
        p.isCharging = false;
        p.isKicking = true;
      } else if (nearBall) {
        p.isCharging = true;
        p.isKicking = false;
        p.chargeTime += TICK;
        const normalizedTime = Math.min(1, p.chargeTime / 0.75);
        p.chargeRatio = (Math.exp(2.2 * normalizedTime) - 1) / (Math.exp(2.2) - 1);
      } else {
        p.isCharging = false;
        p.isKicking = false;
        p.chargeTime = 0;
        p.chargeRatio = 0;
      }

      if (p.chargeRatio > highestCharge) {
        highestCharge = p.chargeRatio;
      }

      // Handle Skill Dribble (Q / E)
      if (inp.dribble) {
        if (p.dribbleCooldown <= 0 && distToBall <= kickRadius + 26) {
          p.dribbleCooldown = 0.55;
          let fx = dxToBall;
          let fy = dyToBall;
          if (distToBall < 0.0001) {
            fx = p.team === "blue" ? 1 : -1;
            fy = 0;
          } else {
            fx /= distToBall;
            fy /= distToBall;
          }

          // Perpendicular vector calculation in screen coordinates (+Y is down):
          // LEFT turn (-90 deg) is (fy, -fx)
          // RIGHT turn (+90 deg) is (-fy, fx)
          const forwardBias = 0.45;
          let dragX = inp.dribble === "left" ? (fy + fx * forwardBias) : (-fy + fx * forwardBias);
          let dragY = inp.dribble === "left" ? (-fx + fy * forwardBias) : (fx + fy * forwardBias);
          const dragLen = Math.hypot(dragX, dragY) || 1;
          dragX /= dragLen;
          dragY /= dragLen;

          const dragPower = 160;
          room.ball.vx += dragX * dragPower;
          room.ball.vy += dragY * dragPower;
          p.vx += dragX * 45;
          p.vy += dragY * 45;
        }
        inp.dribble = null;
      }

      // Handle Dash Skill Move (C)
      if (inp.dash) {
        if (p.stamina >= 50 && !p.isDashing) {
          p.stamina = Math.max(0, p.stamina - 50);
          p.isDashing = true;
          p.dashTimer = 0.11;

          let dx = inp.moveX;
          let dy = inp.moveY;
          const len = Math.hypot(dx, dy);
          if (len < 0.0001) {
            dx = p.team === "blue" ? 1 : -1;
            dy = 0;
          } else {
            dx /= len;
            dy /= len;
          }

          const dashImpulse = 1050;
          p.vx = dx * dashImpulse;
          p.vy = dy * dashImpulse;
        }
        inp.dash = false;
      }

      // Movement & Sprint
      const isMoving = Math.hypot(inp.moveX, inp.moveY) > 0.1;
      const accel = inp.sprint && p.stamina > 2 ? 2400 : 1800;
      const maxSpd = inp.sprint && p.stamina > 2 ? 570 : 420;

      if (inp.sprint && isMoving && p.stamina > 2) {
        p.isSprinting = true;
        p.stamina = Math.max(0, p.stamina - 34 * TICK);
      } else {
        p.isSprinting = false;
        p.stamina = Math.min(100, p.stamina + 22 * TICK);
      }

      if (!p.isDashing) {
        p.vx += inp.moveX * accel * TICK;
        p.vy += inp.moveY * accel * TICK;

        const spd = Math.hypot(p.vx, p.vy);
        if (spd > maxSpd) {
          p.vx = (p.vx / spd) * maxSpd;
          p.vy = (p.vy / spd) * maxSpd;
        }
        p.vx *= Math.pow(0.82, TICK * 60);
        p.vy *= Math.pow(0.82, TICK * 60);
      }

      p.x += p.vx * TICK;
      p.y += p.vy * TICK;

      // Arena bounds for players (allowing entry inside goal nets)
      const pInGoalY = p.y >= goalTop && p.y <= goalBottom;
      if (!pInGoalY && p.x - playerRadius < 0) {
        p.x = playerRadius;
        p.vx = Math.max(0, p.vx);
      } else if (pInGoalY && p.x - playerRadius < -goalDepth + 10) {
        p.x = -goalDepth + 10 + playerRadius;
        p.vx = Math.max(0, p.vx);
      }

      if (!pInGoalY && p.x + playerRadius > width) {
        p.x = width - playerRadius;
        p.vx = Math.min(0, p.vx);
      } else if (pInGoalY && p.x + playerRadius > width + goalDepth - 10) {
        p.x = width + goalDepth - 10 - playerRadius;
        p.vx = Math.min(0, p.vx);
      }

      if (p.x < 0 || p.x > width) {
        if (p.y - playerRadius < goalTop) {
          p.y = goalTop + playerRadius;
          p.vy = Math.max(0, p.vy);
        }
        if (p.y + playerRadius > goalBottom) {
          p.y = goalBottom - playerRadius;
          p.vy = Math.min(0, p.vy);
        }
      }

      p.y = Math.max(playerRadius, Math.min(height - playerRadius, p.y));

      // Post collisions for players
      for (const post of posts) {
        resolvePostCollision(
          { x: p.x, y: p.y, vx: p.vx, vy: p.vy, radius: playerRadius },
          post,
          0.3
        );
      }

      // Player-Ball Collision (Passive Touch)
      const ballBallColl = {
        x: p.x,
        y: p.y,
        vx: p.vx,
        vy: p.vy,
        radius: playerRadius,
        mass: 1
      };
      const bColl = {
        x: room.ball.x,
        y: room.ball.y,
        vx: room.ball.vx,
        vy: room.ball.vy,
        radius: ballRadius,
        mass: 0.55
      };
      const restitution = p.isDashing ? 0.28 : 0.72;

      if (resolveCircleCollision(ballBallColl, bColl, restitution)) {
        p.x = ballBallColl.x;
        p.y = ballBallColl.y;
        p.vx = ballBallColl.vx;
        p.vy = ballBallColl.vy;

        room.ball.x = bColl.x;
        room.ball.y = bColl.y;
        room.ball.vx = bColl.vx;
        room.ball.vy = bColl.vy;
        room.ball.lastKickerTeam = p.team;

        if (p.isDashing) {
          const bSpeed = Math.hypot(room.ball.vx, room.ball.vy);
          if (bSpeed > 520) {
            room.ball.vx = (room.ball.vx / bSpeed) * 520;
            room.ball.vy = (room.ball.vy / bSpeed) * 520;
          }
        }
      }

      // Space Kick Action with Full Charge Multiplier
      const shouldKick = (inp.kick || (inp.isHoldingSpace && nearBall)) && p.kickCooldown <= 0 && distToBall <= kickRadius;
      if (shouldKick) {
        let dirX = dxToBall;
        let dirY = dyToBall;
        if (distToBall < 0.0001) {
          dirX = p.team === "blue" ? 1 : -1;
          dirY = 0;
        } else {
          dirX /= distToBall;
          dirY /= distToBall;
        }

        const currentCharge = p.chargeRatio;
        const powerMultiplier = 1 + currentCharge * 0.65;
        const strength = 380 * powerMultiplier * (1 - (distToBall / kickRadius) * 0.2);

        room.ball.lastKickerTeam = p.team;
        room.ball.vx += dirX * strength;
        room.ball.vy += dirY * strength;

        const recoil = 35 * powerMultiplier;
        p.vx -= dirX * recoil;
        p.vy -= dirY * recoil;

        p.kickCooldown = 0.22;
        p.chargeRatio = 0;
        p.chargeTime = 0;
        p.isCharging = false;
        p.isKicking = false;
        inp.kick = false;
      } else if (inp.kick) {
        inp.kick = false;
      }
    }

    room.ball.chargeRatio = highestCharge;

    // 5. Inter-Player Collisions on Server
    const playerList = Object.values(room.players);
    for (let i = 0; i < playerList.length; i++) {
      for (let j = i + 1; j < playerList.length; j++) {
        const pA = playerList[i];
        const pB = playerList[j];
        const collA = { x: pA.x, y: pA.y, vx: pA.vx, vy: pA.vy, radius: playerRadius, mass: 1 };
        const collB = { x: pB.x, y: pB.y, vx: pB.vx, vy: pB.vy, radius: playerRadius, mass: 1 };

        if (resolveCircleCollision(collA, collB, 0.2)) {
          pA.x = collA.x; pA.y = collA.y; pA.vx = collA.vx; pA.vy = collA.vy;
          pB.x = collB.x; pB.y = collB.y; pB.vx = collB.vx; pB.vy = collB.vy;
        }
      }
    }

    // 6. Broadcast Authoritative Game State ONLY to Clients in THIS Room
    io.to(code).emit("roomStateUpdate", room);
  }
}, 1000 / 60);

// Socket.io Connection & Room Handlers
io.on("connection", (socket: Socket) => {
  console.log(`[Multiplayer] Client connected: ${socket.id}`);

  // Create Room
  socket.on("createRoom", (data: { playerName: string; config: any }, callback: (res: any) => void) => {
    const code = generateRoomCode();
    const cfg = data.config || {};
    const room: RoomState = {
      id: code,
      code: code,
      hostId: socket.id,
      status: "lobby",
      countdownTimer: 0,
      goalTimer: 0,
      lastScorerTeam: null,
      blueScore: 0,
      redScore: 0,
      duration: cfg.duration || 180,
      timeRemaining: cfg.duration || 180,
      isExtraTime: false,
      ball: { x: 500, y: 300, vx: 0, vy: 0, chargeRatio: 0, lastKickerTeam: null },
      players: {
        [socket.id]: {
          id: socket.id,
          socketId: socket.id,
          name: data.playerName || "Host",
          team: "blue",
          x: 220,
          y: 300,
          vx: 0,
          vy: 0,
          stamina: 100,
          isSprinting: false,
          isKicking: false,
          isCharging: false,
          chargeTime: 0,
          chargeRatio: 0,
          kickCooldown: 0,
          dribbleCooldown: 0,
          dashCooldown: 0,
          dashTimer: 0,
          isDashing: false,
          jerseyNumber: cfg.jerseyNumber || 10,
          badgeEmoji: cfg.badgeEmoji || "",
          customColor: cfg.customColor || null,
          borderStyle: cfg.borderStyle || "classic",
          pattern: cfg.pattern || "spain",
          input: { moveX: 0, moveY: 0, sprint: false, kick: false, isHoldingSpace: false, dribble: null, dash: false }
        }
      }
    };

    rooms[code] = room;
    socket.join(code);
    callback({ success: true, roomCode: code, room });
  });

  // Join Room
  socket.on("joinRoom", (data: { roomCode: string; playerName: string; config: any }, callback: (res: any) => void) => {
    const code = (data.roomCode || "").toUpperCase().trim();
    const room = rooms[code];

    if (!room) {
      return callback({ success: false, message: "¡Código de sala no encontrado!" });
    }

    const cfg = data.config || {};
    const playerList = Object.values(room.players);
    const blueCount = playerList.filter(p => p.team === "blue").length;
    const redCount = playerList.filter(p => p.team === "red").length;
    const assignedTeam: "blue" | "red" = blueCount <= redCount ? "blue" : "red";

    const newPlayer: RoomPlayer = {
      id: socket.id,
      socketId: socket.id,
      name: data.playerName || `Jugador ${playerList.length + 1}`,
      team: assignedTeam,
      x: assignedTeam === "blue" ? 220 : 780,
      y: 300,
      vx: 0,
      vy: 0,
      stamina: 100,
      isSprinting: false,
      isKicking: false,
      isCharging: false,
      chargeTime: 0,
      chargeRatio: 0,
      kickCooldown: 0,
      dribbleCooldown: 0,
      dashCooldown: 0,
      dashTimer: 0,
      isDashing: false,
      jerseyNumber: cfg.jerseyNumber || (assignedTeam === "blue" ? 7 : 9),
      badgeEmoji: cfg.badgeEmoji || "",
      customColor: cfg.customColor || null,
      borderStyle: cfg.borderStyle || "classic",
      pattern: cfg.pattern || "spain",
      input: { moveX: 0, moveY: 0, sprint: false, kick: false, isHoldingSpace: false, dribble: null, dash: false }
    };

    room.players[socket.id] = newPlayer;
    socket.join(code);

    io.to(code).emit("roomUpdated", room);
    callback({ success: true, roomCode: code, room });
  });

  // Switch Team in Lobby
  socket.on("switchTeam", (data: { roomCode: string; team: "blue" | "red" }) => {
    const code = (data.roomCode || "").toUpperCase().trim();
    const room = rooms[code];
    if (room && room.players[socket.id]) {
      room.players[socket.id].team = data.team;
      io.to(code).emit("roomUpdated", room);
    }
  });

  // Host Starts Match
  socket.on("startGame", (data: { roomCode: string }) => {
    const code = (data.roomCode || "").toUpperCase().trim();
    const room = rooms[code];
    if (room && room.hostId === socket.id) {
      room.status = "countdown";
      room.countdownTimer = 3.8;
      room.goalTimer = 0;
      room.timeRemaining = room.duration || 180;
      resetPositions(room);
      io.to(code).emit("gameStarted", room);
      io.to(code).emit("roomStateUpdate", room);
    }
  });

  // Receive Player Controls/Input (Isolated per room)
  socket.on("playerInput", (data: { roomCode: string; input: PlayerInput }) => {
    const code = (data.roomCode || "").toUpperCase().trim();
    const room = rooms[code];
    if (room && room.players[socket.id] && data.input) {
      const prev = room.players[socket.id].input;
      // One-shot impulses (dribble, kick, dash) must NOT be clobbered by empty frames before server tick consumes them!
      const preservedDribble = data.input.dribble || prev?.dribble || null;
      const preservedKick = data.input.kick || prev?.kick || false;
      const preservedDash = data.input.dash || prev?.dash || false;

      room.players[socket.id].input = {
        ...data.input,
        dribble: preservedDribble,
        kick: preservedKick,
        dash: preservedDash,
      };
    }
  });

  // Handle Disconnection
  socket.on("disconnect", () => {
    for (const code in rooms) {
      const room = rooms[code];
      if (room.players[socket.id]) {
        delete room.players[socket.id];
        if (Object.keys(room.players).length === 0) {
          delete rooms[code];
        } else {
          if (room.hostId === socket.id) {
            room.hostId = Object.keys(room.players)[0];
          }
          io.to(code).emit("roomUpdated", room);
        }
      }
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`⚽ World League Soccer Authoritative Server running on port ${PORT}`);
});
