#include "math_utils.h"
#include <limits>
#include <cstdint>
#include <iostream> // Added for logging
#include <iomanip>  // Added for std::fixed and std::setprecision

// PCG32 RNG implementation
namespace {
    static uint64_t g_pcg_state = 0x853c49e6748fea9bULL;
    // Multiplier: 0x5851F42D4C957F2D (same as TS 6364136223846793005)
    // Increment:  0x14057B7EF767814F (same as TS 1442695040888963407)
    static const uint64_t PCG_MULTIPLIER = 0x5851F42D4C957F2DULL;
    static const uint64_t PCG_INCREMENT  = 0x14057B7EF767814FULL; // must be odd
    static uint64_t g_pcg_inc   = PCG_INCREMENT;
}

namespace math {

void set_rng_seed(uint64_t seed) {
    // Replicate TS seedToState(seed) exactly:
    // s = abs(seed) & 0xFFFFFFFF
    uint64_t s = static_cast<uint64_t>(static_cast<uint32_t>(seed));
    uint64_t state = (s ^ 0x9E3779B97F4A7C15ULL) * 0xBF58476D1CE4E5B9ULL;
    state = (state ^ (state >> 30)) * 0x94D049BB133111EBULL;
    state = (state ^ (state >> 27)) * 0x9E3779B97F4A7C15ULL;
    state = (state ^ (state >> 31));
    g_pcg_state = state;
    g_pcg_inc = PCG_INCREMENT; // fixed stream, matches TS
}

static inline uint32_t rotr32(uint32_t x, uint32_t r) {
    return (x >> r) | (x << ((32 - r) & 31));
}

uint32_t pcg32() {
    // Generate output from current state (match TS implementation)
    uint32_t rot = static_cast<uint32_t>(g_pcg_state >> 59u);
    uint64_t x = g_pcg_state ^ (g_pcg_state >> 18u);
    uint32_t xorshifted = static_cast<uint32_t>((x >> 27u) & 0xFFFFFFFFu);
    
    // Advance state AFTER generating output
    g_pcg_state = g_pcg_state * PCG_MULTIPLIER + g_pcg_inc;
    
    return rotr32(xorshifted, rot);
}

float random_float01() {
    // Scale to [0,1)
    uint32_t raw = pcg32();
    float result = static_cast<float>(raw) / 4294967296.0f; // 2^32
    return result;
}

// Corresponds to TS seedToState
uint64_t seed_to_state(uint64_t seed) {
    uint64_t s = seed & 0xFFFFFFFF;
    uint64_t state = (s ^ 0x9E3779B97F4A7C15ULL) * 0xBF58476D1CE4E5B9ULL;
    state = (state ^ (state >> 30)) * 0x94D049BB133111EBULL;
    state = (state ^ (state >> 27)) * 0x9E3779B97F4A7C15ULL;
    return state ^ (state >> 31);
}

// Corresponds to TS pcgStateToOutput
uint32_t pcg_state_to_output(uint64_t state) {
    uint32_t rot = static_cast<uint32_t>(state >> 59u);
    uint64_t x = state ^ (state >> 18u);
    uint32_t xorshifted = static_cast<uint32_t>((x >> 27u) & 0xFFFFFFFFu);
    return rotr32(xorshifted, rot);
}

// A version of random_float01 that takes a state, generates a number, and advances the state IN PLACE.
// This matches the local behavior inside TS getRandomTriangleInArea
float seed_to_random_no_advance(uint64_t* seed_state) {
    uint64_t current_state = seed_to_state(*seed_state);
    uint32_t output = pcg_state_to_output(current_state);
    
    // Advance state for next iteration
    current_state = (current_state * PCG_MULTIPLIER + PCG_INCREMENT);
    *seed_state = current_state >> 32;

    return static_cast<float>(output) / 4294967296.0f;
}

// Corresponds to TS advanceSeed
uint64_t advance_seed_cpp(uint64_t seed) {
    uint64_t state = seed_to_state(seed);
    state = (state * PCG_MULTIPLIER + PCG_INCREMENT);
    return state >> 32;
}

int random_int(int min_inclusive, int max_inclusive) {
    if (max_inclusive <= min_inclusive) return min_inclusive;
    uint32_t r = pcg32();
    uint32_t range = static_cast<uint32_t>(max_inclusive - min_inclusive + 1);
    return min_inclusive + static_cast<int>(r % range);
}

bool lineSegmentIntersectionTest(const Point2& p1, const Point2& p2, const Point2& p3, const Point2& p4) {
    constexpr float EPSILON = 1e-10f;
    
    Point2 r = p2 - p1;
    Point2 s = p4 - p3;
    float r_cross_s = cross(r, s);
    Point2 q_minus_p = p3 - p1;
    
    if (std::abs(r_cross_s) < EPSILON) { // Lines are parallel
        if (std::abs(cross(q_minus_p, r)) < EPSILON) { // Lines are collinear
            float t0 = dot(q_minus_p, r) / dot(r, r);
            float t1 = t0 + dot(s, r) / dot(r, r);
            
            float tMin = std::min(t0, t1);
            float tMax = std::max(t0, t1);
            
            return tMax >= -EPSILON && tMin <= 1.0f + EPSILON;
        }
        return false; // Parallel and not collinear
    }
    
    float t = cross(q_minus_p, s) / r_cross_s;
    float u = cross(q_minus_p, r) / r_cross_s;
    
    return t >= -EPSILON && t <= 1.0f + EPSILON && u >= -EPSILON && u <= 1.0f + EPSILON;
}

Point2 getLineSegmentIntersectionPoint(const Point2& p1, const Point2& p2, const Point2& p3, const Point2& p4) {
    float den = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
    if (den == 0) {
        return {0, 0}; // Lines are parallel, return invalid point
    }
    
    float t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / den;
    float u = -((p1.x - p2.x) * (p1.y - p3.y) - (p1.y - p2.y) * (p1.x - p3.x)) / den;

    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
        return {
            p1.x + t * (p2.x - p1.x),
            p1.y + t * (p2.y - p1.y)
        };
    }

