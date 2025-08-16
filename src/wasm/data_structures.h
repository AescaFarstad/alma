#ifndef DATA_STRUCTURES_H
#define DATA_STRUCTURES_H

#include <cstdint>
#include <vector>
#include <cmath>

#include "constants_layout.h"

struct Point2 {
    float x, y;
    Point2() : x(0.0f), y(0.0f) {}
    Point2(float x, float y) : x(x), y(y) {}
    Point2(const float* arr) : x(arr[0]), y(arr[1]) {}

    Point2 operator+(const Point2& other) const {
        return Point2(x + other.x, y + other.y);
    }

    Point2 operator-(const Point2& other) const {
        return Point2(x - other.x, y - other.y);
    }

    Point2 operator*(float scalar) const {
        return Point2(x * scalar, y * scalar);
    }

    Point2 operator/(float scalar) const {
        return Point2(x / scalar, y / scalar);
    }

    Point2& operator+=(const Point2& other) {
        x += other.x;
        y += other.y;
        return *this;
    }

    Point2& operator-=(const Point2& other) {
        x -= other.x;
        y -= other.y;
        return *this;
    }

    Point2& operator*=(float scalar) {
        x *= scalar;
        y *= scalar;
        return *this;
    }

    Point2& operator/=(float scalar) {
        x /= scalar;
        y /= scalar;
        return *this;
    }
};

// Enum for agent state, mirroring AgentState in Agent.ts
enum AgentState : uint8_t {
    Standing,
    Traveling,
    Escaping,
};

// Represents the navmesh data passed from JavaScript.
// All arrays point to memory within the navmeshBuffer provided during initialization.
struct NavmeshData {
    Point2* points;      // Vertex coordinates [x1, y1, x2, y2, ...] -> mapped to Point2 array
    int32_t* triangles;  // Triangle vertex indices [t1_v1, t1_v2, t1_v3, ...]
    int32_t* neighbors;  // Triangle neighbor indices [t1_n1, t1_n2, t1_n3, ...]
    Point2* centroids;   // Triangle centroids [c1x, c1y, c2x, c2y, ...] -> mapped to Point2 array
    int32_t numPoints;
    int32_t numTriangles;
};

struct NavmeshBBox {
    float minX;
    float minY;
    float maxX;
    float maxY;
};

// Defines the Structure of Arrays (SoA) layout for all agents.
// All arrays are views into a single SharedArrayBuffer managed by JavaScript.
struct AgentSoA {
    // Core physics
    Point2* positions;
    Point2* last_coordinates;
    Point2* velocities;
    Point2* looks;
    AgentState* states;
    bool* is_alive;

    // Navigation
    int* current_tris;
    Point2* next_corners;
    int* next_corner_tris;
    Point2* next_corners2;
    int* next_corner_tris2;
    uint8_t* num_valid_corners;  // 0, 1, or 2
    Point2* pre_escape_corners;
    int* pre_escape_corner_tris;
    Point2* end_targets;
    int* end_target_tris;
    Point2* last_valid_positions;
    int* last_valid_tris;

    // Statistics
    Point2* last_end_targets;
    int* min_corridor_lengths;
    float* last_distances_to_next_corner;
    float* sight_ratings;
    int* last_next_corner_tris;
    float* stuck_ratings;
    float* path_frustrations;

    // Agent parameters (read-only from JS)
    float* max_speeds;
    float* accels;
    float* resistances;
    float* intelligences;
    float* look_speeds;
    float* max_frustrations;
    float* arrival_desired_speeds;
    float* arrival_threshold_sqs;
    float* predicament_ratings;
    
    // Per-agent dynamic data (managed in C++)
    std::vector<int>* corridors;
    int* corridor_indices;

    // Placed at the very end of the shared layout
    uint16_t* frame_ids;

    int capacity;
};

struct AgentGridData {
    std::vector<uint16_t> cell_data;
    std::vector<uint32_t> cell_offsets;
    std::vector<uint16_t> cell_counts;
};

// Blob system data structures
struct BlobGeometry {
    std::vector<Point2> points;
    int id;
};

struct BlobSpatialCell {
    std::vector<int> blob_indices; // indices into global blob array
};

struct BoundingBox {
    float minX, minY, maxX, maxY;
};

struct BlobSpatialIndex {
    static const float CELL_SIZE;
    static const float WORLD_MIN_X;
    static const float WORLD_MIN_Y; 
    static const float WORLD_MAX_X;
    static const float WORLD_MAX_Y;
    static const int GRID_WIDTH;
    static const int GRID_HEIGHT;
    static const int TOTAL_CELLS;

    std::vector<BlobSpatialCell> cells;
    std::vector<BlobGeometry> blobs;

    void initialize();
    void add_blob(const BlobGeometry& blob);
    std::vector<int> search(const BoundingBox& box) const;
    int get_cell_index(float x, float y) const;
};

extern AgentSoA agent_data;
extern BlobSpatialIndex blob_spatial_index;

#endif // DATA_STRUCTURES_H 