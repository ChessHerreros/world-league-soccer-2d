import { SoundEffects } from "../audio/SoundEffects";

export type GameMode = "VS_AI" | "LOCAL_2P" | "PRACTICE" | "TOURNAMENT" | "ONLINE";

export type MatchDuration = 90 | 180 | 300 | 0; // seconds, 0 = unlimited
export type GoalLimit = 3 | 5 | 10 | 0; // 0 = none

export interface MatchConfig {
  mode: GameMode;
  duration: MatchDuration;
  goalLimit: GoalLimit;
  skinIndex: number;
  jerseyNumber: number;
  badgeEmoji: string;
  customColor: string | null;
  borderStyle: "classic" | "gold" | "neon" | "rainbow";
  pattern: "classic" | "halves" | "checker" | "stripes" | "rings" | "sash" | "diamond" | "spain";
  goalSound?: string;
  playerName?: string;
}

export class MenuManager {
  private overlay: HTMLElement;
  private sound = new SoundEffects();
  private currentSkin = 0;
  private selectedMode: GameMode = "VS_AI";
  private duration: MatchDuration = 180;
  private goalLimit: GoalLimit = 5;

  // Player Username & Customization State
  private playerName: string = "Jugador";
  private jerseyNumber = 29;
  private badgeEmoji = "";
  private customColor: string | null = null;
  private borderStyle: "classic" | "gold" | "neon" | "rainbow" = "classic";
  private pattern: "classic" | "halves" | "checker" | "stripes" | "rings" | "sash" | "diamond" | "spain" = "spain";
  private goalSound: string = "stadium_horn";
  private selectedItemId = "spain";

  private onStartMatchCallback?: (config: MatchConfig) => void;
  private onOnlineRoomCallback?: (action: "create" | "join", roomCode?: string) => void;
  private onResumeCallback?: () => void;
  private onQuitToMenuCallback?: () => void;

  constructor() {
    this.overlay = document.createElement("div");
    this.overlay.id = "menu-overlay";
    document.querySelector("#app")?.appendChild(this.overlay);

    // Retrieve stored username or prompt player
    const savedName = localStorage.getItem("wls_username");
    if (savedName && savedName.trim().length > 0) {
      this.playerName = savedName.trim();
      this.showMainMenu();
    } else {
      this.showUsernameModal();
    }
  }

  getPlayerName(): string {
    return this.playerName;
  }

  getPlayerConfig(): Partial<MatchConfig> {
    return {
      playerName: this.playerName,
      jerseyNumber: this.jerseyNumber,
      badgeEmoji: this.badgeEmoji,
      customColor: this.customColor,
      borderStyle: this.borderStyle,
      pattern: this.pattern,
      goalSound: this.goalSound,
      skinIndex: this.currentSkin,
    };
  }

  showUsernameModal(): void {
    this.overlay.style.display = "flex";
    this.overlay.innerHTML = `
      <div class="roblox-inv-modal settings-modal-card" style="max-width: 440px; text-align: center;">
        <div class="roblox-inv-header" style="justify-content: center;">
          <h2 class="roblox-inv-title">⚽ WORLD LEAGUE SOCCER</h2>
        </div>
        <div class="settings-content-stack" style="gap: 16px; margin-top: 10px;">
          <span class="setting-group-title">INTRODUCE TU NOMBRE DE JUGADOR</span>
          <input type="text" id="input-username" placeholder="Tu nombre..." maxlength="12" style="width: 100%; padding: 14px; border-radius: 8px; border: 2px solid #3b82f6; background: #0f172a; color: #fff; font-weight: bold; text-align: center; font-size: 1.3rem;">
          <button id="btn-save-username" class="btn-roblox-kickoff" style="width: 100%;">¡ENTRAR AL JUEGO! ⚽</button>
        </div>
      </div>
    `;

    document.querySelector("#btn-save-username")?.addEventListener("click", () => {
      const input = this.overlay.querySelector<HTMLInputElement>("#input-username");
      const name = input?.value.trim();
      if (name && name.length > 0) {
        this.playerName = name;
        localStorage.setItem("wls_username", name);
        this.showMainMenu();
      } else {
        alert("Por favor escribe tu nombre de usuario para continuar.");
      }
    });
  }

  onOnlineRoom(cb: (action: "create" | "join", roomCode?: string) => void): void {
    this.onOnlineRoomCallback = cb;
  }

  onStartMatch(cb: (config: MatchConfig) => void): void {
    this.onStartMatchCallback = cb;
  }

  onResume(cb: () => void): void {
    this.onResumeCallback = cb;
  }

  onQuitToMenu(cb: () => void): void {
    this.onQuitToMenuCallback = cb;
  }

