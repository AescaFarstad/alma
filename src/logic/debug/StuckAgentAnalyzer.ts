import { Agent } from '../agents/Agent';
import { Point2, distance_sq } from '../core/math';
import { analyzeAgentCornerProgression } from './LogAnalyzer';
import { checkReferenceCorruption } from './ReferenceTracker';

export interface StuckAgentAnalysis {
  isStuck: boolean;
  scenario: string;
  distanceToNextCorner: number;
  possibleCause: string;
  referenceIssues: string[];
  recommendations: string[];
}

/**
 * Analyzes a stuck agent to determine the likely cause
 */
export function analyzeStuckAgent(agent: Agent): StuckAgentAnalysis {
  const analysis: StuckAgentAnalysis = {
  isStuck: false,
  scenario: 'unknown',
  distanceToNextCorner: Math.sqrt(distance_sq(agent.coordinate, agent.nextCorner)),
  possibleCause: 'unknown',
  referenceIssues: [],
  recommendations: []
  };

  // Check if agent is actually stuck
  const distSq = distance_sq(agent.coordinate, agent.nextCorner);
  analysis.isStuck = distSq < 0.01 && agent.numValidCorners === 1;
  
  if (!analysis.isStuck) {
  analysis.scenario = 'not_stuck';
  return analysis;
  }

  // Analyze reference issues (skip expected nextCorner/preEscapeCorner sharing)
  if (agent.nextCorner === agent.coordinate) {
  analysis.referenceIssues.push('nextCorner is same reference as coordinate');
  }
  if (agent.nextCorner === agent.lastValidPosition) {
  analysis.referenceIssues.push('nextCorner is same reference as lastValidPosition');
  }
  if (agent.nextCorner === agent.endTarget) {
  analysis.referenceIssues.push('nextCorner is same reference as endTarget');
  }
  // Note: nextCorner sharing reference with preEscapeCorner is expected and not an issue

  // Analyze the scenario based on agent state and debug log
  const recentLogs = agent.debugLog.slice(-10); // Look at last 10 log entries
  const hasEscapeLog = recentLogs.some(log => log.includes('Escaped!'));
  const hasCornerUpdateLog = recentLogs.some(log => log.includes('Updated corners'));
  const hasFindPathLog = recentLogs.some(log => log.includes('Started traveling'));

  if (hasEscapeLog) {
  analysis.scenario = 'stuck_after_escape';
  analysis.possibleCause = 'preEscapeCorner was set to a point very close to agent position, and when agent escaped back to navmesh, nextCorner was set to preEscapeCorner';
  analysis.recommendations.push('Check if preEscapeCorner was properly validated before use');
  analysis.recommendations.push('Consider adding distance check before setting nextCorner to preEscapeCorner');
  } else if (hasCornerUpdateLog) {
  analysis.scenario = 'stuck_after_corner_update';
  analysis.possibleCause = 'funnel algorithm produced a corner very close to agent position during normal path following';
  analysis.recommendations.push('Check funnel algorithm for edge cases');
  analysis.recommendations.push('Validate corner distance before assignment');
  } else if (hasFindPathLog) {
  analysis.scenario = 'stuck_after_pathfinding';
  analysis.possibleCause = 'initial pathfinding produced a corner very close to start position';
  analysis.recommendations.push('Check pathfinding algorithm for edge cases');
  } else {
  analysis.scenario = 'stuck_unknown_origin';
  analysis.possibleCause = 'nextCorner became equal to position through unknown mechanism';
  }

  // Check corridor state
  if (agent.corridor.length === 1 && agent.currentTri === agent.corridor[0]) {
  analysis.recommendations.push('Agent is in destination triangle, should transition to Standing state');
  }

  return analysis;
}

/**
 * Tests the escape scenario hypothesis and analyzes where the bad value originated
 */
