export interface Blob {
    id: string;
    buildingIds: string[];
    coordinates: number[]; // Flat array [x1, y1, x2, y2, ...]
}

/**
 * Loads blobs from blobs.txt file.
 * Format: blobId;[buildingId1,buildingId2,...];[x1,y1,x2,y2,...]
 * Example: 0;[Ma123,Ma456];[68.17,2523.29,64.53,2559.21]
 */
export async function loadBlobs(): Promise<Blob[]> {
    const response = await fetch('/data/blobs.txt');
    const text = await response.text();
    
    const blobs: Blob[] = [];
    const lines = text.trim().split('\n');
    
    for (const line of lines) {
        if (!line.trim()) continue;
        
        const parts = line.split(';');
        if (parts.length !== 3) {
            console.warn(`Invalid blob line format: ${line}`);
            continue;
        }
        
        const id = parts[0];
        
        const buildingIdsStr = parts[1].slice(1, -1); // Remove brackets
        const buildingIds = buildingIdsStr.split(',');

        const coordsStr = parts[2].slice(1, -1); // Remove brackets
        const coordinates: number[] = [];

        if (coordsStr.trim()) {
            try {
                const coordStrings = coordsStr.split(',');
                for (const coordStr of coordStrings) {
                    const coord = parseFloat(coordStr.trim());
                    if (isNaN(coord)) {
                        throw new Error(`Invalid coordinate: ${coordStr}`);
                    }
                    coordinates.push(coord);
                }
            } catch (e) {
                console.warn(`Invalid coordinates in blob line: ${line}`, e);
                continue;
            }
        }

        if (coordinates.length % 2 !== 0) {
            console.warn(`Odd number of coordinates in blob line: ${line}`);
            continue;
        }

        if (coordinates.length < 6) {
            console.warn(`Insufficient coordinates for polygon in blob line: ${line}`);
            continue;
        }
        
        blobs.push({
            id,
            buildingIds,
            coordinates
        });
    }
    
    return blobs;
} 