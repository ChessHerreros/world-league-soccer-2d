import { Vec2 } from "../math/Vec2";

export interface ArenaConfig {
  width: number;
  height: number;
  goalWidth: number;
}

export interface Post {
  position: Vec2;
  radius: number;
}

export class Arena {
  width: number;
  height: number;
  goalWidth: number;
  readonly goalDepth = 65;
  readonly postRadius = 8.5;
  readonly cornerSize = 42;
  posts: Post[] = [];

  constructor(config: ArenaConfig) {
    this.width = config.width;
    this.height = config.height;
    this.goalWidth = config.goalWidth;
    this.updatePosts();
  }

  setSize(width: number, height: number, goalWidth: number): void {
    this.width = width;
    this.height = height;
    this.goalWidth = goalWidth;
    this.updatePosts();
  }

  private updatePosts(): void {
    const gt = this.goalTop;
    const gb = this.goalBottom;
    const r = this.postRadius;

    this.posts = [
      { position: new Vec2(0, gt), radius: r },
      { position: new Vec2(0, gb), radius: r },
      { position: new Vec2(this.width, gt), radius: r },
      { position: new Vec2(this.width, gb), radius: r },
    ];
  }

  get goalTop(): number {
    return (this.height - this.goalWidth) / 2;
  }

  get goalBottom(): number {
    return this.goalTop + this.goalWidth;
  }

  readonly outerMargin = 75;

  isInsideGoal(y: number): boolean {
    return y >= this.goalTop && y <= this.goalBottom;
  }

  isOutOfBounds(x: number, y: number): boolean {
    return x < 0 || x > this.width || y < 0 || y > this.height;
  }
}