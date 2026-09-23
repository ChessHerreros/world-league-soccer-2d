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