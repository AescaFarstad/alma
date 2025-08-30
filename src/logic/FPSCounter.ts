export interface FPSMetrics {
  currentFPS: number;
  averageFPS: number;
  longAverageFPS: number; // 10-second average
  maxFrameTime: number;
}

export class FPSCounter {
  // Circular buffer for frame timestamps using typed array
  private frameTimestamps: Float64Array;
  private bufferIndex = 0;
  private bufferSize = 0;
  private readonly MAX_BUFFER_SIZE = 1200; // 20 seconds * 60 FPS
  
  private lastFrameTime = 0;
  private currentFPS = 0;
  
  // Configuration constants
  private readonly HISTORY_DURATION_MS = 2000; // 2 seconds
  private readonly LONG_HISTORY_DURATION_MS = 10000; // 10 seconds
  private readonly MAX_FRAME_TIME_MS = 1000; // Cap at 1 second to handle browser throttling
  private readonly MIN_FRAME_TIME_MS = 1; // Minimum meaningful frame time

  constructor() {
  this.frameTimestamps = new Float64Array(this.MAX_BUFFER_SIZE);
  }
  
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
  
  // Add current frame timestamp to circular buffer
  this.frameTimestamps[this.bufferIndex] = now;
  this.bufferIndex = (this.bufferIndex + 1) % this.MAX_BUFFER_SIZE;
  
  // Track how many frames we have (up to MAX_BUFFER_SIZE)
  if (this.bufferSize < this.MAX_BUFFER_SIZE) {
    this.bufferSize++;
  }
  
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
  return this.calculateAverageFPS(this.HISTORY_DURATION_MS);
  }
  
  /**
   * Get the average FPS over the last ten seconds
   */
  public getLongAverageFPS(): number {
  return this.calculateAverageFPS(this.LONG_HISTORY_DURATION_MS);
  }
  
  /**
   * Calculate average FPS over a specified duration
   */
  private calculateAverageFPS(durationMs: number): number {
  if (this.bufferSize < 2) {
    return 0;
  }
  
  const now = this.lastFrameTime;
  const cutoffTime = now - durationMs;
  
  // Find oldest frame within the time window
  let oldestValidIndex = -1;
  let oldestValidTime = now;
  
  // Single pass through circular buffer
  if (this.bufferSize < this.MAX_BUFFER_SIZE) {
    // Buffer not full, iterate sequentially
    for (let i = 0; i < this.bufferSize; i++) {
    const timestamp = this.frameTimestamps[i];
    if (timestamp >= cutoffTime && timestamp < oldestValidTime) {
      oldestValidTime = timestamp;
      oldestValidIndex = i;
    }
    }
  } else {
    // Buffer is full, iterate chronologically
    for (let i = 0; i < this.MAX_BUFFER_SIZE; i++) {
    const idx = (this.bufferIndex + i) % this.MAX_BUFFER_SIZE;
    const timestamp = this.frameTimestamps[idx];
    
    if (timestamp >= cutoffTime) {
      // Found first valid timestamp (oldest in range)
      oldestValidTime = timestamp;
      oldestValidIndex = idx;
      break;
    }
    }
  }
  
  if (oldestValidIndex === -1) {
    return 0; // No frames in time window
  }
  
  const timeSpan = now - oldestValidTime;
  if (timeSpan <= 0) {
    return 0;
  }
  
  // Count frames from oldest valid to now
  let frameCount = 0;
  if (this.bufferSize < this.MAX_BUFFER_SIZE) {
    // Count frames from oldestValidIndex to latest
    for (let i = oldestValidIndex; i < this.bufferSize; i++) {
    if (this.frameTimestamps[i] >= cutoffTime) {
      frameCount++;
    }
    }
  } else {
    // Count frames chronologically from oldest valid
    let found = false;
    for (let i = 0; i < this.MAX_BUFFER_SIZE; i++) {
    const idx = (this.bufferIndex + i) % this.MAX_BUFFER_SIZE;
    const timestamp = this.frameTimestamps[idx];
    
    if (timestamp >= cutoffTime) {
      found = true;
    }
    if (found) {
      frameCount++;
    }
    }
  }
  
  const averageFPS = ((frameCount - 1) * 1000) / timeSpan; // -1 because we count intervals
  return Math.round(averageFPS);
  }
  
  /**
   * Get the maximum frame time (worst performance) over the last two seconds
   */
  public getMaxFrameTime(): number {
  if (this.bufferSize < 2) {
    return 0;
  }
  
  const now = this.lastFrameTime;
  const cutoffTime = now - this.HISTORY_DURATION_MS;
  let maxFrameTime = 0;
  let prevTimestamp = -1;
  
  // Single pass through circular buffer to find max frame time
  if (this.bufferSize < this.MAX_BUFFER_SIZE) {
    // Buffer not full, iterate sequentially
    for (let i = 0; i < this.bufferSize; i++) {
    const timestamp = this.frameTimestamps[i];
    if (timestamp >= cutoffTime) {
      if (prevTimestamp >= 0) {
      const frameTime = timestamp - prevTimestamp;
      if (frameTime <= this.MAX_FRAME_TIME_MS) {
        maxFrameTime = Math.max(maxFrameTime, frameTime);
      }
      }
      prevTimestamp = timestamp;
    }
    }
  } else {
    // Buffer is full, iterate chronologically
    for (let i = 0; i < this.MAX_BUFFER_SIZE; i++) {
    const idx = (this.bufferIndex + i) % this.MAX_BUFFER_SIZE;
    const timestamp = this.frameTimestamps[idx];
    
    if (timestamp >= cutoffTime) {
      if (prevTimestamp >= 0) {
      const frameTime = timestamp - prevTimestamp;
      if (frameTime <= this.MAX_FRAME_TIME_MS) {
        maxFrameTime = Math.max(maxFrameTime, frameTime);
      }
      }
      prevTimestamp = timestamp;
    }
    }
  }
  
  return Math.round(maxFrameTime);
  }
  
  /**
   * Get all FPS metrics at once
   */
  public getMetrics(): FPSMetrics {
  return {
    currentFPS: this.getCurrentFPS(),
    averageFPS: this.getAverageFPS(),
    longAverageFPS: this.getLongAverageFPS(),
    maxFrameTime: this.getMaxFrameTime()
  };
  }
  
  /**
   * Reset the FPS counter, clearing all history
   */
  public reset(): void {
  this.frameTimestamps.fill(0);
  this.bufferIndex = 0;
  this.bufferSize = 0;
  this.lastFrameTime = 0;
  this.currentFPS = 0;
  }
  
  /**
   * Get the number of frames recorded in the current history window
   */
  public getFrameCount(): number {
  return this.bufferSize;
  }
} 