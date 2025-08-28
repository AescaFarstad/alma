#include "path_corridor.h"
#include "math_utils.h"
#include "nav_utils.h"
#include "fast_priority_queue.h"
#include "constants_layout.h"
#include <algorithm>
#include <iostream>
#include <iomanip>
#include <limits>

// Global state dependencies
extern Navmesh g_navmesh;

// Pre-allocated A* data structures for reuse
static FastPriorityQueue openSet;
static int32_t* cameFrom_parent = nullptr;
static float* gScore = nullptr;
static float* heuristic = nullptr;
static int array_size = 0;
static bool astar_initialized = false;

bool findCorridor(
    Navmesh& navmesh,
    float FREE_WIDTH,
    float STRAY_MULT,
    const Point2& startPoint,
    const Point2& endPoint,
    std::vector<int>& outCorridor,
    int startPolyHint,
    int endPolyHint
) {
    const int startPoly = (startPolyHint != -1) ? startPolyHint : getPolygonFromPoint(startPoint);
    const int endPoly = (endPolyHint != -1) ? endPolyHint : getPolygonFromPoint(endPoint);

    if (startPoly == -1 || endPoly == -1) {
        std::cout << "[WA] findCorridor: FAILED - invalid polygons" << std::endl;
        return false;
    }

    if (startPoly == endPoly) {
        outCorridor.clear();
        outCorridor.push_back(startPoly);
        return true;
    }

    const int numWalkablePolys = g_navmesh.walkable_polygon_count;

    if (!astar_initialized) {
        openSet.reserve(256);
        array_size = numWalkablePolys;
        cameFrom_parent = new int32_t[array_size];
        gScore = new float[array_size];
        heuristic = new float[array_size];
        astar_initialized = true;
    } else {
        openSet.clear();
    }
    
    std::fill(cameFrom_parent, cameFrom_parent + array_size, -1);
    const float kUnknown = std::numeric_limits<float>::lowest();
    std::fill(gScore, gScore + array_size, kUnknown);
    std::fill(heuristic, heuristic + array_size, kUnknown);

    const Point2 startToEnd = endPoint - startPoint;
    const float lineDistDenomSq = math::length_sq(startToEnd);
    const float lineDistDenom = std::sqrt(lineDistDenomSq) + 1.0f;
    const float effectiveCMult = (lineDistDenom > FREE_WIDTH * 3.0f) ? STRAY_MULT : 0.0f;
    // std::cout << "[WA] effectiveCMult: " << effectiveCMult << std::endl;

    const Point2 endCentroid = g_navmesh.poly_centroids[endPoly];

    const float startScore = math::distance(startPoint, endPoint);
    openSet.put(startPoly, startScore);
    gScore[startPoly] = 0.0f;
    heuristic[startPoly] = 0.0f;

    int iterations = 0;
    while (!openSet.empty()) {
        iterations++;
        if (iterations > 100000) {
            std::cout << "[WA] findCorridor: FAILED - iteration limit reached" << std::endl;
            return false;
        }
        
        int current = openSet.get();

        if (current == endPoly) {
            outCorridor.clear();
            outCorridor.push_back(current);
            int temp = current;
            while (cameFrom_parent[temp] != -1) {
                temp = cameFrom_parent[temp];
                outCorridor.push_back(temp);
            }
            std::reverse(outCorridor.begin(), outCorridor.end());
            // std::cout << "[WA] " << iterations << " iterations" << std::endl;
            return true;
        }

        const int32_t polyVertStart = g_navmesh.polygons[current];
        const int32_t polyVertEnd = g_navmesh.polygons[current + 1];
        const int32_t polyVertCount = polyVertEnd - polyVertStart;

        const float myScore = gScore[current];
        const Point2 currentCentroid = g_navmesh.poly_centroids[current];
        
        for (int i = 0; i < polyVertCount; i++) {
            const int32_t neighbor = g_navmesh.poly_neighbors[polyVertStart + i];
            if (neighbor >= g_navmesh.walkable_polygon_count) {
                continue;
            }

            const Point2 neighborCentroid = g_navmesh.poly_centroids[neighbor];
            const float travelCost = math::distance(currentCentroid, neighborCentroid);
            const float tentativeGScore = travelCost + myScore;

            const bool neighborHasScore = (gScore[neighbor] != kUnknown);
            
            if (!neighborHasScore || tentativeGScore <  gScore[neighbor]) {
                cameFrom_parent[neighbor] = current;
                gScore[neighbor] = tentativeGScore;

                float heuristicValue;
                
                // Check if heuristic has already been computed for this neighbor
                if (heuristic[neighbor] == kUnknown) {
                    heuristicValue = math::distance(neighborCentroid, endCentroid);

                    if (effectiveCMult > 0.0f) {
                        // Penalize straying too far from the straight line
                        const float lineDistNum = std::abs(math::cross(endPoint - startPoint, neighborCentroid - startPoint));
                        const float distToLine = lineDistNum / lineDistDenom;
                        
                        Point2 v = neighborCentroid - startPoint;
                        math::normalize_inplace(v);
                        
                        const float d = math::dot(v, startToEnd) / lineDistDenom;
                        const float CFactor = std::max(0.0f, distToLine - FREE_WIDTH) * effectiveCMult * (1.0f + (1.0f - d));
                        
                        const float backtrack = std::max(0.0f, math::distance(endPoint, neighborCentroid) - lineDistDenom);                    
                        heuristicValue += CFactor + backtrack;
                    }
                    
                    // Cache the computed heuristic
                    heuristic[neighbor] = heuristicValue;
                } else {
                    // Use the cached heuristic
                    heuristicValue = heuristic[neighbor];
                }
                
                const float fScoreValue = tentativeGScore + heuristicValue;
                if (neighborHasScore) {
                    openSet.updatePriority(neighbor, fScoreValue);
                } else {
                    openSet.put(neighbor, fScoreValue);
                }
            }
        }
    }

    std::cout << "[WA] findCorridor: FAILED - no path found after " << iterations << " iterations" << std::endl;
    return false;
} 