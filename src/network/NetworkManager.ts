import { io, Socket } from "socket.io-client";
import Peer, { DataConnection } from "peerjs";

export interface NetworkInput {
  moveX: number;
  moveY: number;
  sprint: boolean;
  kick: boolean;
  dribble: "left" | "right" | null;
  dash: boolean;
}

export interface P2PRoomPlayer {
  id: string;
  peerId?: string;
  socketId?: string;
  name: string;
  team: "blue" | "red";
  jerseyNumber: number;
  badgeEmoji?: string;
  customColor?: string | null;
  borderStyle?: string;
  pattern?: string;
}

export class NetworkManager {
  private socket: Socket | null = null;
  private peer: Peer | null = null;
  private p2pConnection: DataConnection | null = null;
  private currentRoomCode: string | null = null;
  private isHost: boolean = false;
  private localPeerId: string | null = null;

  private onRoomUpdatedCb: ((room: any) => void) | null = null;
  private onGameStartedCb: ((room: any) => void) | null = null;
  private onRoomStateUpdateCb: ((state: any) => void) | null = null;
  private onGuestInputCb: ((input: NetworkInput) => void) | null = null;

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

  getIsHost(): boolean {
    return this.isHost;
  }

  // Initialize PeerJS for Direct P2P Connections
  private initPeer(): Promise<string> {
    return new Promise((resolve) => {
      if (this.peer && this.localPeerId) {
        return resolve(this.localPeerId);
      }

      this.peer = new Peer();
      this.peer.on("open", (id) => {
        console.log("[P2P WebRTC] Peer initialized with ID:", id);
        this.localPeerId = id;
        resolve(id);
      });

      this.peer.on("connection", (conn) => {
        console.log("[P2P WebRTC] Incoming peer connection received!");
        this.p2pConnection = conn;
        this.setupP2PListeners(conn);
      });

      this.peer.on("error", (err) => {
        console.warn("[P2P WebRTC] Peer error:", err);
      });
    });
  }

  private setupP2PListeners(conn: DataConnection) {
    conn.on("open", () => {
      console.log("[P2P WebRTC] DataChannel connected and open!");
    });

    conn.on("data", (data: any) => {
      if (!data) return;

      if (data.type === "GUEST_INPUT" && this.isHost) {
        this.onGuestInputCb?.(data.input);
      } else if (data.type === "HOST_STATE" && !this.isHost) {
        this.onRoomStateUpdateCb?.(data.state);
      } else if (data.type === "GAME_START") {
        this.onGameStartedCb?.(data.room);
      }
    });

    conn.on("close", () => {
      console.log("[P2P WebRTC] Connection closed.");
    });
  }

  async createRoom(playerName: string, config: any, callback: (res: any) => void): Promise<void> {
    this.isHost = true;
    const socket = this.connect();
    const peerId = await this.initPeer();

    socket.emit("createRoom", { playerName, peerId, config }, (res: any) => {
      if (res && res.success) {
        this.currentRoomCode = res.roomCode;
      }
      callback(res);
    });
  }

  async joinRoom(roomCode: string, playerName: string, config: any, callback: (res: any) => void): Promise<void> {
    this.isHost = false;
    const socket = this.connect();
    const peerId = await this.initPeer();

    socket.emit("joinRoom", { roomCode, peerId, playerName, config }, (res: any) => {
      if (res && res.success) {
        this.currentRoomCode = res.roomCode;
        const hostPeerId = res.room.hostPeerId;

        if (hostPeerId && this.peer) {
          console.log("[P2P WebRTC] Connecting directly to Host Peer:", hostPeerId);
          const conn = this.peer.connect(hostPeerId, { reliable: false }); // UDP Mode for ultralow latency!
          this.p2pConnection = conn;
          this.setupP2PListeners(conn);
        }
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
    if (this.isHost) {
      if (this.socket && this.currentRoomCode) {
        this.socket.emit("startGame", { roomCode: this.currentRoomCode });
      }
      if (this.p2pConnection && this.p2pConnection.open) {
        this.p2pConnection.send({ type: "GAME_START", room: { code: this.currentRoomCode } });
      }
    }
  }

  // Send input from Guest to Host over WebRTC DataChannel (UDP)
  sendInput(input: NetworkInput): void {
    if (this.isHost) {
      // Local host processes own input directly
    } else if (this.p2pConnection && this.p2pConnection.open) {
      this.p2pConnection.send({ type: "GUEST_INPUT", input });
    } else if (this.socket && this.currentRoomCode) {
      // Fallback signaling if P2P channel is still connecting
      this.socket.emit("playerInput", { roomCode: this.currentRoomCode, input });
    }
  }

  // Broadcast host physics state over WebRTC DataChannel to Guest
  broadcastHostState(state: any): void {
    if (this.isHost) {
      if (this.p2pConnection && this.p2pConnection.open) {
        this.p2pConnection.send({ type: "HOST_STATE", state });
      } else if (this.socket && this.currentRoomCode) {
        // Fallback signaling
        this.socket.emit("hostStateUpdate", { roomCode: this.currentRoomCode, state });
      }
    }
  }

  onGuestInput(cb: (input: NetworkInput) => void): void {
    this.onGuestInputCb = cb;
    this.socket?.on("playerInputRelay", (data: any) => {
      if (this.isHost && data && data.input) {
        cb(data.input);
      }
    });
  }

  onRoomUpdated(cb: (room: any) => void): void {
    this.onRoomUpdatedCb = cb;
    this.socket?.on("roomUpdated", cb);
  }

  onGameStarted(cb: (room: any) => void): void {
    this.onGameStartedCb = cb;
    this.socket?.on("gameStarted", cb);
  }

  onRoomStateUpdate(cb: (state: any) => void): void {
    this.onRoomStateUpdateCb = cb;
    this.socket?.on("hostStateUpdate", cb);
  }
}
