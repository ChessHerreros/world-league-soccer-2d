export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private released = new Set<string>();

  constructor() {
    window.addEventListener("keydown", (e) => {
      const key = e.key.toLowerCase();
      if (!this.keys.has(key)) this.pressed.add(key);
      this.keys.add(key);

      if ([" ", "shift", "arrowup", "arrowdown", "arrowleft", "arrowright", "enter", "escape"].includes(key)) {
        e.preventDefault();
      }
    });

    window.addEventListener("keyup", (e) => {
      const key = e.key.toLowerCase();
      this.keys.delete(key);
      this.released.add(key);
    });
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

    if (this.down("a")) x -= 1;
    if (this.down("d")) x += 1;
    if (this.down("w")) y -= 1;
    if (this.down("s")) y += 1;

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