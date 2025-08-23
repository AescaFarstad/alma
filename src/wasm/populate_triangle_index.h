#ifndef POPULATE_TRIANGLE_INDEX_H
#define POPULATE_TRIANGLE_INDEX_H

#include "navmesh.h"
#include <cstdint>
#include <vector>

void populate_triangle_index(Navmesh& navmesh, size_t& auxOffset, uint8_t* auxiliaryMemory, size_t auxiliaryMemorySize);

#endif // POPULATE_TRIANGLE_INDEX_H
