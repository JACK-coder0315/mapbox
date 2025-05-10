// Import Mapbox as an ESM module
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
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

// 4. 仅作检测：地图加载完在控制台打印一次
map.on('load', () => console.log('Map loaded!'));