 // // // ============================================================
// // // Tier 2 Forest vs Non-Forest 
// // // ============================================================

//---Create Training Data Menu-----


// var wi = ee.FeatureCollection("TIGER/2018/States").filter(ee.Filter.eq("NAME", "Wisconsin"));

// // 1. THE 2-OUT-OF-3 CONSENSUS MASK
// var wisclandRaw = ee.Image("projects/code-test-476615/assets/wiscland2_level3"); // <--- DOUBLE CHECK
// var nlcd = ee.ImageCollection("USGS/NLCD_RELEASES/2021_REL/NLCD").first();
// var gfw = ee.Image("UMD/hansen/global_forest_change_2023_v1_11");

// var forestCodes = [4000, 4100, 4110, 4120, 4121, 4122, 4123, 4130, 4200, 4211, 4212, 
//                   4220, 4230, 4231, 4232, 4233, 4240, 4250, 4251, 4252, 4300,
//                   6400, 6410, 6411, 6412, 6413, 6414, 6420, 6430, 6431, 6432, 
//                   6440, 6441, 6442, 6450];

// var wisclandF = wisclandRaw.select(0).remap(forestCodes, ee.List.repeat(1, forestCodes.length), 0);
// var nlcdF = nlcd.select('landcover').remap([41, 42, 43], [1, 1, 1], 0);
// var gfwF = gfw.select('treecover2000').gt(30);

// var forestVote = wisclandF.add(nlcdF).add(gfwF);
// var consensusClass = forestVote.gte(2).rename('training_class');

// // 2. ADD ELEVATION (Since it's static and fast)
// var elevation = ee.Image("USGS/3DEP/10m").select(['elevation']);
// var baseImage = consensusClass.addBands(elevation);

// // 3. GENERATE THE POINTS (5,000 per class)
// var trainingPoints = baseImage.stratifiedSample({
//   numPoints: 0,
//   classBand: "training_class",
//   region: wi.geometry().bounds(),
//   scale: 30,
//   classValues: [0, 1],
//   classPoints: [5000, 5000],
//   tileScale: 16,
//   geometries: true // We need geometries to get the Lat/Long!
// });

// // 4. FORMAT FOR CSV (Adding Lat/Long columns)
// var skeletonTable = trainingPoints.map(function(feature) {
//   var coords = feature.geometry().coordinates();
//   return feature.set({
//     'longitude': coords.get(0),
//     'latitude': coords.get(1),
//     // Placeholders for the bands we will add in Step 2
//     'NDVI': 0, 'NBR': 0, 'NDRE': 0, 'NDMI': 0, 'EVI': 0,
//     'B2': 0, 'B4': 0, 'B8': 0, 'B11': 0, 'B12': 0
//   });
// });

// // 5. EXPORT THE SKELETON
// Export.table.toDrive({
//   collection: skeletonTable,
//   description: "Tier2_Consensus_Skeleton_Points",
//   fileFormat: "CSV",
//   selectors: ['longitude', 'latitude', 'training_class', 'elevation', 'NDVI', 'NBR', 'NDRE', 'NDMI', 'EVI', 'B2', 'B4', 'B8', 'B11', 'B12']
// });


// //---Populate the menu with training data----

// var skeleton = ee.FeatureCollection("projects/code-test-476615/assets/Tier2_Consensus_Skeleton_Points");
// print('Look at these properties:', skeleton.first().propertyNames());

// // 1. LOAD THE SKELETON ASSET
// // 1. SETTINGS
// var propName = 'training_class'; 
// var skeleton = ee.FeatureCollection("projects/code-test-476615/assets/Tier2_Consensus_Skeleton_Points");

// // 2. PREPARE THE S2 KITCHEN
// function addIndices(image) {
//   var ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI');
//   var nbr = image.normalizedDifference(['B8', 'B12']).rename('NBR');
//   var ndmi = image.normalizedDifference(['B8', 'B11']).rename('NDMI');
//   var ndre = image.normalizedDifference(['B8', 'B5']).rename('NDRE');
//   var evi = image.expression(
//     '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))', {
//       'NIR': image.select('B8'), 'RED': image.select('B4'), 'BLUE': image.select('B2')
//     }).rename('EVI');
//   return image.addBands([ndvi, nbr, ndmi, ndre, evi]);
// }