  showMainMenu(): void {
    this.overlay.style.display = "flex";
    this.overlay.innerHTML = `
      <div class="roblox-menu-layout">
        <!-- Top Nav Bar -->
        <header class="roblox-top-bar">
          <div class="top-nav-pill">
            <button class="nav-tab active" id="tab-play">Play</button>
            <button class="nav-tab" id="tab-inventory">Inventory <span class="tab-badge">NEW</span></button>
            <button class="nav-tab vip" id="tab-settings">Settings</button>
          </div>
        </header>

        <!-- Center Match Mode Cards Layout -->
        <main class="roblox-center-stage">
          <div class="mode-cards-row">
            <button class="roblox-card ${this.selectedMode === "VS_AI" ? "active" : ""}" data-mode="VS_AI">
              <h2 class="card-title">1v1</h2>
            </button>

            <button class="roblox-card featured ${this.selectedMode === "LOCAL_2P" ? "active" : ""}" data-mode="LOCAL_2P">
              <h2 class="card-title">2v2</h2>
            </button>

            <button class="roblox-card ${this.selectedMode === "PRACTICE" ? "active" : ""}" data-mode="PRACTICE">
              <h2 class="card-title">3v3</h2>
            </button>

            <button class="roblox-card ${this.selectedMode === "TOURNAMENT" ? "active" : ""}" data-mode="TOURNAMENT">
              <h2 class="card-title">4v4</h2>
            </button>

            <button class="roblox-card online-card ${this.selectedMode === "ONLINE" ? "active" : ""}" data-mode="ONLINE">
              <h2 class="card-title">🌐 ONLINE</h2>
            </button>
          </div>

          <div class="center-bottom-bar">
            <button id="btn-kickoff-main" class="btn-roblox-kickoff">
              ${this.selectedMode === "ONLINE" ? "SALA MULTIJUGADOR 🌐" : "PLAY MATCH NOW ⚽"}
            </button>
          </div>
        </main>
      </div>
    `;

    // Mode Card Selection
    const modeCards = this.overlay.querySelectorAll<HTMLButtonElement>(".roblox-card");
    modeCards.forEach((card) => {
      card.addEventListener("click", () => {
        modeCards.forEach((c) => c.classList.remove("active"));
        card.classList.add("active");
        this.selectedMode = (card.dataset.mode as GameMode) || "VS_AI";
      });
    });

    // Kickoff action
    document.querySelector("#btn-kickoff-main")?.addEventListener("click", () => {
      if (this.selectedMode === "ONLINE") {
        this.showOnlineMenu();
        return;
      }
      this.hideOverlay();
      this.onStartMatchCallback?.({
        mode: this.selectedMode,
        duration: this.duration,
        goalLimit: this.goalLimit,
        skinIndex: this.currentSkin,
        jerseyNumber: this.jerseyNumber,
        badgeEmoji: this.badgeEmoji,
        customColor: this.customColor,
        borderStyle: this.borderStyle,
        pattern: this.pattern,
        playerName: this.playerName,
      });
    });

    // Nav bar tab handlers
    document.querySelector("#tab-inventory")?.addEventListener("click", () => this.showBallSubmenu());
    document.querySelector("#tab-settings")?.addEventListener("click", () => this.showSettingsSubmenu());
  }

