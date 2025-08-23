#ifndef NAV_UTILS_H
#define NAV_UTILS_H

#include <cstdint>
#include "navmesh.h"

/**
 * Navigation utility functions that mirror the TypeScript NavUtils.ts
 * These functions use the navmesh triangle spatial index for efficient queries
 */

/**
 * Check if a point is inside the navmesh and return the triangle index
 * @param p Point coordinates
 * @param lastTriangle Previously known triangle for optimization (-1 if unknown)
 * @return Triangle index if point is in navmesh, -1 otherwise
 */
int32_t is_point_in_navmesh(Point2 p, int32_t lastTriangle);

/**
 * Get a random triangle from the navmesh
 * @param seed Random seed for deterministic results
 * @return Random triangle index
 */
int32_t get_random_triangle(uint64_t* seed);

/**
 * Get a random triangle within a specified area
 * @param center Center point of search area
 * @param numCellExtents Number of cell extents to search around center
 * @param seed Random seed for deterministic results
 * @return Random triangle index within the area
 */
int32_t get_random_triangle_in_area(Point2 center, int32_t numCellExtents, uint64_t* seed);

/**
 * Get all triangles in a specific spatial index cell
 * @param cellX Cell X coordinate
 * @param cellY Cell Y coordinate
 * @param triangleIds Output buffer for triangle IDs
 * @param maxTriangles Maximum number of triangles to return
 * @return Number of triangles found
 */
int32_t get_triangles_in_cell(int32_t cellX, int32_t cellY, int32_t* triangleIds, int32_t maxTriangles);

/**
 * Check if a point is inside a triangle using barycentric coordinates
 * @param point Point to check
 * @param v1 First triangle vertex
 * @param v2 Second triangle vertex
 * @param v3 Third triangle vertex
 * @return true if point is inside triangle, false otherwise
 */
bool is_point_in_triangle(Point2 point, Point2 v1, Point2 v2, Point2 v3);

int getTriangleFromPoint(const Point2& point);

#endif // NAV_UTILS_H 