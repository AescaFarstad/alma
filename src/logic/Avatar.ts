
import { raycastPoint } from "./Raycasting";
import { dot, length_sq, Point2, copy, subtract, scale, add, normalize } from "./core/math";
import { Navmesh } from "./navmesh/Navmesh";
import type { Avatar } from "./GameState";


export function updateAvatar(avatar: Avatar, deltaTime: number, navmesh: Navmesh) {
    // --- Avatar Look Rotation ---
    const dotProduct = dot(avatar.look, avatar.lookTarget);
    const clampedDot = Math.max(-1.0, Math.min(1.0, dotProduct));
    let angle = Math.acos(clampedDot);

    if (angle > 0.001) {
        const crossProduct = avatar.look.x * avatar.lookTarget.y - avatar.look.y * avatar.lookTarget.x;
        const rotationDirection = Math.sign(crossProduct);
        
        const maxAngleChange = avatar.lookSpeed * deltaTime;
        const angleChange = Math.min(angle, maxAngleChange);
        
        const rotationAngle = angleChange * rotationDirection;
        
        const cosAngle = Math.cos(rotationAngle);
        const sinAngle = Math.sin(rotationAngle);
        
        const newLookX = avatar.look.x * cosAngle - avatar.look.y * sinAngle;
        const newLookY = avatar.look.x * sinAngle + avatar.look.y * cosAngle;
        
        avatar.look = normalize({ x: newLookX, y: newLookY });

    } else {
        avatar.look.x = avatar.lookTarget.x;
        avatar.look.y = avatar.lookTarget.y;
    }
    
    // --- Avatar Physics and Movement ---

    const desiredVelocity = { x: 0, y: 0 };

    if (length_sq(avatar.movement) > 0) {
        const forwardX = avatar.look.x;
        const forwardY = avatar.look.y;
        const rightX = forwardY;
        const rightY = -forwardX;

        const moveDirX = forwardX * avatar.movement.y + rightX * avatar.movement.x;
        const moveDirY = forwardY * avatar.movement.y + rightY * avatar.movement.x;
        
        const moveDirLen = Math.sqrt(moveDirX*moveDirX + moveDirY*moveDirY);
        if (moveDirLen > 0) {
            desiredVelocity.x = (moveDirX / moveDirLen) * avatar.maxSpeed;
            desiredVelocity.y = (moveDirY / moveDirLen) * avatar.maxSpeed;
        }
    }

    const velocityDiff = subtract(desiredVelocity, avatar.velocity);
    let finalAccel = { x: 0, y: 0 };
    
    if (length_sq(avatar.movement) > 0) {
        // Player is giving input - always apply full acceleration
        const accelVec = scale(normalize(velocityDiff), avatar.accel);
        finalAccel = accelVec;
    } else {
        // No player input - stopping, apply threshold and prevent overshoot
        const accelVec = scale(normalize(velocityDiff), avatar.accel);
        finalAccel = length_sq(velocityDiff) < 0.01 ? {x: 0, y: 0} : accelVec;
        
        // Prevent overshooting zero velocity when stopping
        const accelDelta = scale(finalAccel, deltaTime);
        const newVelocity = add(avatar.velocity, accelDelta);
        
        // Check if acceleration would overshoot zero in either axis
        if ((avatar.velocity.x > 0 && newVelocity.x < 0) || (avatar.velocity.x < 0 && newVelocity.x > 0)) {
            finalAccel.x = -avatar.velocity.x / deltaTime; // Exactly stop at zero
        }
        if ((avatar.velocity.y > 0 && newVelocity.y < 0) || (avatar.velocity.y < 0 && newVelocity.y > 0)) {
            finalAccel.y = -avatar.velocity.y / deltaTime; // Exactly stop at zero
        }
    }
    
    avatar.velocity = add(avatar.velocity, scale(finalAccel, deltaTime));

    // 2. Apply resistance (frame-rate independent)
    const resistanceFactor = Math.pow(1 - avatar.resistance, deltaTime);
    avatar.velocity.x *= resistanceFactor;
    avatar.velocity.y *= resistanceFactor;
    
    // Stop avatar completely when velocity is very low to prevent jiggling
    if (length_sq(avatar.velocity) < 0.001) {
        avatar.velocity.x = 0;
        avatar.velocity.y = 0;
    }
    
    // 4. Collision Detection and Resolution
    const startPoint = copy(avatar.coordinate);
    const endPoint = {
        x: startPoint.x + avatar.velocity.x * deltaTime,
        y: startPoint.y + avatar.velocity.y * deltaTime
    } as Point2;
    const normVelocity = normalize(avatar.velocity);
    const endPointForRecast = {
        x: endPoint.x + normVelocity.x * 0.45,
        y: endPoint.y + normVelocity.y * 0.45
    } as Point2;
    avatar.wallContact = false;
    
    if (deltaTime > 0 && length_sq(avatar.velocity) > 0) {
        const raycastResult = raycastPoint(navmesh, startPoint, endPointForRecast, avatar.lastTriangle, undefined);

        if (raycastResult.hitP1 && raycastResult.hitP2) {
            avatar.wallContact = true;
            
            // Calculate wall vector and normal
            const wallVector = { x: raycastResult.hitP2.x - raycastResult.hitP1.x, y: raycastResult.hitP2.y - raycastResult.hitP1.y };
            let wallNormal = { x: -wallVector.y, y: wallVector.x } as Point2;
            
            // Normalize the wall normal
            const normLen = Math.sqrt(wallNormal.x * wallNormal.x + wallNormal.y * wallNormal.y);
            if (normLen > 0) {
                wallNormal.x /= normLen;
                wallNormal.y /= normLen;
            }
            
            // Ensure wall normal points away from the movement direction
            if (dot(wallNormal, normVelocity) > 0) {
                wallNormal.x = -wallNormal.x;
                wallNormal.y = -wallNormal.y;
            }

            // Project velocity onto the wall plane (slide) - removes normal component completely
            const normalVelocityComponent = dot(avatar.velocity, wallNormal);
            avatar.velocity.x -= normalVelocityComponent * wallNormal.x * 1.45;
            avatar.velocity.y -= normalVelocityComponent * wallNormal.y * 1.45;

            let newCoordinate = add({x: startPoint.x, y: startPoint.y}, scale(avatar.velocity, deltaTime));
            
            // Validate the calculated position is within navmesh
            const newTriangle = navmesh.triIndex.isPointInNavmesh(newCoordinate, navmesh, avatar.lastTriangle);
            if (newTriangle !== -1) {
                avatar.lastTriangle = newTriangle;
                avatar.coordinate.x = newCoordinate.x;
                avatar.coordinate.y = newCoordinate.y;
            }
            else {
                console.log("projected coord fail");
            }
        }
        else {
            // No collision, move to original endpoint
            avatar.coordinate.x = endPoint.x;
            avatar.coordinate.y = endPoint.y;
            
            // Check if the new position is within navmesh (only for non-raycasted movements)
            const newTriangle = navmesh.triIndex.isPointInNavmesh(avatar.coordinate, navmesh, avatar.lastTriangle);
            if (newTriangle !== -1) {
                avatar.lastTriangle = newTriangle;
            } else {
                // If outside navmesh, revert to start position
                console.log("global fail");
                avatar.coordinate.x = startPoint.x;
                avatar.coordinate.y = startPoint.y;
            }
        }
    }

    const newTriangle = navmesh.triIndex.isPointInNavmesh(avatar.coordinate, navmesh, avatar.lastTriangle);
    avatar.isOutsideNavmesh = newTriangle === -1;

    if (avatar.wallContact) {
        const frictionFactor = Math.pow(1 - avatar.wallResistance, deltaTime);
        avatar.velocity.x *= frictionFactor;
        avatar.velocity.y *= frictionFactor;
    }
} 