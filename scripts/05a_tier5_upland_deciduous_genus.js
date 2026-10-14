/**---------------------------------------------------------
 * TIER 4: UPLAND SKELETON (BINARY - 4000 SERIES CODES)
 *----------------------------------------------------------*/

// var wi = ee.FeatureCollection("TIGER/2018/States").filter(ee.Filter.eq("NAME", "Wisconsin"));
// var wiscland = ee.Image("projects/code-test-476615/assets/wiscland2_level3");
// var tier3 = ee.Image("projects/code-test-476615/assets/Tier3/Tier3_Forest_Hydrology_Final");

// // 1. THE PRECISION MASK
// // Must be Upland (10) AND within the Forest range (4000-4999)
// var uplandForestMask = tier3.eq(10).and(wiscland.gte(4000).and(wiscland.lt(5000)));

// // 2. DEFINE BINARY CLASSES BASED ON YOUR LIST
// // Class 1: Coniferous (4100s)
// var conifer = wiscland.gte(4100).and(wiscland.lt(4200)).multiply(1);
// // Class 2: Deciduous (4200s)
// var deciduous = wiscland.gte(4200).and(wiscland.lt(4300)).multiply(2);

// var binaryClass = conifer.add(deciduous)
//   .updateMask(uplandForestMask)
//   .rename('species_class')
//   .selfMask();


// // 4. STRATIFIED SAMPLE (The Skeleton)
// var skeleton = binaryClass.stratifiedSample({
//   numPoints: 0,
//   classBand: 'species_class',
//   region: wi.geometry(),
//   scale: 30,
//   classValues: [1, 2],
//   classPoints: [4000, 4000], // High density for the 20m Radar anchor to chew on
//   geometries: true 
// }).map(function(f) {
//   var coords = f.geometry().coordinates();
//   return f.set({
//     'long_val': coords.get(0),
//     'lat_val': coords.get(1)
//   });
// });

// print('Upland Skeleton Count:', skeleton.size());

// // 5. EXPORT
// Export.table.toDrive({
//   collection: skeleton,
//   description: 'Tier4_Upland_Skeleton',
//   fileFormat: 'CSV',
//   selectors: ['long_val', 'lat_val', 'species_class']
// });


/**-------------------------------------------------------------------
 * TIER 4: UPLAND BINARY POPULATOR (Master Cube + Legacy SAR)
 * (Targets: 1=Conifer, 2=Deciduous | 4000-Series Baseline)
 *-------------------------------------------------------------------*/

// // 1. LOAD ASSETS (Pointing to your new Binary Skeleton)
// var trainingPoints = ee.FeatureCollection("projects/code-test-476615/assets/Tier4/Tier4_Lowland_Skeleton");
// var cube = ee.Image("projects/code-test-476615/assets/WISC_MasterCube/WI_MultiYear_Optical_Cube"); 
// var s1_legacy = ee.Image("projects/code-test-476615/assets/WISC_MasterCube/WI_S1_20m_2020_2022");
// var wi = ee.FeatureCollection("TIGER/2018/States").filter(ee.Filter.eq("NAME", "Wisconsin"));
// var dem = ee.Image("USGS/3DEP/10m");

// // 2. LIVE TERRAIN & SOIL
// var terrain = ee.Terrain.products(dem);
// var slope = terrain.select('slope');
// var aspect = terrain.select('aspect');
// var northness = aspect.multiply(Math.PI / 180).cos().rename('northness');
// var eastness = aspect.multiply(Math.PI / 180).sin().rename('eastness');
// var tpi = dem.subtract(dem.focal_mean(300, 'circle', 'meters')).rename('TPI');

// // 3. PREPARE RADAR ANCHOR
// // Resampled to 10m to match Optical Cube alignment
// var radar_stack = s1_legacy.resample('bilinear').rename(['S1_VV', 'S1_VH', 'S1_Ratio']);

// // 4. LIVE LANDSAT THERMAL (Summer Canopy Temp)
// var thermal = ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
//     .merge(ee.ImageCollection("LANDSAT/LC09/C02/T1_L2"))
//     .filterBounds(wi)
//     .filterDate('2025-07-01', '2025-08-31')
//     .median()
//     .multiply(0.00341802).add(149.0).subtract(273.15)
//     .select('ST_B10').rename('Summer_LST');

