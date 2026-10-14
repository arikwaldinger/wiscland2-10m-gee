/**---------------------------------------------------------
 * TIER 3: SPATIAL SKELETON GENERATOR
 *----------------------------------------------------------*/
// var wi = ee.FeatureCollection("TIGER/2018/States").filter(ee.Filter.eq("NAME", "Wisconsin"));
// var forestMap = ee.Image("projects/code-test-476615/assets/Tier2/Tier2_Forest_Map_Final");
// var wiscland = ee.Image("projects/code-test-476615/assets/wiscland2_level3");

// // 1. ANCILLARY TRUTH (Consensus Logic)
// var nwi = ee.FeatureCollection("projects/code-test-476615/assets/Tier3/WI_NWI_2025_Table");
// var nwiLowland = nwi.filter(ee.Filter.or(
//   ee.Filter.stringContains('WETLAND_TYPE', 'PFO'),
//   ee.Filter.stringContains('WETLAND_TYPE', 'PSS')
// )).reduceToImage(['OBJECTID'], ee.Reducer.first()).gt(0).unmask(0);

// var lowlandCodes = [6400, 6410, 6411, 6412, 6413, 6414, 6420, 6430, 6431, 6432, 6440, 6441, 6442, 6450];
// var uplandCodes = [4000, 4100, 4110, 4120, 4121, 4122, 4123, 4130, 4200, 4211, 4212, 4220, 4230, 4231, 4232, 4233, 4240, 4250, 4251, 4252, 4300];

// var wlLowland = wiscland.remap(lowlandCodes, ee.List.repeat(1, lowlandCodes.length), 0);
// var wlUpland = wiscland.remap(uplandCodes, ee.List.repeat(1, uplandCodes.length), 0);

// // Define the "Answer Key"
// var hydroClass = ee.Image(0)
//   .where(forestMap.eq(1).and(nwiLowland.not().and(wlUpland)), 10) // Upland
//   .where(forestMap.eq(1).and(nwiLowland.or(wlLowland)), 20)      // Lowland
//   .selfMask().rename('hydro_class');

// // 2. GENERATE SKELETON POINTS
// var skeleton = hydroClass.stratifiedSample({
//   numPoints: 0,
//   classBand: 'hydro_class',
//   region: wi.geometry(), // Changed to wi.geometry() for tighter bounds
//   scale: 30,
//   classValues: [10, 20],
//   classPoints: [4000, 4000],
//   geometries: true // CRITICAL: This keeps the dots for the next step
// }).map(function(f) {
//   var coords = f.geometry().coordinates();
//   return f.set({
//     'longitude': coords.get(0),
//     'latitude': coords.get(1),
//     'hydro_class': f.get('hydro_class')
//   });
// });

// // 3. EXPORT TO DRIVE
// // We include longitude and latitude in the selectors to force them into the CSV
// Export.table.toDrive({
//   collection: skeleton,
//   description: 'Tier3_Spatial_Skeleton_Points',
//   fileFormat: 'CSV',
//   selectors: ['longitude', 'latitude', 'hydro_class']
// });


/**---------------------------------------------------------
 * TIER 3: POPULATE SKELETON 
 *----------------------------------------------------------*/


// var skeletonAsset = ee.FeatureCollection("projects/code-test-476615/assets/Tier3/Tier3_Spatial_Skeleton_Points");
// var wi = ee.FeatureCollection("TIGER/2018/States").filter(ee.Filter.eq("NAME", "Wisconsin"));

// // --- THE CRITICAL FIX: MANUALLY EXTRACT COORDINATES FROM GEOMETRY FIRST ---
// var skeleton = skeletonAsset.map(function(f) {
//   var coords = f.geometry().coordinates();
//   return f.set({
//     'longitude': coords.get(0),
//     'latitude': coords.get(1)
//   });
// });

// // 1. DATA STACK LOGIC
// var baseS2 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
//   .filterBounds(wi)
//   .filterDate('2024-01-01', '2026-05-01') 
//   .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40));

// var globalBackup = baseS2.median().divide(10000);

// // 2. MONTHLY DATA GENERATOR
// var months = [3, 4, 5, 7, 9, 10, 11];
// var seasonalBandsList = months.map(function(m) {
//   var monthlyMedian = baseS2.filter(ee.Filter.calendarRange(m, m, 'month')).median().divide(10000);
//   var patched = monthlyMedian.unmask(globalBackup);
  
