Almaty OpenStreetMap Data Extract

## Overview

This dataset contains geographic information about Almaty, Kazakhstan, extracted and processed from OpenStreetMap (OSM). The data represents real-world features including buildings, roads, and other urban infrastructure.

-   **Original Source**: OpenStreetMap (OSM) - located at /data/other/kazakhstan-latest.osm.pbf
-   **License**: Open Database License (ODbL) 1.0
-   **Coverage Area**: Central Almaty, Kazakhstan - filtered to /data/almaty_c.pbf

## Data Pipeline

The game's map data is generated through a multi-step pipeline. The process starts with a large OpenStreetMap data file and progressively refines it into a format the game can use for logic and rendering. All intermediate data artifacts are stored in the /data/ directory for examination.

The pipeline consists of the following steps:

1.  **Region Filtering**: The process begins by extracting the relevant map area for Almaty from a larger country-wide OSM file. This creates a smaller, more manageable file, /data/almaty_c.pbf.

2.  **GeoJSON Conversion**: The filtered OSM data is then converted into GeoJSON format by the src/mapgen/process_osm_data.cjs script. The output is a GeoJSON file containing building and road features. This step is run via the 'Process OSM' VS Code task.

3.  **GeoJSON Filtering**: The raw GeoJSON is further processed by the src/mapgen/filter_geojson.cjs script. This step can be used to remove unneeded features, simplify geometries, or modify properties to suit the game's requirements.

4.  **Navigation Mesh Generation**: The src/mapgen/build_navmesh.cjs script takes the filtered GeoJSON and generates a navigation mesh, which is essential for pathfinding and unit movement within the game.

The result of this pipeline is a final GeoJSON file that is loaded by the game and navmesh data. The GeoJSON file serves two purposes: it provides the core data for the game's logic (e.g., building locations, properties) and it is used to dynamically generate vector tiles on the client-side for map rendering using technologies like geojson-vt in a web worker.

---

## Working with Custom Coordinates and Static Tiles

A significant challenge in this project was creating an efficient static tile system for a non-geographic, custom Cartesian coordinate system (from -10,000m to 10,000m). A naive approach using standard web mapping tools, which are designed for the massive scale of planet Earth, results in thousands of tiny, mostly empty tiles.

The solution required a coordinated, three-part setup across the tile generation script, the frontend map component, and the development server.

### 1. The Tile Generation Script (`src/mapgen/generate_tiles.cjs`)

The core problem was that a standard tile pyramid (where the number of tiles is 2^zoom) is inappropriate for our small world. The solution was to define a custom tile grid that creates a sane number of tiles at each zoom level.

**Key Insight**: Instead of `2^zoom` tiles, we defined explicit tile counts for each zoom level. At zoom 9, the entire 20km x 20km world is a single tile. At zoom 10, it's 2x2=4 tiles, and so on.

```javascript
// src/mapgen/generate_tiles.cjs

const ZOOM_TILE_COUNTS = {
    9: 1,   // 1x1 = 1 tile total (20km x 20km per tile)
    10: 2,  // 2x2 = 4 tiles total (10km x 10km per tile)
    11: 4,  // 4x4 = 16 tiles total (5km x 5km per tile)
    12: 8,  // 8x8 = 64 tiles total (2.5km x 2.5km per tile)
    13: 16, // 16x16 = 256 tiles total (1.25km x 1.25km per tile)
    14: 32, // 32x32 = 1024 tiles total (625m x 625m per tile)
    15: 64  // 64x64 = 4096 tiles total (312.5m x 312.5m per tile)
};
```

The tile generation functions were then modified to use this `ZOOM_TILE_COUNTS` object to calculate tile boundaries, ensuring the generated tiles match our custom grid.

### 2. The Frontend Map Component (`src/components/map/Map.vue`)

The frontend needs to be perfectly synchronized with the backend tile structure. This required two critical configurations.

**Insight A: Synchronize the View and the Tile Grid**
The OpenLayers `View` (what the user sees) and the `TileGrid` (what tiles are requested) must share the exact same definition of zoom levels. We achieved this by defining a single `resolutions` array and passing it to both constructors.

**Insight B: Map Zoom Index to Semantic Zoom Level**
When using a custom `resolutions` array, OpenLayers' "zoom" becomes an *index* into that array (0, 1, 2...). Our tile generation script, however, creates directories named after the *semantic* zoom level (9, 10, 11...). The final piece of the puzzle was a `tileUrlFunction` to translate the request. When OpenLayers requests tile with `z=2`, this function builds a URL for `z=11`.

