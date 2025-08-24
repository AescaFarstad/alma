#include "raycasting.h"
#include "math_utils.h"
#include "nav_utils.h"
#include "navmesh.h"
#include <array>
#include <tuple>

// Forward declaration of internal functions
static std::vector<int> traceStraightCorridor(const Point2& startPoint, const Point2& endPoint, int startTriIdx, int endTriIdx, int& hitEdgeIndex);
static int traceStraightCorridorHitOnly(const Point2& startPoint, const Point2& endPoint, int startTriIdx, int endTriIdx, int& hitEdgeIndex);
static void getTrianglePoints(int triIdx, std::array<Point2, 3>& outPoints);


std::tuple<Point2, Point2, std::vector<int>, bool> raycastCorridor(const Point2& startPoint, const Point2& endPoint, int startTriIdx, int endTriIdx) {
    int hitEdgeIndex = -1;
    std::vector<int> corridor = traceStraightCorridor(startPoint, endPoint, startTriIdx, endTriIdx, hitEdgeIndex);

    if (corridor.empty()) {
        return std::make_tuple(startPoint, startPoint, std::vector<int>{}, true);
    }

    int lastTriIdx = corridor.back();
    
    bool hasClearPath = false;
    if (endTriIdx != -1) {
        if (lastTriIdx == endTriIdx) {
            hasClearPath = true;
        }
    } else {
        if (test_point_inside_triangle(endPoint, lastTriIdx)) {
            hasClearPath = true;
        }
    }

    if (hasClearPath) {
        return std::make_tuple(Point2{}, Point2{}, corridor, false);
    }

    if (hitEdgeIndex != -1) {
        std::array<Point2, 3> triPoints;
        getTrianglePoints(lastTriIdx, triPoints);
        Point2 p1 = triPoints[hitEdgeIndex];
        Point2 p2 = triPoints[(hitEdgeIndex + 1) % 3];
        return std::make_tuple(p1, p2, corridor, true);
    }

    return std::make_tuple(Point2{}, Point2{}, corridor, false); // Fallback
}

std::tuple<Point2, Point2, bool> raycastPoint(const Point2& startPoint, const Point2& endPoint, int startTriIdx, int endTriIdx) {
    int hitEdgeIndex = -1;
    int lastTriIdx = traceStraightCorridorHitOnly(startPoint, endPoint, startTriIdx, endTriIdx, hitEdgeIndex);

    if (lastTriIdx == -1) {
        return std::make_tuple(startPoint, startPoint, true);
    }

    bool hasClearPath = false;
    if (endTriIdx != -1) {
        if (lastTriIdx == endTriIdx) {
            hasClearPath = true;
        }
    } else {
        if (test_point_inside_triangle(endPoint, lastTriIdx)) {
            hasClearPath = true;
        }
    }

    if (hasClearPath) {
        return std::make_tuple(Point2{}, Point2{}, false);
    }

    if (hitEdgeIndex != -1) {
        std::array<Point2, 3> triPoints;
        getTrianglePoints(lastTriIdx, triPoints);
        Point2 p1 = triPoints[hitEdgeIndex];
        Point2 p2 = triPoints[(hitEdgeIndex + 1) % 3];
        return std::make_tuple(p1, p2, true);
    }

    return std::make_tuple(Point2{}, Point2{}, false); // Fallback
}

static std::vector<int> traceStraightCorridor(const Point2& startPoint, const Point2& endPoint, int startTriIdx, int endTriIdx, int& hitEdgeIndex) {
    int currentTriIdx = (startTriIdx != -1) ? startTriIdx : getTriangleFromPoint(startPoint);
    if (currentTriIdx == -1 || currentTriIdx >= g_navmesh.walkable_triangle_count) return {};

    std::vector<int> corridor;
    corridor.push_back(currentTriIdx);
    const int MAX_ITERATIONS = 5000;
    int previousTriIdx = -1;

    for (int iter = 0; iter < MAX_ITERATIONS; ++iter) {
        if (endTriIdx != -1 && currentTriIdx == endTriIdx) return corridor;

        std::array<Point2, 3> triPoints;
        getTrianglePoints(currentTriIdx, triPoints);

        if (endTriIdx == -1 && math::isPointInTriangle(endPoint, triPoints[0], triPoints[1], triPoints[2])) {
            return corridor;
        }

        int nextTriIdx = -1;
        int exitEdgeIdx = -1;

        if (previousTriIdx == -1) {
            bool c0 = math::isToRight(startPoint, endPoint, triPoints[0]);
            bool c1 = math::isToRight(startPoint, endPoint, triPoints[1]);
            bool c2 = math::isToRight(startPoint, endPoint, triPoints[2]);

            if (c0 != c1 && c0 != c2) exitEdgeIdx = c0 ? 0 : 2;
            else if (c1 != c0 && c1 != c2) exitEdgeIdx = c1 ? 1 : 0;
            else exitEdgeIdx = c2 ? 2 : 1;
        } else {
            int entryEdgeIdx = -1;
            for (int i = 0; i < 3; ++i) {
                if (g_navmesh.neighbors[currentTriIdx * 3 + i] == previousTriIdx) {
                    entryEdgeIdx = i;
                    break;
                }
            }

            if (entryEdgeIdx != -1) {
                const Point2& p_entry2 = triPoints[(entryEdgeIdx + 1) % 3];
                const Point2& p_apex = triPoints[(entryEdgeIdx + 2) % 3];
                if (math::isToRight(startPoint, endPoint, p_apex) != math::isToRight(startPoint, endPoint, p_entry2)) {
                    exitEdgeIdx = (entryEdgeIdx + 1) % 3;
                } else {
                    exitEdgeIdx = (entryEdgeIdx + 2) % 3;
                }
            }
        }
        
        if (exitEdgeIdx != -1) {
            nextTriIdx = g_navmesh.neighbors[currentTriIdx * 3 + exitEdgeIdx];
            if (nextTriIdx == -1 || nextTriIdx >= g_navmesh.walkable_triangle_count) {
                hitEdgeIndex = exitEdgeIdx;
                return corridor;
            }
        }

        if (nextTriIdx != -1) {
            previousTriIdx = currentTriIdx;
            currentTriIdx = nextTriIdx;
            corridor.push_back(currentTriIdx);
        } else {
            return corridor;
        }
    }
    return corridor;
}

