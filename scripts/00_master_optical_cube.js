
// /**-------------------------------------------------------------------
// * THE ONE-SHOT MASTER CUBE & POPULATOR (2023-2025 Multi-Year Median)
// * Bypasses the 250GB storage limit by calculating everything in memory.
// *-------------------------------------------------------------------*/

// var wi = ee.FeatureCollection("TIGER/2018/States").filter(ee.Filter.eq("NAME", "Wisconsin"));
// var tier2Forest = ee.Image("projects/code-test-476615/assets/Tier2/Tier2_Forest_Map_Final"); // Use your actual Tier 2 path

// function maskS2(image) {
//   var qa = image.select('QA60');
//   var mask = qa.bitwiseAnd(1 << 10).eq(0).and(qa.bitwiseAnd(1 << 11).eq(0));
//   return image.updateMask(mask).divide(10000);
// }

// var coreBands = ['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B11', 'B12'];
// var windows = [
//   ['Mar', 3, 3], ['Apr', 4, 4], ['May', 5, 5], 
//   ['Summer', 7, 8], ['Sep', 9, 9], ['Oct', 10, 10], 
//   ['Nov', 11, 11], ['Winter', 1, 2]
// ];

// // 1. GENERATE THE 3-YEAR MEDIAN OPTICAL CUBE (No more separate year exports!)
// var multiYearStack = ee.Image([]);

// windows.forEach(function(m) {
//   // Notice we pull 2023 through 2025 all at once
//   var med = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
//     .filterBounds(wi)
//     .filter(ee.Filter.calendarRange(2023, 2025, 'year'))
//     .filter(ee.Filter.calendarRange(m[1], m[2], 'month'))
//     .map(maskS2).select(coreBands).median();
    
//   multiYearStack = multiYearStack.addBands(med.rename(coreBands.map(function(b){return b+'_'+m[0]})));
// });

// // Apply your forest mask to keep file size down
// var finalOptical = multiYearStack.updateMask(tier2Forest.gt(0)).float().clip(wi);

// // 2. EXPORT THE ONE TRUE CUBE
// Export.image.toAsset({
//   image: finalOptical,
//   description: 'WI_MultiYear_Optical_Cube',
//   assetId: 'projects/code-test-476615/assets/Tier5/WI_MultiYear_Optical_Cube',
//   scale: 10,
//   region: wi.geometry().bounds(),
//   maxPixels: 1e13,
//   shardSize: 256
// });

// print('Run the 3-Year Median Export. This will fit within your 250GB limit!');


// /**-------------------------------------------------------------------
// * TIER 5: ULTIMATE MASTER CUBE & TRAINING POPULATOR
// * Combines S2, Topography, LST, and Advanced Indices.
// *-------------------------------------------------------------------*/

/**-------------------------------------------------------------------
 * TIER 5: VIRTUAL STACK POPULATOR
 * Purpose: Extract 150+ variables to points without hitting storage limits.
 *-------------------------------------------------------------------*/

// // 1. LOAD THE ASSETS
// var opticalCube = ee.Image("projects/code-test-476615/assets/WISC_MasterCube/WI_MultiYear_Optical_Cube");
// var skeleton = ee.FeatureCollection("projects/code-test-476615/assets/Tier5/Upland_Dec/Tier5_Upland_Dec_Ultimate_Training");
// var wi = ee.FeatureCollection("TIGER/2018/States").filter(ee.Filter.eq("NAME", "Wisconsin"));

// // 2. PHENOLOGY & INDICES (Calculated on the fly)
// var seasons = ['Mar', 'Apr', 'May', 'Summer', 'Sep', 'Oct', 'Nov', 'Winter'];
// var indicesStack = ee.Image([]);

// seasons.forEach(function(s) {
//   var b2 = opticalCube.select('B2_'+s);
//   var b4 = opticalCube.select('B4_'+s);
//   var b5 = opticalCube.select('B5_'+s);
//   var b8 = opticalCube.select('B8_'+s);
//   var b11 = opticalCube.select('B11_'+s);
  
