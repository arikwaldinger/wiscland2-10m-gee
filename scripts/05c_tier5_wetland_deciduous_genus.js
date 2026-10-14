/**-------------------------------------------------------------------
 * TIER 5: STEP 1 - SKELETON GENERATOR (LOWLAND DECIDUOUS)
 * Targets: 10 (Bottomland Hardwood), 11 (Swamp Hardwood / Ash)
 *-------------------------------------------------------------------*/

// var wiscland = ee.Image("projects/code-test-476615/assets/wiscland2_level3");
// var wi = ee.FeatureCollection("TIGER/2018/States").filter(ee.Filter.eq("NAME", "Wisconsin"));

// // The Guardrail: ONLY look where Tier 4 said it is Lowland Deciduous (Class 2)
// var tier4LowDec = ee.Image("projects/code-test-476615/assets/Tier4/Tier4_Lowland_Map").eq(2);

// // 1. GENUS MASKS (Based on your confirmed codes)
// var mask10 = wiscland.eq(6430).or(wiscland.eq(6431)); // Bottomland (Floodplains)
// var mask11 = wiscland.eq(6400).or(wiscland.eq(6440)); // Swamp/Ash (Stagnant water)

// // 2. SAMPLING ENGINE
// var getPoints = function(mask, classValue, num) {
//   return mask.updateMask(tier4LowDec).selfMask().stratifiedSample({
//     numPoints: num,
//     region: wi.geometry().bounds(),
//     scale: 30,
//     geometries: true
//   }).map(function(f) {
//     var coords = f.geometry().coordinates();
//     return f.set({
//       'genus_class': classValue,
//       'long_val': coords.get(0),
//       'lat_val': coords.get(1)
//     });
//   });
// };

// // 3. GENERATE SKELETONS
// var p10 = getPoints(mask10, 10, 4000);
// var p11 = getPoints(mask11, 11, 4000);

// print('--- LOWLAND DECIDUOUS SKELETON TOTALS ---');
// print('10 (Bottomland):', p10.size());
// print('11 (Swamp/Ash):', p11.size());

// var lowlandDecSkeleton = p10.merge(p11);

// // 4. EXPORT TO DRIVE
// Export.table.toDrive({
//   collection: lowlandDecSkeleton,
//   description: 'Tier5_Lowland_Dec_Skeleton_V5',
//   fileFormat: 'CSV',
//   selectors: ['long_val', 'lat_val', 'genus_class']
// });

/**-------------------------------------------------------------------
 * TIER 5: STEP 2 - POPULATE LOWLAND DECIDUOUS (Cube + Hydro)
 *-------------------------------------------------------------------*/

// var trainingPoints = ee.FeatureCollection("projects/code-test-476615/assets/Tier5/Low_Dec/Tier5_Lowland_Dec_Skeleton_V5");
// var cube = ee.Image("projects/code-test-476615/assets/WISC_MasterCube/WI_MultiYear_Optical_Cube"); 
// var s1_legacy = ee.Image("projects/code-test-476615/assets/WISC_MasterCube/WI_S1_20m_2020_2022");
// var dem = ee.Image("USGS/3DEP/10m");

// // 1. HYDROLOGY & SOILS (Critical for separating floodplains from stagnant bogs)
// var hand = ee.Image("MERIT/Hydro/v1_0_1").select('hnd').rename('HAND');
// var waterFreq = ee.Image("JRC/GSW1_4/GlobalSurfaceWater").select('occurrence').rename('water_occurrence').unmask(0);
// var soilCarbon = ee.Image("OpenLandMap/SOL/SOL_ORGANIC-CARBON_USDA-6A1C_M/v02").select('b0').rename('soil_organic_carbon');

// // 2. RADAR ANCHOR
// var radar = s1_legacy.resample('bilinear').rename(['S1_VV', 'S1_VH', 'S1_Ratio']);

// // 3. PHENOLOGY (Ash trees leaf out late and drop leaves early)
// var aprNDVI = cube.normalizedDifference(['B8_Apr', 'B4_Apr']);
// var mayNDVI = cube.normalizedDifference(['B8_May', 'B4_May']);
// var springSpeed = mayNDVI.subtract(aprNDVI).rename('Spring_Greenup_Speed');

