#include "benchmarks.h"
#include "navmesh.h"
#include "math_utils.h"
#include "nav_utils.h"
#include "data_structures.h"
#include <stdio.h>
#include <vector>
#include <chrono>
#include <numeric>
#include <algorithm>
#include <string>

struct BenchmarkResult {
  std::string name;
  double durMs;
  int zeroMatches;
  int multiMatches;
};

template<typename Func>
BenchmarkResult runNavmeshMethod(const std::string& name, Func method, int num_points, const std::vector<Point2>& points, const std::vector<std::vector<int>>& candidateArrays) {
  int zeroMatches = 0;
  int multiMatches = 0;
  auto t0 = std::chrono::high_resolution_clock::now();

  for (int i = 0; i < num_points; ++i) {
    const Point2 p = points[i]; // Make a copy to avoid aliasing issues
    int matches = 0;
    const auto& candidates = candidateArrays[i];
    for (int triIdx : candidates) {
      if (method(p, triIdx)) {
        matches++;
      }
    }
    if (matches == 0) zeroMatches++;
    if (matches > 1) multiMatches++;
  }

  auto t1 = std::chrono::high_resolution_clock::now();
  std::chrono::duration<double, std::milli> durMs = t1 - t0;
  return {name, durMs.count(), zeroMatches, multiMatches};
}

template<typename Func>
BenchmarkResult runCoordinateMethod(const std::string& name, Func method, int num_points, const std::vector<Point2>& points, const std::vector<std::vector<int>>& candidateArrays) {
  int zeroMatches = 0;
  int multiMatches = 0;
  auto t0 = std::chrono::high_resolution_clock::now();

  for (int i = 0; i < num_points; ++i) {
    const Point2 p = points[i]; // Make a copy to avoid aliasing issues
    int matches = 0;
    const auto& candidates = candidateArrays[i];
    for (int triIdx : candidates) {
      int base = triIdx * 3;
      int i1 = g_navmesh.triangles[base];
      int i2 = g_navmesh.triangles[base + 1];
      int i3 = g_navmesh.triangles[base + 2];
      float ax = g_navmesh.vertices[i1].x;
      float ay = g_navmesh.vertices[i1].y;
      float bx = g_navmesh.vertices[i2].x;
      float by = g_navmesh.vertices[i2].y;
      float cx = g_navmesh.vertices[i3].x;
      float cy = g_navmesh.vertices[i3].y;

      if (method(p.x, p.y, ax, ay, bx, by, cx, cy)) {
        matches++;
      }
    }
    if (matches == 0) zeroMatches++;
    if (matches > 1) multiMatches++;
  }

  auto t1 = std::chrono::high_resolution_clock::now();
  std::chrono::duration<double, std::milli> durMs = t1 - t0;
  return {name, durMs.count(), zeroMatches, multiMatches};
}


void point_in_triangle_bench() {
  printf("[WASM BENCH] point_in_triangle_bench called.\n");

  if (!g_navmesh.vertices || !g_navmesh.triangles) {
    printf("[WASM BENCH] Navmesh not available.\n");
    return;
  }

  float minX = g_navmesh.bbox[0];
  float minY = g_navmesh.bbox[1];
  float maxX = g_navmesh.bbox[2];
  float maxY = g_navmesh.bbox[3];

  const int NUM_POINTS = 500000;
  std::vector<Point2> points(NUM_POINTS);
  uint64_t seed = 12345;
  for (int i = 0; i < NUM_POINTS; i++) {
    auto r1 = math::seededRandom(seed); 
    seed = r1.newSeed; 
    float rx = r1.value;
    
    auto r2 = math::seededRandom(seed);
    seed = r2.newSeed;
    float ry = r2.value;

    points[i] = {
      minX + rx * (maxX - minX),
      minY + ry * (maxY - minY)
    };
  }

  std::vector<std::vector<int>> candidateArrays(NUM_POINTS);
  for (int i = 0; i < NUM_POINTS; i++) {
    candidateArrays[i] = g_navmesh.triangle_index.query(points[i]);
  }

  std::vector<BenchmarkResult> results;
  results.push_back(runCoordinateMethod("isPointInTriangle", 
    static_cast<bool(*)(float,float,float,float,float,float,float,float)>(math::isPointInTriangle), 
    NUM_POINTS, points, candidateArrays));
  // results.push_back(runNavmeshMethod("testPointInsideTriangleLoop", test_point_inside_triangle_loop, NUM_POINTS, points, candidateArrays));
  results.push_back(runCoordinateMethod("isPointInTriangle2", 
    static_cast<bool(*)(float,float,float,float,float,float,float,float)>(math::isPointInTriangle2), 
    NUM_POINTS, points, candidateArrays));
  // results.push_back(runNavmeshMethod("testPointInsideTriangleEE", test_point_inside_triangle_ee, NUM_POINTS, points, candidateArrays));
  results.push_back(runNavmeshMethod("testPointInsideTriangle", test_point_inside_triangle, NUM_POINTS, points, candidateArrays));
  // results.push_back(runNavmeshMethod("testPointInsideTriangleO", test_point_inside_triangle_o, NUM_POINTS, points, candidateArrays));
  
  printf("\nPoint-in-triangle benchmark over %d points (precomputed candidates & coords)\n", NUM_POINTS);
  for (const auto& result : results) {
    printf("- %-30s: t=%.0f\t\tzero=%d\tmulti=%d\n", result.name.c_str(), result.durMs, result.zeroMatches, result.multiMatches);
  }

  auto fastest = std::min_element(results.begin(), results.end(), [](const auto& a, const auto& b) {
    return a.durMs < b.durMs;
  });
  auto slowest = std::max_element(results.begin(), results.end(), [](const auto& a, const auto& b) {
    return a.durMs < b.durMs;
  });

  printf("\nFastest: %s (%.0fms)\n", fastest->name.c_str(), fastest->durMs);
  printf("Slowest: %s (%.0fms)\n", slowest->name.c_str(), slowest->durMs);
  printf("Speed difference: %.2fx\n", slowest->durMs / fastest->durMs);
} 