export function testEscapeScenarioHypothesis(agent: Agent): {
  hypothesis: string;
  evidence: string[];
  confidence: 'high' | 'medium' | 'low';
  originalBadValueSource?: string;
} {
  const evidence: string[] = [];
  let originalBadValueSource: string | undefined;
  
  // Look for evidence in debug log
  const logs = agent.debugLog;
  const escapeSetupIndex = logs.findIndex(log => log.includes('preEscapeCorner saved as'));
  const escapeSuccessIndex = logs.findIndex(log => log.includes('Escaped! nextCorner'));
  
  if (escapeSetupIndex !== -1 && escapeSuccessIndex !== -1) {
  evidence.push('Found escape setup and success logs in agent history');
  
  // Extract coordinates from logs
  const setupLog = logs[escapeSetupIndex];
  const successLog = logs[escapeSuccessIndex];
  
  evidence.push(`Setup log: ${setupLog}`);
  evidence.push(`Success log: ${successLog}`);
  
  // Parse coordinates if possible
  const setupMatch = setupLog.match(/preEscapeCorner saved as: \(([^,]+), ([^)]+)\)/);
  const successMatch = successLog.match(/Escaped! nextCorner: \(([^,]+), ([^)]+)\)/);
  
  if (setupMatch && successMatch) {
    const setupX = parseFloat(setupMatch[1]);
    const setupY = parseFloat(setupMatch[2]);
    const successX = parseFloat(successMatch[1]);
    const successY = parseFloat(successMatch[2]);
    
    if (Math.abs(setupX - successX) < 0.01 && Math.abs(setupY - successY) < 0.01) {
    evidence.push('preEscapeCorner coordinates match escaped nextCorner coordinates');
    }
    
    // Check if these coordinates are close to current position
    const distToCurrentSq = (setupX - agent.coordinate.x) ** 2 + (setupY - agent.coordinate.y) ** 2;
    if (distToCurrentSq < 0.01) {
    evidence.push('preEscapeCorner was very close to current agent position');
    }
    
    // Try to find where the original bad nextCorner value came from
    // Look backwards from the escape setup to find the last corner update
    for (let i = escapeSetupIndex - 1; i >= 0; i--) {
    const log = logs[i];
    if (log.includes('Updated corners. newCorner:')) {
      const match = log.match(/Updated corners\. newCorner: \(([^,]+), ([^)]+)\)/);
      if (match) {
      const cornerX = parseFloat(match[1]);
      const cornerY = parseFloat(match[2]);
      const distToSetupSq = (cornerX - setupX) ** 2 + (cornerY - setupY) ** 2;
      if (distToSetupSq < 0.01) {
        originalBadValueSource = 'corner_update';
        evidence.push(`Bad value originated from corner update: ${log}`);
        break;
      }
      }
    } else if (log.includes('Started traveling. nextCorner:')) {
      const match = log.match(/Started traveling\. nextCorner: \(([^,]+), ([^)]+)\)/);
      if (match) {
      const cornerX = parseFloat(match[1]);
      const cornerY = parseFloat(match[2]);
      const distToSetupSq = (cornerX - setupX) ** 2 + (cornerY - setupY) ** 2;
      if (distToSetupSq < 0.01) {
        originalBadValueSource = 'initial_pathfinding';
        evidence.push(`Bad value originated from initial pathfinding: ${log}`);
        break;
      }
      }
    }
    }
  }
  }

  // Determine confidence
  let confidence: 'high' | 'medium' | 'low' = 'low';
  if (evidence.length >= 3) confidence = 'high';
  else if (evidence.length >= 2) confidence = 'medium';

  return {
  hypothesis: 'Agent became stuck because preEscapeCorner was set to a point very close to agent position when falling off navmesh, and when escaping back to navmesh, nextCorner was set to this problematic preEscapeCorner value',
  evidence,
  confidence,
  originalBadValueSource
  };
}

/**
 * Console helper to run full analysis on a stuck agent
 */
export function debugStuckAgent(agent: Agent): void {
  console.group('🔍 STUCK AGENT ANALYSIS');
  
  const analysis = analyzeStuckAgent(agent);
  console.log('📊 Analysis:', analysis);
  
  const hypothesis = testEscapeScenarioHypothesis(agent);
  console.log('💡 Escape Hypothesis:', hypothesis);
  
  if (hypothesis.originalBadValueSource) {
  console.log(`🎯 Root Cause: Bad value originated from ${hypothesis.originalBadValueSource}`);
  }
  
  // Reference check (excluding expected preEscapeCorner sharing)
  const refs = {
  nextCorner_vs_coordinate: agent.nextCorner === agent.coordinate,
  nextCorner_vs_lastValidPosition: agent.nextCorner === agent.lastValidPosition,
  nextCorner_vs_endTarget: agent.nextCorner === agent.endTarget
  };
  console.log('🔗 Reference Check (problematic ones only):', refs);
  
  // Corner progression analysis
  analyzeAgentCornerProgression(agent);
  
  // Reference corruption analysis
  checkReferenceCorruption(agent);
  
  // Recent debug log
  console.log('📝 Recent Debug Log (last 15 entries):');
  agent.debugLog.slice(-15).forEach((log, i) => {
  console.log(`  ${agent.debugLog.length - 15 + i}: ${log}`);
  });
  
  console.groupEnd();
} 