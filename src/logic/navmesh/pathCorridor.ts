import { Navmesh } from "./Navmesh";
import { Point2, isPointInTriangle } from "../core/math";
// Remove aStar import since we're inlining it
import { GameState } from "../GameState";
// import { arePointsSuspiciouslyClose } from "../debug/AgentDebugUtils";
// import { ACINDIGO, sceneState } from "../drawing/SceneState";


// Binary heap-based priority queue with typed arrays for better performance
class PriorityQueue {
    private elements: Int32Array;
    private priorities: Float32Array;
    private size = 0;
    private capacity: number;
    
    constructor(initialCapacity = 1024) {
        this.capacity = initialCapacity;
        this.elements = new Int32Array(initialCapacity);
        this.priorities = new Float32Array(initialCapacity);
    }
    
    private resize(): void {
        const newCapacity = this.capacity * 2;
        const newElements = new Int32Array(newCapacity);
        const newPriorities = new Float32Array(newCapacity);
        
        newElements.set(this.elements);
        newPriorities.set(this.priorities);
        
        this.elements = newElements;
        this.priorities = newPriorities;
        this.capacity = newCapacity;
    }
    
    enqueue(element: number, priority: number): void {
        if (this.size >= this.capacity) {
            this.resize();
        }
        
        this.elements[this.size] = element;
        this.priorities[this.size] = priority;
        this.heapifyUp(this.size);
        this.size++;
    }
    
    dequeue(): number | undefined {
        if (this.size === 0) return undefined;
        
        const result = this.elements[0];
        
        this.size--;
        if (this.size > 0) {
            this.elements[0] = this.elements[this.size];
            this.priorities[0] = this.priorities[this.size];
            this.heapifyDown(0);
        }
        
        return result;
    }
    
    isEmpty(): boolean {
        return this.size === 0;
    }
    
    clear(): void {
        this.size = 0;
    }
    
    private heapifyUp(index: number): void {
        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);
            if (this.priorities[index] >= this.priorities[parentIndex]) {
                break;
            }
            this.swap(index, parentIndex);
            index = parentIndex;
        }
    }
    
    private heapifyDown(index: number): void {
        while (true) {
            const leftChild = 2 * index + 1;
            const rightChild = 2 * index + 2;
            let smallest = index;
            
            if (leftChild < this.size && this.priorities[leftChild] < this.priorities[smallest]) {
                smallest = leftChild;
            }
            
            if (rightChild < this.size && this.priorities[rightChild] < this.priorities[smallest]) {
                smallest = rightChild;
            }
            
            if (smallest === index) {
                break;
            }
            
            this.swap(index, smallest);
            index = smallest;
        }
    }
    
    private swap(i: number, j: number): void {
        // Swap elements
        const tempElement = this.elements[i];
        this.elements[i] = this.elements[j];
        this.elements[j] = tempElement;
        
        // Swap priorities
        const tempPriority = this.priorities[i];
        this.priorities[i] = this.priorities[j];
        this.priorities[j] = tempPriority;
    }
}

// Reusable priority queue instance with persistent pool
const sharedOpenSet = new PriorityQueue();

export function getTriangleFromPoint(navmesh: Navmesh, point: Point2): number {
    const possibleTris = navmesh.triangleIndex.query(point.x, point.y);
    
    for (let i = 0; i < possibleTris.length; i++) {
        const triIdx = possibleTris[i];
        
        // Skip non-walkable triangles
        if (triIdx >= navmesh.walkable_triangle_count) {
            continue;
        }
        
        const triVertexStartIndex = triIdx * 3;
        const p1Index = navmesh.triangles[triVertexStartIndex];
        const p2Index = navmesh.triangles[triVertexStartIndex + 1];
        const p3Index = navmesh.triangles[triVertexStartIndex + 2];

        const p1x = navmesh.vertices[p1Index * 2];
        const p1y = navmesh.vertices[p1Index * 2 + 1];
        const p2x = navmesh.vertices[p2Index * 2];
        const p2y = navmesh.vertices[p2Index * 2 + 1];
        const p3x = navmesh.vertices[p3Index * 2];
        const p3y = navmesh.vertices[p3Index * 2 + 1];

        if (isPointInTriangle(point.x, point.y, p1x, p1y, p2x, p2y, p3x, p3y)) {
            return triIdx;
        }
    }

    return -1;
}

