// // ============================================================
// // STEP 2: Load State-Wide Points, Evaluate, and Map
// // ============================================================

// // ------------------------------
// // 1. Rebuild the Target Image
// // ------------------------------
// var wi = ee.FeatureCollection("TIGER/2018/States")
//   .filter(ee.Filter.eq("NAME", "Wisconsin"));

// Map.centerObject(wi, 6);

// function maskS2clouds(image) {
//   var scl = image.select("SCL");
//   var mask = scl.neq(3)    // shadow
//     .and(scl.neq(8))       // cloud medium
//     .and(scl.neq(9))       // cloud high
//     .and(scl.neq(10))      // cirrus
//     .and(scl.neq(11));     // snow
//   return image.updateMask(mask);
// }

// var s2 = ee.ImageCollection("COPERNICUS/S2_SR")
//   .filterBounds(wi)
//   .filterDate("2025-05-01", "2025-09-30")
//   .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
//   .map(maskS2clouds)
//   .select(["B2","B3","B4","B8","B11"]);

// var composite = s2.median().clip(wi);

// var blue  = composite.select("B2");
// var green = composite.select("B3");
// var red   = composite.select("B4");
// var nir   = composite.select("B8");
// var swir1 = composite.select("B11");

// var ndwi  = green.subtract(nir).divide(green.add(nir)).rename("NDWI");
// var mndwi = green.subtract(swir1).divide(green.add(swir1)).rename("MNDWI");
// var ndvi  = nir.subtract(red).divide(nir.add(red)).rename("NDVI");

// var dem = ee.Image("USGS/3DEP/10m")
//   .select("elevation")
//   .rename("elevation");

// // Here is the missing tier1Image!
// var tier1Image = ee.Image.cat([
//   blue, green, red, nir, swir1,
//   ndwi, mndwi, ndvi,
//   dem
// ]);

// // ------------------------------
// // 2. Load the Exported Training Points
// // ------------------------------
// // Make sure this path exactly matches where your Step 1 export saved the points
// var allSamples = ee.FeatureCollection("projects/code-test-476615/assets/Tier1/Tier1_TrainingPoints_Statewide_v2");

// // Split data: 70% for training, 30% for validation
// var withRandom = allSamples.randomColumn('random', 42);
// var trainingData = withRandom.filter(ee.Filter.lt('random', 0.7));
// var testingData = withRandom.filter(ee.Filter.gte('random', 0.7));

// print("Training points:", trainingData.size());
// print("Testing points:", testingData.size());

// // ------------------------------
// // 3. Train Random Forest & Evaluate
// // ------------------------------
// var classifierDiscrete = ee.Classifier.smileRandomForest({
//   numberOfTrees: 200, minLeafPopulation: 5, bagFraction: 0.7, seed: 42
// }).train({
//   features: trainingData,
//   classProperty: "class",
//   inputProperties: tier1Image.bandNames()
// });

// var validated = testingData.classify(classifierDiscrete, "predicted");

// var errorMatrix = validated.errorMatrix({
//   actual: "class", predicted: "predicted", order: [0, 1]
// });

// print('Confusion Matrix (Row=Actual, Col=Predicted):', errorMatrix);
// print('Overall Accuracy:', errorMatrix.accuracy());
// print('Kappa Coefficient:', errorMatrix.kappa());

// // Custom Jaccard Index for Water (Class 1)
// var matrixArray = ee.Array(errorMatrix.array());
// var tp = ee.Number(matrixArray.get([1, 1])); 
// var fp = ee.Number(matrixArray.get([0, 1])); 
// var fn = ee.Number(matrixArray.get([1, 0])); 

// var jaccardWater = tp.divide(tp.add(fp).add(fn));
// print('Jaccard Index (Water):', jaccardWater);

// // ------------------------------
// // 4. Classify & Export
// // ------------------------------
// var classifierProb = classifierDiscrete.setOutputMode('PROBABILITY');
// var waterProb = tier1Image.classify(classifierProb, "water_prob").rename("water_prob");

// Map.addLayer(waterProb, {min: 0, max: 1, palette: ["tan", "blue"]}, "Tier 1 Water Probability");

// Export.image.toAsset({
//   image: waterProb,
//   description: "Tier1_LandWater_WaterProb_2025_FIXED",
//   assetId: "projects/code-test-476615/assets/Tier1_LandWater_WaterProb_2025_FIXED",
//   region: wi.geometry(),
//   scale: 10,
//   maxPixels: 1e13
// });




/**
 * TIER 1: FINAL VALIDATION & VARIABLE IMPORTANCE
 * Asset: Tier1_LandWater_WaterProb_2025_FIXED
 */

// 1. LOAD ASSETS
var waterProb = ee.Image("projects/code-test-476615/assets/Tier1/Tier1_LandWater_WaterProb_2025_FIXED");
var allSamples = ee.FeatureCollection("projects/code-test-476615/assets/Tier1/Tier1_TrainingPoints_Statewide_v2");
var wi = ee.FeatureCollection("TIGER/2018/States").filter(ee.Filter.eq("NAME", "Wisconsin"));

// 2. RECREATE THE CLASSIFIER FOR VARIABLE IMPORTANCE
// (GEE cannot extract importance from a saved Image, only from the Classifier object)
var withRandom = allSamples.randomColumn('random', 42);
var trainingData = withRandom.filter(ee.Filter.lt('random', 0.7));
var testingData = withRandom.filter(ee.Filter.gte('random', 0.7));

// Define predictors exactly as they were in training
var predictors = ["B2","B3","B4","B8","B11","NDWI","MNDWI","NDVI","elevation"];

var classifier = ee.Classifier.smileRandomForest(200).train({
  features: trainingData,
  classProperty: "class",
  inputProperties: predictors
});

// 3. GENERATE ERROR MATRIX
// Convert probability image to discrete (Water if prob > 0.5)
var discreteMap = waterProb.gt(0.5).rename('predicted');

var validated = discreteMap.sampleRegions({
  collection: testingData,
  properties: ['class'],
  scale: 10
});

var errorMatrix = validated.errorMatrix('class', 'predicted');

// 4. PRINT RESULTS
print('--- TIER 1 VALIDATION: LAND vs WATER ---');
print('Overall Accuracy:', errorMatrix.accuracy());
print('Kappa Coefficient:', errorMatrix.kappa());
print('Confusion Matrix (Row=Actual, Col=Predicted):', errorMatrix);
print('Producers Accuracy (0=Land, 1=Water):', errorMatrix.producersAccuracy());
print('Users Accuracy (0=Land, 1=Water):', errorMatrix.consumersAccuracy());

// 5. VARIABLE IMPORTANCE
var importance = ee.Dictionary(classifier.explain().get('importance'));
var sortedImportance = importance.keys().sort(importance.values()).reverse();

print('--- VARIABLE IMPORTANCE (Predictor Rank) ---');
sortedImportance.evaluate(function(keys) {
  keys.forEach(function(key) {
    var val = importance.get(key).getInfo().toFixed(2);
    print(key + ': ' + val);
  });
});

// 6. VISUALIZATION
Map.centerObject(wi, 7);
Map.addLayer(waterProb, {min: 0, max: 1, palette: ['#dfc27d', '#018571']}, 'Water Probability');
Map.addLayer(discreteMap.selfMask(), {palette: ['blue']}, 'Final Water Mask (>0.5)');
