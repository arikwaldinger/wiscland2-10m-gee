# WISCLAND 2.0: Statewide 10m Forest Species Classification in Google Earth Engine

![WISCLAND II High-Resolution Forest Update Map](assets/WISCLANDII_ForestUpdate.png)

## Overview
This repository contains the complete 5-tier hierarchical Random Forest classification pipeline developed to scale Wisconsin's land cover classification from 30-meter (Landsat) to **10-meter spatial resolution (Sentinel-2/Sentinel-1)** across 35 million acres (~1.4 billion pixels).

Developed by **Arik Waldinger** (M.S. Environmental Observation & Informatics, UW–Madison) in collaboration with the Wisconsin Department of Natural Resources (WI-DNR).

---

## Technical Stack & Multi-Sensor Fusion
* **Platform:** Google Earth Engine (JavaScript API)
* **Optical Core:** Sentinel-2 MSI (12 bands across 7 seasonal phenology windows)
* **Radar (SAR):** Sentinel-1 C-Band (VV, VH, and VH/VV ratio for canopy structural roughness)
* **Thermal:** Landsat 8/9 LST (Land Surface Temperature microclimatic cooling)
* **Terrain Engine:** USGS 10m DEM (Elevation, Slope, Aspect, TPI, CTI)
* **Classifier:** Nested 5-Tier Random Forest Ensemble (200–300 trees per tier)

---

## Pipeline & Script Architecture

| Script | Phase | Target Classes | Random Forest Setup |
| :--- | :--- | :--- | :--- |
| [`00_master_optical_cube.js`](scripts/00_master_optical_cube.js) | Data Prep | 3-Year Cloud-Free Master Composite (2023–2025) | Multi-sensor stack build |
| [`01_tier1_water_mask.js`](scripts/01_tier1_water_mask.js) | Tier 1 | Land vs. Water (10m) | 200 Trees / 16k Points |
| [`02_tier2_forest_mask.js`](scripts/02_tier2_forest_mask.js) | Tier 2 | Forest vs. Non-Forest (10m) | 150 Trees / 10k Points |
| [`03_tier3_hydrology.js`](scripts/03_tier3_hydrology.js) | Tier 3 | Upland Forest vs. Wetland/Lowland Forest | 100 Trees / 8k Points |
| [`04a_tier4_upland_structure.js`](scripts/04a_tier4_upland_structure.js) | Tier 4 | Upland: Deciduous vs. Conifer | 300 Trees / 8k Points |
| [`04b_tier4_wetland_structure.js`](scripts/04b_tier4_wetland_structure.js) | Tier 4 | Wetland: Deciduous vs. Conifer | 300 Trees / 8k Points |
| [`05a_tier5_upland_deciduous_genus.js`](scripts/05a_tier5_upland_deciduous_genus.js) | Tier 5 | Oak, Red Maple / N. Hardwoods, Aspen / Birch | 300 Trees / Stratified |
| [`05b_tier5_upland_conifer_genus.js`](scripts/05b_tier5_upland_conifer_genus.js) | Tier 5 | White/Red Pine, Fir / Spruce, Hemlock | 300 Trees / Stratified |
| [`05c_tier5_wetland_deciduous_genus.js`](scripts/05c_tier5_wetland_deciduous_genus.js) | Tier 5 | Bottomland Hardwood, Swamp Hardwood / Ash | 300 Trees / Stratified |
| [`05d_tier5_wetland_conifer_genus.js`](scripts/05d_tier5_wetland_conifer_genus.js) | Tier 5 | Lowland Conifer, Tamarack | 300 Trees / Stratified |
| [`06_tier5b_combine_all_maps.js`](scripts/06_tier5b_combine_all_maps.js) | Final Assembly | Combined Statewide 10m Forest Master Raster | Focal mode smoothing |

---

## Validation Accuracy Summary

* **Tier 1 (Water Mask):** 100.0% Accuracy ($\kappa = 1.00$)
* **Tier 2 (Forest Mask):** 88.1% Accuracy ($\kappa = 0.76$)
* **Tier 3 (Hydrology Split):** 87.0% Accuracy ($\kappa = 0.73$)
* **Tier 4 (Structural Binary):** 81.3%–81.5% Accuracy ($\kappa = 0.62–0.63$)
* **Tier 5 (Species Alliances):** 88.0%–90.0% Accuracy ($\kappa = 0.80–0.82$)

---

## How to Run in Google Earth Engine
1. Open any script from the `scripts/` folder above.
2. Copy the JavaScript code into your [Google Earth Engine Code Editor](https://code.earthengine.google.com/).
3. Ensure you have access to public Sentinel-2 (`COPERNICUS/S2_SR_HARMONIZED`) and Sentinel-1 (`COPERNICUS/S1_GRD`) collections.
4. Click **Run**.
