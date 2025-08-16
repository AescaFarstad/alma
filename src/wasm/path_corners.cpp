#include "path_corners.h"
#include "math_utils.h"
#include <vector>
#include <algorithm>

// Global state dependencies
extern NavmeshData navmesh_data;

struct Portal {
    Point2 left;
    Point2 right;
};

static std::vector<Portal> getPortals(const std::vector<int>& corridor, const Point2& startPoint, const Point2& endPoint);
static Portal getPortalPoints(int tri1Idx, int tri2Idx);
static float triarea2(const Point2& p1, const Point2& p2, const Point2& p3);
static bool isPointsEqual(const Point2& p1, const Point2& p2, float epsilon = 1e-6);
static void funnel_dual(const std::vector<Portal>& portals, const std::vector<int>& corridor, DualCorner& result);
static void apply_offset_to_point(Point2& point, int tri, const Point2& end_pos, float offset);

std::vector<Corner> findCorners(const std::vector<int>& corridor, const Point2& startPoint, const Point2& endPoint) {
    if (corridor.empty()) {
        return {{endPoint, -1}};
    }
    
    std::vector<Portal> portals = getPortals(corridor, startPoint, endPoint);
    
    if (portals.size() < 2) {
        return {{startPoint, corridor[0]}};
    }

    std::vector<Corner> path;
    path.push_back({portals[0].left, corridor[0]});

    Point2 portalApex = portals[0].left;
    Point2 portalLeft = portals[0].left;
    Point2 portalRight = portals[0].right;

    int apexIndex = 0;
    int leftIndex = 0;
    int rightIndex = 0;

    for (size_t i = 1; i < portals.size(); ++i) {
        Point2 left = portals[i].left;
        Point2 right = portals[i].right;

        if (triarea2(portalApex, portalRight, right) <= 0.0f) {
            if (isPointsEqual(portalApex, portalRight) || triarea2(portalApex, portalLeft, right) > 0.0f) {
                portalRight = right;
                rightIndex = i;
            } else {
                path.push_back({portalLeft, corridor[leftIndex]});
                portalApex = portalLeft;
                apexIndex = leftIndex;
                portalLeft = portalApex;
                portalRight = portalApex;
                leftIndex = apexIndex;
                rightIndex = apexIndex;
                i = apexIndex;
                continue;
            }
        }

        if (triarea2(portalApex, portalLeft, left) >= 0.0f) {
            if (isPointsEqual(portalApex, portalLeft) || triarea2(portalApex, portalRight, left) < 0.0f) {
                portalLeft = left;
                leftIndex = i;
            } else {
                path.push_back({portalRight, corridor[rightIndex]});
                portalApex = portalRight;
                apexIndex = rightIndex;
                portalLeft = portalApex;
                portalRight = portalApex;
                leftIndex = apexIndex;
                rightIndex = apexIndex;
                i = apexIndex;
                continue;
            }
        }
    }

    if (!isPointsEqual(path.back().point, endPoint)) {
        path.push_back({endPoint, corridor.back()});
    }

    return path;
}

DualCorner find_next_corner(Point2 pos, const std::vector<int>& corridor, Point2 end_pos, float offset) {
    DualCorner result = {{0,0}, -1, {0,0}, -1, 0};
    
    if (corridor.empty()) {
        result.corner1 = end_pos;
        result.tri1 = -1;
        result.corner2 = end_pos;
        result.tri2 = -1;
        result.numValid = 1;
        return result;
    }

    // Special case: single triangle corridor - just go directly to the end point
    if (corridor.size() == 1) {
        result.corner1 = end_pos;
        result.tri1 = corridor[0];
        result.corner2 = end_pos;
        result.tri2 = corridor[0];
        result.numValid = 1;
        return result;
    }

    std::vector<Portal> portals = getPortals(corridor, pos, end_pos);
    funnel_dual(portals, corridor, result);

    if (result.numValid == 0) {
        result.corner1 = end_pos;
        result.tri1 = -1;
        result.corner2 = end_pos;
        result.tri2 = -1;
        result.numValid = 1;
        return result;
    }

    // Apply offset to corners if needed
    if (offset > 0) {
        apply_offset_to_point(result.corner1, result.tri1, end_pos, offset);
        if (result.numValid == 2) {
            apply_offset_to_point(result.corner2, result.tri2, end_pos, offset);
        }
    }

    return result;
}

