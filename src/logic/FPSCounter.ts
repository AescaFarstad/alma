export interface FPSMetrics {
  currentFPS: number;
  averageFPS: number;
  maxFrameTime: number;
}

export class FPSCounter {
  private frameTimestamps: number[] = [];
  private lastFrameTime = 0;
  private currentFPS = 0;
  
  // Configuration constants
  private readonly HISTORY_DURATION_MS = 2000; // 2 seconds
  private readonly MAX_FRAME_TIME_MS = 1000; // Cap at 1 second to handle browser throttling
  private readonly MIN_FRAME_TIME_MS = 1; // Minimum meaningful frame time
  
  /**
   * Update the FPS counter with a new frame timestamp
   * @param now - Current timestamp in milliseconds (typically from performance.now() or Date.now())
   */
  public update(now: number): void {
    // Calculate current FPS from time since last frame
    if (this.lastFrameTime > 0) {
      const deltaTime = now - this.lastFrameTime;
      
      // Handle browser time limitations and throttling
      if (deltaTime >= this.MIN_FRAME_TIME_MS && deltaTime <= this.MAX_FRAME_TIME_MS) {
        this.currentFPS = 1000 / deltaTime;
      } else if (deltaTime > this.MAX_FRAME_TIME_MS) {
        // Browser was likely throttled or suspended
        this.currentFPS = 0;
      }
      // If deltaTime is too small, keep the previous FPS value
    }
    
    // Add current frame timestamp to history
    this.frameTimestamps.push(now);
    
    // Remove timestamps older than our history duration
    this.cleanupOldFrames(now);
    
    this.lastFrameTime = now;
  }
  
  /**
   * Get the current FPS based on the last frame interval
   */
  public getCurrentFPS(): number {
    return Math.round(this.currentFPS); // Round to integer
  }
  
  /**
   * Get the average FPS over the last two seconds
   */
  public getAverageFPS(): number {
    if (this.frameTimestamps.length < 2) {
      return 0;
    }
    
    const timeSpan = this.frameTimestamps[this.frameTimestamps.length - 1] - this.frameTimestamps[0];
    if (timeSpan <= 0) {
      return 0;
    }
    
    // Number of frames divided by time span in seconds
    const frameCount = this.frameTimestamps.length - 1; // Subtract 1 because we count intervals
    const averageFPS = (frameCount * 1000) / timeSpan;
    
    return Math.round(averageFPS); // Round to integer
  }
  
  /**
   * Get the maximum frame time (worst performance) over the last two seconds
   */
  public getMaxFrameTime(): number {
    if (this.frameTimestamps.length < 2) {
      return 0;
    }
    
    let maxFrameTime = 0;
    
    for (let i = 1; i < this.frameTimestamps.length; i++) {
      const frameTime = this.frameTimestamps[i] - this.frameTimestamps[i - 1];
      
      // Only consider valid frame times (ignore browser throttling)
      if (frameTime <= this.MAX_FRAME_TIME_MS) {
        maxFrameTime = Math.max(maxFrameTime, frameTime);
      }
    }
    
    return Math.round(maxFrameTime); // Round to integer
  }
  
  /**
   * Get all FPS metrics at once
   */
  public getMetrics(): FPSMetrics {
    return {
      currentFPS: this.getCurrentFPS(),
      averageFPS: this.getAverageFPS(),
      maxFrameTime: this.getMaxFrameTime()
    };
  }
  
  /**
   * Reset the FPS counter, clearing all history
   */
  public reset(): void {
    this.frameTimestamps = [];
    this.lastFrameTime = 0;
    this.currentFPS = 0;
  }
  
  /**
   * Get the number of frames recorded in the current history window
   */
  public getFrameCount(): number {
    return this.frameTimestamps.length;
  }
  
  /**
   * Remove frame timestamps older than the history duration
   */
  private cleanupOldFrames(currentTime: number): void {
    const cutoffTime = currentTime - this.HISTORY_DURATION_MS;
    
    // Remove frames older than the cutoff time
    let removeCount = 0;
    for (let i = 0; i < this.frameTimestamps.length; i++) {
      if (this.frameTimestamps[i] >= cutoffTime) {
        break;
      }
      removeCount++;
    }
    
    if (removeCount > 0) {
      this.frameTimestamps = this.frameTimestamps.slice(removeCount);
    }
  }
} 