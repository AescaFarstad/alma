## **GeoJSON Processing and Transformation Specification**

This document outlines a series of sequential rules for cleaning, transforming, and simplifying a GeoJSON dataset containing `building` and `highway` features. The process is divided into distinct stages: Global Filtering, Feature-Specific Processing, Global Transformation, and Logging.

The overall process for each feature is as follows:
1.  Run feature-specific processing rules.
2.  Transform coordinates to a local planar system.
3.  For `building` features, calculate the `inscribedCenter` based on the new coordinates.
4.  Perform final checks and write the feature to the output file.
5.  Generate a detailed log of all operations.

---

### **1. Global Pre-processing & Filtering**

This initial stage removes features that do not meet the basic criteria for inclusion, regardless of their type.

**1.1. Feature Removal Rules:**
Remove any feature that meets one of the following conditions:
*   **Invalid Geometry Type:** The feature's geometry is not `Polygon`, `MultiPolygon`, or `LineString`.


---

### **2. Feature-Specific Processing**

These rules are applied sequentially to features that passed the global filtering stage.

#### **2.1. Rules for `building` Features**

The following rules apply only to features where the `building` property exists. The operations should be performed in the order listed.

**2.1.1. `building` Tag Refinement**
These rules refine the primary `building` tag based on other properties.

*   **Geometry Check**: Remove the feature if its geometry is not `Polygon`, `MultiPolygon`, or a closed `LineString`.
*   **Barrier Check**: Remove features that have a non-empty value for the `barrier` or `bollard` property.
*   **Healthcare Check:** If the feature has a `healthcare` or `healthcare:speciality` property, set the `building` property to `healthcare`.
*   **Refinement of `building=yes`:** If the `building` property has the value `yes`, it must be re-categorized. The first matching rule in the following list determines the new value:
    *   **Set to `commercial` if any of these properties exist:**
        *   `amenity`, `brand`, `brand:en`, `brand:ru`, `brand:wikidata`, `brand:wikipedia`, `construction`, `cuisine`, `fuel:diesel`, `fuel:octane_95`, `fuel:octane_98`, `leisure`, `opening_hours`, `phone`, `phone_1`, `product`, `shop` or any property starting with `payment:`.
    *   **Set to `amenity` if any of these properties exist:**
        *   `community_centre`, `government`, `public_transport`, `railway`, `religion`, `sport`, `tourism`.
    *   **Set to `industrial` if any of these properties exist:**
        *   `industrial`, `power`.


**2.1.2. Property Normalization and Enrichment**
These rules clean up and consolidate feature properties.

*   **Address (`addr:*`) Consolidation:**
    *   `addr:housenumber`:
        1. If `addr:housenumber` is missing, copy the value from `addr2:housenumber` or `addr:housenumber2`.
        2. If `addr:housenumber` and `addr:housenumber2` both exist and differ, they are combined as `{housenumber}/{housenumber2}`.
        3. If `addr:housenumber` is missing, `addr:unit` is used.
        4. If both `addr:housenumber` and `addr:unit` exist, they are combined as `{housenumber}-{unit}`.
    *   `addr:street`: If `addr:street` is missing or empty, copy the value from `addr:street:ru`.

*   **Name (`name`) Population (in order of priority):**
    1.  If `name:ru` exists, its value **overwrites** any existing `name`.
    2.  If `name` is empty, populate from the first available: `name:en`, `name:es`, `name:de`, `name:fr`, `name:kk`, `name:tr`, `name:tt`, `name:zh`, `name:cv`, `name:ko`, `name:alt`, `name:old`.
    3.  If `name` is still empty, populate from the first available: `official_name:ru`, `official_name`, `official_name:kk`, `old_name`, `short_name`, `short_name:ru`, `short_name:en`, `short_name:de`.
    4.  If `name` is still empty, populate from `wikimedia_commons`, stripping the `Category:` prefix.
    5.  If `name` is still empty, populate from `wikipedia`, stripping any language prefixes (`ru:`, `en:`, `kk:`).

*   **Building Attributes:**
    *   `building:levels`: If `building:levels` does not exist, copy the value from `levels` or `level` (preferring `levels`).
    *   `building:colour`: If `building:colour` does not exist, copy the value from `roof:colour`.

**2.1.3. `building` Category Condensation**
Map the `building` property's value to one of the target categories. If a value fits multiple categories, the more specific one is preferred. Any unlisted value defaults to `amenity`.