static int traceStraightCorridorHitOnly(const Point2& startPoint, const Point2& endPoint, int startTriIdx, int endTriIdx, int& hitEdgeIndex) {
    int currentTriIdx = (startTriIdx != -1) ? startTriIdx : getTriangleFromPoint(startPoint);
    if (currentTriIdx == -1 || currentTriIdx >= g_navmesh.walkable_triangle_count) return -1;

    const int MAX_ITERATIONS = 5000;
    int previousTriIdx = -1;

    for (int iter = 0; iter < MAX_ITERATIONS; ++iter) {
        if (endTriIdx != -1 && currentTriIdx == endTriIdx) return currentTriIdx;

        std::array<Point2, 3> triPoints;
        getTrianglePoints(currentTriIdx, triPoints);
        
        if (endTriIdx == -1 && math::isPointInTriangle(endPoint, triPoints[0], triPoints[1], triPoints[2])) {
            return currentTriIdx;
        }

        int nextTriIdx = -1;
        int exitEdgeIdx = -1;

        if (previousTriIdx == -1) {
            bool c0 = math::isToRight(startPoint, endPoint, triPoints[0]);
            bool c1 = math::isToRight(startPoint, endPoint, triPoints[1]);
            bool c2 = math::isToRight(startPoint, endPoint, triPoints[2]);

            if (c0 != c1 && c0 != c2) exitEdgeIdx = c0 ? 0 : 2;
            else if (c1 != c0 && c1 != c2) exitEdgeIdx = c1 ? 1 : 0;
            else exitEdgeIdx = c2 ? 2 : 1;
        } else {
            int entryEdgeIdx = -1;
            for (int i = 0; i < 3; ++i) {
                if (g_navmesh.neighbors[currentTriIdx * 3 + i] == previousTriIdx) {
                    entryEdgeIdx = i;
                    break;
                }
            }
            if (entryEdgeIdx != -1) {
                const Point2& p_entry2 = triPoints[(entryEdgeIdx + 1) % 3];
                const Point2& p_apex = triPoints[(entryEdgeIdx + 2) % 3];
                if (math::isToRight(startPoint, endPoint, p_apex) != math::isToRight(startPoint, endPoint, p_entry2)) {
                    exitEdgeIdx = (entryEdgeIdx + 1) % 3;
                } else {
                    exitEdgeIdx = (entryEdgeIdx + 2) % 3;
                }
            }
        }
        
        if (exitEdgeIdx != -1) {
            nextTriIdx = g_navmesh.neighbors[currentTriIdx * 3 + exitEdgeIdx];
            if (nextTriIdx == -1 || nextTriIdx >= g_navmesh.walkable_triangle_count) {
                hitEdgeIndex = exitEdgeIdx;
                return currentTriIdx;
            }
        }

        if (nextTriIdx != -1) {
            previousTriIdx = currentTriIdx;
            currentTriIdx = nextTriIdx;
        } else {
            return currentTriIdx;
        }
    }
    return currentTriIdx;
}

static void getTrianglePoints(int triIdx, std::array<Point2, 3>& outPoints) {
    const int triVertexStartIndex = triIdx * 3;
    const int p1Index = g_navmesh.triangles[triVertexStartIndex];
    const int p2Index = g_navmesh.triangles[triVertexStartIndex + 1];
    const int p3Index = g_navmesh.triangles[triVertexStartIndex + 2];

    outPoints[0] = g_navmesh.vertices[p1Index];
    outPoints[1] = g_navmesh.vertices[p2Index];
    outPoints[2] = g_navmesh.vertices[p3Index];
} 