#ifndef FLAT_MAPS_H
#define FLAT_MAPS_H

#include <vector>
#include <limits>
#include <cstdint>
#include <algorithm>

// Flat arrays to replace unordered_map for A* on fixed triangle index domain [0, numTriangles)
struct FlatCameFrom {
    std::vector<int32_t> parent; // -1 = unknown

    FlatCameFrom() = default;
    explicit FlatCameFrom(size_t size) { init(size); }

    inline void init(size_t size) { parent.assign(size, -1); }
    inline void reset() { std::fill(parent.begin(), parent.end(), -1); }
    inline bool has(int idx) const { return idx >= 0 && (size_t)idx < parent.size() && parent[(size_t)idx] != -1; }
    inline void set(int child, int par) { parent[(size_t)child] = par; }
    inline int get(int idx) const { return parent[(size_t)idx]; }
};

struct FlatScores {
    std::vector<float> g; // max() = unknown
    std::vector<float> f;

    FlatScores() = default;
    explicit FlatScores(size_t size) { init(size); }

    inline void init(size_t size) {
        const float kUnknown = std::numeric_limits<float>::max();
        g.assign(size, kUnknown);
        f.assign(size, kUnknown);
    }

    inline void reset() {
        const float kUnknown = std::numeric_limits<float>::max();
        std::fill(g.begin(), g.end(), kUnknown);
        std::fill(f.begin(), f.end(), kUnknown);
    }

    inline bool hasG(int idx) const { return g[(size_t)idx] != std::numeric_limits<float>::max(); }
    inline float getG(int idx) const { return g[(size_t)idx]; }
    inline float getF(int idx) const { return f[(size_t)idx]; }
    inline void setG(int idx, float val) { g[(size_t)idx] = val; }
    inline void setF(int idx, float val) { f[(size_t)idx] = val; }
};

#endif // FLAT_MAPS_H 