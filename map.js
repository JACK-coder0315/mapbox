// Import Mapbox as an ESM module
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3   from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
console.log('Mapbox GL JS Loaded:', mapboxgl);

mapboxgl.accessToken ='pk.eyJ1IjoiamFjazAzMTUiLCJhIjoiY21haTZoNjA3MGsxdTJrcHlsMjZwZjU1aSJ9.bInG4_BU-h6a-eEXGHRDEg'

// 3. 创建地图
const map = new mapboxgl.Map({
  container: 'map',                               // DOM id
  style: 'mapbox://styles/mapbox/streets-v12',    // 底图样式
  center: [-71.09415, 42.36027],                  // 经度,纬度
  zoom: 12,
  minZoom: 5,
  maxZoom: 18,
});

map.on('load', async () => {

  map.addSource('bos_lanes_2022', {
    type : 'geojson',
    data : 'data/Existing_Bike_Network_2022.geojson'
  });

  /* 4.2  公共样式（便于多图层复用） */
  const bikePaint = {
    'line-color'   : '#32d400',   // 亮绿
    'line-width'   : 3,
    'line-opacity' : 0.45
  };

  /* 4.3  实际图层 */
  map.addLayer({
    id     : 'bike-bos-2022',
    type   : 'line',
    source : 'bos_lanes_2022',
    paint  : bikePaint
  });


  map.addSource('cam_lanes', {
    type:'geojson',
    data:'data/cambridge_bike_lanes.geojson'
  });
  map.addLayer({
    id:'bike-cam',
    type:'line',
    source:'cam_lanes',
    paint:bikePaint
  });

  console.log('Bike‑lane layers added ✔');
});

const laneColors = {
  'Bike Lane'                : '#32d400',
  'Separated Bike Lane'      : '#ff4d4d',
  'Grade-Separated Bike Lane' : '#ff9d00',
  'Bike Path/Multi-Use Path' : '#0094ff',
  'Shared Lane Pavement Marking': '#808080',
  'Buffered Bike Lane'       : '#8a2be2',
  'Bus/Bike Lane'            : '#d81b60',
  'Contra-flow'              : '#795548',
  'Shared Street'            : '#00bcd4'
};

map.addLayer({
  id     : 'bike-camb',
  type   : 'line',
  source : 'camb_lanes',
  paint  : {
    'line-color'   : [
      'coalesce',
      ['get', ['to-string', ['get', 'FacilityType']], laneColors],
      '#000' // fallback
    ],
    'line-width'   : 3,
    'line-opacity' : 0.7
  }
});

map.on('mouseenter', 'bike-camb', e => {
  map.getCanvas().style.cursor = 'pointer';

  const p = e.features[0].properties;
  const html = `
    <strong>${p.STREET}</strong><br/>
    ${p.FacilityType}<br/>
    length：${(p.LaneLengthFeet/3.28).toFixed(1)} m
  `;

  new mapboxgl.Popup()
    .setLngLat(e.lngLat)
    .setHTML(html)
    .addTo(map);
});