  showBallSubmenu(): void {
    this.overlay.style.display = "flex";

    let activeCategory = "Discs";

    // Catalog item definitions per category
    const catalogData: Record<string, { title: string; count: string; sections: Array<{ name: string; count: string; items: Array<{ id: string; title: string; sub?: string; pinkSub?: boolean; price?: string; owned?: boolean; icon?: string; patternClass?: string }> }> }> = {
      Discs: {
        title: "Discs",
        count: "4/44",
        sections: [
          {
            name: "Default",
            count: "(1/1)",
            items: [
              { id: "classic", title: "Classic", owned: true, patternClass: "classic" }
            ]
          },
          {
            name: "Patterns",
            count: "(3/8)",
            items: [
              { id: "rings", title: "Rings", sub: "Customizable", price: "$1,000", patternClass: "pattern-rings" },
              { id: "halves", title: "Halves", sub: "Customizable", pinkSub: true, owned: true, patternClass: "pattern-halves" },
              { id: "checker", title: "Checker", sub: "Customizable", pinkSub: true, owned: true, patternClass: "pattern-checker" },
              { id: "stripes", title: "Stripes", sub: "Customizable", pinkSub: true, owned: true, patternClass: "pattern-stripes" },
              { id: "sash", title: "Sash", sub: "Customizable", price: "$1,000", patternClass: "pattern-sash" },
              { id: "diamond", title: "Diamond", sub: "Customizable", price: "$3,000", patternClass: "pattern-diamond" }
            ]
          },
          {
            name: "Country Flags",
            count: "(1/36)",
            items: [
              { id: "spain", title: "Spain", owned: true, patternClass: "pattern-spain" }
            ]
          }
        ]
      },
      GoalSound: {
        title: "Goal Sound",
        count: "2/31",
        sections: [
          {
            name: "Classic Sounds",
            count: "(1/10)",
            items: [
              { id: "stadium_horn", title: "Stadium Horn", owned: true, icon: "📢" },
              { id: "whistle_blast", title: "Whistle Blast", owned: true, icon: "🎷" },
              { id: "retro_beep", title: "8-Bit Victory", price: "$500", icon: "👾" },
              { id: "siren", title: "Police Siren", price: "$1,200", icon: "🚨" }
            ]
          },
          {
            name: "Meme Sounds",
            count: "(1/21)",
            items: [
              { id: "airhorn", title: "MLG Airhorn", pinkSub: true, owned: true, icon: "📣" },
              { id: "samba", title: "Samba Beats", price: "$2,500", icon: "🥁" },
              { id: "thunder", title: "Thunder Boom", price: "$5,000", icon: "⚡" }
            ]
          }
        ]
      },
      GoalFX: {
        title: "Goal FX",
        count: "1/10",
        sections: [
          {
            name: "Explosions",
            count: "(1/10)",
            items: [
              { id: "confetti", title: "Party Confetti", owned: true, icon: "🎉" },
              { id: "fireworks", title: "Gold Fireworks", price: "$2,000", icon: "🎆" },
              { id: "slime_burst", title: "Green Slime", price: "$3,500", icon: "🧪" },
              { id: "cosmic_hole", title: "Black Hole", price: "$10,000", icon: "🌌" }
            ]
          }
        ]
      },
      GoalEmote: {
        title: "Goal Emote",
        count: "6/12",
        sections: [
          {
            name: "Celebrations",
            count: "(6/12)",
            items: [
              { id: "siuuu", title: "Siuuu Leap", price: "$2,500", icon: "👑", sub: "Legendary", pinkSub: true, owned: true },
              { id: "griddly", title: "The Griddly", price: "$3,000", icon: "🔥", sub: "Viral Dance", pinkSub: true, owned: true },
              { id: "robot_spin", title: "Robot Spin", price: "$1,800", icon: "🤖", sub: "Mechanical" },
              { id: "knee_slide", title: "Turf Slide", price: "$1,200", icon: "🏃", owned: true },
              { id: "hyped_flip", title: "Acrobat Flip", price: "$3,500", icon: "🤸" },
              { id: "breakdance", title: "Breakdance", price: "$5,000", icon: "🕺", sub: "Epic" }
            ]
          }
        ]
      },
      Banners: {
        title: "Banners",
        count: "0/33",
        sections: [
          {
            name: "Card Frames",
            count: "(0/33)",
            items: [
              { id: "neon_frame", title: "Neon City", price: "$800", icon: "🌆" },
              { id: "gold_frame", title: "Champion Gold", price: "$5,000", icon: "👑" },
              { id: "cyber_grid", title: "Cyber Matrix", price: "$2,500", icon: "🌐" }
            ]
          }
        ]
      },
      BallTrail: {
        title: "Ball Trail",
        count: "0/3",
        sections: [
          {
            name: "Trails",
            count: "(0/3)",
            items: [
              { id: "fire_trail", title: "Fire Comet", price: "$1,500", icon: "🔥" },
              { id: "rainbow_trail", title: "Rainbow Sparkle", price: "$3,000", icon: "🌈" },
              { id: "lightning_trail", title: "Thunderbolt", price: "$6,000", icon: "⚡" }
            ]
          }
        ]
      },
      PlayerTrail: {
        title: "Player Trail",
        count: "0/5",
        sections: [
          {
            name: "Footstep Trails",
            count: "(0/5)",
            items: [
              { id: "smoke", title: "Tire Smoke", price: "$1,000", icon: "💨" },
              { id: "sparkles", title: "Star Dust", price: "$2,500", icon: "✨" },
              { id: "magma", title: "Magma Steps", price: "$7,500", icon: "🌋" }
            ]
          }
        ]
      },
      KickFX: {
        title: "Kick FX",
        count: "0/6",
        sections: [
          {
            name: "Impact Effects",
            count: "(0/6)",
            items: [
              { id: "sonic_wave", title: "Sonic Boom", price: "$2,000", icon: "💥" },
              { id: "shockwave_gold", title: "Golden Blast", price: "$4,000", icon: "🌟" },
              { id: "pixel_burst", title: "Retro Pixels", price: "$1,800", icon: "👾" }
            ]
          }
        ]
      },
      Titles: {
        title: "Titles",
        count: "0/247",
        sections: [
          {
            name: "Player Badges",
            count: "(0/247)",
            items: [
              { id: "goat", title: "G.O.A.T.", price: "$10,000", icon: "🐐" },
              { id: "sniper", title: "Top Sniper", price: "$3,000", icon: "🎯" },
              { id: "wall", title: "Iron Wall", price: "$2,500", icon: "🧱" },
              { id: "speedy", title: "Speed Demon", price: "$4,000", icon: "🏎️" }
            ]
          }
        ]
      }
    };

    const renderCatalogContent = () => {
      const data = catalogData[activeCategory] || catalogData.Discs;
      const centerCol = this.overlay.querySelector(".catalog-scroll-area");
      if (!centerCol) return;

      let html = "";
      for (const sec of data.sections) {
        html += `
          <div class="cat-section">
            <div class="cat-section-header">
              <span class="header-name">${sec.name}</span>
              <span class="header-count">${sec.count}</span>
            </div>
            <div class="pattern-items-grid">
        `;

        for (const item of sec.items) {
          const isSelected = activeCategory === "Discs" && this.pattern === item.id;
          const circleContent = item.patternClass
            ? `<div class="item-circle ${item.patternClass}"><span>${this.jerseyNumber}</span></div>`
            : `<div class="item-circle generic-icon"><span>${item.icon || "⚽"}</span></div>`;

          html += `
            <button class="pattern-item-card ${isSelected ? "selected" : ""}" data-id="${item.id}" data-cat="${activeCategory}">
              ${circleContent}
              <span class="item-title">${item.title}</span>
              ${item.sub ? `<span class="item-sub ${item.pinkSub ? "pink" : ""}">${item.sub}</span>` : ""}
              ${item.owned ? `<span class="item-status">Owned</span>` : `<span class="item-price">${item.price || "Free"}</span>`}
            </button>
          `;
        }

        html += `
            </div>
          </div>
        `;
      }

      centerCol.innerHTML = html;

      // Item click event bindings
      centerCol.querySelectorAll<HTMLButtonElement>(".pattern-item-card").forEach((card) => {
        card.addEventListener("click", () => {
          centerCol.querySelectorAll(".pattern-item-card").forEach((c) => c.classList.remove("selected"));
          card.classList.add("selected");
          this.selectedItemId = card.dataset.id || "spain";
          this.sound.playButtonClick();
          if (card.dataset.cat === "Discs") {
            this.pattern = (card.dataset.id as any) || "spain";
            updateRightPreview();
          } else if (card.dataset.cat === "GoalSound") {
            this.goalSound = card.dataset.id || "stadium_horn";
          }
        });
      });
    };

    this.overlay.innerHTML = `
      <div class="roblox-inv-modal">
        <!-- Close / Back Header Button -->
        <button id="btn-back" class="roblox-close-x">✕</button>

        <!-- Panel 1: Left Navigation & Collection Stats -->
        <aside class="roblox-inv-left-col">
          <div class="collection-box">
            <span class="collection-title">Collection</span>
            <span class="collection-count">7/401 · 2%</span>
            <div class="collection-progress-bar">
              <div class="collection-progress-fill" style="width: 2%;"></div>
            </div>
          </div>

          <button class="roblox-shop-btn">🛒 Shop</button>

          <div class="cat-nav-list">
            <button class="cat-nav-item ${activeCategory === "Discs" ? "active" : ""}" data-cat="Discs">Discs <span class="cat-count">4/44</span></button>
            <button class="cat-nav-item ${activeCategory === "GoalSound" ? "active" : ""}" data-cat="GoalSound">Goal Sound <span class="cat-count">2/31</span></button>
            <button class="cat-nav-item ${activeCategory === "GoalFX" ? "active" : ""}" data-cat="GoalFX">Goal FX <span class="cat-count">1/10</span></button>
            <button class="cat-nav-item ${activeCategory === "GoalEmote" ? "active" : ""}" data-cat="GoalEmote">Goal Emote <span class="cat-count">0/3</span></button>
            <button class="cat-nav-item ${activeCategory === "Banners" ? "active" : ""}" data-cat="Banners">Banners <span class="cat-count">0/33</span></button>
            <button class="cat-nav-item ${activeCategory === "BallTrail" ? "active" : ""}" data-cat="BallTrail">Ball Trail <span class="cat-count">0/3</span></button>
            <button class="cat-nav-item ${activeCategory === "PlayerTrail" ? "active" : ""}" data-cat="PlayerTrail">Player Trail <span class="cat-count">0/5</span></button>
            <button class="cat-nav-item ${activeCategory === "KickFX" ? "active" : ""}" data-cat="KickFX">Kick FX <span class="cat-count">0/6</span></button>
            <button class="cat-nav-item ${activeCategory === "Titles" ? "active" : ""}" data-cat="Titles">Titles <span class="cat-count">0/247</span></button>
          </div>
        </aside>

        <!-- Panel 2: Center Catalog Grid -->
        <main class="roblox-inv-center-col">
          <div class="catalog-scroll-area">
          </div>
        </main>

        <!-- Panel 3: Right Disc Preview & Customization Card -->
        <aside class="roblox-inv-right-col">
          <div class="preview-large-box">
            <div class="large-disc-preview pattern-${this.pattern}" id="main-preview-disc">
              <span id="main-preview-number">${this.jerseyNumber}</span>
            </div>
          </div>

          <div class="number-spinner-control">
            <button id="btn-num-prev" class="spinner-arrow">‹</button>
            <span id="spinner-num-display" class="spinner-val">${this.jerseyNumber}</span>
            <button id="btn-num-next" class="spinner-arrow">›</button>
          </div>

          <div class="right-card-actions">
            <button class="roblox-btn-preview" id="btn-toggle-preview">▶ Preview</button>
            <button class="roblox-btn-equip" id="btn-equip-disc">Equip</button>
          </div>
        </aside>
      </div>
    `;

    document.querySelector("#btn-back")?.addEventListener("click", () => this.showMainMenu());

    // Category navigation tabs listener
    const navItems = this.overlay.querySelectorAll<HTMLButtonElement>(".cat-nav-item");
    navItems.forEach((btn) => {
      btn.addEventListener("click", () => {
        navItems.forEach((n) => n.classList.remove("active"));
        btn.classList.add("active");
        activeCategory = btn.dataset.cat || "Discs";
        renderCatalogContent();
      });
    });

    const updateRightPreview = () => {
      const disc = this.overlay.querySelector("#main-preview-disc");
      const numDisplay = this.overlay.querySelector("#main-preview-number");
      const spinnerVal = this.overlay.querySelector("#spinner-num-display");

      if (disc) {
        disc.className = `large-disc-preview pattern-${this.pattern}`;
      }
      if (numDisplay) {
        numDisplay.textContent = String(this.jerseyNumber);
      }
      if (spinnerVal) {
        spinnerVal.textContent = String(this.jerseyNumber);
      }
    };

    renderCatalogContent();

    // Jersey Number Spinner Controls (< 29 >)
    document.querySelector("#btn-num-prev")?.addEventListener("click", () => {
      this.jerseyNumber = this.jerseyNumber > 1 ? this.jerseyNumber - 1 : 99;
      updateRightPreview();
      renderCatalogContent();
    });

    document.querySelector("#btn-num-next")?.addEventListener("click", () => {
      this.jerseyNumber = this.jerseyNumber < 99 ? this.jerseyNumber + 1 : 1;
      updateRightPreview();
      renderCatalogContent();
    });

    // Preview Button Action - Play sound or animate preview
    document.querySelector("#btn-toggle-preview")?.addEventListener("click", () => {
      if (activeCategory === "GoalSound") {
        this.sound.playGoalSoundPreview(this.selectedItemId);
      } else if (activeCategory === "KickFX") {
        this.sound.playKick(0.85);
      } else if (activeCategory === "GoalEmote") {
        // Play animated celebration on the preview disc card
        const disc = this.overlay.querySelector("#main-preview-disc") as HTMLElement;
        if (disc) {
          disc.classList.remove("emote-siuuu", "emote-griddly", "emote-robot", "emote-slide", "emote-flip", "emote-dance");
          void disc.offsetWidth; // Trigger reflow to restart CSS animation

          if (this.selectedItemId === "siuuu") disc.classList.add("emote-siuuu");
          else if (this.selectedItemId === "griddly") disc.classList.add("emote-griddly");
          else if (this.selectedItemId === "robot_spin") disc.classList.add("emote-robot");
          else if (this.selectedItemId === "knee_slide") disc.classList.add("emote-slide");
          else if (this.selectedItemId === "hyped_flip") disc.classList.add("emote-flip");
          else if (this.selectedItemId === "breakdance") disc.classList.add("emote-dance");
          else disc.classList.add("emote-flip");

          // Play triumph audio cue
          this.sound.playCountdown(true);
        }
      } else {
        // Pulse disc preview animation
        const disc = this.overlay.querySelector("#main-preview-disc") as HTMLElement;
        if (disc) {
          disc.style.transform = "scale(1.15) rotate(10deg)";
          disc.style.transition = "transform 0.15s ease";
          setTimeout(() => {
            disc.style.transform = "scale(1) rotate(0deg)";
          }, 200);
        }
      }
    });

    // Equip button
    document.querySelector("#btn-equip-disc")?.addEventListener("click", () => {
      this.showMainMenu();
    });
  }

