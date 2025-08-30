#ifndef PATH_CORRIDOR_H
#define PATH_CORRIDOR_H

#include "data_structures.h"
#include "navmesh.h"
#include <vector>

bool findCorridor(
  Navmesh& navmesh,
  float FREE_WIDTH,
  float STRAY_MULT,
  const Point2& startPoint,
  const Point2& endPoint,
  std::vector<int>& outCorridor,
  int startPolyHint = -1,
  int endPolyHint = -1
);

#endif // PATH_CORRIDOR_H 