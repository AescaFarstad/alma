#ifndef MATH_UTILS_H
#define MATH_UTILS_H

#include "data_structures.h"
#include <cmath>
#include <algorithm>
#include <vector>
#include <cstdint>

namespace math {

    // To match the TypeScript seededRandom behavior
    struct SeededRandomResult {
        float value;
        uint64_t newSeed;
    };
    
    uint64_t advance_seed(uint64_t seed);
    SeededRandomResult seededRandom(uint64_t seed);

    // Deterministic PCG32 RNG API
    void set_rng_seed(uint64_t seed);
    uint32_t pcg32();
    float random_float01();
    int random_int(int min_inclusive, int max_inclusive);

    // New functions to match TS logic
    float seed_to_random_no_advance(uint64_t* seed_state);
    uint64_t advance_seed_cpp(uint64_t seed_state);
    uint64_t seed_to_state(uint64_t seed);
    uint32_t pcg_state_to_output(uint64_t state);

    // Basic vector operations (many are already overloaded in Point2)

    inline float length_sq(const Point2& p) {
        return p.x * p.x + p.y * p.y;
    }

    inline float length(const Point2& p) {
        return std::sqrt(length_sq(p));
    }

    inline Point2 normalize(const Point2& p) {
        float len = length(p);
        if (len > 0) {
            return p / len;
        }
        return {0, 0};
    }

    inline float distance_sq(const Point2& p1, const Point2& p2) {
        float dx = p1.x - p2.x;
        float dy = p1.y - p2.y;
        return dx * dx + dy * dy;
    }

    inline float distance(const Point2& p1, const Point2& p2) {
        return std::sqrt(distance_sq(p1, p2));
    }

    inline float dot(const Point2& p1, const Point2& p2) {
        return p1.x * p2.x + p1.y * p2.y;
    }

    inline float cross(const Point2& p1, const Point2& p2) {
        return p1.x * p2.y - p1.y * p2.x;
    }

    inline void normalize_inplace(Point2& p) {
        float len = length(p);
        if (len > 0) {
            p /= len;
        } else {
            p.x = 0;
            p.y = 0;
        }
    }

    inline float lerp(float a, float b, float t) {
        return a + t * (b - a);
    }

    inline float clamp(float value, float min, float max) {
        return std::min(std::max(value, min), max);
    }

    inline float cvt(float val, float in_min, float in_max, float out_min, float out_max, bool clamp_v = false) {
        float v = clamp_v ? clamp(val, in_min, in_max) : val;
        return out_min + (v - in_min) * (out_max - out_min) / (in_max - in_min);
    }

    inline float cvtExp(float value, float in_min, float in_max, float out_min, float out_max, bool clamp_v = false) {
        float v = clamp_v ? clamp(value, in_min, in_max) : value;
        float t = (v - in_min) / (in_max - in_min);
        if (out_min <= 0 || out_max <= 0) {
            return cvt(value, in_min, in_max, out_min, out_max, clamp_v);
        }
        return out_min * std::pow(out_max / out_min, t);
    }

    // Geometric utilities

    inline float triangleArea(const Point2& A, const Point2& B, const Point2& C) {
        return std::abs((A.x * (B.y - C.y) + B.x * (C.y - A.y) + C.x * (A.y - B.y)) / 2.0f);
    }

    // Alternative, slower implementation for testing purposes. For a counter-clockwise triangle.
    // This version uses a canonical edge direction to handle floating-point issues robustly.
    inline bool isPointInTriangle2(float px, float py, float ax, float ay, float bx, float by, float cx, float cy) {
        // Edge AB
        bool abFlip = (ax > bx || (ax == bx && ay > by));
        float oab = abFlip
            ? (ax - bx) * (py - by) - (ay - by) * (px - bx)  // b->a
            : (bx - ax) * (py - ay) - (by - ay) * (px - ax); // a->b

        // Edge BC
        bool bcFlip = (bx > cx || (bx == cx && by > cy));
        float obc = bcFlip
            ? (bx - cx) * (py - cy) - (by - cy) * (px - cx)  // c->b
            : (cx - bx) * (py - by) - (cy - by) * (px - bx); // b->c

        // Edge CA
        bool caFlip = (cx > ax || (cx == ax && cy > ay));
        float oca = caFlip
            ? (cx - ax) * (py - ay) - (cy - ay) * (px - ax)  // a->c
            : (ax - cx) * (py - cy) - (ay - cy) * (px - cx); // c->a

        bool abOk = abFlip ? (oab <= 0) : (oab >= 0);
        bool bcOk = bcFlip ? (obc <= 0) : (obc >= 0);
        bool caOk = caFlip ? (oca <= 0) : (oca >= 0);

        return abOk && bcOk && caOk;
    }

