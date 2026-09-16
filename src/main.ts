import "./style.css";
import { Game } from "./game/Game";
import { MenuManager } from "./ui/MenuManager";

import { NetworkManager } from "./network/NetworkManager";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
const blueScore = document.querySelector<HTMLSpanElement>("#blueScore");
const redScore = document.querySelector<HTMLSpanElement>("#redScore");
const matchTimer = document.querySelector<HTMLSpanElement>("#matchTimer");

if (!canvas || !blueScore || !redScore || !matchTimer) {
  throw new Error("Game DOM elements not found");
}

const menu = new MenuManager();
const netManager = new NetworkManager();

const game = new Game(canvas, {
  onScore: (blue, red) => {
    blueScore.textContent = String(blue);
    redScore.textContent = String(red);
  },
  onTimeUpdate: (formattedTime, _sec, isExtraTime) => {
    matchTimer.textContent = formattedTime;
    if (isExtraTime) {
      matchTimer.classList.add("extra-time");
    } else {
      matchTimer.classList.remove("extra-time");
    }
  },
  onGameOver: (winner, blue, red) => {
    menu.showGameOver(winner, blue, red);
  },
  onPauseToggle: () => {
    menu.showPauseMenu();
  },
});

// Initialize network connection and register listeners right away
const socket = netManager.connect();

netManager.onRoomUpdated((room) => {
  const currentSocket = netManager.getSocket();
  if (currentSocket) {
    menu.showOnlineLobby(room, currentSocket.id!, (team) => netManager.switchTeam(team), () => netManager.startGame());
  }
});

netManager.onGameStarted((room) => {
  menu.hideOverlay();
  game.setOnlineNetworkManager(netManager);

  const localSocketId = netManager.getSocket()?.id;
  const playerList: any[] = Array.isArray(room?.players)
    ? room.players
    : room?.players && typeof room.players === "object"
    ? Object.values(room.players)
    : [];

  const hostObj = playerList.find((p: any) => p.id === room?.hostId || p.socketId === room?.hostId) || playerList[0];
  const guestObj = playerList.find((p: any) => p.id !== room?.hostId && p.socketId !== room?.hostId) || playerList[1];

  const myName = menu.getPlayerName() || "Jugador";
  const hostName = hostObj?.name || "Host";
  const guestName = guestObj?.name || "Invitado";

  game.configureAndStart({
    mode: "ONLINE",
    duration: room?.duration || 180,
    goalLimit: 5,
    skinIndex: 0,
    jerseyNumber: 10,
    badgeEmoji: "",
    customColor: null,
    borderStyle: "classic",
    pattern: "spain",
    playerName: myName,
    hostName: hostName,
    guestName: guestName,
    isOnline: true,
  } as any);
});

// Network online room handlers from menu
menu.onOnlineRoom((action, roomCode) => {
  const activeSocket = netManager.connect();
  const playerName = menu.getPlayerName() || "Jugador_" + Math.floor(Math.random() * 899 + 100);

  if (action === "create") {
    netManager.createRoom(playerName, {}, (res) => {
      if (res && res.success) {
        menu.showOnlineLobby(res.room, activeSocket.id!, (team) => netManager.switchTeam(team), () => netManager.startGame());
      } else {
        alert(res?.error || "Error al crear sala");
      }
    });
  } else if (action === "join" && roomCode) {
    netManager.joinRoom(roomCode, playerName, {}, (res) => {
      if (res && res.success) {
        menu.showOnlineLobby(res.room, activeSocket.id!, (team) => netManager.switchTeam(team), () => netManager.startGame());
      } else {
        alert(res?.error || "Error al unirse a la sala");
      }
    });
  }
});

// Start live background demo match immediately behind main menu!
game.configureAndStart({
  mode: "LOCAL_2P",
  duration: 0,
  goalLimit: 0,
  skinIndex: 0,
  jerseyNumber: 10,
  badgeEmoji: "",
  customColor: null,
  borderStyle: "classic",
  pattern: "spain",
  isDemo: true,
});

menu.onStartMatch((config) => {
  game.configureAndStart(config);
});

menu.onResume(() => {
  game.setPaused(false);
});

menu.onQuitToMenu(() => {
  game.configureAndStart({
    mode: "LOCAL_2P",
    duration: 0,
    goalLimit: 0,
    skinIndex: 0,
    jerseyNumber: 10,
    badgeEmoji: "",
    customColor: null,
    borderStyle: "classic",
    pattern: "spain",
    isDemo: true,
  });
});