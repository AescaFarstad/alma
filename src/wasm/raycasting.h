#ifndef RAYCASTING_H
#define RAYCASTING_H

#include "data_structures.h"
#include <vector>
#include <tuple>

struct RaycastCorridorResult {
  int hitV1_idx;    // vertex index on last walkable triangle
  int hitV2_idx;    // vertex index on last walkable triangle
  int hitTri_idx;   // unwalkable triangle index that blocked the ray, or -1
  std::vector<int> corridor; // fully walkable triangle corridor from start
};

RaycastCorridorResult raycastCorridor(
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
