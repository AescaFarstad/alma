#include "navmesh.h"
#include "math_utils.h"
#include <cstring>
#include <iostream>

// Global navmesh instance
Navmesh g_navmesh;

void initialize_navmesh_structure() {
  // Initialize all pointers to nullptr
  // std::memset(&g_navmesh, 0, sizeof(Navmesh));
  
  // Initialize spatial indices
  g_navmesh.triangle_index = SpatialIndex();
  g_navmesh.polygon_index = SpatialIndex();
  g_navmesh.building_index = SpatialIndex();
  g_navmesh.blob_index = SpatialIndex();
  
  std::cout << "[WASM] Navmesh structure initialized" << std::endl;
}