    // Convenience overload that takes Point2 structs
    inline bool isPointInTriangle2(const Point2& p, const Point2& a, const Point2& b, const Point2& c) {
        return isPointInTriangle2(p.x, p.y, a.x, a.y, b.x, b.y, c.x, c.y);
    }

    inline bool isPointInTriangle(float px, float py, float ax, float ay, float bx, float by, float cx, float cy) {
        const float v0x = bx - ax; const float v0y = by - ay; // B - A
        const float v1x = cx - ax; const float v1y = cy - ay; // C - A
        const float v2x = px - ax; const float v2y = py - ay; // P - A

        const float det = v0x * v1y - v0y * v1x; // signed 2*area

        const float invDet = 1.0f / det;
        const float s = ( v1y * v2x - v1x * v2y) * invDet;
        const float t = (-v0y * v2x + v0x * v2y) * invDet;

        return (s >= -1e-12f) && (t >= -1e-12f) && (s + t <= 1.0f + 1e-12f);
    }

    inline bool isPointInTriangle(const Point2& p, const Point2& a, const Point2& b, const Point2& c) {
        return isPointInTriangle(p.x, p.y, a.x, a.y, b.x, b.y, c.x, c.y);
    }
    
    inline float distancePointToSegment(const Point2& p, const Point2& a, const Point2& b) {
        Point2 ab = b - a;
        Point2 ap = p - a;
        float lenSq = length_sq(ab);

        if (lenSq < 1e-12) {
            return distance(p, a);
        }

        float t = dot(ap, ab) / lenSq;
        t = std::max(0.0f, std::min(1.0f, t));
        
        Point2 closestPoint = a + ab * t;
        
        return distance(p, closestPoint);
    }

    inline bool isToRight(const Point2& p1, const Point2& p2, const Point2& p3) {
        return cross(p2 - p1, p3 - p1) < 0;
    }
    
    inline bool aabbIntersection(const Point2& min1, const Point2& max1, const Point2& min2, const Point2& max2) {
        return !(max1.x < min2.x || min1.x > max2.x || max1.y < min2.y || min1.y > max2.y);
    }

    // Intersection tests
    bool lineSegmentIntersectionTest(const Point2& p1, const Point2& p2, const Point2& p3, const Point2& p4);
    
    inline float pointLineSignedDistance(const Point2& point, const Point2& lineP1, const Point2& lineDir) {
        Point2 normal = {-lineDir.y, lineDir.x};
        Point2 pointVec = point - lineP1;
        float dist = dot(pointVec, normal) / length(normal);
        return dist;
    }

    Point2 getLineSegmentIntersectionPoint(const Point2& p1, const Point2& p2, const Point2& p3, const Point2& p4);
    Point2 lineLineIntersection(const Point2& lineP1, const Point2& lineDir1, const Point2& lineP2, const Point2& lineDir2);
    
    // Triangle-AABB intersection functions
    bool triangleAABBIntersection(const std::vector<Point2>& triPoints, const Point2& cellMin, const Point2& cellMax);
    bool triangleAABBIntersectionWithBounds(const std::vector<Point2>& triPoints, const Point2& triMin, const Point2& triMax, const Point2& cellMin, const Point2& cellMax);

    // Polygon-AABB intersection functions
    bool polygonAABBIntersection(const std::vector<Point2>& polyPoints, const Point2& cellMin, const Point2& cellMax);
    bool polygonAABBIntersectionWithBounds(const std::vector<Point2>& polyPoints, const Point2& polyMin, const Point2& polyMax, const Point2& cellMin, const Point2& cellMax);

} // namespace math

#endif // MATH_UTILS_H 