| Target Category | Source Values                                                                                                                                                                                                                                                         |
| :-------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **residential** | `apartments`, `house`, `residential`, `detached`, `dormitory`, `hut`, `yes` (if it survived refinement)                                                                                                                                                                  |
| **commercial**  | `commercial`, `retail`, `office`, `service`, `hotel`, `warehouse`, `shop`, `kiosk`, `supermarket`                                                                                                                                                                       |
| **education**   | `school`, `university`, `kindergarten`, `college`, `library`                                                                                                                                                                                                            |
| **industrial**  | `industrial`, `garages`, `garage`, `hangar`, `shed`, `greenhouse`, `construction`                                                                                                                                                                                         |
| **healthcare**  | `hospital`, `healthcare`                                                                                                                                                                                                                                                |
| **amenity**     | `roof`, `civic`, `public`, `government`, `church`, `toilets`, `mosque`, `temple`, `museum`, `theater`, `community_centre`, `sports_centre`, `stadium`, `guardhouse`, `parking`, `bridge`, `ruins`, `no` (or any other unlisted value) |


**2.1.4. Final Property Pruning**
After all processing, properties are pruned and renamed. The final feature will only contain:
*   `building`
*   `levels` (from `building:levels`)
*   `color` (from `building:colour`)
*   `num` (from `addr:housenumber`)
*   `amenity`, `shop`, `area`, `name`

#### **2.2. Rules for `highway` Features**

The following rules apply only to features where the `highway` property exists.

**2.2.1. Feature Removal**

*   **Geometry Check**: Remove feature if its geometry is not `LineString`.
*   **Type Check**: Remove if `highway` is `crossing`, `traffic_signals`, `speed_camera`, or `bus_stop`.
*   **Property Check**: Remove if it has any of these properties: `bench`, `crossing`, `crossing:island`, `crossing:markings`, `crossing:signals`, `crossing_ref`.

**2.2.2. Property Normalization**
*   **Name (`name`) Population (in order of priority):**
    1.  If `int_name` exists, its value **overwrites** any existing `name`.
    2.  If `name` is empty, populate from the first available: `name:ru`, `name:ru:word_stress`, `addr:street`, `name:en`, `name:kk`, `old_name:ru`, `old_name`, `old_name_1`, `alt_name`, `description`.

**2.2.3. `highway` Category Condensation**
Map the `highway` property's value to one of the target categories. Any unlisted value defaults to `footway`.

| Target Category | Source Values                                                                                              |
| :-------------- | :--------------------------------------------------------------------------------------------------------- |
| **primary**     | `primary`, `primary_link`                                                                                  |
| **secondary**   | `secondary`, `secondary_link`                                                                              |
| **tertiary**    | `tertiary`, `tertiary_link`                                                                                |
| **service**     | `service`, `residential`, `unclassified`, `living_street`, `track`, `turning_circle`, `raceway`, `construction` |
| **footway**     | `footway`, `steps`, `cycleway`, `pedestrian`, `path`, `corridor`, `bridleway`, `platform` (and any unlisted value).

**2.2.4. Final Property Pruning**
Remove all properties from the feature except for:
*   `highway`
*   `name`

---

### **3. Global Post-processing**

This final stage is applied to all features remaining after the feature-specific processing.

**3.1. Coordinate System Transformation**
*   Transform all coordinate values from geographic (Latitude, Longitude) to a local planar coordinate system. Coordinates are rounded to 2 fractional digits.
*   **Origin Point:** The geographic coordinate `[43.242502, 76.948339]` (configurable in the script) becomes the new origin `[0, 0]`.
*   **Unit:** The unit of the new coordinate system is **1 meter**.

**3.2. Add Derived Members to `building` features**
*   **`inscribedCenter`**: This is added to `building` features **after** coordinate transformation.
    *   *Calculation*: Calculated as the geometric average of all vertices in the feature's transformed geometry.

**3.3. Final Feature Filtering**
*   Remove any feature whose `properties` object is empty after all processing steps.

---

### **4. Output Format**

The final output is a GeoJSON file where each feature is written on a new line for improved readability.

---

### **5. Logging Requirements**

At the end of the process for each input file, a log is generated summarizing the modifications.

**5.1. Removals:**
*   Counts for features removed by each rule, grouped by type or property that triggered the removal.

**5.2. Modifications:**
*   Counts for features modified by each rule (e.g., `building=yes` refinement, category condensation), with details for each transformation.

**5.3. Totals:**
*   Total features read from the source file.
*   Total features remaining in the final output.
*   Total count of `building` and `highway` features in the output. These are only displayed if the count is greater than zero.
*   Output file size in KB.

---

### **6. Post-Processing Pipeline**

After the filtering script runs, the following steps are executed:
1.  **Copying**: Processed files are copied from the output directory to `public/data/`.
2.  **Structure Generation**: The `generate-structure.cjs` script is run on the processed files to generate additional data structures.