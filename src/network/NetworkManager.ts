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
      // If no serverUrl provided, detect host dynamically so local network / friends can connect
      const host = window.location.hostname || "localhost";
      const targetUrl = serverUrl || `http://${host}:3001`;
      
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
      if (res.success) {
        this.currentRoomCode = res.roomCode;
      }
      callback(res);
    });
  }

  joinRoom(roomCode: string, playerName: string, config: any, callback: (res: any) => void): void {
    const socket = this.connect();
    socket.emit("joinRoom", { roomCode, playerName, config }, (res: any) => {
      if (res.success) {
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

  onRoomStateUpdate(cb: (room: any) => void): void {
    this.socket?.on("roomStateUpdate", cb);
  }
}