// var s2Median = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
//   .filterDate('2025-06-01', '2025-09-15')
//   .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
//   .map(function(img) { return img.divide(10000); })
//   .map(addIndices)
//   .median();

// // 3. POPULATE & RENAME
// // We map over the collection first to ensure the class property is explicitly cast to a Number
// var preparedSkeleton = skeleton.map(function(f) {
//   return f.set('class', ee.Number(f.get(propName))); 
// });

// var populatedTable = s2Median.select(['B2','B4','B8','B11','B12','NDVI','NBR','NDRE','NDMI','EVI'])
//   .sampleRegions({
//     collection: preparedSkeleton,
//     properties: ['class', 'elevation', 'latitude', 'longitude'],
//     scale: 30,
//     tileScale: 16
//   });

// // 4. EXPORT
// Export.table.toDrive({
//   collection: populatedTable,
//   description: "Tier2_Master_Training_Data_FINAL_FIXED",
//   fileFormat: "CSV",
//   selectors: ['class', 'elevation', 'NDVI', 'NBR', 'NDRE', 'NDMI', 'EVI', 'B2', 'B4', 'B8', 'B11', 'B12']
// });


//---Run Classifier---


// // // 1. LOAD ASSETS
// var trainingTable = ee.FeatureCollection("projects/code-test-476615/assets/Tier2/Tier2_Master_Training_Data_FINAL_FIXED");
// var wi = ee.FeatureCollection("TIGER/2018/States").filter(ee.Filter.eq("NAME", "Wisconsin"));

// // 2. REBUILD THE PREDICTOR STACK (Must match the CSV columns exactly)
// function addIndices(image) {
//   var ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI');
//   var nbr = image.normalizedDifference(['B8', 'B12']).rename('NBR');
//   var ndmi = image.normalizedDifference(['B8', 'B11']).rename('NDMI');
//   var ndre = image.normalizedDifference(['B8', 'B5']).rename('NDRE');
//   var evi = image.expression(
//     '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))', {
//       'NIR': image.select('B8'), 'RED': image.select('B4'), 'BLUE': image.select('B2')
//     }).rename('EVI');
//   return image.addBands([ndvi, nbr, ndmi, ndre, evi]);
// }

// var s2 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
//   .filterBounds(wi).filterDate('2025-06-01', '2025-09-15')
//   .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
//   .map(function(img) { return img.divide(10000); }).map(addIndices).median();

// var elevation = ee.Image("USGS/3DEP/10m").select(['elevation']);
// var predictors = s2.select(['B2','B4','B8','B11','B12','NDVI','NBR','NDRE','NDMI','EVI']).addBands(elevation);

// // // 3. TRAIN THE RANDOM FOREST
// var classifier = ee.Classifier.smileRandomForest(150).train({
//   features: trainingTable,
//   classProperty: 'class',
//   inputProperties: ['class', 'elevation', 'NDVI', 'NBR', 'NDRE', 'NDMI', 'EVI', 'B2', 'B4', 'B8', 'B11', 'B12']
// });

// // Check the Feature Importance
// print('Tier 2 Feature Importance:', classifier.explain().get('importance'));

// // 4. CLASSIFY THE STATE
// var forestMap = predictors.classify(classifier);

// // 5. CLEAN UP WITH WATER MASK (Tier 1)
// var waterMask = ee.Image("projects/code-test-476615/assets/Tier1_LandWater_WaterProb_2025_FIXED");
// var finalMap = forestMap.updateMask(waterMask.lt(0.5));


// Export.image.toAsset({
//   image: finalMap.uint8(),
//   description: 'Tier2_Wisconsin_Forest_Map_2025',
//   assetId: 'Tier2_Forest_Map_Final',
//   scale: 30,
//   region: wi.geometry().bounds(),
//   maxPixels: 1e13
// });




