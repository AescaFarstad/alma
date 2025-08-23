#ifndef POPULATE_BUILDING_INDEX_H
#define POPULATE_BUILDING_INDEX_H

#include "navmesh.h"
#include <cstdint>

void populate_building_index(Navmesh& navmesh, size_t& auxOffset, uint8_t* auxiliaryMemory, size_t auxiliaryMemorySize);

#endif // POPULATE_BUILDING_INDEX_H
