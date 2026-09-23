import { KeyBindings, loadKeyBindings, saveKeyBindings } from "./KeyBindings";

export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private released = new Set<string>();
  private bindings: KeyBindings = loadKeyBindings();

  constructor() {
    window.addEventListener("keydown", (e) => {
      // Do not capture game inputs if typing in text inputs or textareas
      const targetTag = (e.target as HTMLElement)?.tagName;
      if (targetTag === "INPUT" || targetTag === "TEXTAREA") return;

      const key = e.key.toLowerCase();
      if (!this.keys.has(key)) this.pressed.add(key);
      this.keys.add(key);

      // Prevent scrolling for game controls
      if (
        [
          " ",
          "shift",
          "arrowup",
          "arrowdown",
          "arrowleft",
          "arrowright",
          "enter",
          "escape",
          this.bindings.up,
          this.bindings.down,
          this.bindings.left,
          this.bindings.right,
          this.bindings.kick,
          this.bindings.sprint,
          this.bindings.dash,
          this.bindings.dribbleLeft,
          this.bindings.dribbleRight,
        ].includes(key)
      ) {
        e.preventDefault();
      }
    });

    window.addEventListener("keyup", (e) => {
      const key = e.key.toLowerCase();
      this.keys.delete(key);
      this.released.add(key);
    });

    // Mouse button listeners (M1, M2, M3, Mouse 4, Mouse 5)
    window.addEventListener("mousedown", (e) => {
      const target = e.target as HTMLElement;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.closest("#menu-overlay")) return;

      const mouseKey = "mouse" + e.button;
      if (!this.keys.has(mouseKey)) this.pressed.add(mouseKey);
      this.keys.add(mouseKey);

      // Prevent browser default on right click or lateral buttons (mouse 4 / 5)
      if (e.button === 2 || e.button === 3 || e.button === 4) {
        e.preventDefault();
      }
    });

    window.addEventListener("mouseup", (e) => {
      const mouseKey = "mouse" + e.button;
      this.keys.delete(mouseKey);
      this.released.add(mouseKey);
    });

    // Mouse wheel impulse listener (WheelUp / WheelDown)
    window.addEventListener("wheel", (e) => {
      const target = e.target as HTMLElement;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.closest("#menu-overlay")) return;

      const wheelKey = e.deltaY < 0 ? "wheelup" : "wheeldown";
      if (!this.keys.has(wheelKey)) this.pressed.add(wheelKey);
      this.keys.add(wheelKey);

      setTimeout(() => {
        this.keys.delete(wheelKey);
        this.released.add(wheelKey);
      }, 70);

      const mappedKeys = Object.values(this.bindings);
      if (mappedKeys.includes(wheelKey)) {
        e.preventDefault();
      }
    }, { passive: false });

    // Prevent context menu during gameplay or if right click is mapped
    window.addEventListener("contextmenu", (e) => {
      const target = e.target as HTMLElement;
      if (target?.closest("#game") || Object.values(this.bindings).includes("mouse2")) {
        e.preventDefault();
      }
    });
  }

  getBindings(): KeyBindings {
    return this.bindings;
  }

  setBindings(newBindings: KeyBindings): void {
    this.bindings = { ...newBindings };
    saveKeyBindings(this.bindings);
  }

  reloadBindings(): void {
    this.bindings = loadKeyBindings();
  }

  isActionDown(action: keyof KeyBindings): boolean {
    const key = this.bindings[action];
    return key ? this.down(key) : false;
  }

  consumeActionPressed(action: keyof KeyBindings): boolean {
    const key = this.bindings[action];
    return key ? this.consumePressed(key) : false;
  }

  consumeActionReleased(action: keyof KeyBindings): boolean {
    const key = this.bindings[action];
    return key ? this.consumeReleased(key) : false;
  }

  down(key: string): boolean {
    return this.keys.has(key.toLowerCase());
  }

  consumePressed(key: string): boolean {
    const k = key.toLowerCase();
    if (!this.pressed.has(k)) return false;
    this.pressed.delete(k);
    return true;
  }

  consumeReleased(key: string): boolean {
    const k = key.toLowerCase();
    if (!this.released.has(k)) return false;
    this.released.delete(k);
    return true;
  }

  clearFrame(): void {
    this.pressed.clear();
    this.released.clear();
  }

  movementP1(): { x: number; y: number } {
    let x = 0;
    let y = 0;

    if (this.down(this.bindings.left)) x -= 1;
    if (this.down(this.bindings.right)) x += 1;
    if (this.down(this.bindings.up)) y -= 1;
    if (this.down(this.bindings.down)) y += 1;

    const len = Math.hypot(x, y);
    if (len > 0) {
      x /= len;
      y /= len;
    }

    return { x, y };
  }

  movementP2(): { x: number; y: number } {
    let x = 0;
    let y = 0;

    if (this.down("arrowleft")) x -= 1;
    if (this.down("arrowright")) x += 1;
    if (this.down("arrowup")) y -= 1;
    if (this.down("arrowdown")) y += 1;

    const len = Math.hypot(x, y);
    if (len > 0) {
      x /= len;
      y /= len;
    }

    return { x, y };
  }

  movement(): { x: number; y: number } {
    return this.movementP1();
  }
}