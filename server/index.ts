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
  jerseyNumber: number;
  badgeEmoji: string;
  customColor: string | null;
  borderStyle: string;
  pattern: string;
  input: PlayerInput;
}

interface RoomState {
  id: string;
  hostId: string;
  mode: string;
  status: "lobby" | "playing";
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

// 60 FPS Game Loop for Active Multiplayer Rooms
const TICK = 1 / 60;
setInterval(() => {
  for (const roomId in rooms) {
    const room = rooms[roomId];
    if (room.status !== "playing") continue;

    // Update match time
    if (room.isExtraTime) {
      // Golden Goal
    } else if (room.duration > 0) {
      room.timeRemaining = Math.max(0, room.timeRemaining - TICK);
      if (room.timeRemaining <= 0) {
        if (room.blueScore === room.redScore) {
          room.isExtraTime = true;
        }
      }
    }

    // Physics Update on Server
    const width = 1000;
    const height = 600;
    const goalWidth = 200;
    const goalTop = (height - goalWidth) / 2;
    const goalBottom = goalTop + goalWidth;
    const goalDepth = 65;
    const arenaRadius = 22;
    const ballRadius = 13;

    // Update Ball Physics
    room.ball.x += room.ball.vx * TICK;
    room.ball.y += room.ball.vy * TICK;
    room.ball.vx *= Math.pow(0.98, TICK * 60);
    room.ball.vy *= Math.pow(0.98, TICK * 60);

    // Ball Arena & Goal Net Collisions
    if (room.ball.y - ballRadius < 0) { room.ball.y = ballRadius; room.ball.vy = Math.abs(room.ball.vy) * 0.7; }
    if (room.ball.y + ballRadius > height) { room.ball.y = height - ballRadius; room.ball.vy = -Math.abs(room.ball.vy) * 0.7; }

    const inGoalY = room.ball.y >= goalTop && room.ball.y <= goalBottom;

    if (!inGoalY && room.ball.x - ballRadius < 0) {
      room.ball.x = ballRadius;
      room.ball.vx = Math.abs(room.ball.vx) * 0.7;
    } else if (inGoalY && room.ball.x - ballRadius < -goalDepth) {
      room.ball.x = -goalDepth + ballRadius;
      room.ball.vx = Math.abs(room.ball.vx) * 0.35;
    }

    if (!inGoalY && room.ball.x + ballRadius > width) {
      room.ball.x = width - ballRadius;
      room.ball.vx = -Math.abs(room.ball.vx) * 0.7;
    } else if (inGoalY && room.ball.x + ballRadius > width + goalDepth) {
      room.ball.x = width + goalDepth - ballRadius;
      room.ball.vx = -Math.abs(room.ball.vx) * 0.35;
    }

    // Top/Bottom net walls for deep goals
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

    // Check Goals
    if (room.ball.x < -ballRadius && inGoalY) {
      room.redScore++;
      resetPositions(room);
    } else if (room.ball.x > width + ballRadius && inGoalY) {
      room.blueScore++;
      resetPositions(room);
    }

    // Update Players & Skill Moves
    for (const pid in room.players) {
      const p = room.players[pid];
      const inp = p.input;

      // Handle Skill Dribble
      if (inp.dribble && distToBall(p, room.ball) <= arenaRadius + 30) {
        const dx = room.ball.x - p.x;
        const dy = room.ball.y - p.y;
        const distance = Math.hypot(dx, dy) || 1;
        let fx = dx / distance;
        let fy = dy / distance;

        const forwardBias = 0.45;
        let dragX = inp.dribble === "left" ? (-fy + fx * forwardBias) : (fy + fx * forwardBias);
        let dragY = inp.dribble === "left" ? (fx + fy * forwardBias) : (-fx + fy * forwardBias);
        const dragLen = Math.hypot(dragX, dragY) || 1;
        dragX /= dragLen; dragY /= dragLen;

        room.ball.vx += dragX * 160;
        room.ball.vy += dragY * 160;
        p.vx += dragX * 45;
        p.vy += dragY * 45;
        inp.dribble = null; // consume
      }

      // Handle Dash Skill Move
      if (inp.dash && p.stamina >= 50) {
        p.stamina = Math.max(0, p.stamina - 50);
        let dx = inp.moveX;
        let dy = inp.moveY;
        const len = Math.hypot(dx, dy);
        if (len < 0.0001) {
          dx = p.team === "blue" ? 1 : -1;
          dy = 0;
        } else {
          dx /= len; dy /= len;
        }
        const dashImpulse = 1050;
        p.vx = dx * dashImpulse;
        p.vy = dy * dashImpulse;
        inp.dash = false; // consume
      }

      const accel = inp.sprint && p.stamina > 2 ? 2400 : 1800;
      const maxSpd = inp.sprint && p.stamina > 2 ? 570 : 420;

      if (inp.sprint && (inp.moveX !== 0 || inp.moveY !== 0) && p.stamina > 2) {
        p.isSprinting = true;
        p.stamina = Math.max(0, p.stamina - 34 * TICK);
      } else {
        p.isSprinting = false;
        p.stamina = Math.min(100, p.stamina + 22 * TICK);
      }

      p.vx += inp.moveX * accel * TICK;
      p.vy += inp.moveY * accel * TICK;

      const spd = Math.hypot(p.vx, p.vy);
      if (spd > maxSpd) {
        p.vx = (p.vx / spd) * maxSpd;
        p.vy = (p.vy / spd) * maxSpd;
      }
      p.vx *= Math.pow(0.82, TICK * 60);
      p.vy *= Math.pow(0.82, TICK * 60);

      p.x += p.vx * TICK;
      p.y += p.vy * TICK;

      // Arena bounds for players
      p.x = Math.max(arenaRadius, Math.min(width - arenaRadius, p.x));
      p.y = Math.max(arenaRadius, Math.min(height - arenaRadius, p.y));

      // Player-Ball Collision & Kicks
      const dx = room.ball.x - p.x;
      const dy = room.ball.y - p.y;
      const dist = Math.hypot(dx, dy);

      if (dist < arenaRadius + ballRadius) {
        const nx = dx / (dist || 1);
        const ny = dy / (dist || 1);
        const overlap = (arenaRadius + ballRadius) - dist;
        room.ball.x += nx * overlap;
        room.ball.y += ny * overlap;

        const kPwr = 480;
        room.ball.vx += nx * kPwr * 0.4;
        room.ball.vy += ny * kPwr * 0.4;
      }

      if (inp.kick && dist <= 48) {
        const nx = dx / (dist || 1);
        const ny = dy / (dist || 1);
        const kPwr = 520;
        room.ball.vx += nx * kPwr;
        room.ball.vy += ny * kPwr;
        inp.kick = false; // consume
      }
    }

    // Inter-Player Collisions on Server
    const playerList = Object.values(room.players);
    for (let i = 0; i < playerList.length; i++) {
      for (let j = i + 1; j < playerList.length; j++) {
        const pA = playerList[i];
        const pB = playerList[j];
        const dx = pB.x - pA.x;
        const dy = pB.y - pA.y;
        const minDist = arenaRadius * 2;
        const distSq = dx * dx + dy * dy;
        if (distSq < minDist * minDist) {
          const dist = Math.sqrt(distSq) || 0.0001;
          const overlap = minDist - dist;
          const nx = dx / dist;
          const ny = dy / dist;
          pA.x -= nx * overlap * 0.5;
          pA.y -= ny * overlap * 0.5;
          pB.x += nx * overlap * 0.5;
          pB.y += ny * overlap * 0.5;
        }
      }
    }

    // Broadcast room state to all clients in room
    io.to(roomId).emit("roomStateUpdate", room);
  }
}, 1000 / 60);

function distToBall(p: RoomPlayer, ball: { x: number; y: number }): number {
  return Math.hypot(ball.x - p.x, ball.y - p.y);
}

function resetPositions(room: RoomState): void {
  const width = 1000;
  const height = 600;

  room.ball.x = width / 2;
  room.ball.y = height / 2;
  room.ball.vx = 0;
  room.ball.vy = 0;

  const playerList = Object.values(room.players);
  const blueList = playerList.filter(p => p.team === "blue");
  const redList = playerList.filter(p => p.team === "red");

  const blueStartX = Math.floor(width * 0.22);
  const redStartX = Math.floor(width * 0.78);

  blueList.forEach((p, i) => {
    p.x = blueStartX - i * 60;
    p.y = height / 2 + (i - (blueList.length - 1) / 2) * 90;
    p.vx = 0; p.vy = 0;
  });

  redList.forEach((p, i) => {
    p.x = redStartX + i * 60;
    p.y = height / 2 + (i - (redList.length - 1) / 2) * 90;
    p.vx = 0; p.vy = 0;
  });
}

io.on("connection", (socket: Socket) => {
  console.log(`[Multiplayer] Client connected: ${socket.id}`);

  // Create Room
  socket.on("createRoom", (data: { playerName: string; peerId?: string; config: any }, callback: (res: any) => void) => {
    const code = generateRoomCode();
    const room: RoomState & { code: string; hostPeerId?: string } = {
      id: code,
      code: code,
      hostId: socket.id,
      hostPeerId: data.peerId,
      mode: data.config?.mode || "ONLINE",
      status: "lobby",
      blueScore: 0,
      redScore: 0,
      duration: data.config?.duration || 180,
      timeRemaining: data.config?.duration || 180,
      isExtraTime: false,
      ball: { x: 500, y: 300, vx: 0, vy: 0 },
      players: {
        [socket.id]: {
          id: socket.id,
          socketId: socket.id,
          name: data.playerName || "Player 1",
          team: "blue",
          x: 220,
          y: 300,
          vx: 0,
          vy: 0,
          stamina: 100,
          isSprinting: false,
          jerseyNumber: data.config?.jerseyNumber || 10,
          badgeEmoji: data.config?.badgeEmoji || "",
          customColor: data.config?.customColor || null,
          borderStyle: data.config?.borderStyle || "classic",
          pattern: data.config?.pattern || "spain",
          input: { moveX: 0, moveY: 0, sprint: false, kick: false, dribble: null, dash: false }
        }
      }
    };

    rooms[code] = room;
    socket.join(code);
    callback({ success: true, roomCode: code, room });
  });

  // Join Room with Code
  socket.on("joinRoom", (data: { roomCode: string; peerId?: string; playerName: string; config: any }, callback: (res: any) => void) => {
    const code = data.roomCode.toUpperCase().trim();
    const room = rooms[code];

    if (!room) {
      return callback({ success: false, message: "¡Código de sala no encontrado!" });
    }

    const playerList = Object.values(room.players);
    const blueCount = playerList.filter(p => p.team === "blue").length;
    const redCount = playerList.filter(p => p.team === "red").length;
    const assignedTeam: "blue" | "red" = blueCount <= redCount ? "blue" : "red";

    const newPlayer: RoomPlayer = {
      id: socket.id,
      socketId: socket.id,
      name: data.playerName || `Player ${playerList.length + 1}`,
      team: assignedTeam,
      x: assignedTeam === "blue" ? 220 : 780,
      y: 300,
      vx: 0,
      vy: 0,
      stamina: 100,
      isSprinting: false,
      jerseyNumber: data.config?.jerseyNumber || (assignedTeam === "blue" ? 7 : 9),
      badgeEmoji: data.config?.badgeEmoji || "",
      customColor: data.config?.customColor || null,
      borderStyle: data.config?.borderStyle || "classic",
      pattern: data.config?.pattern || "spain",
      input: { moveX: 0, moveY: 0, sprint: false, kick: false, dribble: null, dash: false }
    };

    room.players[socket.id] = newPlayer;
    socket.join(code);

    io.to(code).emit("roomUpdated", room);
    callback({ success: true, roomCode: code, room });
  });

  // Switch Team in Lobby
  socket.on("switchTeam", (data: { roomCode: string; team: "blue" | "red" }) => {
    const room = rooms[data.roomCode];
    if (room && room.players[socket.id]) {
      room.players[socket.id].team = data.team;
      io.to(data.roomCode).emit("roomUpdated", room);
    }
  });

  // Host starts game
  socket.on("startGame", (data: { roomCode: string }) => {
    const room = rooms[data.roomCode];
    if (room && room.hostId === socket.id) {
      room.status = "playing";
      resetPositions(room);
      io.to(data.roomCode).emit("gameStarted", room);
    }
  });

  // Relay Host State directly to other players in room
  socket.on("hostStateUpdate", (data: { roomCode: string; state: any }) => {
    socket.to(data.roomCode).emit("hostStateUpdate", data.state);
  });

  // Receive Player Inputs and relay to host
  socket.on("playerInput", (data: { roomCode: string; input: PlayerInput }) => {
    const room = rooms[data.roomCode];
    if (room) {
      if (room.players[socket.id]) {
        room.players[socket.id].input = data.input;
      }
      socket.to(data.roomCode).emit("playerInputRelay", { socketId: socket.id, input: data.input });
    }
  });

  // Handle Disconnect
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
  console.log(`⚽ World of Football Server running on http://localhost:${PORT}`);
});