// // 4. TERRAIN
// var terrain = ee.Terrain.products(dem);

// // 5. ASSEMBLE MEGA STACK
// var finalStack = ee.Image.cat([
//   cube,
//   radar,
//   springSpeed,
//   hand,
//   waterFreq,
//   soilCarbon,
//   dem.rename('elevation'),
//   terrain.select(['slope', 'aspect'])
// ]).float();

// // 6. POPULATE
// var populatedData = finalStack.sampleRegions({
//   collection: trainingPoints,
//   properties: ['genus_class', 'long_val', 'lat_val'],
//   scale: 10,
//   tileScale: 16
// }).filter(ee.Filter.notNull(['HAND', 'B8_Summer']));

// // 7. EXPORT
// var bands = finalStack.bandNames();
// var exportList = ee.List(['long_val', 'lat_val', 'genus_class']).cat(bands);

// exportList.evaluate(function(successList) {
//   Export.table.toDrive({
//     collection: populatedData,
//     description: 'Tier5_Lowland_Dec_Master_Training_V5',
//     fileFormat: 'CSV',
//     selectors: successList
//   });
// });


/**-------------------------------------------------------------------
 * TIER 5: STEP 3 - LOWLAND DECIDUOUS CLASSIFIER 
 *-------------------------------------------------------------------*/

// 1. LOAD ASSETS
var wi = ee.FeatureCollection("TIGER/2018/States").filter(ee.Filter.eq("NAME", "Wisconsin"));
var trainingData = ee.FeatureCollection("projects/code-test-476615/assets/Tier5/Low_Dec/Tier5_Lowland_Dec_Master_Training_V5");

// THE GUARDRAIL: Only paint Lowland Deciduous over confirmed Tier 4 pixels
var tier4LowDecMask = ee.Image("projects/code-test-476615/assets/Tier4/Tier4_Lowland_Map").eq(2);

// Data sources for the stack
var cube = ee.Image("projects/code-test-476615/assets/WISC_MasterCube/WI_MultiYear_Optical_Cube"); 
var s1_legacy = ee.Image("projects/code-test-476615/assets/WISC_MasterCube/WI_S1_20m_2020_2022");
var dem = ee.Image("USGS/3DEP/10m");

// 2. HYDROLOGY & SOILS
var hand = ee.Image("MERIT/Hydro/v1_0_1").select('hnd').rename('HAND');
var waterFreq = ee.Image("JRC/GSW1_4/GlobalSurfaceWater").select('occurrence').rename('water_occurrence').unmask(0);
var soilCarbon = ee.Image("OpenLandMap/SOL/SOL_ORGANIC-CARBON_USDA-6A1C_M/v02").select('b0').rename('soil_organic_carbon');

// 3. RADAR & PHENOLOGY
var radar = s1_legacy.resample('bilinear').rename(['S1_VV', 'S1_VH', 'S1_Ratio']);
var aprNDVI = cube.normalizedDifference(['B8_Apr', 'B4_Apr']);
var mayNDVI = cube.normalizedDifference(['B8_May', 'B4_May']);
var springSpeed = mayNDVI.subtract(aprNDVI).rename('Spring_Greenup_Speed');

// 4. TERRAIN ENGINE
var terrain = ee.Terrain.products(dem);

// 5. ASSEMBLE FINAL STACK
var finalStack = ee.Image.cat([
  cube, radar, springSpeed,
  hand, waterFreq, soilCarbon,
  dem.rename('elevation'), terrain.select(['slope', 'aspect'])
]).float();

// 6. TRAIN RANDOM FOREST (Memory safe: Back up to 300 trees!)
var label = 'genus_class';
var features = finalStack.bandNames();

var cleanTraining = trainingData.filter(ee.Filter.notNull(features));

var classifier = ee.Classifier.smileRandomForest(300).train({
  features: cleanTraining,
  classProperty: label,
  inputProperties: features
});

// 7. CLASSIFY & MASK
var rawSpecies = finalStack.select(features)
  .classify(classifier)
  .updateMask(tier4LowDecMask);

