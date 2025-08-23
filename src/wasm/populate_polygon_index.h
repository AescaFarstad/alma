#ifndef POPULATE_POLYGON_INDEX_H
#define POPULATE_POLYGON_INDEX_H

#include "navmesh.h"
#include <cstdint>

void populate_polygon_index(Navmesh& navmesh, size_t& auxOffset, uint8_t* auxiliaryMemory, size_t auxiliaryMemorySize);

#endif // POPULATE_POLYGON_INDEX_H
