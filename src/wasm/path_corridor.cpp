#include "path_corridor.h"
#include "math_utils.h"
#include "nav_utils.h"
#include "fast_priority_queue.h"
#include "flat_maps.h"
#include <algorithm>

// Global state dependencies
extern Navmesh g_navmesh;

inline float heuristic(int from, int to) {
    return math::distance(g_navmesh.triangle_centroids[from], g_navmesh.triangle_centroids[to]);
}

std::vector<int> findCorridor(
    const Point2& startPoint,
    const Point2& endPoint,
    int startTriHint,
    int endTriHint
) {
    int startTri = (startTriHint != -1) ? startTriHint : getTriangleFromPoint(startPoint);
    int endTri = (endTriHint != -1) ? endTriHint : getTriangleFromPoint(endPoint);

    if (startTri == -1 || endTri == -1) {
        return {};
    }

    const int numTris = g_navmesh.triangles_count;

    FastPriorityQueue openSet;
    openSet.reserve(64); // small default; heap grows as needed
    openSet.put(startTri, 0.0f);

    FlatCameFrom cameFrom(static_cast<size_t>(numTris));
    FlatScores scores(static_cast<size_t>(numTris));
    scores.setG(startTri, 0.0f);
    scores.setF(startTri, heuristic(startTri, endTri));

    while (!openSet.empty()) {
        int current = openSet.get();

        if (current == endTri) {
            std::vector<int> path;
            path.push_back(current);
            while (cameFrom.has(current)) {
                current = cameFrom.get(current);
                path.push_back(current);
            }
            std::reverse(path.begin(), path.end());
            return path;
        }

        const int base = current * 3;
        for (int i = 0; i < 3; ++i) {
            const int neighbor = g_navmesh.neighbors[base + i];
            if (neighbor == -1 || neighbor >= g_navmesh.walkable_triangle_count) {
                continue;
            }

            const float tentative_g = scores.getG(current) + heuristic(current, neighbor);

            if (!scores.hasG(neighbor) || tentative_g < scores.getG(neighbor)) {
                cameFrom.set(neighbor, current);
                scores.setG(neighbor, tentative_g);
                const float f = tentative_g + heuristic(neighbor, endTri);
                scores.setF(neighbor, f);
                openSet.put(neighbor, f);
            }
        }
    }

    return {}; // No path found
} 