```typescript
// src/components/map/Map.vue

onMounted(() => {
  // Define a single source of truth for resolutions
  const resolutions = [
    20000 / 512, // zoom 9 (index 0)
    10000 / 512, // zoom 10 (index 1)
    5000 / 512,  // zoom 11 (index 2)
    // ...and so on
  ];

  const customTileGrid = new TileGrid({
      extent: [-10000, -10000, 10000, 10000],
      resolutions: resolutions,
      tileSize: 512
  });

  mapInstance.map = new OlMap({
    view: new View({
      resolutions: resolutions, // Use the same resolutions
      zoom: 2, // Initial zoom is index 2 (semantic zoom 11)
      // ...
    }),
  });
  
  const buildingsSource = new VectorTileSource({
      tileGrid: customTileGrid,
      tileUrlFunction: (tileCoord) => {
          const z = tileCoord[0] + 9; // Map index to semantic zoom
          const x = tileCoord[1];
          const y = tileCoord[2];
          return `/tiles/buildings/${z}/${x}/${y}.pbf`;
      },
  });
  // ...
});
```

### 3. The Development Server (`vite.config.ts`)

After fixing the tile structure, a final roadblock was the `net::ERR_CONTENT_DECODING_FAILED` error. This indicated the server was misrepresenting the tile files.

**Key Insight**: A custom Vite plugin was incorrectly telling the browser that the `.pbf` (Protobuf) files were `gzip` compressed. Since `.pbf` is already a binary compressed format, compressing it again corrupts it.

The fix was to remove the incorrect header from the plugin.

```typescript
// vite.config.ts

const vectorTilesPlugin = () => {
  // ...
  res.setHeader('Content-Type', 'application/vnd.mapbox-vector-tile');
  // Our tiles are not gzipped, so we should not set this header.
  // res.setHeader('Content-Encoding', 'gzip'); // This line was the problem
  // ...
};
```

By coordinating these three areas, we successfully created a high-performance, static tile rendering system for a custom Cartesian world.

---

## Updating the Data

To regenerate the game data, you must run the entire data processing pipeline. Any change in the source data or in any of the processing scripts requires a full rebuild to see the effects in the game. The intermediate files in the /data/ folder can be inspected at each step to debug the process.

---

## Development & Caching

### Disabling Cache (Development)

During development, you want to see data changes immediately. Your browser's cache can prevent this.

-   **Browser DevTools**: The most effective method is to open your browser's Developer Tools, go to the "Network" tab, and check the "Disable cache" option.
-   **Vite Dev Server**: The Vite dev server has built-in mechanisms for hot module replacement (HMR) for code, but it may not automatically handle changes in the static `public` directory where the tiles are located. Restarting the tile-serving process and disabling browser cache is the most reliable approach.

### Enabling Cache (Production)



---

## Advanced: Handling Dynamic Data (e.g., Car Simulation)

When you need to display a large number of dynamic objects (like vehicles) that update frequently (e.g., every frame), the standard `source.setData()` approach can become a performance bottleneck. Here's a guide to handling this efficiently.

### The Challenge with `setData`

Calling `source.setData()` on a GeoJSON source is easy to implement but has performance limitations for a large number of objects updating every frame, this process can easily overwhelm the main thread and cause your animation to stutter.

### The Performant Solution: Custom WebGL Layers

For high-performance rendering, the best practice is to bypass the GeoJSON source and render your objects directly with WebGL using a Custom Layer. This gives you direct access to the map's rendering context. This approach requires knowledge of WebGL, but it is the standard technique for high-performance graphics and is the only way to ensure a smooth frame rate when simulating hundreds or thousands of moving objects on a map.

---

## Modifying Features vs. Adding New Ones

A common challenge is deciding how to handle dynamic data. There are three primary methods, each suited for a different task.

| Method                   | Use For...                                                                               | Example                                                                       | Performance           |
| :----------------------- | :--------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------- | :-------------------- |
| **`map.setFeatureState()`**  | Changing the **appearance of existing features** that are already in your vector tiles.  | Coloring buildings by team, highlighting districts, showing selected roads.   | **Excellent**         |
| **`source.setData()`**     | Adding a **small-to-medium number of new features** that are not in your base tiles.     | A user's planned route, a few drones updating every 5s, search results.       | **Good** (for its use case) |
| **Custom WebGL Layer**   | Adding a **large number of new features** that must update every frame.                    | Simulating hundreds of cars, weather particles, bullet projectiles.           | **Best** (for high-frequency) |

### Use Case: Coloring Captured Buildings (`setFeatureState`)

This is the most efficient way to change the properties of features that are already part of the map. When a building is clicked or captured, use `map.setFeatureState()` to apply a state to it using its unique feature ID. This approach is extremely fast as it does not require re-sending or duplicating any geometry data.