  showModeSubmenu(): void {
    this.overlay.style.display = "flex";
    this.overlay.innerHTML = `
      <div class="cartoon-panel submenu-panel">
        <div class="panel-top-bar">
          <button id="btn-back" class="cartoon-btn-back">⬅ VOLVER</button>
          <h2>ELIGE MODO DE JUEGO</h2>
        </div>

        <div class="cartoon-mode-grid">
          <button class="cartoon-mode-card ${this.selectedMode === "VS_AI" ? "selected" : ""}" data-mode="VS_AI">
            <div class="card-badge">POPULAR</div>
            <div class="card-icon">🤖</div>
            <h3>1v1 VS IA</h3>
            <p>Duelo individual rápido contra el bot</p>
          </button>

          <button class="cartoon-mode-card ${this.selectedMode === "LOCAL_2P" ? "selected" : ""}" data-mode="LOCAL_2P">
            <div class="card-badge 2p">VERSUS</div>
            <div class="card-icon">👥</div>
            <h3>2P LOCAL</h3>
            <p>P1 (WASD) vs P2 (Flechas)</p>
          </button>

          <button class="cartoon-mode-card ${this.selectedMode === "PRACTICE" ? "selected" : ""}" data-mode="PRACTICE">
            <div class="card-badge practice">SKILLS</div>
            <div class="card-icon">🎯</div>
            <h3>ENTRENAMIENTO</h3>
            <p>Práctica de tiros, potencia y regates</p>
          </button>

          <button class="cartoon-mode-card ${this.selectedMode === "TOURNAMENT" ? "selected" : ""}" data-mode="TOURNAMENT">
            <div class="card-badge cup">COPA</div>
            <div class="card-icon">🏆</div>
            <h3>TORNEO</h3>
            <p>Liguilla eliminatoria a 4 equipos</p>
          </button>
        </div>

        <button id="btn-kickoff" class="cartoon-btn btn-green btn-kickoff">
          ¡SALTAR AL CAMPO! ⚽
        </button>
      </div>
    `;

    document.querySelector("#btn-back")?.addEventListener("click", () => this.showMainMenu());

    const modeCards = this.overlay.querySelectorAll<HTMLButtonElement>(".cartoon-mode-card");
    modeCards.forEach((card) => {
      card.addEventListener("click", () => {
        modeCards.forEach((c) => c.classList.remove("selected"));
        card.classList.add("selected");
        this.selectedMode = (card.dataset.mode as GameMode) || "VS_AI";
      });
    });

    document.querySelector("#btn-kickoff")?.addEventListener("click", () => {
      this.hideOverlay();
      this.onStartMatchCallback?.({
        mode: this.selectedMode,
        duration: this.duration,
        goalLimit: this.goalLimit,
        skinIndex: this.currentSkin,
        jerseyNumber: this.jerseyNumber,
        badgeEmoji: this.badgeEmoji,
        customColor: this.customColor,
        borderStyle: this.borderStyle,
        pattern: this.pattern,
      });
    });
  }

