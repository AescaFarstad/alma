#ifndef RAYCASTING_H
#define RAYCASTING_H

#include "data_structures.h"
#include <vector>
#include <tuple>

std::tuple<Point2, Point2, std::vector<int>, bool> raycastCorridor(
    const Point2& startPoint,
    const Point2& endPoint,
    int startTriIdx = -1,
    int endTriIdx = -1
);

std::tuple<Point2, Point2, bool> raycastPoint(
    const Point2& startPoint,
    const Point2& endPoint,
    int startTriIdx = -1,
    int endTriIdx = -1
);

#endif // RAYCASTING_H