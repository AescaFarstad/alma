export interface S7Building {
    id: string;
    properties: Record<string, any>;
    coordinates: number[]; // Flat array [x1, y1, x2, y2, ...]
}

/**
 * Loads buildings from S7 format text file.
 * Format: buildingId;propertiesJson[x1;y1;x2;y2;...]
 * Example: Ma15313653960;{"building":"commercial","num":"36/4"}[68.17;2523.29;64.53;2559.21;56.24;2558.36;59.88;2522.46]
 */
export async function loadS7Buildings(): Promise<S7Building[]> {
    const response = await fetch('/data/buildings_s7.txt');
    const text = await response.text();
    
    const buildings: S7Building[] = [];
    const lines = text.trim().split('\n');
    
    for (const line of lines) {
        if (!line.trim()) continue;
        
        // Parse format: buildingId;propertiesJson[coordinates]
        const semicolonIndex = line.indexOf(';');
        if (semicolonIndex === -1) {
            console.warn(`Invalid S7 line format (no semicolon): ${line}`);
            continue;
        }
        
        const id = line.substring(0, semicolonIndex);
        const remaining = line.substring(semicolonIndex + 1);
        
        // Find the start of coordinates array (marked by '[')
        const bracketIndex = remaining.indexOf('[');
        if (bracketIndex === -1) {
            console.warn(`Invalid S7 line format (no opening bracket): ${line}`);
            continue;
        }
        
        // Extract properties JSON
        const propertiesJson = remaining.substring(0, bracketIndex);
        let properties: Record<string, any> = {};
        
        try {
            properties = JSON.parse(propertiesJson);
        } catch (e) {
            console.warn(`Invalid JSON in S7 line: ${line}`, e);
            continue;
        }
        
        // Extract coordinates array
        const coordsStr = remaining.substring(bracketIndex + 1);
        const closingBracketIndex = coordsStr.lastIndexOf(']');
        if (closingBracketIndex === -1) {
            console.warn(`Invalid S7 line format (no closing bracket): ${line}`);
            continue;
        }
        
        const coordsArray = coordsStr.substring(0, closingBracketIndex);
        const coordinates: number[] = [];
        
        if (coordsArray.trim()) {
            try {
                const coordStrings = coordsArray.split(',');
                for (const coordStr of coordStrings) {
                    const coord = parseFloat(coordStr.trim());
                    if (isNaN(coord)) {
                        throw new Error(`Invalid coordinate: ${coordStr}`);
                    }
                    coordinates.push(coord);
                }
            } catch (e) {
                console.warn(`Invalid coordinates in S7 line: ${line}`, e);
                continue;
            }
        }
        
        // Validate that we have pairs of coordinates
        if (coordinates.length % 2 !== 0) {
            console.warn(`Odd number of coordinates in S7 line: ${line}`);
            continue;
        }
        
        // Ensure we have at least 3 points (6 coordinates) for a valid polygon
        if (coordinates.length < 6) {
            console.warn(`Insufficient coordinates for polygon in S7 line: ${line}`);
            continue;
        }
        
        buildings.push({
            id,
            properties,
            coordinates
        });
    }
    
    // console.log(`[S7BuildingsLoader] Loaded ${buildings.length} buildings from S7 format`);
    return buildings;
} 