  showSettingsSubmenu(): void {
    this.overlay.style.display = "flex";
    this.overlay.innerHTML = `
      <div class="roblox-inv-modal settings-modal-card">
        <div class="roblox-inv-header">
          <button id="btn-back" class="roblox-back-btn">⬅ VOLVER</button>
          <h2 class="roblox-inv-title">⚙️ AJUSTES DE PARTIDA</h2>
        </div>

        <div class="settings-content-stack">
          <div class="setting-group-box">
            <span class="setting-group-title">⏱ DURACIÓN DEL PARTIDO</span>
            <div class="setting-options-row" id="time-pills">
              <button class="setting-opt-btn ${this.duration === 90 ? "active" : ""}" data-val="90">1:30 MIN</button>
              <button class="setting-opt-btn ${this.duration === 180 ? "active" : ""}" data-val="180">3:00 MIN</button>
              <button class="setting-opt-btn ${this.duration === 300 ? "active" : ""}" data-val="300">5:00 MIN</button>
              <button class="setting-opt-btn ${this.duration === 0 ? "active" : ""}" data-val="0">SIN TIEMPO</button>
            </div>
          </div>

          <div class="setting-group-box">
            <span class="setting-group-title">⚽ LÍMITE DE GOLES</span>
            <div class="setting-options-row" id="goal-pills">
              <button class="setting-opt-btn ${this.goalLimit === 3 ? "active" : ""}" data-val="3">3 GOLES</button>
              <button class="setting-opt-btn ${this.goalLimit === 5 ? "active" : ""}" data-val="5">5 GOLES</button>
              <button class="setting-opt-btn ${this.goalLimit === 10 ? "active" : ""}" data-val="10">10 GOLES</button>
              <button class="setting-opt-btn ${this.goalLimit === 0 ? "active" : ""}" data-val="0">LIBRE</button>
            </div>
          </div>
        </div>

        <div class="settings-bottom-actions">
          <button id="btn-save-settings" class="btn-roblox-kickoff btn-save-modal">GUARDAR CAMBIOS ✔</button>
        </div>
      </div>
    `;

    document.querySelector("#btn-back")?.addEventListener("click", () => this.showMainMenu());

    const timeBtns = this.overlay.querySelectorAll<HTMLButtonElement>("#time-pills button");
    timeBtns.forEach((b) => {
      b.addEventListener("click", () => {
        timeBtns.forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        this.duration = Number(b.dataset.val) as MatchDuration;
      });
    });

    const goalBtns = this.overlay.querySelectorAll<HTMLButtonElement>("#goal-pills button");
    goalBtns.forEach((b) => {
      b.addEventListener("click", () => {
        goalBtns.forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        this.goalLimit = Number(b.dataset.val) as GoalLimit;
      });
    });

    document.querySelector("#btn-save-settings")?.addEventListener("click", () => this.showMainMenu());
  }