//   var ndvi = b8.normalizedDifference(b4).rename('NDVI_'+s);
//   var ndmi = b8.normalizedDifference(b11).rename('NDMI_'+s);
//   var ndre = b8.normalizedDifference(b5).rename('NDRE_'+s);
//   var evi = b8.subtract(b4).multiply(2.5).divide(b8.add(b4.multiply(6)).subtract(b2.multiply(7.5)).add(1)).rename('EVI_'+s);
  
//   indicesStack = indicesStack.addBands([ndvi, ndmi, ndre, evi]);
// });

// // Green-up/Leaf-drop Velocity
// var springSpeed = indicesStack.select('NDVI_May').subtract(indicesStack.select('NDVI_Apr')).rename('Spring_Greenup_Speed');
// var fallSpeed = indicesStack.select('NDVI_Oct').subtract(indicesStack.select('NDVI_Sep')).rename('Fall_Senescence_Speed');

// // 3. TOPOGRAPHY & SOILS
// var dem = ee.Image("USGS/3DEP/10m").clip(wi);
// var terrain = ee.Terrain.products(dem);
// var aspect = terrain.select('aspect');
// var northness = aspect.multiply(Math.PI / 180).cos().rename('northness');
// var eastness = aspect.multiply(Math.PI / 180).sin().rename('eastness');
// var tpi = dem.subtract(dem.focal_mean(300, 'circle', 'meters')).rename('TPI');
// var hand = ee.Image("MERIT/Hydro/v1_0_1").select('hnd').rename('HAND');

// var soilSand = ee.Image("OpenLandMap/SOL/SOL_SAND-WFRACTION_USDA-3A1A1A_M/v02").select('b0').rename('soil_sand');
// var soilWater = ee.Image("OpenLandMap/SOL/SOL_WATERCONTENT-33KPA_USDA-4B1C_M/v01").select('b0').rename('soil_awc');

// // 4. RADAR & THERMAL
// var s1 = ee.ImageCollection('COPERNICUS/S1_GRD').filterBounds(wi).filterDate('2024-06-01', '2024-08-31').median();
// var radar = s1.select('VH').subtract(s1.select('VV')).rename('S1_Ratio_Summer').addBands(s1.select(['VV','VH']));

// var thermal = ee.ImageCollection("LANDSAT/LC08/C02/T1_L2").filterBounds(wi).filterDate('2024-06-01', '2024-08-31').median()
//   .multiply(0.00341802).add(149.0).subtract(273.15).select('ST_B10').rename('Summer_LST');

// // 5. ASSEMBLE THE VIRTUAL MEGA-STACK
// var megaStack = ee.Image.cat([
//   opticalCube, indicesStack, springSpeed, fallSpeed,
//   dem, terrain.select('slope'), northness, eastness, tpi, hand,
//   soilSand, soilWater, radar, thermal
// ]);

// // 6. POPULATE THE SKELETON (Extract values to points)
// var populatedPoints = megaStack.sampleRegions({
//   collection: skeleton,
//   properties: ['genus_class'], // Your Wiscland DN label
//   scale: 10,
//   tileScale: 16
// });

// // 7. EXPORT THE TABLE (Small file, won't break your quota!)
// Export.table.toAsset({
//   collection: populatedPoints,
//   description: 'Tier5_Upland_Dec_Populated_Training',
//   assetId: 'projects/code-test-476615/assets/WISC_MasterCube/WI_MultiYear_Optical_Cube_V2'
// });


/**
 * Function to load Sentinel-1 Radar
 * @param {string} startDate - 'YYYY-MM-DD'
 * @param {string} endDate   - 'YYYY-MM-DD'
 * @param {string} prefix    - Label for bands (e.g., 'Spring')
 */
/**---------------------------------------------------------
 * FINAL DATA INTEGRITY CHECK: WHITEWATER AREA
 *----------------------------------------------------------*/
/**---------------------------------------------------------
 * MULTI-YEAR RADAR HEALER (2024 + 2025)
 *----------------------------------------------------------*/
var wi = ee.FeatureCollection("TIGER/2018/States").filter(ee.Filter.eq("NAME", "Wisconsin"));
var whitewater = ee.Geometry.Point([-88.73, 42.83]);
/**---------------------------------------------------------
 * THE "TOTAL RESET" RADAR LOADER (Forcing the Gap to Close)
 *----------------------------------------------------------*/

