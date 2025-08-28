#ifndef INIT_NAVMESH_H
#define INIT_NAVMESH_H

#include <cstdint>

uint32_t init_navmesh_from_buffer(uint8_t* memoryStart, uint32_t binarySize, uint32_t totalMemorySize, float cellSize, bool enableLogging);

#endif // INIT_NAVMESH_H 