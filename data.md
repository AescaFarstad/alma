Almaty OpenStreetMap Data Extract

## Overview

This dataset contains geographic information about Almaty, Kazakhstan, extracted and processed from OpenStreetMap (OSM). The data represents real-world features including buildings, roads, and other urban infrastructure.

-   **Original Source**: OpenStreetMap (OSM)
-   **License**: Open Database License (ODbL) 1.0
-   **Coverage Area**: Central Almaty, Kazakhstan

## Data Pipeline

The application relies on two parallel data processing pipelines that both originate from the same raw OpenStreetMap data but serve different purposes. It's crucial to understand that they are separate and must be kept in sync.

1.  **Pipeline A: Game State Data (`buildings.geojson`)**
    *   **Processor**: `src/mapgen/process_osm_data.cjs`
    *   **Purpose**: To create a `buildings.geojson` file that the game's logic uses to understand the world. This includes finding starting locations and populating the initial set of buildings in the game state.
    *   **Key Action**: This script uses `osmium` to extract building features and, importantly, **must be configured to include the unique OpenStreetMap ID** for each feature. This ID is the link between the game's logic and the visual map.

2.  **Pipeline B: Visual Map Tiles (Vector Tiles)**
    *   **Processor**: Planetiler (`planetiler.jar`) with `public/city-profile.yml` as its configuration.
    *   **Purpose**: To generate the vector tiles that MapLibre renders on the screen. These tiles contain the visual geometry and properties of the buildings you see.
    *   **Key Action**: This process also reads from the raw OSM data and embeds the feature properties, including the unique OSM ID, directly into the tiles.

### The ID Synchronization Challenge

The core problem this application faced was that **Pipeline A was not including the OSM ID**, while **Pipeline B was**. This created a disconnect:
- The **game logic** (from Pipeline A) did not know the real OSM IDs of the buildings.
- The **map view** (from Pipeline B) *did* know the real OSM IDs.

When a building was clicked, the map reported an ID that the game logic didn't recognize, leading to incorrect behavior. The solution is to ensure `process_osm_data.cjs` correctly exports the OSM ID so both pipelines are synchronized.

---

## Updating the Data

When you need to change the map data, you must re-run the appropriate data pipeline.

| If you decide to...                                | You need to...                                                                                                                                                                                                                                  |
| :------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Change what buildings are available to the game** or **add/remove building properties** | 1. **Edit `src/mapgen/process_osm_data.cjs`**: Modify the script's configuration (e.g., `FEATURES_TO_EXTRACT`, `REMOVE_TAGS`). <br/> 2. **Run the script**: Execute `node src/mapgen/process_osm_data.cjs` to regenerate `public/data/buildings.geojson`. |
| **Change the visual appearance of the map** (e.g., add new feature types like waterways, change colors) | 1. **Edit `public/city-profile.yml`**: Modify the Planetiler schema to include new features or attributes. <br/> 2. **Re-run Planetiler**: Use the VS Code task or command to regenerate the vector tiles in `/public/tiles`. |
| **Enlarge the map area**                           | You must update **both pipelines**: <br/> 1. **Edit `process_osm_data.cjs`**: Change `AREA_TO_EXTRACT`. <br/> 2. **Re-run the script**. <br/> 3. **Re-run Planetiler** to generate tiles for the new area. |

---

## Development & Caching

### Disabling Cache (Development)

During development, you want to see data changes immediately. Your browser's cache can prevent this.

-   **Browser DevTools**: The most effective method is to open your browser's Developer Tools, go to the "Network" tab, and check the "Disable cache" option.
-   **Vite Dev Server**: The Vite dev server has built-in mechanisms for hot module replacement (HMR) for code, but it may not automatically handle changes in the static `public` directory where the tiles are located. Restarting the tile-serving process and disabling browser cache is the most reliable approach.

### Enabling Cache (Production)

In a production environment, caching is crucial for performance. You don't need to do anything in the application code. Caching should be configured on the web server that serves the static tile files.

-   **Server Configuration**: Configure your web server (e.g., Nginx, Apache) to serve files from the `/tiles` directory with long-lived `Cache-Control` headers. This tells browsers to store the tiles locally for a long time, reducing server load and speeding up map navigation for repeat visitors.

Example Nginx configuration:
```nginx
location /tiles/ {
  root /path/to/your/project/public;
  expires 1y;
  add_header Cache-Control "public";
}
```

