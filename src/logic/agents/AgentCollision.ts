import { Agent, AgentState } from './Agent';
import { AgentGrid } from './AgentGrid';
import { distance_sq } from '../core/math';

/**
 * Agent collision detection and resolution using spatial grid
 * Only checks collisions within same grid cell for O(n × agents_per_cell) performance
 */

// Configuration constants
const AGENT_RADIUS = 2.5; // meters
const PUSH_FORCE = 10.0;   // force multiplier
const ESCAPING_WEIGHT_MULTIPLIER = 20.0;

/**
 * Process collisions using spatial grid optimization
 * Only agents in the same grid cell are checked for collisions
 */
export function updateAgentCollisions(agents: Agent[], grid: AgentGrid): void {
    const minDistance = AGENT_RADIUS * 2;
    const minDistanceSq = minDistance * minDistance;
    const cellData = grid.cellData;
    const cellCounts = grid.cellCounts;
    const cellOffsets = grid.cellOffsets;
    
    // Iterate over all cells
    for (let cellIndex = 0; cellIndex < grid.totalCells; cellIndex++) {
        const count = cellCounts[cellIndex];
        if (count < 2) continue; // Skip cells with 0 or 1 agents
        
        const offset = cellOffsets[cellIndex];
        
        // Check all agent pairs within this cell
        for (let i = 0; i < count; i++) {
            const agentIndex1 = cellData[offset + i];
            const agent1 = agents[agentIndex1];
            
            for (let j = i + 1; j < count; j++) {
                const agentIndex2 = cellData[offset + j];
                const agent2 = agents[agentIndex2];

                // Check for overlap using distance_sq optimization
                const distanceSq = distance_sq(agent1.coordinate, agent2.coordinate);
                
                if (distanceSq < minDistanceSq && distanceSq > 0.001) {
                    const distance = Math.sqrt(distanceSq);
                    const depth = minDistance - distance;
                    
                    // Calculate normalized separation vector
                    const dx = agent2.coordinate.x - agent1.coordinate.x;
                    const dy = agent2.coordinate.y - agent1.coordinate.y;
                    const normalX = dx / distance;
                    const normalY = dy / distance;

                    const weight1 = agent1.state === AgentState.Escaping ? ESCAPING_WEIGHT_MULTIPLIER : 1.0;
                    const weight2 = agent2.state === AgentState.Escaping ? ESCAPING_WEIGHT_MULTIPLIER : 1.0;
                    const totalWeight = weight1 + weight2;

                    const pushMagnitude = depth * PUSH_FORCE;
                    const force1 = pushMagnitude * (weight2 / totalWeight);
                    const force2 = pushMagnitude * (weight1 / totalWeight);

                    agent1.velocity.x -= normalX * force1;
                    agent1.velocity.y -= normalY * force1;
                    agent2.velocity.x += normalX * force2;
                    agent2.velocity.y += normalY * force2;
                }
            }
        }
    }
}