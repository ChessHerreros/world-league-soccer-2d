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
    const width = 1300;
    const height = 750;
    const arenaRadius = 22;
    const ballRadius = 13;

    // Update Ball Physics
    room.ball.x += room.ball.vx * TICK;
    room.ball.y += room.ball.vy * TICK;
    room.ball.vx *= Math.pow(0.98, TICK * 60);
    room.ball.vy *= Math.pow(0.98, TICK * 60);

    // Ball Arena Collisions
    if (room.ball.y - ballRadius < 0) { room.ball.y = ballRadius; room.ball.vy *= -0.7; }
    if (room.ball.y + ballRadius > height) { room.ball.y = height - ballRadius; room.ball.vy *= -0.7; }
    if (room.ball.x - ballRadius < 0 && (room.ball.y < 255 || room.ball.y > 495)) { room.ball.x = ballRadius; room.ball.vx *= -0.7; }
    if (room.ball.x + ballRadius > width && (room.ball.y < 255 || room.ball.y > 495)) { room.ball.x = width - ballRadius; room.ball.vx *= -0.7; }

    // Check Goals
    if (room.ball.x < -ballRadius && room.ball.y >= 255 && room.ball.y <= 495) {
      room.redScore++;
      resetPositions(room);
    } else if (room.ball.x > width + ballRadius && room.ball.y >= 255 && room.ball.y <= 495) {
      room.blueScore++;
      resetPositions(room);
    }

    // Update Players
    for (const pid in room.players) {
      const p = room.players[pid];
      const inp = p.input;

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

    // Broadcast room state to all clients in room
    io.to(roomId).emit("roomStateUpdate", room);
  }
}, 1000 / 60);

function resetPositions(room: RoomState): void {
  room.ball.x = 650;
  room.ball.y = 375;
  room.ball.vx = 0;
  room.ball.vy = 0;

  const playerList = Object.values(room.players);
  const blueList = playerList.filter(p => p.team === "blue");
  const redList = playerList.filter(p => p.team === "red");

  blueList.forEach((p, i) => {
    p.x = 280 - i * 60;
    p.y = 375 + (i - (blueList.length - 1) / 2) * 90;
    p.vx = 0; p.vy = 0;
  });

  redList.forEach((p, i) => {
    p.x = 1020 + i * 60;
    p.y = 375 + (i - (redList.length - 1) / 2) * 90;
    p.vx = 0; p.vy = 0;
  });
}

io.on("connection", (socket: Socket) => {
  console.log(`[Multiplayer] Client connected: ${socket.id}`);

  // Create Room
  socket.on("createRoom", (data: { playerName: string; config: any }, callback: (res: any) => void) => {
    const code = generateRoomCode();
    const room: RoomState & { code: string } = {
      id: code,
      code: code,
      hostId: socket.id,
      mode: data.config.mode || "ONLINE",
      status: "lobby",
      blueScore: 0,
      redScore: 0,
      duration: data.config.duration || 180,
      timeRemaining: data.config.duration || 180,
      isExtraTime: false,
      ball: { x: 650, y: 375, vx: 0, vy: 0 },
      players: {
        [socket.id]: {
          id: socket.id,
          socketId: socket.id,
          name: data.playerName || "Player 1",
          team: "blue",
          x: 280,
          y: 375,
          vx: 0,
          vy: 0,
          stamina: 100,
          isSprinting: false,
          jerseyNumber: data.config.jerseyNumber || 10,
          badgeEmoji: data.config.badgeEmoji || "",
          customColor: data.config.customColor || null,
          borderStyle: data.config.borderStyle || "classic",
          pattern: data.config.pattern || "spain",
          input: { moveX: 0, moveY: 0, sprint: false, kick: false, dribble: null, dash: false }
        }
      }
    };

    rooms[code] = room;
    socket.join(code);
    callback({ success: true, roomCode: code, room });
  });

  // Join Room with Code
  socket.on("joinRoom", (data: { roomCode: string; playerName: string; config: any }, callback: (res: any) => void) => {
    const code = data.roomCode.toUpperCase().trim();
    const room = rooms[code];

    if (!room) {
      return callback({ success: false, message: "¡Código de sala no encontrado!" });
    }

    // Determine team balancing
    const playerList = Object.values(room.players);
    const blueCount = playerList.filter(p => p.team === "blue").length;
    const redCount = playerList.filter(p => p.team === "red").length;
    const assignedTeam: "blue" | "red" = blueCount <= redCount ? "blue" : "red";

    const newPlayer: RoomPlayer = {
      id: socket.id,
      socketId: socket.id,
      name: data.playerName || `Player ${playerList.length + 1}`,
      team: assignedTeam,
      x: assignedTeam === "blue" ? 280 : 1020,
      y: 375,
      vx: 0,
      vy: 0,
      stamina: 100,
      isSprinting: false,
      jerseyNumber: data.config.jerseyNumber || (assignedTeam === "blue" ? 7 : 9),
      badgeEmoji: data.config.badgeEmoji || "",
      customColor: data.config.customColor || null,
      borderStyle: data.config.borderStyle || "classic",
      pattern: data.config.pattern || "spain",
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

  // Receive Player Inputs
  socket.on("playerInput", (data: { roomCode: string; input: PlayerInput }) => {
    const room = rooms[data.roomCode];
    if (room && room.players[socket.id]) {
      room.players[socket.id].input = data.input;
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
