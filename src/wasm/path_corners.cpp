#include "path_corners.h"
#include "math_utils.h"
#include "navmesh.h"
#include "nav_utils.h"
#include <vector>
#include <algorithm>

// Global state dependencies
extern Navmesh g_navmesh;

struct Portal {
  Point2 left;
  Point2 right;
  int leftVIdx;   // -1 if not a navmesh vertex
  int rightVIdx;  // -1 if not a navmesh vertex
};

static std::vector<Portal> getPolygonPortals(const std::vector<int>& corridor, const Point2& startPoint, const Point2& endPoint);
static Portal getPolygonPortalPoints(int poly1Idx, int poly2Idx);
static float triarea2(const Point2& p1, const Point2& p2, const Point2& p3);
static bool isPointsEqual(const Point2& p1, const Point2& p2, float epsilon = 1e-6);
static void funnel_dual(const std::vector<Portal>& portals, const std::vector<int>& corridor, DualCorner& result);
static void apply_offset_to_point(Point2& point, int vIdx, int tri, const Point2& end_pos, float offset);

std::vector<Corner> findCorners(const std::vector<int>& corridor, const Point2& startPoint, const Point2& endPoint) {
  if (corridor.empty()) {
    return {{endPoint, -1}};
  }
  
  std::vector<Portal> portals = getPolygonPortals(corridor, startPoint, endPoint);
  
  if (portals.size() < 2) {
    return {{startPoint, corridor[0]}};
  }

  std::vector<Corner> path;
  path.push_back({portals[0].left, corridor[0]});

  Point2 portalApex = portals[0].left;
  Point2 portalLeft = portals[0].left;
  Point2 portalRight = portals[0].right;

  int apexIndex = 0;
  int leftIndex = 0;
  int rightIndex = 0;

  for (size_t i = 1; i < portals.size(); ++i) {
    Point2 left = portals[i].left;
    Point2 right = portals[i].right;

    if (triarea2(portalApex, portalRight, right) <= 0.0f) {
      if (isPointsEqual(portalApex, portalRight) || triarea2(portalApex, portalLeft, right) > 0.0f) {
        portalRight = right;
        rightIndex = i;
      } else {
        path.push_back({portalLeft, corridor[leftIndex]});
        portalApex = portalLeft;
        apexIndex = leftIndex;
        portalLeft = portalApex;
        portalRight = portalApex;
        leftIndex = apexIndex;
        rightIndex = apexIndex;
        i = apexIndex;
        continue;
      }
    }

    if (triarea2(portalApex, portalLeft, left) >= 0.0f) {
      if (isPointsEqual(portalApex, portalLeft) || triarea2(portalApex, portalRight, left) < 0.0f) {
        portalLeft = left;
        leftIndex = i;
      } else {
        path.push_back({portalRight, corridor[rightIndex]});
        portalApex = portalRight;
        apexIndex = rightIndex;
        portalLeft = portalApex;
        portalRight = portalApex;
        leftIndex = apexIndex;
        rightIndex = apexIndex;
        i = apexIndex;
        continue;
      }
    }
  }

  if (!isPointsEqual(path.back().point, endPoint)) {
    path.push_back({endPoint, corridor.back()});
  }

  return path;
}

