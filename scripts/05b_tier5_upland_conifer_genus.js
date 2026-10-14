/**-------------------------------------------------------------------
 * TIER 5: STEP 1 - SKELETON GENERATOR (UPLAND CONIFER)
 * Targets: 15 (Pine), 16 (Fir/Spruce), 17 (Hemlock)
 *-------------------------------------------------------------------*/

// var wiscland = ee.Image("projects/code-test-476615/assets/wiscland2_level3");
// var wi = ee.FeatureCollection("TIGER/2018/States").filter(ee.Filter.eq("NAME", "Wisconsin"));

// // The Guardrail: ONLY look where Tier 4 said it is Conifer (Class 1)
// var tier4Conifer = ee.Image("projects/code-test-476615/assets/Tier4/Tier4_Upland_Map").eq(1);

// // 1. GENUS MASKS (Based on your provided DN Codes)
// // Class 15: The Pines (Jack, Red, White) -> 4120 to 4123
// var mask15 = wiscland.gte(4120).and(wiscland.lte(4123)); 

// // Class 16: Fir/Spruce -> 4100 (Broad) and 4110
// var mask16 = wiscland.eq(4110).or(wiscland.eq(4100)); 

// // Class 17: Hemlock -> 4130
// var mask17 = wiscland.eq(4130);

// // 2. SAMPLING ENGINE
// var getPoints = function(mask, classValue, num) {
//   // updateMask ensures we only drop points on confirmed Tier 4 Conifer pixels
//   return mask.updateMask(tier4Conifer).selfMask().stratifiedSample({
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

// // 3. GENERATE SKELETONS (Asking for 3000, may get slightly less for Hemlock)
// var p15 = getPoints(mask15, 15, 3000);
// var p16 = getPoints(mask16, 16, 3000); 
// var p17 = getPoints(mask17, 17, 3000);

// print('--- CONIFER SKELETON TOTALS ---');
// print('15 (Pine):', p15.size());
// print('16 (Fir/Spruce):', p16.size());
// print('17 (Hemlock):', p17.size());

// var coniferSkeleton = p15.merge(p16).merge(p17);

// // 4. EXPORT TO DRIVE
// Export.table.toDrive({
//   collection: coniferSkeleton,
//   description: 'Tier5_Upland_Conifer_Skeleton_V5',
//   fileFormat: 'CSV',
//   selectors: ['long_val', 'lat_val', 'genus_class']
// });


/**-------------------------------------------------------------------
 * TIER 5: STEP 2 - POPULATE UPLAND CONIFER (Master Cube + S1 Legacy)
 *-------------------------------------------------------------------*/

// var trainingPoints = ee.FeatureCollection("projects/code-test-476615/assets/Tier5/Upland_Con/Tier5_Upland_Conifer_Skeleton_V5");
// var cube = ee.Image("projects/code-test-476615/assets/WISC_MasterCube/WI_MultiYear_Optical_Cube"); 
// var s1_legacy = ee.Image("projects/code-test-476615/assets/WISC_MasterCube/WI_S1_20m_2020_2022");
// var dem = ee.Image("USGS/3DEP/10m");

// // 1. RADAR ANCHOR (Crucial for Pine vs Spruce structure)
// var radar = s1_legacy.resample('bilinear').rename(['S1_VV', 'S1_VH', 'S1_Ratio']);

// // 2. CONIFER HEALTH CALC (Winter Moisture in needles)
// var winterNDVI = cube.normalizedDifference(['B8_Winter', 'B4_Winter']).rename('NDVI_Winter');
// var winterNDMI = cube.normalizedDifference(['B8_Winter', 'B11_Winter']).rename('NDMI_Winter');

// // 3. TERRAIN
// var terrain = ee.Terrain.products(dem);
// var tpi = dem.subtract(dem.focal_mean(300, 'circle', 'meters')).rename('TPI');

// // 4. ASSEMBLE MEGA STACK
// var finalStack = ee.Image.cat([
//   cube,
//   radar,
//   winterNDVI,
//   winterNDMI,
//   dem.rename('elevation'),
//   terrain.select(['slope', 'aspect']),
//   tpi
// ]).float();

// // 5. POPULATE
// var populatedData = finalStack.sampleRegions({
//   collection: trainingPoints,
//   properties: ['genus_class', 'long_val', 'lat_val'],
//   scale: 10,
//   tileScale: 16
// }).filter(ee.Filter.notNull(['S1_VH', 'B2_Summer']));

// // 6. EXPORT
// var bands = finalStack.bandNames();
// var exportList = ee.List(['long_val', 'lat_val', 'genus_class']).cat(bands);

// exportList.evaluate(function(successList) {
//   Export.table.toDrive({
//     collection: populatedData,
//     description: 'Tier5_Upland_Conifer_Master_Training',
//     fileFormat: 'CSV',
//     selectors: successList
//   });
// });


// /**-------------------------------------------------------------------
// * TIER 5: STEP 3 - GENUS CLASSIFIER (UPLAND CONIFER)
// *-------------------------------------------------------------------*/

// 1. LOAD ASSETS
var wi = ee.FeatureCollection("TIGER/2018/States").filter(ee.Filter.eq("NAME", "Wisconsin"));
var trainingData = ee.FeatureCollection("projects/code-test-476615/assets/Tier5/Upland_Con/Tier5_Upland_Conifer_Master_Training");

// THE GUARDRAIL: We only paint Conifers over the areas Tier 4 explicitly said were Conifers
var tier4Mask = ee.Image("projects/code-test-476615/assets/Tier4/Tier4_Upland_Map").eq(1);

