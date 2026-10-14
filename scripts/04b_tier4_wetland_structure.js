/**---------------------------------------------------------
 * TIER 4: LOWLAND SKELETON (BINARY: CONIFER vs DECIDUOUS)
 *----------------------------------------------------------*/

// var wi = ee.FeatureCollection("TIGER/2018/States").filter(ee.Filter.eq("NAME", "Wisconsin"));
// var wiscland = ee.Image("projects/code-test-476615/assets/wiscland2_level3");
// var lowlandMask = ee.Image("projects/code-test-476615/assets/Tier3/Tier3_Forest_Hydrology_Final").eq(20); 

// // 1. DEFINE LOWLAND CODES (Mixed 6450 is EXCLUDED)
// var coniferCodes = [6410, 6411, 6412, 6413, 6414];
// var deciduousCodes = [6420, 6430, 6431, 6432, 6440, 6441, 6442];

// // 2. REMAP
// var allCodes = coniferCodes.concat(deciduousCodes);
// var allValues = ee.List.repeat(1, coniferCodes.length)
//   .cat(ee.List.repeat(2, deciduousCodes.length));

// var binaryClass = wiscland.remap(allCodes, allValues, 0)
//   .updateMask(lowlandMask)
//   .rename('species_class')
//   .selfMask();

// // 3. GENERATE SKELETON
// var skeleton = binaryClass.stratifiedSample({
//   numPoints: 0,
//   classBand: 'species_class',
//   region: wi.geometry(),
//   scale: 30,
//   classValues: [1, 2],
//   classPoints: [4000, 4000], 
//   geometries: true 
// }).map(function(f) {
//   var coords = f.geometry().coordinates();
//   return f.set({
//     'long_val': coords.get(0),
//     'lat_val': coords.get(1)
//   });
// });

// // 4. EXPORT
// Export.table.toDrive({
//   collection: skeleton,
//   description: 'Tier4_Lowland_Skeleton',
//   fileFormat: 'CSV',
//   selectors: ['long_val', 'lat_val', 'species_class']
// });

/**-------------------------------------------------------------------
 * TIER 4: LOWLAND BINARY POPULATOR (Master Cube + Legacy SAR)
 *-------------------------------------------------------------------*/

// // 1. UPDATE: Points to the new Binary Asset from Phase 2
// var trainingPoints = ee.FeatureCollection("projects/code-test-476615/assets/Tier4/Tier4_Lowland_Skeleton");
// var cube = ee.Image("projects/code-test-476615/assets/WISC_MasterCube/WI_MultiYear_Optical_Cube"); 
// var s1_legacy = ee.Image("projects/code-test-476615/assets/WISC_MasterCube/WI_S1_20m_2020_2022");
// var wi = ee.FeatureCollection("TIGER/2018/States").filter(ee.Filter.eq("NAME", "Wisconsin"));
// var dem = ee.Image("USGS/3DEP/10m");

// // 2. SOIL & WETNESS ANCILLARY
// var soilCarbon = ee.Image("OpenLandMap/SOL/SOL_ORGANIC-CARBON_USDA-6A1C_M/v02").select('b0').rename('soil_organic_carbon');
// var hand = ee.Image("MERIT/Hydro/v1_0_1").select('hnd').rename('HAND');
// var waterFreq = ee.Image("JRC/GSW1_4/GlobalSurfaceWater").select('occurrence').rename('water_occurrence').unmask(0);

// // 3. RADAR ANCHOR
// var radar_stack = s1_legacy.resample('bilinear').rename(['S1_VV', 'S1_VH', 'S1_Ratio']);

// // 4. THERMAL BASELINE
// var thermal = ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
//     .merge(ee.ImageCollection("LANDSAT/LC09/C02/T1_L2"))
//     .filterBounds(wi).filterDate('2025-07-01', '2025-08-31').median()
//     .multiply(0.00341802).add(149.0).subtract(273.15)
//     .select('ST_B10').rename('Summer_LST');

// // 5. ASSEMBLE HYBRID STACK
// var slope = ee.Terrain.slope(dem).rename('slope');
// var tpi = dem.subtract(dem.focal_mean(300, 'circle', 'meters')).rename('TPI');