// // 5. ASSEMBLE HYBRID STACK
// var finalStack = ee.Image.cat([
//   cube,           // 10m Optical Cube (B2_Nov, etc.)
//   radar_stack,    // 20m SAR Anchor
//   slope,          
//   northness, 
//   eastness, 
//   tpi, 
//   dem.rename('elevation'),
//   thermal         
// ]).float();

// // 6. POPULATE DATA
// var populatedData = finalStack.sampleRegions({
//   collection: trainingPoints,
//   // Note: block_id and random removed as they aren't in the new skeleton yet
//   properties: ['species_class', 'long_val', 'lat_val'], 
//   scale: 10,
//   tileScale: 16
// }).filter(ee.Filter.notNull(['S1_VH', 'species_class'])); 

// // 7. DYNAMIC EXPORT
// var bands = finalStack.bandNames();
// var exportList = ee.List(['long_val', 'lat_val', 'species_class']).cat(bands);

// exportList.evaluate(function(successList) {
//   Export.table.toDrive({
//     collection: populatedData,
//     description: 'Tier4_Upland_Master_Training',
//     fileFormat: 'CSV',
//     selectors: successList
//   });
// });

/**-------------------------------------------------------------------
 * TIER 4: UPLAND CLASSIFIER (Master Cube + Legacy SAR)
 * Classes: 1=Conifer, 2=Deciduous, 3=Mixed
 *-------------------------------------------------------------------*/

/**-------------------------------------------------------------------
 * TIER 4: UPLAND BINARY CLASSIFIER (Master Cube + Legacy SAR)
 * Targets: 1=Conifer, 2=Deciduous | 4000-Series Baseline
 *-------------------------------------------------------------------*/


// // 1. LOAD ASSETS
// var wi = ee.FeatureCollection("TIGER/2018/States").filter(ee.Filter.eq("NAME", "Wisconsin"));
// var cube = ee.Image("projects/code-test-476615/assets/WISC_MasterCube/WI_MultiYear_Optical_Cube"); 
// var s1_legacy = ee.Image("projects/code-test-476615/assets/WISC_MasterCube/WI_S1_20m_2020_2022");
// var dem = ee.Image("USGS/3DEP/10m");

// // Tier 3 Hydrology Mask (Lowland = 20)
// var uplandMask = ee.Image("projects/code-test-476615/assets/Tier3/Tier3_Forest_Hydrology_Final").eq(10); 

// // LOAD THE NEW BINARY TRAINING DATA (V5)
// var trainingData = ee.FeatureCollection("projects/code-test-476615/assets/Tier4/Tier4_Upland_Master_Training");

// // 2. RADAR & THERMAL
// var radar_stack = s1_legacy.resample('bilinear').rename(['S1_VV', 'S1_VH', 'S1_Ratio']);

// var thermal = ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
//     .merge(ee.ImageCollection("LANDSAT/LC09/C02/T1_L2"))
//     .filterBounds(wi).filterDate('2025-07-01', '2025-08-31').median()
//     .multiply(0.00341802).add(149.0).subtract(273.15)
//     .select('ST_B10').rename('Summer_LST');


// // 3. TERRAIN ENGINE
// var terrain = ee.Terrain.products(dem);
// var aspect = terrain.select('aspect');
// var slope = terrain.select('slope').rename('slope'); 
// var northness = aspect.multiply(Math.PI / 180).cos().rename('northness');
// var eastness = aspect.multiply(Math.PI / 180).sin().rename('eastness');
// var tpi = dem.subtract(dem.focal_mean(300, 'circle', 'meters')).rename('TPI');


// // 4. ASSEMBLE STACK 
// var finalStack = ee.Image.cat([
//   cube, 
//   radar_stack, 
//   dem.rename('elevation'),
//   slope,
//   northness, 
//   eastness, 
//   tpi,
//   thermal 
// ]).updateMask(uplandMask).float();