// Data sources for the stack
var cube = ee.Image("projects/code-test-476615/assets/WISC_MasterCube/WI_MultiYear_Optical_Cube"); 
var s1_legacy = ee.Image("projects/code-test-476615/assets/WISC_MasterCube/WI_S1_20m_2020_2022");
var dem = ee.Image("USGS/3DEP/10m");

// 2. RADAR ANCHOR
var radar = s1_legacy.resample('bilinear').rename(['S1_VV', 'S1_VH', 'S1_Ratio']);

// 3. CONIFER HEALTH CALC
var winterNDVI = cube.normalizedDifference(['B8_Winter', 'B4_Winter']).rename('NDVI_Winter');
var winterNDMI = cube.normalizedDifference(['B8_Winter', 'B11_Winter']).rename('NDMI_Winter');

// 4. TERRAIN ENGINE
var terrain = ee.Terrain.products(dem);
var tpi = dem.subtract(dem.focal_mean(300, 'circle', 'meters')).rename('TPI');

// 5. ASSEMBLE FINAL STACK
var finalStack = ee.Image.cat([
  cube,
  radar,
  winterNDVI,
  winterNDMI,
  dem.rename('elevation'),
  terrain.select(['slope', 'aspect']),
  tpi
]).float();

// 6. TRAIN RANDOM FOREST
var label = 'genus_class';
var features = finalStack.bandNames();

// Scrub nulls from the training collection before training
var cleanTraining = trainingData.filter(ee.Filter.notNull(features));

var classifier = ee.Classifier.smileRandomForest(300).train({
  features: cleanTraining,
  classProperty: label,
  inputProperties: features
});

// 7. CLASSIFY & MASK
var rawSpecies = finalStack.select(features)
  .classify(classifier)
  .updateMask(tier4Mask); // Guardrail: Only maps where Tier 4 said 'Conifer'

// 8. POST-PROCESSING (Majority Filter)
var speciesMap = rawSpecies.focalMode({
  radius: 1.5,
  kernelType: 'circle',
  units: 'pixels'
}).uint8();


// // 10. EXPORT
// Export.image.toAsset({
//   image: speciesMap.rename('upland_conifer_genus'),
//   description: 'Tier5_Upland_Conifer_Genus_Map',
//   assetId: 'projects/code-test-476615/assets/Tier5/Tier5_Upland_Conifer_Genus_Map',
//   scale: 10,
//   region: wi.geometry().bounds(),
//   maxPixels: 1e13,
//   pyramidingPolicy: {'.default': 'mode'}
// });

/**-------------------------------------------------------------------
 * TIER 5: ASSET VALIDATION & VIEWER (UPLAND CONIFER)
 * Purpose: Assess the exported map asset against test data
 *-------------------------------------------------------------------*/

// 1. LOAD ASSETS
var coniferMap = ee.Image("projects/code-test-476615/assets/Tier5/Upland_Con/Tier5_Upland_Conifer_Genus_Map");
var trainingData = ee.FeatureCollection("projects/code-test-476615/assets/Tier5/Upland_Con/Tier5_Upland_Conifer_Master_Training");
var wi = ee.FeatureCollection("TIGER/2018/States").filter(ee.Filter.eq("NAME", "Wisconsin"));

// 2. AUTO-DETECT BAND NAME & PREP TEST SET
var assetBand = coniferMap.bandNames().get(0);
var testSet = trainingData.randomColumn('random').filter(ee.Filter.gte('random', 0.7));

print('Detected Asset Band Name:', assetBand);

// 3. SAMPLE THE MAP AT TEST LOCATIONS
var validationPoints = coniferMap.sampleRegions({
  collection: testSet,
  properties: ['genus_class'],
  scale: 10,
  tileScale: 16
}).filter(ee.Filter.notNull([assetBand, 'genus_class']));

// 4. GENERATE ERROR MATRIX (15=Pine, 16=Spruce/Fir, 17=Hemlock)
var errorMatrix = validationPoints.errorMatrix('genus_class', assetBand);

print('--- FINAL ASSET VALIDATION: UPLAND CONIFER ---');
print('Overall Accuracy:', errorMatrix.accuracy());
print('Kappa Coefficient:', errorMatrix.kappa());
print('Confusion Matrix:', errorMatrix);
print('Producers Accuracy (Sensitivity):', errorMatrix.producersAccuracy());
print('Users Accuracy (Precision):', errorMatrix.consumersAccuracy());

// 5. VISUALIZATION
// 15 = Pine (Deep Navy), 16 = Fir/Spruce (Teal), 17 = Hemlock (Purple/Plum)
var viz = {
  min: 15, 
  max: 17, 
  palette: ['#0d47a1', '#00838f', '#6a1b9a']
};

Map.centerObject(wi, 7);
Map.addLayer(coniferMap, viz, 'Upland Conifer Genus Map');

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
legend.add(ui.Label({value: 'Upland Conifer', style: {fontWeight: 'bold'}}));
legend.add(makeRow('#0d47a1', 'Pine (15)'));
legend.add(makeRow('#00838f', 'Fir / Spruce (16)'));
legend.add(makeRow('#6a1b9a', 'Hemlock (17)'));
Map.add(legend);

// Run this where 'classifier' is defined (Step 3 Script)
var importance = ee.Dictionary(classifier.explain().get('importance'));
var sortedImportance = importance.keys().sort(importance.values()).reverse();

print('--- TOP 10 CONIFER PREDICTORS ---');
sortedImportance.slice(0, 10).evaluate(function(keys) {
  keys.forEach(function(key) {
    print(key + ': ' + importance.get(key).getInfo().toFixed(2));
  });
});