// var finalStack = ee.Image.cat([
//   cube,           
//   radar_stack,    
//   slope, 
//   tpi, 
//   dem.rename('elevation'),
//   soilCarbon, 
//   hand, 
//   waterFreq, 
//   thermal
// ]).float();

// // 6. POPULATE DATA
// var populatedData = finalStack.sampleRegions({
//   collection: trainingPoints,
//   properties: ['species_class', 'long_val', 'lat_val'], 
//   scale: 10,
//   tileScale: 16
// }).filter(ee.Filter.notNull(['S1_VH', 'species_class'])); // Removed B2_Winter to be safe—it will grab all optical bands regardless

// // 7. DYNAMIC EXPORT TO CSV
// var bands = finalStack.bandNames();
// var exportList = ee.List(['long_val', 'lat_val', 'species_class']).cat(bands);

// exportList.evaluate(function(successList) {
//   Export.table.toDrive({
//     collection: populatedData,
//     // UPDATE: New name to keep your Binary data separate
//     description: 'Tier4_Lowland_Master_Training',
//     fileFormat: 'CSV',
//     selectors: successList
//   });
// });


/**-------------------------------------------------------------------
 * TIER 4: LOWLAND BINARY CLASSIFIER (Master Cube + Legacy SAR)
 * Targets: 1=Conifer, 2=Deciduous | Binary Optimized
 *-------------------------------------------------------------------*/

// 1. LOAD ASSETS
var wi = ee.FeatureCollection("TIGER/2018/States").filter(ee.Filter.eq("NAME", "Wisconsin"));
var cube = ee.Image("projects/code-test-476615/assets/WISC_MasterCube/WI_MultiYear_Optical_Cube"); 
var s1_legacy = ee.Image("projects/code-test-476615/assets/WISC_MasterCube/WI_S1_20m_2020_2022");
var dem = ee.Image("USGS/3DEP/10m");

// Tier 3 Hydrology Mask (Lowland = 20)
var lowlandMask = ee.Image("projects/code-test-476615/assets/Tier3/Tier3_Forest_Hydrology_Final").eq(20); 

// POINT TO NEW BINARY TRAINING DATA (V4/V5)
var trainingData = ee.FeatureCollection("projects/code-test-476615/assets/Tier4/Tier4_Lowland_Master_Training");

// 2. REBUILD ANCILLARY & RADAR
// Lowland-specific moisture and soil proxies
var soilCarbon = ee.Image("OpenLandMap/SOL/SOL_ORGANIC-CARBON_USDA-6A1C_M/v02").select('b0').rename('soil_organic_carbon');
var hand = ee.Image("MERIT/Hydro/v1_0_1").select('hnd').rename('HAND');
var waterFreq = ee.Image("JRC/GSW1_4/GlobalSurfaceWater").select('occurrence').rename('water_occurrence').unmask(0);

var radar_stack = s1_legacy.resample('bilinear').rename(['S1_VV', 'S1_VH', 'S1_Ratio']);

var thermal = ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
    .merge(ee.ImageCollection("LANDSAT/LC09/C02/T1_L2"))
    .filterBounds(wi).filterDate('2025-07-01', '2025-08-31').median()
    .multiply(0.00341802).add(149.0).subtract(273.15)
    .select('ST_B10').rename('Summer_LST');

var slope = ee.Terrain.slope(dem).rename('slope');
var tpi = dem.subtract(dem.focal_mean(300, 'circle', 'meters')).rename('TPI');

// 3. ASSEMBLE STACK (Perfectly matched to your populator)
var finalStack = ee.Image.cat([
  cube,
  radar_stack,
  slope, 
  tpi, 
  dem.rename('elevation'),
  soilCarbon, 
  hand, 
  waterFreq, 
  thermal
]).updateMask(lowlandMask).float();

// 4. TRAIN RANDOM FOREST (With Fail-Safe Null Scrubber)
var label = 'species_class';
var predictionBands = finalStack.bandNames();

// Ensure no points with missing SAR or Optical data make it to the classifier
var cleanTraining = trainingData.filter(ee.Filter.notNull(predictionBands));

var classifier = ee.Classifier.smileRandomForest(300).train({
  features: cleanTraining, 
  classProperty: label, 
  inputProperties: predictionBands
});

