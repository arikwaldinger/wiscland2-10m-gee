/**
 * TIER 5: STEP 1 - SKELETON GENERATOR (LOWLAND-CONIFER)
 * REPAIR: Buffered mask to capture Tamarack pixels near edges.
 */
var wisclandRaw = ee.Image("projects/code-test-476615/assets/wiscland2_level3");
var wi = ee.FeatureCollection("TIGER/2018/States").filter(ee.Filter.eq("NAME", "Wisconsin"));
var lowlandMask = ee.Image("projects/code-test-476615/assets/Tier4/Tier4_Lowland_Map");

// 1. Prepare Wiscland
var wiscland = wisclandRaw.select([0], ['landcover']).toInt32();

// 2. BUFFER THE MASK (The "Reach")
// We dilate the mask by 2 pixels (20m) to catch Tamarack on the transition edges
var bufferedMask = lowlandMask.focalMax({radius: 2, units: 'pixels'});

// 3. THE FAST SAMPLER - Crank up the density
var fastSample = wiscland.sample({
  region: wi.geometry().bounds(),
  scale: 10,
  numPixels: 10000, // 100k points to ensure we hit the rare bogs
  geometries: true,
  tileScale: 16
});

// 4. SPATIAL FILTER & COORDINATES
var processedPoints = fastSample.map(function(f) {
  var geom = f.geometry();
  var coords = geom.coordinates();
  
  // Use the buffered mask to check validity
  var maskVal = bufferedMask.reduceRegion({
    reducer: ee.Reducer.first(),
    geometry: geom,
    scale: 10
  }).values().get(0); 
  
  return f.set({
    'long_val': coords.get(0),
    'lat_val': coords.get(1),
    'tier4_check': maskVal
  });
}).filter(ee.Filter.notNull(['tier4_check']));

// 5. FILTER FOR SPECIES
// Class 19: General Lowland Conifer (6410)
var points19 = processedPoints.filter(ee.Filter.eq('landcover', 6410))
  .map(function(f) { return f.set('genus_clas', 19); });

// Class 20: Tamarack (6413)
var points20 = processedPoints.filter(ee.Filter.eq('landcover', 6413))
  .map(function(f) { return f.set('genus_clas', 20); });

var skeleton = points19.merge(points20);

// 6. PRINT CHECK
print('--- SKELETON RECOVERY RESULTS ---');
print('Class 19 (General) Count:', points19.size());
print('Class 20 (Tamarack) Count:', points20.size());

// // 7. EXPORT
// Export.table.toDrive({
//     collection: skeleton,
//     description: 'Tier5_Lowland_Conifer_Skeleton_V5',
//     fileFormat: 'CSV',
//     selectors: ['long_val', 'lat_val', 'landcover', 'genus_clas'] 
// });