---

## Advanced: Handling Dynamic Data (e.g., Car Simulation)

When you need to display a large number of dynamic objects (like vehicles) that update frequently (e.g., every frame), the standard `source.setData()` approach can become a performance bottleneck. Here's a guide to handling this efficiently.

### The Challenge with `setData`

Calling `source.setData()` on a GeoJSON source is easy to implement but has performance limitations:
- **CPU Intensive**: It requires processing a potentially large GeoJSON object on the CPU every time it's called.
- **Data Transfer**: It involves transferring the entire dataset from the JavaScript main thread to the map's web worker and then to the GPU on each update.
- **Frame Rate Impact**: For many objects updating every frame, this process can easily overwhelm the main thread and cause your animation to stutter.

### The Performant Solution: Custom WebGL Layers

For high-performance rendering, the best practice is to bypass the GeoJSON source and render your objects directly with WebGL using a [Custom Layer](https://maplibre.org/maplibre-gl-js-docs/example/custom-layer/). This gives you direct access to the map's rendering context.

**How it Works:**

1.  **You Own the Rendering**: You provide the logic to draw your objects. This involves writing your own **vertex and fragment shaders** in GLSL (OpenGL Shading Language).
    *   The **vertex shader** calculates the screen position of each car.
    *   The **fragment shader** determines the color of each pixel for the car's sprite.
2.  **Direct GPU Data Management**: You create and manage your own WebGL buffers on the GPU to store car data (positions, rotations, colors, etc.).
3.  **Efficient Updates**: On each frame, instead of sending a large GeoJSON object, you only send the small amount of changed data (the new positions) directly to the GPU buffer. This is significantly faster.

**Steps to Implement:**

1.  **Create a Custom Layer Class**: Define a JavaScript class that implements MapLibre's `CustomLayerInterface`. This class will have methods like `onAdd` (to set up shaders and buffers) and `render` (which is called on every frame).
2.  **Write GLSL Shaders**: Create shader programs to draw your car sprites (e.g., textured quads).
3.  **Manage Data in Buffers**: In the `onAdd` method, create a WebGL buffer. In the `render` method, update this buffer with the latest car locations and then issue a draw call (`gl.drawArrays` or `gl.drawElements`).
4.  **Add to Map**: Instantiate your custom layer and add it to the map using `map.addLayer()`.

While this approach requires knowledge of WebGL, it is the standard technique for high-performance graphics and is the only way to ensure a smooth frame rate when simulating hundreds or thousands of moving objects on a map.

---

## Modifying Features vs. Adding New Ones

A common challenge is deciding how to handle dynamic data. There are three primary methods, each suited for a different task.

| Method                   | Use For...                                                                               | Example                                                                       | Performance           |
| :----------------------- | :--------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------- | :-------------------- |
| **`map.setFeatureState()`**  | Changing the **appearance of existing features** that are already in your vector tiles.  | Coloring buildings by team, highlighting districts, showing selected roads.   | **Excellent**         |
| **`source.setData()`**     | Adding a **small-to-medium number of new features** that are not in your base tiles.     | A user's planned route, a few drones updating every 5s, search results.       | **Good** (for its use case) |
| **Custom WebGL Layer**   | Adding a **large number of new features** that must update every frame.                    | Simulating hundreds of cars, weather particles, bullet projectiles.           | **Best** (for high-frequency) |

### Use Case: Coloring Captured Buildings (`setFeatureState`)

This is the most efficient way to change the properties of features that are already part of the map.

1.  **Style Modification**: Update your style layer to react to a "state". In `App.vue`, the `buildings` layer `paint` property can be changed to use a `case` expression that checks for a state property (e.g., `team`).

    ```javascript
    "fill-color": [
      "case",
      ["==", ["feature-state", "team"], "blue"], "#87ceeb", // If state 'team' is 'blue'
      ["==", ["feature-state", "team"], "red"], "#f08080",   // If state 'team' is 'red'
      "#cccccc" // Default color
    ]
    ```

2.  **Game Logic**: When a building is clicked or captured, use `map.setFeatureState()` to apply a state to it using its unique feature ID.

    ```javascript
    const featureId = clickedFeature.id;
    map.setFeatureState(
      { source: 'almaty-tiles', sourceLayer: 'building', id: featureId },
      { team: 'blue' }
    );
    ```
This approach is extremely fast as it does not require re-sending or duplicating any geometry data.