    return {0, 0}; // No intersection, return invalid point
}

Point2 lineLineIntersection(const Point2& lineP1, const Point2& lineDir1, const Point2& lineP2, const Point2& lineDir2) {
    float cross_product = cross(lineDir1, lineDir2);
    
    // Lines are parallel or collinear
    if (std::abs(cross_product) < 1e-9f) {
        return {0, 0}; // Return invalid point
    }

    Point2 dp = lineP2 - lineP1;
    float t = cross(dp, lineDir2) / cross_product;

    return {
        lineP1.x + t * lineDir1.x,
        lineP1.y + t * lineDir1.y
    };
}

static bool triangleAABBIntersectionDetailed(const std::vector<Point2>& triPoints, const Point2& cellMin, const Point2& cellMax) {
    // Check 1: Any triangle vertex inside the rectangle
    for (const Point2& p : triPoints) {
        if (p.x >= cellMin.x && p.x <= cellMax.x && p.y >= cellMin.y && p.y <= cellMax.y) {
            return true;
        }
    }

    // Check 2: Any rectangle corner inside the triangle
    std::vector<Point2> cellCorners = {
        cellMin,
        {cellMax.x, cellMin.y},
        cellMax,
        {cellMin.x, cellMax.y}
    };
    
    for (const Point2& corner : cellCorners) {
        if (isPointInTriangle(corner, triPoints[0], triPoints[1], triPoints[2])) {
            return true;
        }
    }

    // Check 3: Triangle edges intersecting rectangle edges
    std::vector<std::pair<Point2, Point2>> triEdges = {
        {triPoints[0], triPoints[1]},
        {triPoints[1], triPoints[2]},
        {triPoints[2], triPoints[0]}
    };
    
    std::vector<std::pair<Point2, Point2>> cellEdges = {
        {cellCorners[0], cellCorners[1]}, // bottom edge
        {cellCorners[1], cellCorners[2]}, // right edge
        {cellCorners[2], cellCorners[3]}, // top edge
        {cellCorners[3], cellCorners[0]}  // left edge
    };

    for (const auto& triEdge : triEdges) {
        for (const auto& cellEdge : cellEdges) {
            if (lineSegmentIntersectionTest(triEdge.first, triEdge.second, cellEdge.first, cellEdge.second)) {
                return true;
            }
        }
    }

    // Check 4: Separating Axis Theorem (SAT) test
    for (int i = 0; i < 3; i++) {
        Point2 edge = triPoints[(i + 1) % 3] - triPoints[i];
        Point2 normal = {-edge.y, edge.x}; // perpendicular to edge
        
        // Project triangle onto this axis
        float triMin = std::numeric_limits<float>::max();
        float triMax = std::numeric_limits<float>::lowest();
        for (const Point2& p : triPoints) {
            float proj = p.x * normal.x + p.y * normal.y;
            triMin = std::min(triMin, proj);
            triMax = std::max(triMax, proj);
        }
        
        // Project rectangle onto this axis
        float rectMin = std::numeric_limits<float>::max();
        float rectMax = std::numeric_limits<float>::lowest();
        for (const Point2& corner : cellCorners) {
            float proj = corner.x * normal.x + corner.y * normal.y;
            rectMin = std::min(rectMin, proj);
            rectMax = std::max(rectMax, proj);
        }
        
        // Check for separation on this axis
        if (triMax < rectMin || rectMax < triMin) {
            return false; // Separated on this axis
        }
    }

    return true;
}