//   return patched.select(['B8', 'B11', 'B12'])
//     .addBands(patched.normalizedDifference(['B8', 'B4']).rename('NDVI_' + m))
//     .addBands(patched.normalizedDifference(['B3', 'B8']).rename('NDWI_' + m))
//     .addBands(patched.select('B11').divide(patched.select('B8').add(0.0001)).rename('MSI_' + m));
// });

// // 3. ASSEMBLE SEASONAL STACK
// var seasonalStack = ee.Image([]);
// var suffixes = ['', '_1', '_2', '_3', '_4', '_5', '_6'];

// months.forEach(function(m, i) {
//   var img = ee.Image(seasonalBandsList[i]);
//   var s = suffixes[i];
//   seasonalStack = seasonalStack.addBands([
//     img.select('B8').rename('B8' + s),
//     img.select('B11').rename('B11' + s),
//     img.select('B12').rename('B12' + s),
//     img.select('NDVI_' + m),
//     img.select('NDWI_' + m),
//     img.select('MSI_' + m)
//   ]);
// });

// // 4. TOPOGRAPHIC INDICES
// var dem = ee.Image("USGS/3DEP/10m");
// var slope = ee.Terrain.slope(dem).float().rename('slope');
// var tpi = dem.subtract(dem.focal_mean(300, 'circle', 'meters')).float().rename('TPI');
// var tpi_small = dem.subtract(dem.focal_mean(30, 'circle', 'meters'));
// var cti = tpi_small.divide(slope.add(0.001)).float().rename('CTI');

// var tcWet = globalBackup.expression(
//   '(0.1509*B2)+(0.1973*B3)+(0.3279*B4)+(0.3406*B8)-(0.7112*B11)-(0.4572*B12)', 
//   {'B2':globalBackup.select('B2'),'B3':globalBackup.select('B3'),'B4':globalBackup.select('B4'),
//   'B8':globalBackup.select('B8'),'B11':globalBackup.select('B11'),'B12':globalBackup.select('B12')}
// ).rename('TCW');

// var reip = globalBackup.expression(
//   '700 + 40 * (((B4 + B7) / 2) - B5) / (B6 - B5 + 0.0001)', 
//   {'B4':globalBackup.select('B4'),'B5':globalBackup.select('B5'),
//   'B6':globalBackup.select('B6'),'B7':globalBackup.select('B7')}
// ).rename('REIP');

// var finalMegaStack = seasonalStack.addBands([tcWet, reip, slope, tpi, cti, dem.rename('elevation')]);

// // 5. THE POPULATION (Extracting data)
// var trainingData = finalMegaStack.sampleRegions({
//   collection: skeleton,
//   properties: ['hydro_class', 'latitude', 'longitude'], // Now they DEFINITELY exist in the collection
//   scale: 10,
//   tileScale: 16
// });

// // 6. EXPORT MASTER TABLE
// Export.table.toDrive({
//   collection: trainingData,
//   description: 'Tier3_Master_Training_Data_FINAL_FIX',
//   fileFormat: 'CSV'
// });

/**---------------------------------------------------------
 * TIER 3: UPLAND VS LOWLAND (HYDROLOGY) MAPPER
 * Patched for the 2026 ESA Data Gap (Rhinelander)
 *----------------------------------------------------------*/

// // 1. LOAD ASSETS & BOUNDARIES
// var wi = ee.FeatureCollection("TIGER/2018/States").filter(ee.Filter.eq("NAME", "Wisconsin"));
// var trainingData = ee.FeatureCollection("projects/code-test-476615/assets/Tier3/Tier3_Final_Master_Training_Data");
// var forestMask = ee.Image("projects/code-test-476615/assets/Tier2/Tier2_Forest_Map_Final");

// // 2. DEFINE THE EXACT FEATURES FROM YOUR CSV
// var label = 'hydro_class';
// var features = [
//   'B11', 'B11_1', 'B11_2', 'B11_3', 'B11_4', 'B11_5', 'B11_6', 
//   'B12', 'B12_1', 'B12_2', 'B12_3', 'B12_4', 'B12_5', 'B12_6', 
//   'B8',  'B8_1',  'B8_2',  'B8_3',  'B8_4',  'B8_5',  'B8_6', 
//   'CTI', 
//   'MSI_10', 'MSI_11', 'MSI_3', 'MSI_4', 'MSI_5', 'MSI_7', 'MSI_9', 
//   'NDVI_10', 'NDVI_11', 'NDVI_3', 'NDVI_4', 'NDVI_5', 'NDVI_7', 'NDVI_9', 
//   'NDWI_10', 'NDWI_11', 'NDWI_3', 'NDWI_4', 'NDWI_5', 'NDWI_7', 'NDWI_9', 
//   'REIP', 'TCW', 'TPI', 'elevation', 'slope'
// ];

