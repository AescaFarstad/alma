/**
 * Utility to analyze agent debug logs to trace nextCorner value progression
 */

export interface CornerLogEntry {
  index: number;
  timestamp: string;
  action: string;
  coordinates: { x: number; y: number };
  source: string;
}

/**
 * Parses agent debug log to extract nextCorner value changes
 */
export function parseCornerProgression(debugLog: string[]): CornerLogEntry[] {
  const entries: CornerLogEntry[] = [];
  
  for (let i = 0; i < debugLog.length; i++) {
  const log = debugLog[i];
  let match: RegExpMatchArray | null;
  
  // Extract timestamp
  const timestampMatch = log.match(/^\[(\d+)\]/);
  const timestamp = timestampMatch ? timestampMatch[1] : 'unknown';
  
  // Check for different types of corner updates
  if ((match = log.match(/Started traveling\. nextCorner: \(([^,]+), ([^)]+)\)/))) {
    entries.push({
    index: i,
    timestamp,
    action: 'initial_pathfinding',
    coordinates: { x: parseFloat(match[1]), y: parseFloat(match[2]) },
    source: 'findPathToDestination'
    });
  } else if ((match = log.match(/Updated corners\. newCorner: \(([^,]+), ([^)]+)\)/))) {
    entries.push({
    index: i,
    timestamp,
    action: 'corner_update',
    coordinates: { x: parseFloat(match[1]), y: parseFloat(match[2]) },
    source: 'findNextCorner'
    });
  } else if ((match = log.match(/preEscapeCorner saved as: \(([^,]+), ([^)]+)\)/))) {
    entries.push({
    index: i,
    timestamp,
    action: 'save_preEscape',
    coordinates: { x: parseFloat(match[1]), y: parseFloat(match[2]) },
    source: 'escape_setup'
    });
  } else if ((match = log.match(/Escaped! nextCorner: \(([^,]+), ([^)]+)\)/))) {
    entries.push({
    index: i,
    timestamp,
    action: 'restore_from_preEscape',
    coordinates: { x: parseFloat(match[1]), y: parseFloat(match[2]) },
    source: 'escape_success'
    });
  }
  }
  
  return entries;
}

/**
 * Analyzes corner progression to identify when bad values were introduced
 */
export function analyzeCornerProgression(
  debugLog: string[], 
  currentPosition: { x: number; y: number },
  threshold: number = 0.01
): {
  progression: CornerLogEntry[];
  suspiciousEntries: CornerLogEntry[];
  summary: string;
} {
  const progression = parseCornerProgression(debugLog);
  const suspiciousEntries: CornerLogEntry[] = [];
  
  for (const entry of progression) {
  const distance = Math.sqrt(
    (entry.coordinates.x - currentPosition.x) ** 2 + 
    (entry.coordinates.y - currentPosition.y) ** 2
  );
  
  if (distance < threshold) {
    suspiciousEntries.push(entry);
  }
  }
  
  let summary = '';
  if (suspiciousEntries.length === 0) {
  summary = 'No suspicious corner values found in progression';
  } else {
  const firstSuspicious = suspiciousEntries[0];
  summary = `First suspicious corner value introduced at log index ${firstSuspicious.index} via ${firstSuspicious.action}`;
  
  if (suspiciousEntries.length > 1) {
    summary += `. Total suspicious entries: ${suspiciousEntries.length}`;
  }
  }
  
  return {
  progression,
  suspiciousEntries,
  summary
  };
}

/**
 * Console helper to analyze an agent's corner progression
 */
export function analyzeAgentCornerProgression(agent: { debugLog: string[]; coordinate: { x: number; y: number } }): void {
  console.group('📈 CORNER PROGRESSION ANALYSIS');
  
  const analysis = analyzeCornerProgression(agent.debugLog, agent.coordinate);
  
  console.log('📊 Summary:', analysis.summary);
  console.log('🔍 Full Progression:');
  analysis.progression.forEach((entry, i) => {
  const distance = Math.sqrt(
    (entry.coordinates.x - agent.coordinate.x) ** 2 + 
    (entry.coordinates.y - agent.coordinate.y) ** 2
  );
  const suspicious = distance < 0.01 ? ' ⚠️  SUSPICIOUS' : '';
  console.log(`  ${i + 1}. [${entry.timestamp}] ${entry.action}: (${entry.coordinates.x.toFixed(3)}, ${entry.coordinates.y.toFixed(3)}) distance: ${distance.toFixed(4)}${suspicious}`);
  });
  
  if (analysis.suspiciousEntries.length > 0) {
  console.log('⚠️  Suspicious Entries:');
  analysis.suspiciousEntries.forEach(entry => {
    console.log(`  Log ${entry.index}: ${entry.action} set corner to (${entry.coordinates.x.toFixed(3)}, ${entry.coordinates.y.toFixed(3)})`);
  });
  }
  
  console.groupEnd();
}

// Make it available globally for console debugging
if (typeof window !== 'undefined') {
  (window as any).analyzeAgentCornerProgression = analyzeAgentCornerProgression;
} 