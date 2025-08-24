#include "agent_nav_utils.h"
#include "path_corridor.h"
#include "path_corners.h"
#include "raycasting.h"
#include "nav_utils.h" // For pointInTriangle
#include <iostream>
#include <vector>
#include <algorithm>
#include <tuple>

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
    
    bool pathFound = findCorridor(navmesh, agent_data.positions[agentIndex], agent_data.end_targets[agentIndex], agent_data.corridors[agentIndex], startPoly, endPoly);
    
    if (pathFound) {
        DualCorner reusableDualCorner = find_next_corner(agent_data.positions[agentIndex], agent_data.corridors[agentIndex], agent_data.end_targets[agentIndex], CORNER_OFFSET);
        
        if (reusableDualCorner.numValid > 0) {
            agent_data.next_corners[agentIndex] = reusableDualCorner.corner1;
            agent_data.next_corners2[agentIndex] = reusableDualCorner.corner2;
            agent_data.next_corner_tris[agentIndex] = reusableDualCorner.tri1;
            agent_data.next_corner_tris2[agentIndex] = reusableDualCorner.tri2;
            agent_data.num_valid_corners[agentIndex] = reusableDualCorner.numValid;
            agent_data.path_frustrations[agentIndex] = 0;
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

    if (!std::get<3>(raycastResult) && std::get<2>(raycastResult).size() > 0) {
        auto& agentCorridor = agent_data.corridors[agentIndex];
        std::vector<int> raycastPolyCorridor;
        raycastPolyCorridor.reserve(agentCorridor.capacity());
        for (const auto& tri : std::get<2>(raycastResult)) {
            int poly = navmesh.triangle_to_polygon[tri];
            if (raycastPolyCorridor.empty() || raycastPolyCorridor.back() != poly) {
                raycastPolyCorridor.push_back(poly);
            }
        }

        int targetPoly = navmesh.triangle_to_polygon[targetTri];
        auto it = std::find(agentCorridor.begin(), agentCorridor.end(), targetPoly);

        if (it != agentCorridor.end()) {
            int targetPolyIndex = std::distance(agentCorridor.begin(), it);
            
            raycastPolyCorridor.insert(raycastPolyCorridor.end(), agentCorridor.begin() + targetPolyIndex + 1, agentCorridor.end());
            agent_data.corridors[agentIndex] = raycastPolyCorridor;

            return true;
        } else if (!raycastPolyCorridor.empty()) {
            agent_data.corridors[agentIndex] = raycastPolyCorridor;
            return true;
        }
    }

    return false;
} 