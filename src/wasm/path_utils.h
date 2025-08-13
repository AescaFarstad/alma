#ifndef PATH_UTILS_H
#define PATH_UTILS_H

#include "data_structures.h"

// Finds the triangle index in the navmesh that contains the given point.
// Returns -1 if the point is not on the navmesh.
int getTriangleFromPoint(const Point2& point);

#endif // PATH_UTILS_H 