// // 5. TRAIN RANDOM FOREST (With Null-Scrubbing)
// var label = 'species_class';
// var predictionBands = finalStack.bandNames();

// // Aggressive scrub to ensure model stability
// var cleanTraining = trainingData.filter(ee.Filter.notNull(predictionBands));

// var classifier = ee.Classifier.smileRandomForest(300).train({
//   features: cleanTraining, 
//   classProperty: label, 
//   inputProperties: predictionBands
// });


// // 6. CLASSIFY & SMOOTH
// var rawClassification = finalStack.select(predictionBands).classify(classifier);

// // Post-processing: Remove "speckle" for a professional cartographic look
// var smoothedMap = rawClassification.focalMode({
//   radius: 1.5,
//   kernelType: 'circle',
//   units: 'pixels'
// }).uint8();



// // 8. EXPORT
// Export.image.toAsset({
//   image: smoothedMap.rename('upland_binary_type'),
//   description: 'Tier4_Final_Upland_Binary_Map_V5',
//   assetId: 'projects/code-test-476615/assets/Tier4/Tier4_Upland_Binary_Map_V5',
//   scale: 10,
//   region: wi.geometry().bounds(),
//   maxPixels: 1e13,
//   pyramidingPolicy: {'.default': 'mode'}
// });

/**-------------------------------------------------------------------
 * TIER 4: UPLAND BINARY MAP VALIDATION & VISUALIZATION
 *-------------------------------------------------------------------*/

// 1. LOAD ASSETS
var wi = ee.FeatureCollection("TIGER/2018/States").filter(ee.Filter.eq("NAME", "Wisconsin"));

// THE IMAGE (The map you just exported)
var uplandMap = ee.Image("projects/code-test-476615/assets/Tier4/Tier4_Upland_Map");

// THE POINTS (The training data used to build the map)
var trainingData = ee.FeatureCollection("projects/code-test-476615/assets/Tier4/Tier4_Upland_Master_Training");

// 2. DEFINE FEATURES AND SCRUB NULLS
var label = 'species_class';

// Extract property names dynamically from the points
var predictionBands = trainingData.first().propertyNames()
  .remove(label)
  .remove('system:index')
  .remove('random')
  .remove('block_id')
  .remove('lat_val')
  .remove('long_val')
  .remove('.geo');

var cleanData = trainingData.filter(ee.Filter.notNull(predictionBands));

// 3. SPATIAL SPLIT (East vs West)
// This is your "Scientific Proof" for the presentation
var splitLine = -89.5;
var trainingSet = cleanData.filter(ee.Filter.gte('long_val', splitLine)); // East
var testSet = cleanData.filter(ee.Filter.lt('long_val', splitLine));      // West

print('Validation Setup:');
print('-> Total Prediction Bands:', predictionBands.size());
print('-> Training Points (East):', trainingSet.size());
print('-> Testing Points (West):', testSet.size());

// 4. TRAIN VALIDATION CLASSIFIER
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

// 5. RUN SPATIAL VALIDATION
var validation = testSet.classify(classifier);
var confMatrix = validation.errorMatrix(label, 'classification');

print('--- TIER 4 UPLAND: SPATIAL VALIDATION RESULTS ---');
print('Real Overall Accuracy:', confMatrix.accuracy());
print('Real Kappa Coefficient:', confMatrix.kappa());
print('Spatial Confusion Matrix:', confMatrix);

// 6. VARIABLE IMPORTANCE
var importance = ee.Dictionary(classifier.explain().get('importance'));
print('Top 5 Predictors:', importance.keys().sort(importance.values()).reverse().slice(0, 5));

// 7. MAP DISPLAY
// Class 1 (Conifer) = Dark Green, Class 2 (Deciduous) = Lime Green
var speciesViz = {
  min: 1, 
  max: 2, 
  palette: ['#004400', '#66ff66']
};

Map.centerObject(wi.geometry().centroid(), 7);
Map.addLayer(uplandMap, speciesViz, 'Final Upland Binary Map (V5)');

// Add a legend to the console for your quick reference
print('LEGEND: 1 = Conifer (Dark Green), 2 = Deciduous (Light Green)');