bool triangleAABBIntersection(const std::vector<Point2>& triPoints, const Point2& cellMin, const Point2& cellMax) {
    if (triPoints.size() != 3) return false;
    
    // Calculate triangle bounding box
    float triMinX = triPoints[0].x, triMinY = triPoints[0].y;
    float triMaxX = triPoints[0].x, triMaxY = triPoints[0].y;
    
    for (int i = 1; i < 3; i++) {
        const Point2& p = triPoints[i];
        if (p.x < triMinX) triMinX = p.x;
        if (p.y < triMinY) triMinY = p.y;
        if (p.x > triMaxX) triMaxX = p.x;
        if (p.y > triMaxY) triMaxY = p.y;
    }
    
    // Quick rejection: if bounding boxes don't overlap
    if (!aabbIntersection({triMinX, triMinY}, {triMaxX, triMaxY}, cellMin, cellMax)) {
        return false;
    }
    
    return triangleAABBIntersectionDetailed(triPoints, cellMin, cellMax);
}

bool triangleAABBIntersectionWithBounds(const std::vector<Point2>& triPoints, const Point2& triMin, const Point2& triMax, const Point2& cellMin, const Point2& cellMax) {
    // Broad phase: Quick AABB vs AABB test using pre-calculated bounds
    if (!aabbIntersection(triMin, triMax, cellMin, cellMax)) {
        return false;
    }
    
    // If bounding boxes overlap, we need detailed intersection tests
    return triangleAABBIntersectionDetailed(triPoints, cellMin, cellMax);
}

// Check if point is inside polygon using winding number algorithm
static bool isPointInPolygon(const Point2& point, const std::vector<Point2>& polygon) {
    int wn = 0; // winding number
    int n = polygon.size();
    
    for (int i = 0; i < n; i++) {
        int j = (i + 1) % n;
        if (polygon[i].y <= point.y) {
            if (polygon[j].y > point.y) { // upward crossing
                if (cross(polygon[j] - polygon[i], point - polygon[i]) > 0) {
                    ++wn;
                }
            }
        } else {
            if (polygon[j].y <= point.y) { // downward crossing
                if (cross(polygon[j] - polygon[i], point - polygon[i]) < 0) {
                    --wn;
                }
            }
        }
    }
    return wn != 0;
}

