import { Agent } from '../agents/Agent';
import { Point2 } from '../core/math';

export interface ReferenceMap {
  coordinate: Set<string>;
  lastCoordinate: Set<string>;
  nextCorner: Set<string>;
  nextCorner2: Set<string>;
  endTarget: Set<string>;
  lastValidPosition: Set<string>;
  preEscapeCorner: Set<string>;
  velocity: Set<string>;
  lastAppliedAccel: Set<string>;
  look: Set<string>;
}

/**
 * Detects if any Point2 fields in an agent share the same object reference
 */
export function detectAgentReferenceIssues(agent: Agent): ReferenceMap {
  const refs: ReferenceMap = {
    coordinate: new Set(),
    lastCoordinate: new Set(),
    nextCorner: new Set(),
    nextCorner2: new Set(),
    endTarget: new Set(),
    lastValidPosition: new Set(),
    preEscapeCorner: new Set(),
    velocity: new Set(),
    lastAppliedAccel: new Set(),
    look: new Set()
  };

  const fields = [
    'coordinate', 'lastCoordinate', 'nextCorner', 'nextCorner2', 
    'endTarget', 'lastValidPosition', 'preEscapeCorner', 
    'velocity', 'lastAppliedAccel', 'look'
  ] as const;

  // Map each object to the fields that reference it
  const objectToFields = new Map<object, string[]>();
  
  for (const field of fields) {
    const obj = agent[field as keyof Agent] as Point2 | null;
    if (obj) {
      if (!objectToFields.has(obj)) {
        objectToFields.set(obj, []);
      }
      objectToFields.get(obj)!.push(field);
    }
  }

  // Report which fields share references (filter out expected nextCorner/preEscapeCorner sharing)
  for (const [obj, fieldList] of objectToFields) {
    if (fieldList.length > 1) {
      // Filter out the expected case where only nextCorner and preEscapeCorner share a reference
      const isOnlyNextCornerAndPreEscape = fieldList.length === 2 && 
        fieldList.includes('nextCorner') && fieldList.includes('preEscapeCorner');
      
      if (!isOnlyNextCornerAndPreEscape) {
        for (const field of fieldList) {
          refs[field as keyof ReferenceMap].add(fieldList.join(', '));
        }
      }
    }
  }

  return refs;
}

/**
 * Logs reference issues if any are found
 */
export function logAgentReferenceIssues(agent: Agent, context: string): boolean {
  const refs = detectAgentReferenceIssues(agent);
  let hasIssues = false;

  for (const [field, sharedWith] of Object.entries(refs)) {
    if (sharedWith.size > 0) {
      console.error(`REFERENCE ISSUE [${context}]: Agent field '${field}' shares reference with: ${Array.from(sharedWith).join(' | ')}`);
      hasIssues = true;
    }
  }

  return hasIssues;
}

/**
 * Creates a snapshot of all Point2 fields with their values and references
 */
export function snapshotAgentPoints(agent: Agent, label: string): void {
  const snapshot = {
    label,
    timestamp: Date.now(),
    fields: {
      coordinate: { value: {...agent.coordinate}, ref: agent.coordinate },
      lastCoordinate: { value: {...agent.lastCoordinate}, ref: agent.lastCoordinate },
      nextCorner: { value: {...agent.nextCorner}, ref: agent.nextCorner },
      nextCorner2: { value: {...agent.nextCorner2}, ref: agent.nextCorner2 },
      endTarget: { value: {...agent.endTarget}, ref: agent.endTarget },
      lastValidPosition: { value: {...agent.lastValidPosition}, ref: agent.lastValidPosition },
      preEscapeCorner: agent.preEscapeCornerTri !== -1 ? { value: {...agent.preEscapeCorner}, ref: agent.preEscapeCorner } : { value: {...agent.preEscapeCorner}, ref: agent.preEscapeCorner, note: 'invalid' },
      velocity: { value: {...agent.velocity}, ref: agent.velocity },
      lastAppliedAccel: { value: {...agent.lastAppliedAccel}, ref: agent.lastAppliedAccel },
      look: { value: {...agent.look}, ref: agent.look }
    }
  };

  // Store in a global array for debugging
  if (!(window as any).agentSnapshots) {
    (window as any).agentSnapshots = [];
  }
  (window as any).agentSnapshots.push(snapshot);
  
  // Keep only last 50 snapshots to avoid memory bloat
  if ((window as any).agentSnapshots.length > 50) {
    (window as any).agentSnapshots.shift();
  }
}

/**
 * Tracks where Point2 assignments happen (skip preEscapeCorner cases)
 */
export function logPointAssignment(
  target: Point2, 
  source: Point2, 
  context: string, 
  targetName: string = 'unknown'
): void {
  if (target === source && context !== 'escape_success') {
    console.warn(`REFERENCE ASSIGNMENT [${context}]: ${targetName} assigned same reference as source`, {
      target: {...target},
      source: {...source},
      sameRef: target === source
    });
  }
}

/**
 * Deep comparison of two Point2 objects
 */
export function arePointsValueEqual(p1: Point2, p2: Point2, epsilon: number = 1e-6): boolean {
  return Math.abs(p1.x - p2.x) < epsilon && Math.abs(p1.y - p2.y) < epsilon;
}

/**
 * Checks if two points are suspiciously close (potential bug indicator)
 */
export function arePointsSuspiciouslyClose(p1: Point2, p2: Point2, threshold: number = 0.01): boolean {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const distSq = dx * dx + dy * dy;
  return distSq < threshold * threshold;
} 