  showOnlineMenu(): void {
    this.overlay.style.display = "flex";
    this.overlay.innerHTML = `
      <div class="roblox-inv-modal settings-modal-card">
        <div class="roblox-inv-header">
          <button id="btn-back" class="roblox-back-btn">⬅ VOLVER</button>
          <h2 class="roblox-inv-title">🌐 MULTIJUGADOR ONLINE</h2>
        </div>

        <div class="settings-content-stack" style="gap: 20px;">
          <div class="setting-group-box" style="text-align: center;">
            <span class="setting-group-title">CREAR NUEVA SALA</span>
            <p style="color: #94a3b8; margin-top: 6px; font-size: 0.95rem;">Crea una sala privada y comparte el código con tus amigos.</p>
            <button id="btn-create-room" class="btn-roblox-kickoff" style="margin-top: 14px; width: 100%;">CREAR SALA DE JUEGO ✨</button>
          </div>

          <div class="setting-group-box" style="text-align: center;">
            <span class="setting-group-title">UNIRSE A UNA SALA</span>
            <div style="display: flex; gap: 10px; margin-top: 12px;">
              <input type="text" id="input-room-code" placeholder="CÓDIGO (EJ: ABCD)" maxlength="4" style="flex: 1; padding: 12px; border-radius: 8px; border: 2px solid #334155; background: #0f172a; color: #fff; text-transform: uppercase; font-weight: bold; text-align: center; font-size: 1.2rem; letter-spacing: 2px;">
              <button id="btn-join-room" class="roblox-btn-equip" style="padding: 0 24px;">UNIRSE 🚀</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.querySelector("#btn-back")?.addEventListener("click", () => {
      this.sound.playButtonClick();
      this.showMainMenu();
    });

    document.querySelector("#btn-create-room")?.addEventListener("click", () => {
      this.sound.playButtonClick();
      this.onOnlineRoomCallback?.("create");
    });

    document.querySelector("#btn-join-room")?.addEventListener("click", () => {
      this.sound.playButtonClick();
      const codeInput = this.overlay.querySelector<HTMLInputElement>("#input-room-code");
      const code = codeInput?.value.trim().toUpperCase();
      if (code && code.length === 4) {
        this.onOnlineRoomCallback?.("join", code);
      } else {
        alert("Por favor introduce un código de sala válido de 4 letras.");
      }
    });
  }

  showOnlineLobby(room: any, localSocketId: string, onSwitchTeam: (team: "blue" | "red") => void, onStart: () => void): void {
    this.overlay.style.display = "flex";
    const isHost = room.hostId === localSocketId;

    // Normalize room.players whether it's an Array or Record object from server
    const playerList: any[] = Array.isArray(room.players)
      ? room.players
      : room.players && typeof room.players === "object"
      ? Object.values(room.players)
      : [];

    const bluePlayers = playerList.filter((p: any) => p.team === "blue");
    const redPlayers = playerList.filter((p: any) => p.team === "red");

    const displayCode = room.code || room.id || room.roomCode || "----";

    this.overlay.innerHTML = `
      <div class="roblox-inv-modal settings-modal-card" style="max-width: 680px;">
        <div class="roblox-inv-header">
          <button id="btn-back" class="roblox-back-btn">⬅ SALIR</button>
          <h2 class="roblox-inv-title">SALA: <span style="color: #10b981; font-family: monospace; font-size: 1.8rem; letter-spacing: 3px;">${displayCode}</span></h2>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px;">
          <!-- Blue Team Card -->
          <div style="background: rgba(30, 58, 138, 0.4); border: 2px solid #3b82f6; border-radius: 12px; padding: 16px;">
            <h3 style="color: #60a5fa; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
              <span>EQUIPO AZUL</span>
              <button id="btn-join-blue" class="roblox-btn-preview" style="font-size: 0.8rem; padding: 4px 10px;">UNIRSE</button>
            </h3>
            <ul style="list-style: none; padding: 0; margin: 0;">
              ${bluePlayers.map((p: any) => `<li style="padding: 8px; background: rgba(15, 23, 42, 0.6); margin-bottom: 6px; border-radius: 6px; font-weight: bold; color: #fff;">⚽ ${p.name} ${p.id === room.hostId ? "👑 (HOST)" : ""} ${p.id === localSocketId ? " (TÚ)" : ""}</li>`).join("")}
              ${bluePlayers.length === 0 ? `<li style="color: #64748b; font-style: italic;">Esperando jugadores...</li>` : ""}
            </ul>
          </div>

          <!-- Red Team Card -->
          <div style="background: rgba(136, 19, 55, 0.4); border: 2px solid #f43f5e; border-radius: 12px; padding: 16px;">
            <h3 style="color: #fb7185; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
              <span>EQUIPO ROJO</span>
              <button id="btn-join-red" class="roblox-btn-preview" style="font-size: 0.8rem; padding: 4px 10px;">UNIRSE</button>
            </h3>
            <ul style="list-style: none; padding: 0; margin: 0;">
              ${redPlayers.map((p: any) => `<li style="padding: 8px; background: rgba(15, 23, 42, 0.6); margin-bottom: 6px; border-radius: 6px; font-weight: bold; color: #fff;">⚽ ${p.name} ${p.id === room.hostId ? "👑 (HOST)" : ""} ${p.id === localSocketId ? " (TÚ)" : ""}</li>`).join("")}
              ${redPlayers.length === 0 ? `<li style="color: #64748b; font-style: italic;">Esperando jugadores...</li>` : ""}
            </ul>
          </div>
        </div>

        <div class="settings-bottom-actions" style="margin-top: 24px;">
          ${isHost
            ? `<button id="btn-start-online" class="btn-roblox-kickoff btn-save-modal" style="width: 100%;">¡EMPEZAR PARTIDO ONLINE! ⚽</button>`
            : `<p style="color: #94a3b8; text-align: center; font-style: italic;">Esperando a que el HOST inicie el partido...</p>`}
        </div>
      </div>
    `;

    document.querySelector("#btn-back")?.addEventListener("click", () => {
      this.sound.playButtonClick();
      this.showMainMenu();
    });
    document.querySelector("#btn-join-blue")?.addEventListener("click", () => {
      this.sound.playLobbySwitch();
      onSwitchTeam("blue");
    });
    document.querySelector("#btn-join-red")?.addEventListener("click", () => {
      this.sound.playLobbySwitch();
      onSwitchTeam("red");
    });

    if (isHost) {
      document.querySelector("#btn-start-online")?.addEventListener("click", () => {
        this.sound.playWhistle("start");
        onStart();
      });
    }
  }

  playLobbyJoinSound(): void {
    this.sound.playLobbyJoin();
  }

  playLobbySwitchSound(): void {
    this.sound.playLobbySwitch();
  }

  playMatchStartSound(): void {
    this.sound.playWhistle("start");
  }

  hideOverlay(): void {
    this.overlay.style.display = "none";
  }

  showPauseMenu(): void {
    this.overlay.style.display = "flex";
    this.overlay.innerHTML = `
      <div class="roblox-inv-modal pause-modal-card">
        <div class="pause-header">
          <span class="pause-icon">⏸️</span>
          <h1 class="pause-title">PARTIDO EN PAUSA</h1>
        </div>
        <div class="pause-actions-stack">
          <button id="btn-resume" class="btn-roblox-kickoff btn-resume">REANUDAR ⚽</button>
          <button id="btn-quit" class="roblox-btn-preview btn-quit-menu">SALIR AL MENÚ</button>
        </div>
      </div>
    `;

    document.querySelector("#btn-resume")?.addEventListener("click", () => {
      this.hideOverlay();
      this.onResumeCallback?.();
    });

    document.querySelector("#btn-quit")?.addEventListener("click", () => {
      this.onQuitToMenuCallback?.();
      this.showMainMenu();
    });
  }

  showGameOver(winner: "blue" | "red" | "draw", blueScore: number, redScore: number): void {
    this.overlay.style.display = "flex";
    const titleText = winner === "draw" ? "¡EMPATE!" : winner === "blue" ? "¡EQUIPO AZUL GANA!" : "¡EQUIPO ROJO GANA!";
    const headerClass = winner === "blue" ? "blue-win" : winner === "red" ? "red-win" : "draw-win";

    this.overlay.innerHTML = `
      <div class="roblox-inv-modal victory-modal-card">
        <div class="victory-banner-top ${headerClass}">
          <span class="victory-trophy-icon">${winner === "draw" ? "🤝" : "🏆"}</span>
          <h1 class="victory-title-text">${titleText}</h1>
          <span class="victory-sub-text">${winner === "draw" ? "PARTIDO MUY IGUALADO" : "¡VICTORIA ÉPICA!"}</span>
        </div>

        <div class="victory-scoreboard-box">
          <div class="victory-team-badge blue">
            <span class="team-label">AZUL</span>
            <span class="team-score-num">${blueScore}</span>
          </div>

          <div class="victory-vs-divider">VS</div>

          <div class="victory-team-badge red">
            <span class="team-label">ROJO</span>
            <span class="team-score-num">${redScore}</span>
          </div>
        </div>

        <div class="victory-actions-stack">
          <button id="btn-rematch" class="btn-roblox-kickoff btn-rematch">REVANCHA 🔄</button>
          <button id="btn-main-menu" class="roblox-btn-preview btn-menu-return">MENÚ PRINCIPAL</button>
        </div>
      </div>
    `;

    document.querySelector("#btn-rematch")?.addEventListener("click", () => {
      this.hideOverlay();
      if (this.selectedMode === "ONLINE") {
        this.showOnlineMenu();
      } else {
        this.onStartMatchCallback?.({
          mode: this.selectedMode,
          duration: this.duration,
          goalLimit: this.goalLimit,
          skinIndex: this.currentSkin,
          jerseyNumber: this.jerseyNumber,
          badgeEmoji: this.badgeEmoji,
          customColor: this.customColor,
          borderStyle: this.borderStyle,
          pattern: this.pattern,
        });
      }
    });

    document.querySelector("#btn-main-menu")?.addEventListener("click", () => {
      this.onQuitToMenuCallback?.();
      this.showMainMenu();
    });
  }
}
