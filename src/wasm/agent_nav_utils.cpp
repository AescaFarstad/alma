#include "agent_nav_utils.h"
#include "path_corridor.h"
#include "path_corners.h"
#include "raycasting.h"
#include "path_patching.h"
#include "constants_layout.h"
#include <vector>
#include <iostream>
 

extern Navmesh g_navmesh;

bool findPathToDestination(
  Navmesh& navmesh,
  int idx,
  int startTri,
  int endTri,
  const char* errorContext
) {
  
  int startPoly = navmesh.triangle_to_polygon[startTri];
  int endPoly = navmesh.triangle_to_polygon[endTri];
  std::cout << "findPathToDestination" << std::endl;
  
  bool pathFound = findCorridor(navmesh, PATH_FREE_WIDTH, PATH_WIDTH_PENALTY_MULT, agent_data.positions[idx], agent_data.end_targets[idx], agent_data.corridors[idx], startPoly, endPoly);
  
  if (pathFound) {
    DualCorner reusableDualCorner = find_next_corner(agent_data.positions[idx], agent_data.corridors[idx], agent_data.end_targets[idx], CORNER_OFFSET);
    
    if (reusableDualCorner.numValid > 0) {
      
      agent_data.next_corners[idx] = reusableDualCorner.corner1;
      agent_data.next_corners2[idx] = reusableDualCorner.corner2;
      agent_data.next_corner_tris[idx] = reusableDualCorner.tri1;
      agent_data.next_corner_tris2[idx] = reusableDualCorner.tri2;
      agent_data.num_valid_corners[idx] = reusableDualCorner.numValid;
      agent_data.path_frustrations[idx] = 0;
      agent_data.last_visible_points_for_next_corner[idx] = agent_data.positions[idx];
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
  int idx,
  const Point2& targetPoint,
  int targetTri
) {
  RaycastCorridorResult raycastResult = raycastCorridor(agent_data.positions[idx], targetPoint, agent_data.current_tris[idx], targetTri);

  const std::vector<int>& triCorridor = raycastResult.corridor;
  const bool hit = (raycastResult.hitV1_idx != -1);

  if (!hit && !triCorridor.empty()) {
    
    auto& agentCorridor = agent_data.corridors[idx];
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

      agent_data.corridors[idx] = newCorridor;

      return true;
    } else if (!raycastPolyCorridor.empty()) {
      
      agent_data.corridors[idx] = raycastPolyCorridor;
      return true;
    }
  }
  else {
    
    return attempt_path_patch(navmesh, idx, raycastResult.hitV1_idx, raycastResult.hitV2_idx, raycastResult.hitTri_idx, triCorridor);
  }

  return false;
} 