static std::vector<Portal> getPortals(const std::vector<int>& corridor, const Point2& startPoint, const Point2& endPoint) {
    std::vector<Portal> portals;
    portals.push_back({startPoint, startPoint});

    for (size_t i = 0; i < corridor.size() - 1; ++i) {
        portals.push_back(getPortalPoints(corridor[i], corridor[i+1]));
    }

    portals.push_back({endPoint, endPoint});
    return portals;
}

static Portal getPortalPoints(int tri1Idx, int tri2Idx) {
    std::vector<int> tri1Verts, tri2Verts;
    for(int i=0; i<3; ++i) {
        tri1Verts.push_back(navmesh_data.triangles[tri1Idx * 3 + i]);
        tri2Verts.push_back(navmesh_data.triangles[tri2Idx * 3 + i]);
    }
    
    std::vector<int> sharedVerts;
    std::sort(tri1Verts.begin(), tri1Verts.end());
    std::sort(tri2Verts.begin(), tri2Verts.end());
    std::set_intersection(tri1Verts.begin(), tri1Verts.end(),
                          tri2Verts.begin(), tri2Verts.end(),
                          std::back_inserter(sharedVerts));

    Point2 p1 = navmesh_data.points[sharedVerts[0]];
    Point2 p2 = navmesh_data.points[sharedVerts[1]];

    Point2 c1 = navmesh_data.centroids[tri1Idx];
    Point2 c2 = navmesh_data.centroids[tri2Idx];
    
    Point2 travelDir = c2 - c1;
    Point2 edgeDir = p2 - p1;

    if (math::cross(travelDir, edgeDir) > 0) {
        return {p2, p1};
    } else {
        return {p1, p2};
    }
}

static float triarea2(const Point2& p1, const Point2& p2, const Point2& p3) {
    float ax = p2.x - p1.x;
    float ay = p2.y - p1.y;
    float bx = p3.x - p1.x;
    float by = p3.y - p1.y;
    return bx * ay - ax * by;
}

static bool isPointsEqual(const Point2& p1, const Point2& p2, float epsilon) {
    return std::abs(p1.x - p2.x) < epsilon && std::abs(p1.y - p2.y) < epsilon;
}

static void funnel_dual(const std::vector<Portal>& portals, const std::vector<int>& corridor, DualCorner& result) {
    if (portals.empty()) {
        result.corner1 = Point2(0, 0);
        result.corner2 = Point2(0, 0);
        result.tri1 = -1;
        result.tri2 = -1;
        result.numValid = 0;
        return;
    }
    
    if (portals.size() == 1) {
        Point2 corner = portals[0].left;
        int tri = corridor.empty() ? -1 : corridor[0];
        result.corner1 = corner;
        result.tri1 = tri;
        result.corner2 = corner;
        result.tri2 = tri;
        result.numValid = 1;
        return;
    }

    int cornersFound = 0;

    Point2 portalApex = portals[0].left;
    Point2 portalLeft = portals[0].left;
    Point2 portalRight = portals[0].right;
    int apexIndex = 0;
    int leftIndex = 0;
    int rightIndex = 0;

    for (size_t i = 1; i < portals.size(); ++i) {
        Point2 left = portals[i].left;
        Point2 right = portals[i].right;

        // Update right vertex
        float rightTriArea = triarea2(portalApex, portalRight, right);

        if (rightTriArea <= 0.0f) {
            bool apexRightEqual = isPointsEqual(portalApex, portalRight);
            float leftTriArea = apexRightEqual ? 1.0f : triarea2(portalApex, portalLeft, right);

            if (apexRightEqual || leftTriArea > 0.0f) {
                portalRight = right;
                rightIndex = static_cast<int>(i);
            } else {
                // Right over left, we have a corner
                Point2 startPoint = portals[0].left;
                bool leftEqualsStart = isPointsEqual(portalLeft, startPoint);

                if (cornersFound == 0) {
                    // Check if this corner is actually the start point (agent's current position)
                    if (!leftEqualsStart) {
                        result.corner1 = portalLeft;
                        result.tri1 = corridor[leftIndex];
                        cornersFound = 1;
                    }
                } else {
                    bool corner1EqualsLeft = isPointsEqual(result.corner1, portalLeft);
                    if (!corner1EqualsLeft) {
                        result.corner2 = portalLeft;
                        result.tri2 = corridor[leftIndex];
                        result.numValid = 2;
                        return;
                    }
                }
                
                // Restart from the corner
                portalApex = portalLeft;
                apexIndex = leftIndex;
                portalLeft = portalApex;
                portalRight = portalApex;
                leftIndex = apexIndex;
                rightIndex = apexIndex;
                i = apexIndex;
                continue;
            }
        }

        // Update left vertex
        float leftTriArea2 = triarea2(portalApex, portalLeft, left);

        if (leftTriArea2 >= 0.0f) {
            bool apexLeftEqual = isPointsEqual(portalApex, portalLeft);
            float rightTriArea2 = apexLeftEqual ? -1.0f : triarea2(portalApex, portalRight, left);

            if (apexLeftEqual || rightTriArea2 < 0.0f) {
                portalLeft = left;
                leftIndex = static_cast<int>(i);
            } else {
                // Left over right, we have a corner
                Point2 startPoint = portals[0].left;
                bool rightEqualsStart = isPointsEqual(portalRight, startPoint);

                if (cornersFound == 0) {
                    // Check if this corner is actually the start point (agent's current position)  
                    if (!rightEqualsStart) {
                        result.corner1 = portalRight;
                        result.tri1 = corridor[rightIndex];
                        cornersFound = 1;
                    }
                } else {
                    bool corner1EqualsRight = isPointsEqual(result.corner1, portalRight);
                    if (!corner1EqualsRight) {
                        result.corner2 = portalRight;
                        result.tri2 = corridor[rightIndex];
                        result.numValid = 2;
                        return;
                    }
                }
                
                // Restart from the corner
                portalApex = portalRight;
                apexIndex = rightIndex;
                portalLeft = portalApex;
                portalRight = portalApex;
                leftIndex = apexIndex;
                rightIndex = apexIndex;
                i = apexIndex;
                continue;
            }
        }
    }

    // Add the final point if we haven't found 2 corners yet
    Point2 endPoint = portals.back().left;
    int endTri = corridor.empty() ? -1 : corridor.back();

    if (cornersFound == 0) {
        result.corner1 = endPoint;
        result.tri1 = endTri;
        result.corner2 = endPoint;
        result.tri2 = endTri;
        result.numValid = 1;
    } else {
        // First corner already set, just add the endpoint as second corner
        bool corner1EqualsEnd = isPointsEqual(result.corner1, endPoint);
        if (corner1EqualsEnd) {
            result.numValid = 1;
        } else {
            result.corner2 = endPoint;
            result.tri2 = endTri;
            result.numValid = 2;
        }
    }
}

