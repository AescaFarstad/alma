#include "agent_nav_utils.h"
#include "path_corridor.h"
#include "path_corners.h"
#include "raycasting.h"
#include "nav_utils.h"
#include "path_patching.h"
#include "constants_layout.h"
#include <vector>
#include <algorithm>

extern Navmesh g_navmesh;

bool findPathToDestination(
    Navmesh& navmesh,
    int agentIndex,
    int startTri,
    int endTri,
    const char* errorContext
) {
    int startPoly = navmesh.triangle_to_polygon[startTri];
    int endPoly = navmesh.triangle_to_polygon[endTri];
    
    bool pathFound = findCorridor(navmesh, PATH_FREE_WIDTH, PATH_WIDTH_PENALTY_MULT, agent_data.positions[agentIndex], agent_data.end_targets[agentIndex], agent_data.corridors[agentIndex], startPoly, endPoly);
    
    if (pathFound) {
        DualCorner reusableDualCorner = find_next_corner(agent_data.positions[agentIndex], agent_data.corridors[agentIndex], agent_data.end_targets[agentIndex], CORNER_OFFSET);
        
        if (reusableDualCorner.numValid > 0) {
            agent_data.next_corners[agentIndex] = reusableDualCorner.corner1;
            agent_data.next_corners2[agentIndex] = reusableDualCorner.corner2;
            agent_data.next_corner_tris[agentIndex] = reusableDualCorner.tri1;
            agent_data.next_corner_tris2[agentIndex] = reusableDualCorner.tri2;
            agent_data.num_valid_corners[agentIndex] = reusableDualCorner.numValid;
            agent_data.path_frustrations[agentIndex] = 0;
            agent_data.last_visible_points_for_next_corner[agentIndex] = agent_data.positions[agentIndex];
            return true;
        } else {
            return false;
        }
    } else {
        return false;
    }
}

bool raycastAndPatchCorridor(
    Navmesh& navmesh,
    int agentIndex,
    const Point2& targetPoint,
    int targetTri
) {
    auto raycastResult = raycastCorridor(agent_data.positions[agentIndex], targetPoint, agent_data.current_tris[agentIndex], targetTri);

    const Point2 hitP1 = std::get<0>(raycastResult);
    const Point2 hitP2 = std::get<1>(raycastResult);
    const std::vector<int>& triCorridor = std::get<2>(raycastResult);
    const bool hit = std::get<3>(raycastResult);

    if (!hit && !triCorridor.empty()) {
        auto& agentCorridor = agent_data.corridors[agentIndex];
        std::vector<int> raycastPolyCorridor;
        raycastPolyCorridor.reserve(agentCorridor.capacity());
        for (int i = triCorridor.size() - 1; i >= 0; --i) {
            int poly = navmesh.triangle_to_polygon[ triCorridor[i]];
            if (raycastPolyCorridor.empty() || raycastPolyCorridor.back() != poly) {
                raycastPolyCorridor.push_back(poly);
            }
        }

        int targetPoly = navmesh.triangle_to_polygon[targetTri];
        int targetPolyIndex = -1;
        for (int i = agentCorridor.size() - 1; i >= 0; --i) {
            if (agentCorridor[i] == targetPoly) {
                targetPolyIndex = i;
                break;
            }
        }

        if (targetPolyIndex != -1) {
            std::vector<int> newCorridor;
            newCorridor.reserve(targetPolyIndex + 1 + raycastPolyCorridor.size());
            newCorridor.insert(newCorridor.end(), agentCorridor.begin(), agentCorridor.begin() + targetPolyIndex);
            newCorridor.insert(newCorridor.end(), raycastPolyCorridor.begin(), raycastPolyCorridor.end());

            agent_data.corridors[agentIndex] = newCorridor;

            return true;
        } else if (!raycastPolyCorridor.empty()) {
            agent_data.corridors[agentIndex] = raycastPolyCorridor;
            return true;
        }
    }
    else {
        return attempt_path_patch(navmesh, agentIndex, hitP1, hitP2, triCorridor);
    }

    return false;
} 