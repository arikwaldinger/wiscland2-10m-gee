/**
 * TIER 6: THE MASTER MOSAIC (FIXED)
 * Resolves band name incompatibility errors.
 */

// 1. Load the Assets
var uplandDec = ee.Image("projects/code-test-476615/assets/Tier5/Upland_Dec/Tier5_Upland_Deciduous_Genus_Map");
var uplandCon = ee.Image("projects/code-test-476615/assets/Tier5/Upland_Con/Tier5_Upland_Conifer_Genus_Map");
var lowDec    = ee.Image("projects/code-test-476615/assets/Tier5/Low_Dec/Tier5_Lowland_Deciduous_Genus_Map");
var lowCon    = ee.Image("projects/code-test-476615/assets/Tier4/Tier4_Lowland_Map");

// 2. Normalize Bands (The Fix)
// We select the first band [0] and rename it to 'lc' for every image
var ud = uplandDec.select([0], ['lc']).toInt();
var uc = uplandCon.select([0], ['lc']).toInt();
var ld = lowDec.select([0], ['lc']).toInt();

// 3. Prepare the Lowland Conifer Placeholder
// Remap Tier 4 (1=Conifer, 2=Deciduous) to unique IDs
var lc = lowCon.select([0]).remap([1, 2], [19, 0]).selfMask().rename('lc').toInt();

// 4. Create the Master Mosaic
// The order matters: the first images in the list sit on "top"
var masterMosaic = ee.ImageCollection([
  lc,
  ld,
  uc,
  ud
]).mosaic();

// 5. Define the Final Classification Legend & Palette
var finalPalette = [
  '#005a32', // 10: Bottomland Hardwoods
  '#238b45', // 11: Swamp Hardwoods/Ash
  '#fe9929', // 12: Oak
  '#d94701', // 13: Maple
  '#ffff33', // 14: Aspen/Birch
  '#084594', // 15: Pine
  '#4292c6', // 16: Spruce/Fir
  '#807dba', // 17: Hemlock
  '#00441b'  // 19: General Lowland Conifer
];

// 6. Display Result
var wi = ee.FeatureCollection("TIGER/2018/States").filter(ee.Filter.eq("NAME", "Wisconsin"));
Map.centerObject(wi, 7);
Map.addLayer(masterMosaic, {min: 10, max: 19, palette: finalPalette}, "Wisconsin Master Forest Mosaic");

// 7. Export the Final Product
Export.image.toDrive({
  image: masterMosaic,
  description: 'Wisconsin_Statewide_Forest_Genus_Mosaic_2026',
  scale: 10,
  region: wi.geometry().bounds(),
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF'
});

// ============================================================
// STEP 7: CREATE UI LEGEND & CONSOLE SUMMARY
// ============================================================

// 1. Define the Legend Data
var names = [
  '10: Bottomland Hardwoods',
  '11: Swamp Hardwoods/Ash',
  '12: Oak',
  '13: Maple',
  '14: Aspen/Birch',
  '15: Pine',
  '16: Spruce/Fir',
  '17: Hemlock',
  '19: Lowland Conifer (Gen)'
];

var colors = ['#005a32', '#238b45', '#fe9929', '#d94701', '#ffff33', '#084594', '#4292c6', '#807dba', '#00441b'];

// 2. Create the Console Summary
print('--- FOREST GENUS CLASSIFICATION LEGEND ---');
for (var i = 0; i < names.length; i++) {
  print(names[i], colors[i]);
}

// 3. Set up the Legend Panel
var legend = ui.Panel({
  style: {
    position: 'bottom-right',
    padding: '8px 15px',
    border: '1px solid black'
  }
});

// 4. Create Legend Title
var legendTitle = ui.Label({
  value: 'Wisconsin Forest Genus',
  style: {
    fontWeight: 'bold',
    fontSize: '16px',
    margin: '0 0 4px 0',
    padding: '0'
    }
});
legend.add(legendTitle);

// 5. Create the Legend Rows
var makeRow = function(color, name) {
  var colorBox = ui.Label({
    style: {
      backgroundColor: color,
      padding: '8px',
      margin: '0 0 4px 0'
    }
  });
  var description = ui.Label({
    value: name,
    style: {margin: '0 0 4px 6px'}
  });
  return ui.Panel({
    widgets: [colorBox, description],
    layout: ui.Panel.Layout.Flow('horizontal')
  });
};

for (var i = 0; i < names.length; i++) {
  legend.add(makeRow(colors[i], names[i]));
}

// 6. Add the legend to the map
Map.add(legend);
