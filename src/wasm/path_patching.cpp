#include "path_patching.h"
#include "raycasting.h"
#include "nav_utils.h"
#include "path_corridor.h"
#include "constants_layout.h"
#include "math_utils.h"
#include <algorithm>
 

extern Navmesh g_navmesh;

static inline void append_tris_as_polys(const std::vector<int>& tris, std::vector<int>& out) {
  for (int i = tris.size() - 1; i >= 0; --i) {
    const int p = g_navmesh.triangle_to_polygon[tris[i]];
    if (out.empty() || out.back() != p) {
      out.push_back(p);
    }
  }
}

// Efficient two-corridor merge: first corridor must begin at the join polygon,
// second continues from there back toward the agent. Writes result into outPolyCorr.
static inline bool merge_corridors(
  const std::vector<int>& triCorrFirst,
  const std::vector<int>& triCorrSecond,
  const std::vector<int>& originalCorr,
  int joinTriangle,
  std::vector<int>& outPolyCorr
) {
  outPolyCorr.clear();

  // Determine where to rejoin the original corridor (using polygon index of the join triangle)
  const int joinPoly = g_navmesh.triangle_to_polygon[joinTriangle];

  int originalCorridorJoinIndex = -1;
  for (int i = static_cast<int>(originalCorr.size()) - 1; i >= 0; --i) {
    if (originalCorr[i] == joinPoly) {
      originalCorridorJoinIndex = i;
      break;
    }
  }

  // Preserve the original corridor prefix up to (but excluding) the join polygon.
  if (originalCorridorJoinIndex != -1) {
    // Conservative reserve to reduce reallocations
    outPolyCorr.reserve(
      (originalCorridorJoinIndex > 0 ? originalCorridorJoinIndex : 0)
      + static_cast<int>(triCorrFirst.size())
      + static_cast<int>(triCorrSecond.size())
    );
    outPolyCorr.insert(outPolyCorr.end(), originalCorr.begin(), originalCorr.begin() + originalCorridorJoinIndex);
  }

  // Then append the new (triangle) corridors converted to polygon corridors in the given order.
  append_tris_as_polys(triCorrFirst, outPolyCorr);
  append_tris_as_polys(triCorrSecond, outPolyCorr);

  return !outPolyCorr.empty();
}

static inline int vertex_index_from_point_on_triangle(int triIdx, const Point2& p)
{
  const int v1 = g_navmesh.triangles[triIdx * 3 + 0];
  const int v2 = g_navmesh.triangles[triIdx * 3 + 1];
  const int v3 = g_navmesh.triangles[triIdx * 3 + 2];
  const Point2& P1 = g_navmesh.vertices[v1];
  const Point2& P2 = g_navmesh.vertices[v2];
  const Point2& P3 = g_navmesh.vertices[v3];
  const float eps = 1e-5f;
  auto close = [&](const Point2& a, const Point2& b){ return std::abs(a.x - b.x) < eps && std::abs(a.y - b.y) < eps; };
  if (close(p, P1)) return v1;
  if (close(p, P2)) return v2;
  if (close(p, P3)) return v3;
  return -1;
}

static inline bool compute_corner_miter_offset(int polyIdx, int cornerVIdx, const Point2& cornerPoint, float offset, Point2& outPoint)
{
  const int start = g_navmesh.polygons[polyIdx];
  const int end = g_navmesh.polygons[polyIdx + 1];
  for (int i = start; i < end; ++i) {
    if (g_navmesh.poly_verts[i] == cornerVIdx) {
      const int prevIndex = (i == start) ? end - 1 : i - 1;
      const int nextIndex = (i == end - 1) ? start : i + 1;
      const Point2 A = g_navmesh.vertices[g_navmesh.poly_verts[prevIndex]];
      const Point2 C = g_navmesh.vertices[g_navmesh.poly_verts[nextIndex]];

      Point2 vBA = cornerPoint - A;
      Point2 vBC = cornerPoint - C;
      math::normalize_inplace(vBA);
      math::normalize_inplace(vBC);
      Point2 miter = {vBA.x + vBC.x, vBA.y + vBC.y};
      if (math::length_sq(miter) <= 1e-12f) return false;
      math::normalize_inplace(miter);
      outPoint = {cornerPoint.x + miter.x * offset, cornerPoint.y + miter.y * offset};
      return true;
    }
  }
  return false;
}