// // 3. TRAIN THE CLASSIFIER
// var classifier = ee.Classifier.smileRandomForest(100).train({
//   features: trainingData,
//   classProperty: label,
//   inputProperties: features
// });

// // 4. TOPOGRAPHY MATH (With CTI Zero-Bug Fix)
// var dem = ee.Image("USGS/3DEP/10m");
// var nativeScale = dem.projection().nominalScale();

// // Cast slope to float to prevent integer rounding
// var slope = ee.Terrain.slope(dem).float().rename('slope');

// var mean300 = dem.reduceNeighborhood({
//   reducer: ee.Reducer.mean(),
//   kernel: ee.Kernel.circle(300, 'meters')
// }).reproject({crs: dem.projection(), scale: nativeScale});
// var tpi = dem.subtract(mean300).float().rename('TPI');

// var mean30 = dem.reduceNeighborhood({
//   reducer: ee.Reducer.mean(),
//   kernel: ee.Kernel.circle(30, 'meters')
// }).reproject({crs: dem.projection(), scale: nativeScale});
// var tpi_small = dem.subtract(mean30).float();

// // CTI Fix: Add 0.001 to prevent divide-by-zero, cast final to float
// var cti = tpi_small.divide(slope.add(0.001)).float().rename('CTI'); 

// // 5. THE "DEEP FIX" OPTICAL STACK
// var baseS2 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
//   .filterBounds(wi)
//   .filterDate('2024-01-01', '2026-05-01') 
//   .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40));

// // The Ultimate Safety Net: A 2-year median to fill the Rhinelander Gap
// var globalBackup = baseS2.median().divide(10000);

// // Map the 7 months and the 7 suffixes required by your CSV
// var months = [3, 4, 5, 7, 9, 10, 11];
// var suffixes = ['', '_1', '_2', '_3', '_4', '_5', '_6'];

// // Generate all bands in a single loop to match exact CSV naming
// var seasonalBandsList = months.map(function(m, index) {
//   var monthlyMedian = baseS2.filter(ee.Filter.calendarRange(m, m, 'month')).median().divide(10000);
  
//   // Patch the month with the global backup if it's missing data
//   var patched = monthlyMedian.unmask(globalBackup);
  
//   // Raw Bands with suffixes (B8, B8_1, B8_2, etc.)
//   var suffix = suffixes[index];
//   var b8  = patched.select('B8').rename('B8' + suffix);
//   var b11 = patched.select('B11').rename('B11' + suffix);
//   var b12 = patched.select('B12').rename('B12' + suffix);
  
//   // Indices with exact month names
//   var ndvi = patched.normalizedDifference(['B8', 'B4']).rename('NDVI_' + m);
//   var ndwi = patched.normalizedDifference(['B3', 'B8']).rename('NDWI_' + m); 
//   var msi  = patched.select('B11').divide(patched.select('B8').add(0.0001)).rename('MSI_' + m);
  
//   return b8.addBands([b11, b12, ndvi, ndwi, msi]);
// });

// // Convert the list of images into a single massive image with all 42 spectral bands
// var seasonalStack = ee.ImageCollection(seasonalBandsList).toBands()
//   // Clean up the names automatically prepended by .toBands()
//   .regexpRename('^[0-9]+_(.*)', '$1'); 

// // Calculate TCW and REIP using the gap-free global backup
// var tcWet = globalBackup.expression(
//   '(0.1509*B2)+(0.1973*B3)+(0.3279*B4)+(0.3406*B8)-(0.7112*B11)-(0.4572*B12)', {
//     'B2':globalBackup.select('B2'),'B3':globalBackup.select('B3'),'B4':globalBackup.select('B4'),
//     'B8':globalBackup.select('B8'),'B11':globalBackup.select('B11'),'B12':globalBackup.select('B12')
// }).rename('TCW');

// var reip = globalBackup.expression(
//   '700 + 40 * (((B4 + B7) / 2) - B5) / (B6 - B5 + 0.0001)', {
//     'B4':globalBackup.select('B4'),'B5':globalBackup.select('B5'),
//     'B6':globalBackup.select('B6'),'B7':globalBackup.select('B7')
// }).rename('REIP');

// // 6. ASSEMBLE THE FINAL MEGA STACK
// var finalMegaStack = seasonalStack.addBands([
//   tcWet, reip, slope, tpi, cti, dem.rename('elevation')
// ]);

