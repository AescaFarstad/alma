#ifndef PATH_CORRIDOR_H
#define PATH_CORRIDOR_H

#include "data_structures.h"
#include <vector>

std::vector<int> findCorridor(
    const Point2& startPoint,
    const Point2& endPoint,
    int startTriHint = -1,
    int endTriHint = -1
);

#endif // PATH_CORRIDOR_H 