DualCorner find_next_corner(Point2 pos, const std::vector<int>& corridor, Point2 end_pos, float offset) {
  DualCorner result = {{0,0}, -1, -1, {0,0}, -1, -1, 0};
  
  if (corridor.empty()) {
    result.corner1 = end_pos;
    result.tri1 = -1;
    result.corner2 = end_pos;
    result.tri2 = -1;
    result.numValid = 1;
    return result;
  }

  if (corridor.size() == 1) {
    result.corner1 = end_pos;
    result.tri1 = getTriangleFromPolyPoint(pos, corridor[0]);
    result.corner2 = end_pos;
    result.tri2 = result.tri1;
    result.numValid = 1;
    return result;
  }

  std::vector<Portal> portals = getPolygonPortals(corridor, pos, end_pos);
  funnel_dual(portals, corridor, result);

  if (result.numValid == 0) {
    result.corner1 = end_pos;
    result.tri1 = -1;
    result.corner2 = end_pos;
    result.tri2 = -1;
    result.numValid = 1;
    return result;
  }  

  if (result.numValid == 1) {
    result.corner2 = end_pos;
    result.tri2 = -1;
    result.vIdx2 = -1;
    result.numValid = 2;
  }

  if (offset > 0 && result.numValid > 1) {
    apply_offset_to_point(result.corner1, result.vIdx1, result.tri1, end_pos, offset);
    apply_offset_to_point(result.corner2, result.vIdx2, result.tri2, end_pos, offset);
  }

  return result;
}

static std::vector<Portal> getPolygonPortals(const std::vector<int>& corridor, const Point2& startPoint, const Point2& endPoint) {
  std::vector<Portal> portals;
  portals.reserve(corridor.size() + 1);
  portals.push_back({startPoint, startPoint, -1, -1});

  for (size_t i = corridor.size() - 1; i > 0; --i) {
    portals.push_back(getPolygonPortalPoints(corridor[i], corridor[i-1]));
  }

  portals.push_back({endPoint, endPoint, -1, -1});
  return portals;
}

static Portal getPolygonPortalPoints(int poly1Idx, int poly2Idx) {
  int32_t poly1VertStart = g_navmesh.polygons[poly1Idx];
  int32_t poly1VertEnd = g_navmesh.polygons[poly1Idx + 1];
  int32_t poly1VertCount = poly1VertEnd - poly1VertStart;

  for (int i = 0; i < poly1VertCount; i++) {
    int32_t neighborIdx = poly1VertStart + i;
    int32_t neighbor = g_navmesh.poly_neighbors[neighborIdx];
    
    if (neighbor == poly2Idx) {
      int32_t v1Idx = g_navmesh.poly_verts[poly1VertStart + i];
      int32_t v2Idx = g_navmesh.poly_verts[poly1VertStart + ((i + 1) % poly1VertCount)];
      
      Point2 p1 = g_navmesh.vertices[v1Idx];
      Point2 p2 = g_navmesh.vertices[v2Idx];
      
      Point2 c1 = g_navmesh.poly_centroids[poly1Idx];
      Point2 c2 = g_navmesh.poly_centroids[poly2Idx];
      
      Point2 travelDir = c2 - c1;
      Point2 edgeDir = p2 - p1;
      
      if (math::cross(travelDir, edgeDir) > 0) {
        return {p2, p1, v2Idx, v1Idx};
      } else {
        return {p1, p2, v1Idx, v2Idx};
      }
    }
  }
  return {{0,0}, {0,0}, -1, -1};
}

static float triarea2(const Point2& p1, const Point2& p2, const Point2& p3) {
  float ax = p2.x - p1.x;
  float ay = p2.y - p1.y;
  float bx = p3.x - p1.x;
  float by = p3.y - p1.y;
  return bx * ay - ax * by;
}

static bool isPointsEqual(const Point2& p1, const Point2& p2, float epsilon) {
  return std::abs(p1.x - p2.x) < epsilon && std::abs(p1.y - p2.y) < epsilon;
}

