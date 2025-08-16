#ifndef RAYCASTING_H
#define RAYCASTING_H

#include "data_structures.h"
#include <vector>

struct RaycastWithCorridorResult {
    Point2 hitP1;
    Point2 hitP2;
    std::vector<int> corridor;
    bool hasHit;
};

struct RaycastHitOnlyResult {
    Point2 hitP1;
    Point2 hitP2;
    bool hasHit;
};

RaycastWithCorridorResult raycastCorridor(
    const Point2& startPoint,
    const Point2& endPoint,
    int startTriIdx = -1,
    int endTriIdx = -1
);

RaycastHitOnlyResult raycastPoint(
    const Point2& startPoint,
    const Point2& endPoint,
    int startTriIdx = -1,
    int endTriIdx = -1
);

#endif // RAYCASTING_H