/**---------------------------------------------------------
 * THE FINAL RADAR HEALER (No Hitchhiker Bands)
 *----------------------------------------------------------*/
/**---------------------------------------------------------
 * THE MULTI-SOURCE RADAR PATCH (Sentinel-1 + ALOS PALSAR)
 *----------------------------------------------------------*/

/**---------------------------------------------------------
 * TIER 4: TRIPLE-YEAR SENTINEL-1 COMPOSITE (GAP-FILLER)
 *----------------------------------------------------------*/

/**---------------------------------------------------------
 * STATEWIDE RADAR ASSET: 20m LEGACY ANCHOR (2020-2022)
 *----------------------------------------------------------*/

// // 1. Define the Statewide Search Area
// var wi = ee.FeatureCollection("TIGER/2018/States").filter(ee.Filter.eq("NAME", "Wisconsin"));
// var wi_bounds = wi.geometry().bounds();

// // 2. Fetch the "Golden Era" Radar (Pre-S1B Failure)
// var getRadar = function(year) {
//   return ee.ImageCollection('COPERNICUS/S1_GRD')
//     .filterBounds(wi_bounds)
//     .filterDate(year + '-05-01', year + '-09-30')
//     .filter(ee.Filter.eq('instrumentMode', 'IW'))
//     .select(['VV', 'VH']);
// };

// var s1_legacy = getRadar('2020')
//   .merge(getRadar('2021'))
//   .merge(getRadar('2022'))
//   .median();

// // 3. Calculate Ratio and Reproject to 20m
// var s1_ratio = s1_legacy.select('VH').subtract(s1_legacy.select('VV')).rename('S1_Ratio');

// var final_export = s1_legacy.addBands(s1_ratio)
//     .reproject({
//       crs: 'EPSG:32616', // UTM Zone 16N
//       scale: 20          // The "Optimal Scale" for efficiency
//     })
//     .float();

// // 4. THE BIG EXPORT
// Export.image.toAsset({
//   image: final_export,
//   description: 'WI_Radar_20m_Legacy_Baseline',
//   assetId: 'projects/code-test-476615/assets/Tier4/WI_S1_20m_2020_2022',
//   scale: 20,
//   region: wi_bounds,
//   maxPixels: 1e13
// });


/**---------------------------------------------------------
 * DISPLAY: 20m STATEWIDE RADAR ANCHOR (2020-2022)
 *----------------------------------------------------------*/

// 1. Load your new Asset
var s1_legacy = ee.Image("projects/code-test-476615/assets/WISC_MasterCube/WI_S1_20m_2020_2022");

// 2. Center on the Whitewater "Ghost" area
var whitewater = ee.Geometry.Point([-88.5887, 42.8631]);
Map.centerObject(whitewater, 11);

// 3. Visualization Parameters
// VV (Vertical-Vertical) usually shows ground/roughness
var vvVis = {min: -20, max: -5, palette: ['black', 'white']};

// VH (Vertical-Horizontal) is the "Forest Structure" band
var vhVis = {min: -25, max: -10, palette: ['black', 'green', 'white']};

// The Ratio highlights "Volume Scattering" (Leaves and Branches)
var ratioVis = {
  min: -10, 
  max: 0, 
  palette: ['#0000ff', '#ffffff', '#006400'] // Blue (Water/Flat) to Dark Green (Dense Forest)
};

// 4. Add Layers to Map
Map.addLayer(s1_legacy.select('VV'), vvVis, '1. Legacy VV (Ground)');
Map.addLayer(s1_legacy.select('VH'), vhVis, '2. Legacy VH (Canopy Structure)');
Map.addLayer(s1_legacy.select('S1_Ratio'), ratioVis, '3. Structural Ratio (The Healer)');

// 5. Inspect for Gaps
// This will display a bright RED square if there is any 'No Data' left
Map.addLayer(s1_legacy.mask().reduce(ee.Reducer.min()).not().selfMask(), 
            {palette: ['red']}, 'ERROR: Gaps Identified');

print('Radar Values at Whitewater Gap:', s1_legacy.reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: whitewater,
  scale: 20
}));