export function findCorridor(
    navmesh: Navmesh, 
    startPoint: Point2, 
    endPoint: Point2, 
    startTriHint?: number, 
    endTriHint?: number,
    existingCorridor?: number[]
): number[] | null {
    const startTri = startTriHint !== undefined ? startTriHint : getTriangleFromPoint(navmesh, startPoint);
    const endTri = endTriHint !== undefined ? endTriHint : getTriangleFromPoint(navmesh, endPoint);

    if (startTri === -1 || endTri === -1) {
        return null;
    }

    // Create a set for fast lookup of existing corridor triangles
    const existingCorridorSet = existingCorridor && existingCorridor.length > 12 ? new Set(existingCorridor.slice(10)) : null;

    // Inline A* algorithm with navmesh-specific calculations
    const openSet = sharedOpenSet; // Use the shared instance
    openSet.clear(); // Clear any previous state while preserving the pool
    const cameFrom = new Map<number, number>();
    const gScore = new Map<number, number>();
    const fScore = new Map<number, number>();

    openSet.enqueue(startTri, 0);
    gScore.set(startTri, 0);
    
    // Inline heuristic calculation for start triangle
    const startHeuristicDx = navmesh.triangle_centroids[startTri * 2] - navmesh.triangle_centroids[endTri * 2];
    const startHeuristicDy = navmesh.triangle_centroids[startTri * 2 + 1] - navmesh.triangle_centroids[endTri * 2 + 1];
    const startHeuristic = Math.sqrt(startHeuristicDx * startHeuristicDx + startHeuristicDy * startHeuristicDy);
    fScore.set(startTri, startHeuristic);

    while (!openSet.isEmpty()) {
        const current = openSet.dequeue();

        if (current === undefined) {
            break;
        }

        // Check if we reached the end triangle
        if (current === endTri) {
            const path: number[] = [current];
            let temp = current;
            while (cameFrom.has(temp)) {
                temp = cameFrom.get(temp)!;
                path.push(temp);
            }
            return path.reverse();
        }

        // Early exit optimization: if we hit a triangle in the existing corridor,
        // we can use the rest of that corridor
        if (existingCorridorSet && existingCorridorSet.has(current)) {
            const existingTriIndex = existingCorridor!.indexOf(current);
            
            // Reconstruct path to current triangle
            const pathToCurrent: number[] = [current];
            let temp = current;
            while (cameFrom.has(temp)) {
                temp = cameFrom.get(temp)!;
                pathToCurrent.push(temp);
            }
            pathToCurrent.reverse();
            
            // Combine with remaining part of existing corridor
            const remainingCorridor = existingCorridor!.slice(existingTriIndex);
            
            // Remove the duplicate triangle at the junction
            return [...pathToCurrent.slice(0, -1), ...remainingCorridor];
        }

        // Inline getNeighbors calculation
        for (let i = 0; i < 3; i++) {
            const neighbor = navmesh.neighbors[current * 3 + i];
            if (neighbor >= navmesh.walkable_triangle_count) {
                continue;
            }

            // Inline getCost calculation
            const costDx = navmesh.triangle_centroids[current * 2] - navmesh.triangle_centroids[neighbor * 2];
            const costDy = navmesh.triangle_centroids[current * 2 + 1] - navmesh.triangle_centroids[neighbor * 2 + 1];
            const cost = Math.sqrt(costDx * costDx + costDy * costDy);
            
            const tentativeGScore = gScore.get(current)! + cost;

            if (!gScore.has(neighbor) || tentativeGScore < gScore.get(neighbor)!) {
                cameFrom.set(neighbor, current);
                gScore.set(neighbor, tentativeGScore);
                
                // Inline heuristic calculation
                const heuristicDx = navmesh.triangle_centroids[neighbor * 2] - navmesh.triangle_centroids[endTri * 2];
                const heuristicDy = navmesh.triangle_centroids[neighbor * 2 + 1] - navmesh.triangle_centroids[endTri * 2 + 1];
                const heuristic = Math.sqrt(heuristicDx * heuristicDx + heuristicDy * heuristicDy);
                
                const fScoreValue = tentativeGScore + heuristic;
                fScore.set(neighbor, fScoreValue);
                openSet.enqueue(neighbor, fScoreValue);
            }
        }
    }

    return null;
}
