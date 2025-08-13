#ifndef PATH_CORNERS_H
#define PATH_CORNERS_H

#include "data_structures.h"
#include <vector>

struct Corner {
    Point2 point;
    int poly;
};

struct DualCorner {
    Point2 corner1;
    int poly1;
    Point2 corner2;
    int poly2;
    int numValid;
};

std::vector<Corner> findCorners(
    const std::vector<int>& corridor,
    const Point2& startPoint,
    const Point2& endPoint
);

DualCorner find_next_corner(
    Point2 pos,
    const std::vector<int>& corridor,
    Point2 end_pos,
    float offset
);

#endif // PATH_CORNERS_H 