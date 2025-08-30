/**
 * Tracks specific reference sharing that could cause the preEscapeCorner corruption bug
 */

export function verifyReferenceCorruption(agent: any): {
  hasCorruption: boolean;
  details: string[];
  recommendations: string[];
} {
  const details: string[] = [];
  const recommendations: string[] = [];
  let hasCorruption = false;

  // Check if coordinate and lastValidPosition share references
  if (agent.coordinate === agent.lastValidPosition) {
  hasCorruption = true;
  details.push('❌ coordinate === lastValidPosition (same object reference)');
  details.push(`   Values: coordinate(${agent.coordinate.x.toFixed(3)}, ${agent.coordinate.y.toFixed(3)})`);
  recommendations.push('Fix: Ensure lastValidPosition is a separate object from coordinate');
  } else {
  details.push('✅ coordinate and lastValidPosition are separate objects');
  }

  // Check if nextCorner points to the same object as coordinate/lastValidPosition  
  if (agent.nextCorner === agent.coordinate) {
  hasCorruption = true;
  details.push('❌ nextCorner === coordinate (same object reference)');
  recommendations.push('Fix: Ensure nextCorner is never assigned the same reference as coordinate');
  }

  if (agent.nextCorner === agent.lastValidPosition) {
  hasCorruption = true;
  details.push('❌ nextCorner === lastValidPosition (same object reference)');
  recommendations.push('Fix: Ensure set_(nextCorner, lastValidPosition) creates a copy, not reference assignment');
  }

  // Check preEscapeCorner relationship (only if it's valid)
  if (agent.preEscapeCornerPoly !== -1) {
  if (agent.preEscapeCorner === agent.coordinate) {
    hasCorruption = true;
    details.push('❌ preEscapeCorner === coordinate (same object reference)');
    recommendations.push('This explains why preEscapeCorner got corrupted to current position');
  }
  
  if (agent.preEscapeCorner === agent.lastValidPosition) {
    hasCorruption = true;
    details.push('❌ preEscapeCorner === lastValidPosition (same object reference)');
    recommendations.push('This explains why preEscapeCorner got corrupted to lastValidPosition');
  }
  }

  // Check for circular reference chains
  const objMap = new Map();
  const fields = ['coordinate', 'lastValidPosition', 'nextCorner', 'preEscapeCorner', 'endTarget'];
  
  fields.forEach(field => {
  const obj = agent[field];
  if (obj && typeof obj === 'object') {
    if (!objMap.has(obj)) {
    objMap.set(obj, []);
    }
    objMap.get(obj).push(field);
  }
  });

  for (const [obj, fieldList] of objMap) {
  if (fieldList.length > 1) {
    details.push(`🔗 Shared object: ${fieldList.join(', ')} point to same reference`);
    
    // This is problematic if it involves coordinate/lastValidPosition with others
    const hasCoord = fieldList.includes('coordinate');
    const hasLastValid = fieldList.includes('lastValidPosition');
    const hasOthers = fieldList.some((f: string) => !['coordinate', 'lastValidPosition'].includes(f));
    
    if ((hasCoord || hasLastValid) && hasOthers) {
    hasCorruption = true;
    details.push(`   ❌ This sharing is problematic and likely causes corruption`);
    }
  }
  }

  return {
  hasCorruption,
  details,
  recommendations
  };
}

/**
 * Quick console function to check reference corruption
 */
export function checkReferenceCorruption(agent: any): void {
  console.group('🔍 REFERENCE CORRUPTION ANALYSIS');
  
  const analysis = verifyReferenceCorruption(agent);
  
  console.log(`🚨 Has Corruption: ${analysis.hasCorruption}`);
  console.log('📋 Details:');
  analysis.details.forEach(detail => console.log(`  ${detail}`));
  
  if (analysis.recommendations.length > 0) {
  console.log('💡 Recommendations:');
  analysis.recommendations.forEach(rec => console.log(`  ${rec}`));
  }
  
  console.groupEnd();
}

// Make available globally
if (typeof window !== 'undefined') {
  (window as any).checkReferenceCorruption = checkReferenceCorruption;
} 