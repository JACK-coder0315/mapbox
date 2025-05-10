/* --------------------------------------------------------
 * map.js ‑ Boston / Cambridge 自行车道 + Bluebikes 可视化
 * ------------------------------------------------------ */

/* === 1. 以 ESM 方式引入依赖 ==================================== */
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3   from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';   // 目前没用到，留作扩展
console.log('Mapbox GL JS Loaded:', mapboxgl, 'D3 Loaded:', d3);

/* === 2. Mapbox 令牌 =========================================== */
mapboxgl.accessToken = 'pk.eyJ1IjoiamFjazAzMTUiLCJhIjoiY21haTZoNjA3MGsxdTJrcHlsMjZwZjU1aSJ9.bInG4_BU-h6a-eEXGHRDEg';

/* === 3. 创建地图 ============================================= */
const map = new mapboxgl.Map({
  container: 'map',                               // <div id="map">
  style    : 'mapbox://styles/mapbox/streets-v12', // 或者 dark / light / satellite…
  center   : [-71.09415, 42.36027],                // Cambridge 中心
  zoom     : 12,
  minZoom  : 5,
  maxZoom  : 18
});

/* -------------------------------------------------------------
 * 4. 图层与交互 —— 依赖底图样式加载完毕后再添加
 * ----------------------------------------------------------- */
map.on('load', async()=>{

  /* ---------- 4.1  Boston 2022 车道（全部绿色，做个参照） ---- */
  map.addSource('bos_lanes_2022',{
    type : 'geojson',
    data : 'data/Existing_Bike_Network_2022.geojson'
  });
  map.addLayer({
    id     : 'bike-bos-2022',
    type   : 'line',
    source : 'bos_lanes_2022',
    paint  : {
      'line-color'  : '#32d400',
      'line-width'  : 3,
      'line-opacity': 0.45
    }
  });

  /* ---------- 4.2  Cambridge 车道（按 FacilityType 着色） ---- */
  map.addSource('cam_lanes',{
    type : 'geojson',
    data : 'data/cambridge_bike_lanes.geojson'
  });

  const laneColors = {                       // 同一份配置，方便调色
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
    id     : 'bike-cam',
    type   : 'line',
    source : 'cam_lanes',
    paint  : {
      'line-color': [
        'match', ['get','FacilityType'],
        ...Object.entries(laneColors).flat(),   // 把上面对象拆成 [key, value, key, value…]
        '#000'                                 // 兜底：未知类型 → 黑
      ],
      'line-width'  : 3,
      'line-opacity': 0.8
    }
  });

  /* ---------- 4.3  Bluebikes 站点 ----------------------------- */
  // 4.3.1 载入站点 JSON
  const raw = await fetch('data/bluebikes-stations.json').then(r=>r.json());

  // 4.3.2 转成 GeoJSON Point
  const bluebikesGeo = {
    type     : 'FeatureCollection',
    features : raw.data.stations.map(s=>({
      type       : 'Feature',
      geometry   : { type:'Point', coordinates:[+s.lon, +s.lat] },
      properties : {
        id       : s.station_id,
        name     : s.name,
        capacity : +s.capacity
      }
    }))
  };

  // 4.3.3 数据源 + 图层（circle）
  map.addSource('bluebikes',{ type:'geojson', data:bluebikesGeo });

  map.addLayer({
    id     : 'bluebikes‑circle',
    type   : 'circle',
    source : 'bluebikes',
    paint  : {
      'circle-radius' : [
        'interpolate', ['linear'], ['get','capacity'],
        10, 4,      // capacity 10 → 4px
        40, 10,     // capacity 40 → 10px
        80, 16      // capacity 80 → 16px
      ],
      'circle-color'        : '#0074D9',
      'circle-opacity'      : 0.85,
      'circle-stroke-color' : '#fff',
      'circle-stroke-width' : 1
    }
  });

  /* ---------- 完成日志 --------------------------------------- */
  console.log('✅  Bike‑lane & Bluebikes layers added');
});
