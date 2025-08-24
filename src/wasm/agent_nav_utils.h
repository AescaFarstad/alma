#pragma once

#include "data_structures.h"
#include "navmesh.h"

bool findPathToDestination(
    Navmesh& navmesh,
    int agentIndex,
    int startTri,
    int endTri,
    const char* errorContext
);

bool raycastAndPatchCorridor(
    Navmesh& navmesh,
    int agentIndex,
    const Point2& targetPoint,
    int targetTri
); 