static void apply_offset_to_point(Point2& point, int tri, const Point2& end_pos, float offset) {
    if (tri == -1 || offset <= 0) return;
    
    bool isEndPoint = isPointsEqual(point, end_pos);
    if (isEndPoint) return;
    
    // Search for nearby blobs using spatial index
    BoundingBox searchBox = {
        point.x - 0.1f,
        point.y - 0.1f, 
        point.x + 0.1f,
        point.y + 0.1f
    };
    
    std::vector<int> nearbyBlobs = blob_spatial_index.search(searchBox);
    bool foundBlob = false;
    
    for (int blobIndex : nearbyBlobs) {
        const BlobGeometry& blob = blob_spatial_index.blobs[blobIndex];
        
        if (blob.points.empty()) continue;
        
        // Find matching vertex in blob geometry
        for (size_t i = 0; i < blob.points.size(); ++i) {
            const Point2& p = blob.points[i];
            
            if (isPointsEqual(p, point, 0.015f)) {
                const Point2& B = point;
                
                // Find adjacent vertices
                size_t prev_i = (i + blob.points.size() - 1) % blob.points.size();
                Point2 A = blob.points[prev_i];
                
                size_t next_i = (i + 1) % blob.points.size();
                Point2 C = blob.points[next_i];

                Point2 tempV = B - A;
                float len = sqrt(tempV.x * tempV.x + tempV.y * tempV.y);
                if (len > 1e-6f) {
                    tempV = tempV / len;
                }
                
                Point2 vec_CB = B - C;
                len = sqrt(vec_CB.x * vec_CB.x + vec_CB.y * vec_CB.y);
                if (len > 1e-6f) {
                    vec_CB = vec_CB / len;
                }
                
                tempV = tempV + vec_CB;

                float length_sq = tempV.x * tempV.x + tempV.y * tempV.y;
                if (length_sq > 1e-6f) {
                    float length = sqrt(length_sq);
                    tempV = tempV / length;
                    tempV = tempV * offset;
                    point = point + tempV;
                }
                
                foundBlob = true;
                break;
            }
        }
        if (foundBlob) break;
    }
    
    // Note: In the original TS, there was a check for gs.navmesh.triIndex.isGridCorner(point)
    // but we don't have that functionality implemented yet, so we skip the warning
} 