// // 7. RUN CLASSIFICATION
// // Using .select(features) ensures the RF gets the exact 48 columns it expects
// var classified = finalMegaStack.select(features).classify(classifier);

// // Apply the Tier 2 Forest Mask (Only show forest areas)
// var finalMap = classified.updateMask(forestMask.eq(1));

// // 8. VISUAL CHECK
// // Map.setCenter(-89.4, 45.4, 9);
// // Map.addLayer(finalMap, {min: 10, max: 20, palette: ['#d2b48c', '#00ffff']}, 'Tier 3: 10=Upland, 20=Lowland');
// // Map.addLayer(finalMap.mask().not().selfMask(), {palette: ['red']}, 'Errors/Gaps (Should be empty)');

// // 9. EXPORT
// Export.image.toAsset({
//   image: finalMap.uint8(), 
//   description: 'Tier3_Final_Hydro_Map_Patched',
//   assetId: 'projects/code-test-476615/assets/Tier3/Tier3_Forest_Hydrology_Final', 
//   scale: 10, 
//   region: wi.geometry(),
//   maxPixels: 1e13,
//   pyramidingPolicy: {'.default': 'mode'}
// });



/**---------------------------------------------------------
 * TIER 3 FINAL PROTOCOL: DEEP CAST VALIDATION
 *----------------------------------------------------------*/

// 1. LOAD ASSETS
var trainingData = ee.FeatureCollection("projects/code-test-476615/assets/Tier3/Tier3_Master_Training_Data_FINAL_FIX");
var tier3Map = ee.Image("projects/code-test-476615/assets/Tier3/Tier3_Forest_Hydrology_Final");

// 2. RESTORE GEOMETRY (The "Direct Handshake" Fix)
// Since the asset already has a 'geo' column, we just ensure 
// Earth Engine treats it as the primary geometry.
var validationPoints = trainingData.map(function(f) {
  return f.setGeometry(f.geometry());
});

// 3. DATA SPLIT (80% Train / 20% Validate)
var withRandom = validationPoints.randomColumn('random');
var trainingSet = withRandom.filter(ee.Filter.lt('random', 0.8));
var testSet = withRandom.filter(ee.Filter.gte('random', 0.8));

var label = 'hydro_class';
var features = [
  'B11', 'B11_1', 'B11_2', 'B11_3', 'B11_4', 'B11_5', 'B11_6', 
  'B12', 'B12_1', 'B12_2', 'B12_3', 'B12_4', 'B12_5', 'B12_6', 
  'B8',  'B8_1',  'B8_2',  'B8_3',  'B8_4',  'B8_5',  'B8_6', 
  'CTI', 'MSI_10', 'MSI_11', 'MSI_3', 'MSI_4', 'MSI_5', 'MSI_7', 'MSI_9', 
  'NDVI_10', 'NDVI_11', 'NDVI_3', 'NDVI_4', 'NDVI_5', 'NDVI_7', 'NDVI_9', 
  'NDWI_10', 'NDWI_11', 'NDWI_3', 'NDWI_4', 'NDWI_5', 'NDWI_7', 'NDWI_9', 
  'REIP', 'TCW', 'TPI', 'elevation', 'slope'
];

// 4. VARIABLE IMPORTANCE
var importanceClassifier = ee.Classifier.smileRandomForest(100).train({
  features: trainingSet,
  classProperty: label,
  inputProperties: features
});

var importanceDict = ee.Dictionary(importanceClassifier.explain().get('importance'));
var sortedKeys = importanceDict.keys().sort(importanceDict.values()).reverse();

print('--- RANKED VARIABLE IMPORTANCE ---', sortedKeys);

// 5. SPATIAL ACCURACY
var validationRes = tier3Map.sampleRegions({
  collection: testSet,
  properties: [label],
  scale: 10,
  tileScale: 4
});

var confMatrix = validationRes.errorMatrix(label, 'classification');

print('--- TIER 3 FINAL VALIDATION ---');
print('Matched Points:', validationRes.size());
print('Overall Accuracy:', confMatrix.accuracy());
print('Kappa Coefficient:', confMatrix.kappa());
print('Confusion Matrix:', confMatrix);

// 6. MAP VIEWER
Map.setCenter(-89.5, 44.5, 7);
var vizParams = {min: 10, max: 20, palette: ['#228B22', '#00FFFF']};
Map.addLayer(tier3Map, vizParams, 'Tier 3 Hydrology');
