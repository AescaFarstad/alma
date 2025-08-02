# Agent Debugging Utilities

This document describes the utilities available for debugging agent navigation and behavior. These tools are located in `src/logic/debug/`.

## `AgentDebugUtils.ts`

### `logAgentEvent(agent: Agent, message: string): void`
*(This utility is currently removed, but can be re-added to `Agent.ts`)*
Appends a timestamped log message to an agent's `debugLog` array. This is useful for creating a trace of an agent's actions over time.

Example `Agent.ts` implementation:
```typescript
// In Agent class
debugLog: string[] = [];

// Function
export function logAgentEvent(agent: Agent, message: string): void {
    const timestamp = Date.now();
    const logEntry = `[${timestamp}] ${message}`;
    agent.debugLog.push(logEntry);
    
    // Keep only the last 300 entries
    if (agent.debugLog.length > 300) {
        agent.debugLog = agent.debugLog.slice(-300);
    }
}
```

### `snapshotAgentPoints(agent: Agent, snapshotName: string): void`
Takes a snapshot of an agent's key positional `Point2` properties (`coordinate`, `lastValidPosition`, `nextCorner`, `preEscapeCorner`, `endTarget`). The snapshots are stored in a global store. This is useful for analyzing how these points change over time, especially before and after a specific event (e.g., a pathfinding failure, or a state change).

### `logPointAssignment(target: Point2, source: Point2, context: string, pointName: string): void`
Logs the assignment of one `Point2` to another. It helps track if `Point2` objects are being assigned by reference or by value, and can highlight potential reference sharing bugs.

### `logAgentReferenceIssues(agent: Agent, context: string): boolean`
Checks for and logs any shared references between an agent's key `Point2` properties. Shared references can lead to unintended side effects where updating one point accidentally updates another. This function returns `true` if any reference issues are found.

### `arePointsSuspiciouslyClose(p1: Point2, p2: Point2): boolean`
Returns `true` if two `Point2` points are very close to each other. This is used to detect situations that might lead to stuck agents, e.g., when a new `nextCorner` is assigned to the agent's current position.

## `StuckAgentAnalyzer.ts`

### `analyzeStuckAgent(agent: Agent): { scenario: string, possibleCause: string }`
Performs an analysis on a potentially stuck agent to determine the likely cause. It returns an object with a `scenario` description (e.g., "Stuck trying to reach final destination") and a `possibleCause` (e.g., "nextCorner is the same as the current position").

### `debugStuckAgent(agent: Agent): void`
A comprehensive debugging function that should be called when an agent is confirmed to be stuck. It logs a detailed report to the console, including:
- Agent's state and properties.
- Analysis from `analyzeStuckAgent`.
- Reference checks via `logAgentReferenceIssues`.
- A snapshot of the agent's points.

This provides a full picture of the agent's state at the moment it got stuck, which is invaluable for debugging complex navigation issues.

## `LogAnalyzer.ts`
Contains tools to analyze logs produced by agents, which is not being used right now.

## `ReferenceTracker.ts`
A utility for tracking object references to debug memory leaks or incorrect object sharing. `snapshotAgentPoints` uses this. 