export const mapStyle = {
    "version": 8 as const,
    "name": "Game Style",
    "sources": {
      "almaty-tiles": {
        "type": "vector",
        "tiles": [`${window.location.origin}/tiles/{z}/{x}/{y}.pbf`],
        "minzoom": 10,
        "maxzoom": 15,
        "bounds": [76.30048, 43.15101, 77.14701, 43.4256],
        "attribution": "<a href=\"https://www.openstreetmap.org/copyright\" target=\"_blank\">&copy; OSM</a>"
      }
    },
    "layers": [
      {
        "id": "background",
        "type": "background",
        "paint": {
          "background-color": "#f8f4f0"
        }
      },
      {
        "id": "water",
        "type": "fill",
        "source": "almaty-tiles",
        "source-layer": "water",
        "paint": {
          "fill-color": "#a0c8f0"
        }
      },
      {
        "id": "buildings",
        "type": "fill",
        "source": "almaty-tiles",
        "source-layer": "building",
        "paint": {
            // "fill-color": "#cccccc", // <-- Replace this
            "fill-color": [
            "interpolate",
            ["linear"],
            ["to-number", ["get", "building:levels"], 1], // Get building:levels, default to 1 if not present
            1, "#e3e3e3",
            2, "#dbdbdb",
            3, "#d3d3d3",
            4, "#cbcbcb",
            5, "#c3c3c3",
            10, "#bdbdbd"
            ],
            "fill-outline-color": "#999999"
        }
      },
      {
        "id": "roads",
        "type": "line",
        "source": "almaty-tiles",
        "source-layer": "road",
        "filter": ["!in", "highway", "footway", "path", "steps"],
        "paint": {
          "line-color": "#aaaaaa",
          "line-width": [
            "match",
            ["get", "highway"],
            "primary", 6,
            "secondary", 4,
            "tertiary", 3,
            2
          ]
        }
      },
      {
        "id": "footways",
        "type": "line",
        "source": "almaty-tiles",
        "source-layer": "road",
        "filter": ["in", "highway", "footway", "path"],
        "paint": {
          "line-color": "#999999",
          "line-dasharray": [2, 2],
          "line-width": 1
        }
      },
      {
        "id": "steps",
        "type": "line",
        "source": "almaty-tiles",
        "source-layer": "road",
        "filter": ["==", ["get", "highway"], "steps"],
        "paint": {
          "line-color": "#999999",
          "line-dasharray": [0.5, 0.5],
          "line-width": 2
        }
      }
    ]
};

export const mapOptions = {
    container: 'map',
    style: mapStyle as any,
    center: [76.9470, 43.2467] as [number, number],
    zoom: 16,
    minZoom: 10,
    maxZoom: 18, // Allow overzooming up to level 18
    maxBounds: [76.30048, 43.15101, 77.14701, 43.4256] as [number, number, number, number], // Restrict panning to tile bounds
}; 