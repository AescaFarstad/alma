#ifndef PATH_PATCHING_H
#define PATH_PATCHING_H

#include "data_structures.h"
#include "navmesh.h"
#include <vector>

// Attempts multi-approach geometric path patching when a direct raycast fails.
// Returns true if it successfully patched the path and updated agent_data accordingly.
bool attempt_path_patch(
  Navmesh& navmesh,
  int idx,
  int hitV1_idx,
  int hitV2_idx,
  int hitTri_idx,
  const std::vector<int>& raycastTriCorridor
);

#endif // PATH_PATCHING_H 
