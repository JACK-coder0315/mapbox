/* --------------------------------------------------------
 * map.js – Boston / Cambridge 自行车道可视化
 * ------------------------------------------------------ */

import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
console.log('Mapbox GL JS Loaded:', mapboxgl);

mapboxgl.accessToken =
  'pk.eyJ1IjoiamFjazAzMTUiLCJhIjoiY21haTZoNjA3MGsxdTJrcHlsMjZwZjU1aSJ9.bInG4_BU-h6a-eEXGHRDEg';

const map = new mapboxgl.Map({
  container: 'map',
  style   : 'mapbox://styles/mapbox/streets-v12',
  center  : [-71.09415, 42.36027],
  zoom    : 12
});

map.on('load', () => {

  /* Boston 2022 */
  map.addSource('bos', {
    type:'geojson',
    data:'data/Existing_Bike_Network_2022.geojson'
  });
  map.addLayer({
    id:'bos-lanes',
    type:'line',
    source:'bos',
    paint:{
      'line-color':'#32d400',
      'line-width':3,
      'line-opacity':0.45
    }
  });

  /* Cambridge */
  map.addSource('cam',{
    type:'geojson',
    data:'data/cambridge_bike_lanes.geojson'
  });

  const colors={
    'Bike Lane':'#32d400',
    'Separated Bike Lane':'#ff4d4d',
    'Grade-Separated Bike Lane':'#ff9d00',
    'Bike Path/Multi-Use Path':'#0094ff',
    'Shared Lane Pavement Marking':'#808080',
    'Buffered Bike Lane':'#8a2be2',
    'Bus/Bike Lane':'#d81b60',
    'Contra-flow':'#795548',
    'Shared Street':'#00bcd4'
  };

  map.addLayer({
    id:'cam-lanes',
    type:'line',
    source:'cam',
    paint:{
      'line-color':[
        'match',['get','FacilityType'],
        ...Object.entries(colors).flat(),
        '#000'
      ],
      'line-width':3,
      'line-opacity':0.8
    }
  });

  console.log('Bike‑lane layers added ✔');
});