// 5. CLASSIFY & SMOOTH
var rawClassification = finalStack.select(predictionBands).classify(classifier);

var smoothedMap = rawClassification.focalMode({
  radius: 1.5,
  kernelType: 'circle',
  units: 'pixels'
}).uint8();

// 6. PREVIEW
Map.centerObject(wi.geometry().centroid(), 7);
Map.addLayer(smoothedMap, {min: 1, max: 2, palette: ['#002200', '#228b22']}, 'Lowland Binary (1=Conifer, 2=Deciduous)');

// 7. EXPORT
Export.image.toAsset({
  image: smoothedMap.rename('lowland_binary_type'),
  description: 'Tier4_Final_Lowland_Binary_Map_V5',
  assetId: 'projects/code-test-476615/assets/Tier4/Tier4_Lowland_Map',
  scale: 10,
  region: wi.geometry().bounds(),
  maxPixels: 1e13,
  pyramidingPolicy: {'.default': 'mode'}
});



/**-------------------------------------------------------------------
 * TIER 4: LOWLAND BINARY MAP VALIDATION & VISUALIZATION
 * Asset: Tier4_Lowland_Binary_Map_V5
 *-------------------------------------------------------------------*/

// 1. LOAD ASSETS
var wi = ee.FeatureCollection("TIGER/2018/States").filter(ee.Filter.eq("NAME", "Wisconsin"));

// THE IMAGE (The binary map you just exported)
var lowlandMap = ee.Image("projects/code-test-476615/assets/Tier4/Tier4_Lowland_Map");

// THE POINTS (The training data used to build the map)
var trainingData = ee.FeatureCollection("projects/code-test-476615/assets/Tier4/Tier4_Lowland_Master_Training");

// 2. DEFINE FEATURES AND SCRUB NULLS
var label = 'species_class';

// Extract property names dynamically
var predictionBands = trainingData.first().propertyNames()
  .remove(label)
  .remove('system:index')
  .remove('random')
  .remove('lat_val')
  .remove('long_val')
  .remove('.geo');

// Fail-safe: Remove any points with missing data
var cleanData = trainingData.filter(ee.Filter.notNull(predictionBands));

// 3. SPATIAL SPLIT (East vs West)
var splitLine = -89.5;
var trainingSet = cleanData.filter(ee.Filter.gte('long_val', splitLine)); // East
var testSet = cleanData.filter(ee.Filter.lt('long_val', splitLine));      // West

print('Validation Setup (Lowland):');
print('-> Training Points (East):', trainingSet.size());
print('-> Testing Points (West):', testSet.size());

// 4. TRAIN DIAGNOSTIC CLASSIFIER
var classifier = ee.Classifier.smileRandomForest({
  numberOfTrees: 300,
  variablesPerSplit: 8,
  minLeafPopulation: 1,
  seed: 42
}).train({
  features: trainingSet,
  classProperty: label,
  inputProperties: predictionBands
});

// 5. EVALUATE
var validation = testSet.classify(classifier);
var confMatrix = validation.errorMatrix(label, 'classification');

print('--- TIER 4 LOWLAND: SPATIAL VALIDATION RESULTS ---');
print('Real Overall Accuracy:', confMatrix.accuracy());
print('Real Kappa Coefficient:', confMatrix.kappa());
print('Spatial Confusion Matrix:', confMatrix);

// 6. VARIABLE IMPORTANCE
var importance = ee.Dictionary(classifier.explain().get('importance'));
print('Top 5 Lowland Predictors:', importance.keys().sort(importance.values()).reverse().slice(0, 5));

// 7. MAP DISPLAY
// 1 = Conifer (Deep Forest Green), 2 = Deciduous (Bright Wetland Green)
var speciesViz = {
  min: 1, 
  max: 2, 
  palette: ['#1a3300', '#4db300']
};

Map.centerObject(wi.geometry().centroid(), 7);
Map.addLayer(lowlandMap, speciesViz, 'Final Lowland Binary Map (V5)');

print('LEGEND: 1 = Lowland Conifer (Tamarack/Spruce), 2 = Lowland Deciduous (Ash/Maple)');
