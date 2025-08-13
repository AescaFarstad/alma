#include "path_utils.h"
#include "nav_tri_index.h"
#include "math_utils.h"
#include <vector>

// Note: These are global and assume single-threaded access within the WASM module
extern NavmeshData navmesh_data;
extern NavmeshBBox navmesh_bbox;

int getTriangleFromPoint(const Point2& point) {
    std::vector<int> possibleTris = query_nav_tri_index(point);

    for (int triIdx : possibleTris) {
        const int triVertexStartIndex = triIdx * 3;
        const int p1Index = navmesh_data.triangles[triVertexStartIndex];
        const int p2Index = navmesh_data.triangles[triVertexStartIndex + 1];
        const int p3Index = navmesh_data.triangles[triVertexStartIndex + 2];

        const Point2& p1 = navmesh_data.points[p1Index];
        const Point2& p2 = navmesh_data.points[p2Index];
        const Point2& p3 = navmesh_data.points[p3Index];

        if (math::isPointInTriangle(point, p1, p2, p3)) {
            return triIdx;
        }
    }

    return -1;
} 