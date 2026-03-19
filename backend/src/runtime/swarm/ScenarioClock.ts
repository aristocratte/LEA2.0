export class ScenarioClock {
  private paused = false;
  private readonly resumeWaiters = new Set<() => void>();

  constructor(private readonly speed = 1) {}

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    this.resumeWaiters.forEach((resolve) => resolve());
    this.resumeWaiters.clear();
  }

  async sleep(ms: number): Promise<void> {
    let remaining = Math.max(0, Math.round(ms / Math.max(this.speed, 0.01)));
    while (remaining > 0) {
      await this.waitIfPaused();
      const chunk = Math.min(remaining, 25);
      await new Promise((resolve) => setTimeout(resolve, chunk));
      remaining -= chunk;
    }
  }

  private async waitIfPaused(): Promise<void> {
    while (this.paused) {
      await new Promise<void>((resolve) => {
        this.resumeWaiters.add(resolve);
      });
    }
  }
}