// Detailed polygon-AABB intersection test
static bool polygonAABBIntersectionDetailed(const std::vector<Point2>& polyPoints, const Point2& cellMin, const Point2& cellMax) {
    // Check 1: Any polygon vertex inside the rectangle
    for (const Point2& p : polyPoints) {
        if (p.x >= cellMin.x && p.x <= cellMax.x && p.y >= cellMin.y && p.y <= cellMax.y) {
            return true;
        }
    }

    // Check 2: Any rectangle corner inside the polygon
    std::vector<Point2> cellCorners = {
        cellMin,
        {cellMax.x, cellMin.y},
        cellMax,
        {cellMin.x, cellMax.y}
    };
    
    for (const Point2& corner : cellCorners) {
        if (isPointInPolygon(corner, polyPoints)) {
            return true;
        }
    }

    // Check 3: Polygon edges intersecting rectangle edges
    int n = polyPoints.size();
    std::vector<std::pair<Point2, Point2>> polyEdges;
    for (int i = 0; i < n; i++) {
        polyEdges.push_back({polyPoints[i], polyPoints[(i + 1) % n]});
    }
    
    std::vector<std::pair<Point2, Point2>> cellEdges = {
        {cellCorners[0], cellCorners[1]}, // bottom edge
        {cellCorners[1], cellCorners[2]}, // right edge
        {cellCorners[2], cellCorners[3]}, // top edge
        {cellCorners[3], cellCorners[0]}  // left edge
    };

    for (const auto& polyEdge : polyEdges) {
        for (const auto& cellEdge : cellEdges) {
            if (lineSegmentIntersectionTest(polyEdge.first, polyEdge.second, cellEdge.first, cellEdge.second)) {
                return true;
            }
        }
    }

    // Check 4: Separating Axis Theorem (SAT) test
    // Test separation along polygon edge normals
    for (int i = 0; i < n; i++) {
        Point2 edge = polyPoints[(i + 1) % n] - polyPoints[i];
        Point2 normal = {-edge.y, edge.x}; // perpendicular to edge
        
        // Project polygon onto this axis
        float polyMin = std::numeric_limits<float>::max();
        float polyMax = std::numeric_limits<float>::lowest();
        for (const Point2& p : polyPoints) {
            float proj = p.x * normal.x + p.y * normal.y;
            polyMin = std::min(polyMin, proj);
            polyMax = std::max(polyMax, proj);
        }
        
        // Project rectangle onto this axis
        float rectMin = std::numeric_limits<float>::max();
        float rectMax = std::numeric_limits<float>::lowest();
        for (const Point2& corner : cellCorners) {
            float proj = corner.x * normal.x + corner.y * normal.y;
            rectMin = std::min(rectMin, proj);
            rectMax = std::max(rectMax, proj);
        }
        
        // Check for separation on this axis
        if (polyMax < rectMin || rectMax < polyMin) {
            return false; // Separated on this axis
        }
    }

    return true;
}

bool polygonAABBIntersection(const std::vector<Point2>& polyPoints, const Point2& cellMin, const Point2& cellMax) {
    if (polyPoints.size() < 3) return false;
    
    // Calculate polygon bounding box
    float polyMinX = polyPoints[0].x, polyMinY = polyPoints[0].y;
    float polyMaxX = polyPoints[0].x, polyMaxY = polyPoints[0].y;
    
    for (size_t i = 1; i < polyPoints.size(); i++) {
        const Point2& p = polyPoints[i];
        if (p.x < polyMinX) polyMinX = p.x;
        if (p.y < polyMinY) polyMinY = p.y;
        if (p.x > polyMaxX) polyMaxX = p.x;
        if (p.y > polyMaxY) polyMaxY = p.y;
    }
    
    // Quick rejection: if bounding boxes don't overlap
    if (!aabbIntersection({polyMinX, polyMinY}, {polyMaxX, polyMaxY}, cellMin, cellMax)) {
        return false;
    }
    
    return polygonAABBIntersectionDetailed(polyPoints, cellMin, cellMax);
}

bool polygonAABBIntersectionWithBounds(const std::vector<Point2>& polyPoints, const Point2& polyMin, const Point2& polyMax, const Point2& cellMin, const Point2& cellMax) {
    // Broad phase: Quick AABB vs AABB test using pre-calculated bounds
    if (!aabbIntersection(polyMin, polyMax, cellMin, cellMax)) {
        return false;
    }
    
    // If bounding boxes overlap, we need detailed intersection tests
    return polygonAABBIntersectionDetailed(polyPoints, cellMin, cellMax);
}


// A simplified version of SAT for AABB vs Triangle intersection
// This is not a full SAT implementation but is sufficient for the purpose of grid indexing.
// The logic is based on checking for a separating axis between the triangle's AABB and the cell's AABB.

} // namespace math 