static void funnel_dual(const std::vector<Portal>& portals, const std::vector<int>& corridor, DualCorner& result) {
  
  if (portals.empty()) {
    result.numValid = 0;
    return;
  }

  Point2 startPoint = portals[0].left;

  Point2 portalApex = startPoint;
  Point2 portalLeft = startPoint;
  Point2 portalRight = startPoint;

  int apexIndex = 0;
  int leftIndex = 0;
  int rightIndex = 0;
  int cornersFound = 0;

  result.numValid = 0;

  for (size_t i = 1; i < portals.size(); ++i) {
    Point2 left = portals[i].left;
    Point2 right = portals[i].right;
    
    float rightTriArea2 = triarea2(portalApex, portalRight, right);

    if (rightTriArea2 <= 0.0f) {
      bool apexRightEqual = isPointsEqual(portalApex, portalRight);
      float leftTriArea2 = apexRightEqual ? 1.0f : triarea2(portalApex, portalLeft, right);

      if (apexRightEqual || leftTriArea2 > 0.0f) {
        portalRight = right;
        rightIndex = i;
      } else {
        Point2 startPoint = portals[0].left;
        bool leftEqualsStart = isPointsEqual(portalLeft, startPoint);

        if (cornersFound == 0) {
          if (!leftEqualsStart) {
            result.corner1 = portalLeft;
            // Map portal index to corridor index: portal 0 = start, portal i (i>0) = between corridor[i-1] and corridor[i]
            int corridorIdx = (leftIndex > 0) ? corridor.size() - leftIndex : corridor.size() - 1;
            result.tri1 = getTriangleFromPolyPoint(portalLeft, corridor[corridorIdx]);
            result.vIdx1 = (leftIndex > 0 && leftIndex < (int)portals.size()) ? portals[leftIndex].leftVIdx : -1;
            cornersFound = 1;
          }
        } else {
          bool corner1EqualsLeft = isPointsEqual(result.corner1, portalLeft);
          if (!corner1EqualsLeft) {
            result.corner2 = portalLeft;
            int corridorIdx = (leftIndex > 0) ? corridor.size() - leftIndex : corridor.size() - 1;
            result.tri2 = getTriangleFromPolyPoint(portalLeft, corridor[corridorIdx]);
            result.vIdx2 = (leftIndex > 0 && leftIndex < (int)portals.size()) ? portals[leftIndex].leftVIdx : -1;
            result.numValid = 2;
            return;
          }
        }
        
        portalApex = portalLeft;
        apexIndex = leftIndex;
        portalLeft = portalApex;
        portalRight = portalApex;
        leftIndex = apexIndex;
        rightIndex = apexIndex;
        i = apexIndex;
        continue;
      }
    }

    float leftTriArea2 = triarea2(portalApex, portalLeft, left);

    if (leftTriArea2 >= 0.0f) {
      bool apexLeftEqual = isPointsEqual(portalApex, portalLeft);
      float rightTriArea2_ = apexLeftEqual ? -1.0f : triarea2(portalApex, portalRight, left);

      if (apexLeftEqual || rightTriArea2_ < 0.0f) {
        portalLeft = left;
        leftIndex = i;
      } else {
        Point2 startPoint = portals[0].left;
        bool rightEqualsStart = isPointsEqual(portalRight, startPoint);

        if (cornersFound == 0) {
          if (!rightEqualsStart) {
            result.corner1 = portalRight;
            int corridorIdx = (rightIndex > 0) ? corridor.size() - rightIndex : corridor.size() - 1;
            result.tri1 = getTriangleFromPolyPoint(portalRight, corridor[corridorIdx]);
            result.vIdx1 = (rightIndex > 0 && rightIndex < (int)portals.size()) ? portals[rightIndex].rightVIdx : -1;
            cornersFound = 1;
          }
        } else {
          bool corner1EqualsRight = isPointsEqual(result.corner1, portalRight);
          if (!corner1EqualsRight) {
            result.corner2 = portalRight;
            int corridorIdx = (rightIndex > 0) ? corridor.size() - rightIndex : corridor.size() - 1;
            result.tri2 = getTriangleFromPolyPoint(portalRight, corridor[corridorIdx]);
            result.vIdx2 = (rightIndex > 0 && rightIndex < (int)portals.size()) ? portals[rightIndex].rightVIdx : -1;
            result.numValid = 2;
            return;
          }
        }
        
        portalApex = portalRight;
        apexIndex = rightIndex;
        portalLeft = portalApex;
        portalRight = portalApex;
        leftIndex = apexIndex;
        rightIndex = apexIndex;
        i = apexIndex;
        continue;
      }
    }
  }

  if (cornersFound == 1) {
    result.numValid = 1;
  } else {
    Point2 endPoint = portals.back().left;
    int poly = corridor.back();
    result.corner1 = endPoint;
    result.tri1 = getTriangleFromPolyPoint(endPoint, poly);
    result.vIdx1 = -1;
    result.numValid = 1;
  }
}