// 8. POST-PROCESSING (Spatial Smoothing Restored!)
var speciesMap = rawSpecies.focalMode({
  radius: 1.5,
  kernelType: 'circle',
  units: 'pixels'
}).uint8();


// // 10. EXPORT
// Export.image.toAsset({
//   image: speciesMap.rename('lowland_deciduous_genus'),
//   description: 'Tier5_Lowland_Deciduous_Genus_Map',
//   assetId: 'projects/code-test-476615/assets/Tier5/Tier5_Lowland_Deciduous_Genus_Map',
//   scale: 10,
//   region: wi.geometry().bounds(),
//   maxPixels: 1e13,
//   pyramidingPolicy: {'.default': 'mode'}
// });


/**-------------------------------------------------------------------
 * TIER 5: ASSET VALIDATION & VIEWER (LOWLAND DECIDUOUS)
 * Purpose: Assess the exported map asset against test data
 *-------------------------------------------------------------------*/

// 1. LOAD ASSETS
var lowDecMap = ee.Image("projects/code-test-476615/assets/Tier5/Low_Dec/Tier5_Lowland_Deciduous_Genus_Map");
var trainingData = ee.FeatureCollection("projects/code-test-476615/assets/Tier5/Low_Dec/Tier5_Lowland_Dec_Master_Training_V5");
var wi = ee.FeatureCollection("TIGER/2018/States").filter(ee.Filter.eq("NAME", "Wisconsin"));

// 2. AUTO-DETECT BAND NAME & PREP TEST SET
var assetBand = lowDecMap.bandNames().get(0);
var testSet = trainingData.randomColumn('random').filter(ee.Filter.gte('random', 0.7));

print('Detected Asset Band Name:', assetBand);

// 3. SAMPLE THE MAP AT TEST LOCATIONS
var validationPoints = lowDecMap.sampleRegions({
  collection: testSet,
  properties: ['genus_class'],
  scale: 10,
  tileScale: 16
}).filter(ee.Filter.notNull([assetBand, 'genus_class']));

// 4. GENERATE ERROR MATRIX (10=Bottomland, 11=Swamp/Ash)
var errorMatrix = validationPoints.errorMatrix('genus_class', assetBand);

print('--- FINAL ASSET VALIDATION: LOWLAND DECIDUOUS ---');
print('Overall Accuracy:', errorMatrix.accuracy());
print('Kappa Coefficient:', errorMatrix.kappa());
print('Confusion Matrix:', errorMatrix);
print('Producers Accuracy (Sensitivity):', errorMatrix.producersAccuracy());
print('Users Accuracy (Precision):', errorMatrix.consumersAccuracy());

// 5. VISUALIZATION
// 10 = Bottomland Hardwood (Cerulean Blue), 11 = Swamp Hardwood/Ash (Deep Purple)
var viz = {
  min: 10, 
  max: 11, 
  palette: ['#1f78b4', '#6a3d9a']
};

Map.centerObject(wi, 7);
Map.addLayer(lowDecMap, viz, 'Lowland Deciduous Genus Map');

// 6. ADD LEGEND
var legend = ui.Panel({style: {position: 'bottom-left', padding: '8px 15px'}});
var makeRow = function(color, name) {
  return ui.Panel({
    widgets: [
      ui.Label({style: {backgroundColor: color, padding: '8px', margin: '0 0 4px 0'}}),
      ui.Label({value: name, style: {margin: '0 0 4px 6px'}})
    ],
    layout: ui.Panel.Layout.Flow('horizontal')
  });
};
legend.add(ui.Label({value: 'Lowland Deciduous', style: {fontWeight: 'bold'}}));
legend.add(makeRow('#1f78b4', 'Bottomland Hardwood (10)'));
legend.add(makeRow('#6a3d9a', 'Swamp Hardwood / Ash (11)'));
Map.add(legend);

var importance = ee.Dictionary(classifier.explain().get('importance'));
var sortedImportance = importance.keys().sort(importance.values()).reverse();

print('--- TOP 10 LOWLAND DECIDUOUS PREDICTORS ---');
sortedImportance.slice(0, 10).evaluate(function(keys) {
  keys.forEach(function(key) {
    print(key + ': ' + importance.get(key).getInfo().toFixed(2));
  });
});
