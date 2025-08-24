#ifndef FLAT_MAPS_H
#define FLAT_MAPS_H

#include <vector>
#include <limits>
#include <cstdint>
#include <algorithm>

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