bool attempt_path_patch(
  Navmesh& navmesh,
  int idx,
  int hitV1_idx,
  int hitV2_idx,
  int hitTri_idx,
  const std::vector<int>& raycastTriCorridor
) {
  if (raycastTriCorridor.empty()) return false;

  // Build hit edge points from vertex indices for geometric checks
  const Point2 hitP1 = g_navmesh.vertices[hitV1_idx];
  const Point2 hitP2 = g_navmesh.vertices[hitV2_idx];

  // Unwalkable triangle that blocked the ray
  const int blockingTri = hitTri_idx;
  const int blockingPoly = (blockingTri != -1) ? g_navmesh.triangle_to_polygon[blockingTri] : -1;

  // Approach 2: miter-offset around solid/obstacle polygon hit
  if (blockingPoly >= g_navmesh.walkable_polygon_count) {
    
    const float d1 = math::distancePointToSegment(hitP1, agent_data.last_visible_points_for_next_corner[idx], agent_data.next_corners[idx]);
    const float d2 = math::distancePointToSegment(hitP2, agent_data.last_visible_points_for_next_corner[idx], agent_data.next_corners[idx]);
    const bool useFirst = (d1 <= d2);
    const Point2 chosenCornerPoint = useFirst ? hitP1 : hitP2;
    const int chosenVIdx = useFirst ? hitV1_idx : hitV2_idx;

    if (chosenVIdx != -1) {
      Point2 offsetPoint;
      if (compute_corner_miter_offset(blockingPoly, chosenVIdx, chosenCornerPoint, CORNER_OFFSET, offsetPoint)) {
        const int offsetTri = getTriangleFromPoint(offsetPoint);
        if (offsetTri != -1) {
          RaycastCorridorResult rc1 = raycastCorridor(agent_data.positions[idx], offsetPoint, agent_data.current_tris[idx], offsetTri);
          if (rc1.hitV1_idx == -1 && !rc1.corridor.empty()) {
            // If we already have two corners, ensure we can reach nextCorner2
            if (agent_data.num_valid_corners[idx] == 2) {
              RaycastCorridorResult rc3 = raycastCorridor(offsetPoint, agent_data.next_corners2[idx], offsetTri, agent_data.next_corner_tris2[idx]);
              if (rc3.hitV1_idx != -1 || rc3.corridor.empty()) {
                // fallback to trying nextCorner first
                RaycastCorridorResult rc2 = raycastCorridor(offsetPoint, agent_data.next_corners[idx], offsetTri, agent_data.next_corner_tris[idx]);
                if (rc2.hitV1_idx != -1 || rc2.corridor.empty()) {
                  // give up miter approach
                } else {
                  // Update corners: insert offset as nextCorner, keep nextCorner2 as is
                  // Preserve the old nextCorner triangle for correct rejoin point
                  const int oldNextCornerTri = agent_data.next_corner_tris[idx];
                  agent_data.next_corners[idx] = offsetPoint;
                  agent_data.next_corner_tris[idx] = offsetTri;
                  std::vector<int> merged;
                  // IMPORTANT: rejoin at old nextCorner, not nextCorner2
                  if (merge_corridors(rc2.corridor, rc1.corridor, agent_data.corridors[idx], oldNextCornerTri, merged)) {
                    agent_data.corridors[idx] = std::move(merged);
                    return true;
                  }
                }
              } else {
                // Great: we can go offset -> nextCorner2; set nextCorner to offset and keep nextCorner2
                agent_data.next_corners[idx] = offsetPoint;
                agent_data.next_corner_tris[idx] = offsetTri;
                std::vector<int> merged;
                if (merge_corridors(rc3.corridor, rc1.corridor, agent_data.corridors[idx], agent_data.next_corner_tris2[idx], merged)) {
                  agent_data.corridors[idx] = std::move(merged);
                  return true;
                }
              }
            } else {
              // Only one corner known: must be able to go offset -> nextCorner
              RaycastCorridorResult rc2 = raycastCorridor(offsetPoint, agent_data.next_corners[idx], offsetTri, agent_data.next_corner_tris[idx]);
              if (rc2.hitV1_idx == -1 && !rc2.corridor.empty()) {
                agent_data.next_corners2[idx] = agent_data.next_corners[idx];
                agent_data.next_corner_tris2[idx] = agent_data.next_corner_tris[idx];
                agent_data.next_corners[idx] = offsetPoint;
                agent_data.next_corner_tris[idx] = offsetTri;
                agent_data.num_valid_corners[idx] = 2;

                std::vector<int> merged;
                if (merge_corridors(rc2.corridor, rc1.corridor, agent_data.corridors[idx], agent_data.next_corner_tris2[idx], merged)) {
                  agent_data.corridors[idx] = std::move(merged);
                  return true;
                }
              }
            }
          }
        }
      }
    }
  }

  // Approach 1: Intersection-based patch
  {
    
    const Point2& L = agent_data.last_visible_points_for_next_corner[idx];
    const Point2& C = agent_data.next_corners[idx];
    const Point2& A = agent_data.positions[idx];

    Point2 d1 = math::normalize(C - L);
    Point2 edgeDir = math::normalize(hitP2 - hitP1);
    const float dp = std::abs(math::dot(d1, edgeDir));
    if (dp <= 0.8f) {
      const float denom = math::cross(d1, edgeDir);
      if (std::abs(denom) > 1e-6f) {
        const Point2 LA = A - L;
        const float t = math::cross(LA, edgeDir) / denom;
        Point2 R = L + d1 * t;
        const float dR2 = math::distance_sq(A, R);
        const float dC2 = math::distance_sq(A, C);
        if (dR2 <= dC2 * 2.25f) {
          const int rTri = getTriangleFromPoint(R);
          if (rTri != -1) {
            RaycastCorridorResult rc1 = raycastCorridor(A, R, agent_data.current_tris[idx], rTri);
            RaycastCorridorResult rc2 = raycastCorridor(R, agent_data.next_corners[idx], rTri, agent_data.next_corner_tris[idx]);
            if (rc1.hitV1_idx == -1 && rc2.hitV1_idx == -1 && !rc1.corridor.empty() && !rc2.corridor.empty()) {
              agent_data.next_corners2[idx] = agent_data.next_corners[idx];
              agent_data.next_corner_tris2[idx] = agent_data.next_corner_tris[idx];
              agent_data.next_corners[idx] = R;
              agent_data.next_corner_tris[idx] = rTri;
              agent_data.num_valid_corners[idx] = 2;

              std::vector<int> merged;
              if (merge_corridors(rc2.corridor, rc1.corridor, agent_data.corridors[idx], agent_data.next_corner_tris2[idx], merged)) {
                agent_data.corridors[idx] = std::move(merged);
                return true;
              }
            }
          }
        }
      }
    }
  }

  return false;
} 
