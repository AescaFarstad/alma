#include "path_corridor.h"
#include "math_utils.h"
#include "nav_utils.h"
#include "fast_priority_queue.h"
#include "flat_maps.h"
#include <algorithm>

// Global state dependencies
extern Navmesh g_navmesh;

// Pre-allocated A* data structures for reuse
static FastPriorityQueue openSet;
static int32_t* cameFrom_parent = nullptr;
static int cameFrom_size = 0;
static FlatScores scores;
static bool astar_initialized = false;


inline float heuristic(int from, int to) {
    return math::distance(g_navmesh.poly_centroids[from], g_navmesh.poly_centroids[to]);
}

bool findCorridor(
    Navmesh& navmesh,
    const Point2& startPoint,
    const Point2& endPoint,
    std::vector<int>& outCorridor,
    int startPolyHint,
    int endPolyHint
) {
    int startPoly = (startPolyHint != -1) ? startPolyHint : getPolygonFromPoint(startPoint);
    int endPoly = (endPolyHint != -1) ? endPolyHint : getPolygonFromPoint(endPoint);

    if (startPoly == -1 || endPoly == -1) {
        return false;
    }

    if (startPoly == endPoly) {
        outCorridor.clear();
        outCorridor.push_back(startPoly);
        return true;
    }

    const int numWalkablePolys = g_navmesh.walkable_polygon_count;

    if (!astar_initialized) {
        openSet.reserve(256); // Reserve a reasonable starting capacity
        cameFrom_size = numWalkablePolys;
        cameFrom_parent = new int32_t[cameFrom_size];
        scores.init(numWalkablePolys);
        astar_initialized = true;
    } else {
        openSet.clear();
        scores.reset();
    }
    std::fill(cameFrom_parent, cameFrom_parent + cameFrom_size, -1);

    const float start_f = heuristic(startPoly, endPoly);
    openSet.put(startPoly, start_f);

    scores.setG(startPoly, 0.0f);
    scores.setF(startPoly, start_f);

    int iterations = 0;
    while (!openSet.empty()) {
        iterations++;
        if (iterations > 100000) {
            return false;
        }
        int current = openSet.get();

        if (scores.getG(current) < 0) { // Already processed
            continue;
        }

        if (current == endPoly) {
            outCorridor.clear();
            outCorridor.push_back(current);
            while (cameFrom_parent[current] != -1) {
                current = cameFrom_parent[current];
                outCorridor.push_back(current);
            }
            std::reverse(outCorridor.begin(), outCorridor.end());
            return true;
        }

        scores.setG(current, -1.0f); // Mark as processed

        const int32_t polyVertStart = g_navmesh.polygons[current];
        const int32_t polyVertEnd = g_navmesh.polygons[current + 1];
        const int32_t polyVertCount = polyVertEnd - polyVertStart;

        for (int i = 0; i < polyVertCount; i++) {
            const int32_t neighborIdx = polyVertStart + i;
            const int32_t neighbor = g_navmesh.poly_neighbors[neighborIdx];
            
            if (neighbor == -1 || (neighbor != endPoly && neighbor >= g_navmesh.walkable_polygon_count)) {
                continue;
            }

            const float g_from_current = scores.hasG(current) && scores.getG(current) >= 0 ? scores.getG(current) : 0; // !
            const float tentative_g = g_from_current + heuristic(current, neighbor); // !


            if (!scores.hasG(neighbor) || tentative_g < scores.getG(neighbor)) {
                cameFrom_parent[neighbor] = current;
                scores.setG(neighbor, tentative_g);
                const float f = tentative_g + heuristic(neighbor, endPoly);
                scores.setF(neighbor, f);
                openSet.put(neighbor, f);
            }
        }
    }

    return false;
} 