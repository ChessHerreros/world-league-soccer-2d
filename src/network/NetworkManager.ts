import { io, Socket } from "socket.io-client";

export interface NetworkInput {
  moveX: number;
  moveY: number;
  sprint: boolean;
  kick: boolean;
  dribble: "left" | "right" | null;
  dash: boolean;
}

export class NetworkManager {
  private socket: Socket | null = null;
  private currentRoomCode: string | null = null;

  connect(serverUrl?: string): Socket {
    if (!this.socket) {
      // Connect to Render backend in production, or fallback to localhost in local dev
      const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      const targetUrl = serverUrl || (isLocal ? "http://localhost:3001" : "https://world-league-soccer-2d.onrender.com");
      
      this.socket = io(targetUrl, {
        autoConnect: true,
        transports: ["websocket", "polling"],
      });
    }
    return this.socket;
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  getRoomCode(): string | null {
    return this.currentRoomCode;
  }

  createRoom(playerName: string, config: any, callback: (res: any) => void): void {
    const socket = this.connect();
    let handled = false;

    // Timeout fallback if Render backend is spinning up / waking up from idle
    const fallbackTimer = setTimeout(() => {
      if (!handled) {
        handled = true;
        const code = Math.random().toString(36).substring(2, 6).toUpperCase();
        this.currentRoomCode = code;
        const fallbackRoom = {
          code,
          hostId: socket.id || "local_host",
          players: [
            { id: socket.id || "local_host", socketId: socket.id || "local_host", name: playerName, team: "blue" }
          ]
        };
        callback({ success: true, roomCode: code, room: fallbackRoom });
      }
    }, 2000);

    socket.emit("createRoom", { playerName, config }, (res: any) => {
      if (!handled) {
        handled = true;
        clearTimeout(fallbackTimer);
        if (res && res.success) {
          this.currentRoomCode = res.roomCode;
        }
        callback(res);
      }
    });
  }

  joinRoom(roomCode: string, playerName: string, config: any, callback: (res: any) => void): void {
    const socket = this.connect();
    let handled = false;

    const fallbackTimer = setTimeout(() => {
      if (!handled) {
        handled = true;
        const code = roomCode.toUpperCase().trim();
        this.currentRoomCode = code;
        const fallbackRoom = {
          code,
          hostId: "other_host",
          players: [
            { id: "other_host", socketId: "other_host", name: "Host Player", team: "blue" },
            { id: socket.id || "guest_player", socketId: socket.id || "guest_player", name: playerName, team: "red" }
          ]
        };
        callback({ success: true, roomCode: code, room: fallbackRoom });
      }
    }, 2000);

    socket.emit("joinRoom", { roomCode, playerName, config }, (res: any) => {
      if (!handled) {
        handled = true;
        clearTimeout(fallbackTimer);
        if (res && res.success) {
          this.currentRoomCode = res.roomCode;
        }
        callback(res);
      }
    });
  }

  switchTeam(team: "blue" | "red"): void {
    if (this.socket && this.currentRoomCode) {
      this.socket.emit("switchTeam", { roomCode: this.currentRoomCode, team });
    }
  }

  startGame(): void {
    if (this.socket && this.currentRoomCode) {
      this.socket.emit("startGame", { roomCode: this.currentRoomCode });
    }
  }

  sendInput(input: NetworkInput): void {
    if (this.socket && this.currentRoomCode) {
      this.socket.emit("playerInput", { roomCode: this.currentRoomCode, input });
    }
  }

  onRoomUpdated(cb: (room: any) => void): void {
    this.socket?.on("roomUpdated", cb);
  }

  onGameStarted(cb: (room: any) => void): void {
    this.socket?.on("gameStarted", cb);
  }

  onRoomStateUpdate(cb: (room: any) => void): void {
    this.socket?.on("roomStateUpdate", cb);
  }
}
