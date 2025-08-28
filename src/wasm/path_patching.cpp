#include "path_patching.h"
#include "raycasting.h"
#include "nav_utils.h"
#include "path_corridor.h"
#include "math_utils.h"
#include <algorithm>

extern Navmesh g_navmesh;

static inline void append_tris_as_polys(const std::vector<int>& tris, std::vector<int>& out)
{
    for (int t : tris) {
        const int p = g_navmesh.triangle_to_polygon[t];
        if (out.empty() || out.back() != p) out.push_back(p);
    }
}

static inline bool merge_corridors(
    const std::vector<int>& triCorrA,
    const std::vector<int>& triCorrB,
    const std::vector<int>& originalCorr,
    int joinTriangle,
    std::vector<int>& outPolyCorr
) {
    outPolyCorr.clear();
    append_tris_as_polys(triCorrA, outPolyCorr);
    append_tris_as_polys(triCorrB, outPolyCorr);

    const int joinPoly = g_navmesh.triangle_to_polygon[joinTriangle];
    int startIdx = (int)originalCorr.size();
    for (int i = 0; i < (int)originalCorr.size(); ++i) {
        if (originalCorr[i] == joinPoly) { startIdx = i + 1; break; }
    }
    for (int i = startIdx; i < (int)originalCorr.size(); ++i) {
        const int p = originalCorr[i];
        if (outPolyCorr.empty() || outPolyCorr.back() != p) outPolyCorr.push_back(p);
    }
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
    int agentIndex,
    const Point2& hitP1,
    const Point2& hitP2,
    const std::vector<int>& raycastTriCorridor
) {
    if (raycastTriCorridor.empty()) return false;

    const int lastTri = raycastTriCorridor.back();
    const int blockingPoly = g_navmesh.triangle_to_polygon[lastTri];

    // Approach 2: miter-offset around solid/obstacle polygon hit
    if (blockingPoly >= g_navmesh.walkable_polygon_count) {
        const float d1 = math::distancePointToSegment(hitP1, agent_data.last_visible_points_for_next_corner[agentIndex], agent_data.next_corners[agentIndex]);
        const float d2 = math::distancePointToSegment(hitP2, agent_data.last_visible_points_for_next_corner[agentIndex], agent_data.next_corners[agentIndex]);
        const Point2 chosenCornerPoint = (d1 <= d2) ? hitP1 : hitP2;
        const int chosenVIdx = vertex_index_from_point_on_triangle(lastTri, chosenCornerPoint);

        if (chosenVIdx != -1) {
            Point2 offsetPoint;
            if (compute_corner_miter_offset(blockingPoly, chosenVIdx, chosenCornerPoint, CORNER_OFFSET, offsetPoint)) {
                const int offsetTri = getTriangleFromPoint(offsetPoint);
                if (offsetTri != -1) {
                    auto rc1 = raycastCorridor(agent_data.positions[agentIndex], offsetPoint, agent_data.current_tris[agentIndex], offsetTri);
                    if (!std::get<3>(rc1) && !std::get<2>(rc1).empty()) {
                        // If we already have two corners, ensure we can reach nextCorner2
                        if (agent_data.num_valid_corners[agentIndex] == 2) {
                            auto rc3 = raycastCorridor(offsetPoint, agent_data.next_corners2[agentIndex], offsetTri, agent_data.next_corner_tris2[agentIndex]);
                            if (std::get<3>(rc3) || std::get<2>(rc3).empty()) {
                                // fallback to trying nextCorner first
                                auto rc2 = raycastCorridor(offsetPoint, agent_data.next_corners[agentIndex], offsetTri, agent_data.next_corner_tris[agentIndex]);
                                if (std::get<3>(rc2) || std::get<2>(rc2).empty()) {
                                    // give up miter approach
                                } else {
                                    // Update corners: insert offset as nextCorner, keep nextCorner2 as is
                                    agent_data.next_corners[agentIndex] = offsetPoint;
                                    agent_data.next_corner_tris[agentIndex] = offsetTri;
                                    std::vector<int> merged;
                                    if (merge_corridors(std::get<2>(rc1), std::get<2>(rc2), agent_data.corridors[agentIndex], agent_data.next_corner_tris2[agentIndex], merged)) {
                                        agent_data.corridors[agentIndex] = std::move(merged);
                                        return true;
                                    }
                                }
                            } else {
                                // Great: we can go offset -> nextCorner2; set nextCorner to offset and keep nextCorner2
                                agent_data.next_corners[agentIndex] = offsetPoint;
                                agent_data.next_corner_tris[agentIndex] = offsetTri;
                                std::vector<int> merged;
                                if (merge_corridors(std::get<2>(rc1), std::get<2>(rc3), agent_data.corridors[agentIndex], agent_data.next_corner_tris2[agentIndex], merged)) {
                                    agent_data.corridors[agentIndex] = std::move(merged);
                                    return true;
                                }
                            }
                        } else {
                            // Only one corner known: must be able to go offset -> nextCorner
                            auto rc2 = raycastCorridor(offsetPoint, agent_data.next_corners[agentIndex], offsetTri, agent_data.next_corner_tris[agentIndex]);
                            if (!std::get<3>(rc2) && !std::get<2>(rc2).empty()) {
                                agent_data.next_corners2[agentIndex] = agent_data.next_corners[agentIndex];
                                agent_data.next_corner_tris2[agentIndex] = agent_data.next_corner_tris[agentIndex];
                                agent_data.next_corners[agentIndex] = offsetPoint;
                                agent_data.next_corner_tris[agentIndex] = offsetTri;
                                agent_data.num_valid_corners[agentIndex] = 2;

                                std::vector<int> merged;
                                if (merge_corridors(std::get<2>(rc1), std::get<2>(rc2), agent_data.corridors[agentIndex], agent_data.next_corner_tris2[agentIndex], merged)) {
                                    agent_data.corridors[agentIndex] = std::move(merged);
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
        const Point2& L = agent_data.last_visible_points_for_next_corner[agentIndex];
        const Point2& C = agent_data.next_corners[agentIndex];
        const Point2& A = agent_data.positions[agentIndex];

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
                        auto rc1 = raycastCorridor(A, R, agent_data.current_tris[agentIndex], rTri);
                        auto rc2 = raycastCorridor(R, agent_data.next_corners[agentIndex], rTri, agent_data.next_corner_tris[agentIndex]);
                        if (!std::get<3>(rc1) && !std::get<3>(rc2) && !std::get<2>(rc1).empty() && !std::get<2>(rc2).empty()) {
                            agent_data.next_corners2[agentIndex] = agent_data.next_corners[agentIndex];
                            agent_data.next_corner_tris2[agentIndex] = agent_data.next_corner_tris[agentIndex];
                            agent_data.next_corners[agentIndex] = R;
                            agent_data.next_corner_tris[agentIndex] = rTri;
                            agent_data.num_valid_corners[agentIndex] = 2;

                            std::vector<int> merged;
                            if (merge_corridors(std::get<2>(rc1), std::get<2>(rc2), agent_data.corridors[agentIndex], agent_data.next_corner_tris2[agentIndex], merged)) {
                                agent_data.corridors[agentIndex] = std::move(merged);
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