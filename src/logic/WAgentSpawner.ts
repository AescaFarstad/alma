import type { WasmAgentSystem } from "./WasmAgentSystem";
import { getTriangleFromPoint } from "./navmesh/pathCorridor";
import { wagentsLimit, type GameState } from "./GameState";

export type WAgentSpawner = 
    { coordinate: { x: number, y: number } } & 
    { spawnCooldown: number } & 
    { spawnTimer: number } & 
    { spawnCount: number };

export function updateWAgentSpawners(spawners: WAgentSpawner[], wasmAgentSystem: WasmAgentSystem, dt: number, gs: GameState) {
    if (!spawners || !wasmAgentSystem) {
        return;
    }

    // Skip spawning until WASM is initialized
    // @ts-ignore internal check by presence of pointers (set after init)
    const isReady = (wasmAgentSystem as any).sharedBufferPtr && (wasmAgentSystem as any).navmeshBufferPtr;
    if (!isReady) {
        return;
    }

    if (wasmAgentSystem.agents.length > wagentsLimit)
        return;
    
    for (const spawner of spawners) {
        spawner.spawnTimer -= dt;
        if (spawner.spawnTimer <= 0) {
            spawner.spawnTimer += spawner.spawnCooldown;
            spawner.spawnCount++;

            // Create WAgent first
            const display = "character_black_blue";
            wasmAgentSystem.createAgent(
                spawner.coordinate.x, 
                spawner.coordinate.y, 
                display
            );

            // Get the agent index (last created agent)
            const agentIndex = wasmAgentSystem.agents.length - 1;
            const actualAgentIndex = wasmAgentSystem.agents[agentIndex].agentIndex;

            // Initialize current_tris like TS AgentSpawner does
            const currentTriView = wasmAgentSystem.agentDataViews.current_tris;
            const lastValidTrisView = wasmAgentSystem.agentDataViews.last_valid_tris;
            let startTri = -1;
            if (currentTriView && lastValidTrisView) {
                startTri = getTriangleFromPoint(gs.navmesh, spawner.coordinate);
                currentTriView[actualAgentIndex] = startTri;
                lastValidTrisView[actualAgentIndex] = startTri;
            }

            // Set agent parameters directly through shared memory data views
            // Default parameters match createAgent(x, y, 500, 0.9, 30, 1)
            const accelsView = wasmAgentSystem.agentDataViews.accels;
            const resistancesView = wasmAgentSystem.agentDataViews.resistances;
            const intelligencesView = wasmAgentSystem.agentDataViews.intelligences;
            const maxSpeedsView = wasmAgentSystem.agentDataViews.max_speeds;
            const maxFrustrationsView = wasmAgentSystem.agentDataViews.max_frustrations;
            const arrivalDesiredSpeedsView = wasmAgentSystem.agentDataViews.arrival_desired_speeds;
            const arrivalThresholdSqsView = wasmAgentSystem.agentDataViews.arrival_threshold_sqs;
            const frameIdsView = wasmAgentSystem.agentDataViews.frame_ids;

            if (accelsView && resistancesView && intelligencesView && maxSpeedsView) {
                // Base defaults
                let accel = 500;
                let resistance = 0.9;
                let maxFrustration = 30;
                let intelligence = 1;
                let arrivalDesiredSpeed = 1.0;
                let arrivalThresholdSq = 4.0;

                // Mirror AgentSpawner: even-numbered spawns are the "alt" type
                if (spawner.spawnCount % 2 === 0) {
                    arrivalDesiredSpeed = 0.05;
                    arrivalThresholdSq = 25;
                    intelligence = 0;
                }

                // Apply parameters directly to shared memory
                accelsView[actualAgentIndex] = accel;
                resistancesView[actualAgentIndex] = resistance;
                intelligencesView[actualAgentIndex] = intelligence;

                if (maxFrustrationsView) maxFrustrationsView[actualAgentIndex] = maxFrustration;
                if (arrivalDesiredSpeedsView) arrivalDesiredSpeedsView[actualAgentIndex] = arrivalDesiredSpeed;
                if (arrivalThresholdSqsView) arrivalThresholdSqsView[actualAgentIndex] = arrivalThresholdSq;
                wasmAgentSystem.agentDataViews.look_speeds[actualAgentIndex] = 50;

                // Calculate and set maxSpeed (same formula as regular Agent)
                let maxSpeed: number;
                if (resistance >= 1) {
                    maxSpeed = 0;
                } else if (resistance <= 0) {
                    maxSpeed = 999999;
                } else {
                    maxSpeed = accel / -Math.log(1 - resistance);
                }
                maxSpeedsView[actualAgentIndex] = maxSpeed;
            }

            // Set frame id per agent using lexicographic mapping
            if (frameIdsView) {
                const frameId = wasmAgentSystem.getFrameIdByName(display);
                frameIdsView[actualAgentIndex] = frameId;
            }

            // Rare event: spawn
            
        }
    }
} 