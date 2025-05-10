/* --------------------------------------------------------
 * map.js – Boston / Cambridge 自行车道可视化
 * ------------------------------------------------------ */

// 1. 只引入 Mapbox‑GL
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
console.log('Mapbox GL JS Loaded:', mapboxgl);

// 2. Mapbox 令牌
mapboxgl.accessToken =
  'pk.eyJ1IjoiamFjazAzMTUiLCJhIjoiY21haTZoNjA3MGsxdTJrcHlsMjZwZjU1aSJ9.bInG4_BU-h6a-eEXGHRDEg';

// 3. 创建地图
const map = new mapboxgl.Map({
  container: 'map',
  style   : 'mapbox://styles/mapbox/streets-v12',
  center  : [-71.09415, 42.36027],
  zoom    : 12,
  minZoom : 5,
  maxZoom : 18
});

// 4. 数据与图层
map.on('load', () => {

  /* 4.1  Boston（全部绿色，做底图） */
  map.addSource('bos_lanes_2022', {
    type : 'geojson',
    data : 'data/Existing_Bike_Network_2022.geojson'
  });

  map.addLayer({
    id    : 'bike-bos-2022',
    type  : 'line',
    source: 'bos_lanes_2022',
    paint : {
      'line-color'  : '#32d400',
      'line-width'  : 3,
      'line-opacity': 0.45
    }
  });

  /* 4.2  Cambridge（按类型着色，覆盖在上面） */
  map.addSource('cam_lanes', {
    type : 'geojson',
    data : 'data/cambridge_bike_lanes.geojson'
  });

  const laneColors = {
    'Bike Lane'                   : '#32d400',
    'Separated Bike Lane'         : '#ff4d4d',
    'Grade-Separated Bike Lane'   : '#ff9d00',
    'Bike Path/Multi-Use Path'    : '#0094ff',
    'Shared Lane Pavement Marking': '#808080',
    'Buffered Bike Lane'          : '#8a2be2',
    'Bus/Bike Lane'               : '#d81b60',
    'Contra-flow'                 : '#795548',
    'Shared Street'               : '#00bcd4'
  };

  map.addLayer({
    id    : 'bike-cam',
    type  : 'line',
    source: 'cam_lanes',
    paint : {
      'line-color': [
        'match', ['get', 'FacilityType'],
        ...Object.entries(laneColors).flat(),     // 依次展开 (key, value, key, value…)
        '#000000'                                // 兜底色
      ],
      'line-width'  : 3,
      'line-opacity': 0.80
    }
  });

  console.log('Bike‑lane layers added ✔');
});
