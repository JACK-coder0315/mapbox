/* --------------------------------------------------------
 * map.js ‑ Boston / Cambridge 自行车道可视化
 * ------------------------------------------------------ */

// 1. 以 ESM 方式引入依赖
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3   from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
console.log('Mapbox GL JS Loaded:', mapboxgl, 'D3 Loaded:', d3);

// 2. Mapbox 令牌
mapboxgl.accessToken = 'pk.eyJ1IjoiamFjazAzMTUiLCJhIjoiY21haTZoNjA3MGsxdTJrcHlsMjZwZjU1aSJ9.bInG4_BU-h6a-eEXGHRDEg';

// 3. 创建地图
const map = new mapboxgl.Map({
  container: 'map',                               // <div id="map">
  style    : 'mapbox://styles/mapbox/streets-v12', // 底图样式
  center   : [-71.09415, 42.36027],                // 视角中心：Cambridge
  zoom     : 12,
  minZoom  : 5,
  maxZoom  : 18
});

// 4. 数据与图层 —— 在样式加载完成后一次性添加
map.on('load', () => {

  /* ---------- 4.1  数据源 ---------- */
  map.addSource('bos_lanes_2022', {
    type : 'geojson',
    data : 'data/Existing_Bike_Network_2022.geojson'
  });

  map.addSource('cam_lanes', {
    type : 'geojson',
    data : 'data/cambridge_bike_lanes.geojson'
  });

  /* ---------- 4.2  备份用：全部绿色的 Boston 2022 车道 ---------- */
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

  /* ---------- 4.3  Cambridge 车道分类型着色 ---------- */
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
    id     : 'bike-cam',
    type   : 'line',
    source : 'cam_lanes',
    paint  : {
      'line-color': [
        'match', ['get', 'FacilityType'],
        'Bike Lane',                    laneColors['Bike Lane'],
        'Separated Bike Lane',          laneColors['Separated Bike Lane'],
        'Grade-Separated Bike Lane',    laneColors['Grade-Separated Bike Lane'],
        'Bike Path/Multi-Use Path',     laneColors['Bike Path/Multi-Use Path'],
        'Shared Lane Pavement Marking', laneColors['Shared Lane Pavement Marking'],
        'Buffered Bike Lane',           laneColors['Buffered Bike Lane'],
        'Bus/Bike Lane',                laneColors['Bus/Bike Lane'],
        'Contra-flow',                  laneColors['Contra-flow'],
        'Shared Street',                laneColors['Shared Street'],
        /* 其它未知类型：黑色 */
        '#000000'
      ],
      'line-width'  : 3,
      'line-opacity': 0.8
    }
  });

  /* ---------- 4.4  悬停信息弹窗 ---------- */
  map.on('mouseenter', 'bike-cam', e => {
    map.getCanvas().style.cursor = 'pointer';

    const p = e.features[0].properties;
    const html = `
      <strong>${p.STREET}</strong><br/>
      ${p.FacilityType}<br/>
      length：${(p.LaneLengthFeet / 3.28).toFixed(1)} m
    `;

    new mapboxgl.Popup()
      .setLngLat(e.lngLat)
      .setHTML(html)
      .addTo(map);
  });

  map.on('mouseleave', 'bike-cam', () => {
    map.getCanvas().style.cursor = '';
  });

  console.log('Bike‑lane layers added ✔');
});
