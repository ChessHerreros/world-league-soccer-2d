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
    socket.emit("createRoom", { playerName, config }, (res: any) => {
      if (res && res.success) {
        this.currentRoomCode = res.roomCode;
      }
      callback(res);
    });
  }

  joinRoom(roomCode: string, playerName: string, config: any, callback: (res: any) => void): void {
    const socket = this.connect();
    const cleanCode = (roomCode || "").toUpperCase().trim();
    socket.emit("joinRoom", { roomCode: cleanCode, playerName, config }, (res: any) => {
      if (res && res.success) {
        this.currentRoomCode = res.roomCode;
      }
      callback(res);
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

  onRoomStateUpdate(cb: (state: any) => void): void {
    this.socket?.on("roomStateUpdate", cb);
  }
}