/**-------------------------------------------------------------------
 * TIER 5 DIAGNOSTICS: ACCURACY & VARIABLE IMPORTANCE
 *-------------------------------------------------------------------*/

/**-------------------------------------------------------------------
 * TIER 5 DIAGNOSTICS: AUTO-REPAIR VERSION
 *-------------------------------------------------------------------*/

// 1. LOAD ASSETS (Fixed the 'Finall' typo here)
var trainingData = ee.FeatureCollection("projects/code-test-476615/assets/Tier2/Tier2_Master_Training_Data_FINAL_FIXED");
var forestMask = ee.Image("projects/code-test-476615/assets/Tier2/Tier2_Forest_Map_Final"); 



// 2. DYNAMIC PROPERTY DETECTION
var sample = trainingData.first();
var props = sample.propertyNames();
// We look for 'class' or 'landcover' since 'genus_class' isn't there
var classProp = ee.Algorithms.If(props.contains('class'), 'class', 'landcover');
var actualFeatures = props.removeAll(['system:index', classProp, 'random', 'landcover', 'genus_class']);

print('Using Class Property:', classProp);
print('Using Features:', actualFeatures);

// 3. DATA SPLIT (70/30)
var dataWithRandom = trainingData.randomColumn('random');
var trainingSet = dataWithRandom.filter(ee.Filter.lt('random', 0.7));
var validationSet = dataWithRandom.filter(ee.Filter.gte('random', 0.7));

// 4. TRAIN CLASSIFIER
var classifier = ee.Classifier.smileRandomForest(100).train({
  features: trainingSet,
  classProperty: classProp, // Now dynamically using 'class'
  inputProperties: actualFeatures
});

// 5. VALIDATE
var validated = validationSet.classify(classifier);
var errorMatrix = validated.errorMatrix(classProp, 'classification');

// --- PRINT PERFORMANCE ---
print('--- 1. OVERALL ACCURACY ---', errorMatrix.accuracy());
print('--- 2. KAPPA COEFFICIENT ---', errorMatrix.kappa());
print('--- 3. PRODUCER ACCURACY (Forest vs Non) ---', errorMatrix.producersAccuracy());
print('--- 4. USER ACCURACY (Forest vs Non) ---', errorMatrix.consumersAccuracy());
print('--- 5. CONFUSION MATRIX ---', errorMatrix);

// 6. VARIABLE IMPORTANCE
var dict = classifier.explain();
var variableImportance = ee.Feature(null, ee.Dictionary(dict).get('importance'));
print('--- 6. VARIABLE IMPORTANCE ---', variableImportance);

/**-------------------------------------------------------------------
 * TIER 2 MAP VIEWER
 * Purpose: Visualize the Forest / Non-Forest Binary Layer
 *-------------------------------------------------------------------*/

// 1. LOAD ASSETS
// Ensure this path matches your Tier 2 asset ID exactly
var forestMap = ee.Image("projects/code-test-476615/assets/Tier2/Tier2_Forest_Map_Final");
var wi = ee.FeatureCollection("TIGER/2018/States").filter(ee.Filter.eq("NAME", "Wisconsin"));

// 2. CENTER MAP
Map.centerObject(wi, 7);

// 3. DEFINE VISUALIZATION
// Assuming 0 = Non-Forest (Transparent/White) and 1 = Forest (Green)
var forestVis = {
  min: 0,
  max: 1,
  palette: ['#ffffff', '#006400'] // White for Non-Forest, Dark Green for Forest
};

// 4. ADD LAYERS
// We use .selfMask() on the forest layer so the '0' values don't cover the base map
Map.addLayer(wi, {color: 'grey'}, 'Wisconsin Boundary', false);
Map.addLayer(forestMap.selfMask(), forestVis, 'Tier 2 Forest Mask');

// 5. INSPECTOR TOOL (Optional tip)
print('Click the INSPECTOR tab and click the map to verify pixel values.');