static void apply_offset_to_point(Point2& point, int vIdx, int tri, const Point2& end_pos, float offset) {
  
  if (vIdx == -1 || tri == -1 || offset <= 0) {
    return;
  }
  
  bool isEndPoint = isPointsEqual(point, end_pos);
  if (isEndPoint) {
    return;
  }
  
  std::vector<int> nearbyBlobs = g_navmesh.blob_index.query(point);
  bool foundBlob = false;
  
  for (int blobPolygonId : nearbyBlobs) {
    int32_t vertStart = g_navmesh.polygons[blobPolygonId];
    int32_t vertEnd = g_navmesh.polygons[blobPolygonId + 1];
    
    // Find matching vertex in blob geometry using vertex index comparison
    for (int32_t i = vertStart; i < vertEnd; ++i) {
      if (g_navmesh.poly_verts[i] == vIdx) {
        const Point2& B = point;
        
        // Find adjacent vertices (wrap around the polygon)
        int32_t prevIndex = (i == vertStart) ? vertEnd - 1 : i - 1;
        int32_t nextIndex = (i == vertEnd - 1) ? vertStart : i + 1;
        
        Point2 A = g_navmesh.vertices[g_navmesh.poly_verts[prevIndex]];
        Point2 C = g_navmesh.vertices[g_navmesh.poly_verts[nextIndex]];

        Point2 tempV = B - A;
        math::normalize_inplace(tempV);
        
        Point2 vec_CB = B - C;
        math::normalize_inplace(vec_CB);
        
        tempV = tempV + vec_CB;

        float lenSq = math::length_sq(tempV);
        
        if (lenSq > 1e-6f) {
          math::normalize_inplace(tempV);
          tempV = tempV * offset;
          point = point + tempV;
        }
        
        foundBlob = true;
        break;
      }
    }
    if (foundBlob) break;
  }
  
  // Add grid corner check and warning if blob not found
  if (!foundBlob) {
    printf("apply_offset_to_point: FAILURE - Could not find matching blob for corner, not applying offset. Point: (%.3f, %.3f)\n", 
         point.x, point.y);
    printf("apply_offset_to_point: Nearby blobs were: ");
    for (int blobId : nearbyBlobs) {
      printf("%d ", blobId);
    }
    printf("\n");
    
    // Debug: Find the closest vertex across all blobs
    float minDist = 999999.0f;
    Point2 closestVertex = {0, 0};
    int closestBlob = -1;
    
    for (int blobPolygonId : nearbyBlobs) {
      int32_t vertStart = g_navmesh.polygons[blobPolygonId];
      int32_t vertEnd = g_navmesh.polygons[blobPolygonId + 1];
      
      for (int32_t i = vertStart; i < vertEnd; ++i) {
        const Point2& p = g_navmesh.vertices[g_navmesh.poly_verts[i]];
        float dist = std::sqrt((p.x - point.x) * (p.x - point.x) + (p.y - point.y) * (p.y - point.y));
        
        if (dist < minDist) {
          minDist = dist;
          closestVertex = p;
          closestBlob = blobPolygonId;
        }
      }
    }
    
    printf("apply_offset_to_point: DEBUG - Closest vertex found at (%.3f, %.3f) in blob %d, distance=%.6f (tolerance=0.015)\n", 
         closestVertex.x, closestVertex.y, closestBlob, minDist);
  }
} 