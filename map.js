
/* --------------------------------------------------------
 * map.js ‑ Boston / Cambridge 自行车道 + Bluebikes 可视化
 * ------------------------------------------------------ */

/* === 1. 依赖（ESM） =================================== */
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
console.log('Mapbox GL JS Loaded:', mapboxgl);

/* === 2. Mapbox 令牌 ================================== */
mapboxgl.accessToken = 'pk.eyJ1IjoiamFjazAzMTUiLCJhIjoiY21haTZoNjA3MGsxdTJrcHlsMjZwZjU1aSJ9.bInG4_BU-h6a-eEXGHRDEg';

/* === 3. 构建地图 ===================================== */
const map = new mapboxgl.Map({
  container:'map',
  style   :'mapbox://styles/mapbox/streets-v12',
  center  :[-71.09415, 42.36027],
  zoom    :12,
  minZoom :5,
  maxZoom :18
});

/* =============== 4. 图层 ============================== */
map.on('load', async () => {

  /* 4.1 Boston 2022 Bike‑lanes (统一绿色) --------------- */
  map.addSource('bos_lanes_2022',{type:'geojson',data:'data/Existing_Bike_Network_2022.geojson'});
  map.addLayer({
    id:'bike-bos-2022',type:'line',source:'bos_lanes_2022',
    paint:{'line-color':'#32d400','line-width':3,'line-opacity':0.45}
  });

  /* 4.2 Cambridge 车道（彩色） ------------------------- */
  map.addSource('cam_lanes',{type:'geojson',data:'data/cambridge_bike_lanes.geojson'});
  const laneColors={
    'Bike Lane':'#32d400','Separated Bike Lane':'#ff4d4d',
    'Grade-Separated Bike Lane':'#ff9d00','Bike Path/Multi-Use Path':'#0094ff',
    'Shared Lane Pavement Marking':'#808080','Buffered Bike Lane':'#8a2be2',
    'Bus/Bike Lane':'#d81b60','Contra-flow':'#795548','Shared Street':'#00bcd4'
  };
  map.addLayer({
    id:'bike-cam',type:'line',source:'cam_lanes',
    paint:{
      'line-color':['match',['get','FacilityType'],...Object.entries(laneColors).flat(),'#000'],
      'line-width':3,'line-opacity':0.8
    }
  });

  /* 4.3 Bluebikes 站点 -------------------------------- */
  const raw=await fetch('data/bluebikes-stations.json').then(r=>r.json());
  const blueGeo={type:'FeatureCollection',features:raw.data.stations.map(s=>({
    type:'Feature',
    geometry:{type:'Point',coordinates:[+s.lon,+s.lat]},
    properties:{capacity:+s.capacity}
  }))};
  map.addSource('bluebikes',{type:'geojson',data:blueGeo});
  map.addLayer({
    id:'bluebikes-circle',type:'circle',source:'bluebikes',
    paint:{
      'circle-radius':['interpolate',['linear'],['get','capacity'],10,4,40,10,80,16],
      'circle-color':'#0074D9','circle-opacity':0.85,
      'circle-stroke-color':'#fff','circle-stroke-width':1
    }
  });

  console.log('✅ layers added');
});

/* =============== 5. 图层显隐开关 ===================== */
['bos','cam','blue'].forEach(([abbr,layer])=>{
  /* 这里只是为了书写简洁，真正执行请用下面单独写出的三行 👇 */
});
function toggle(chkId,layerId){
  document.getElementById(chkId).addEventListener('change',e=>{
    map.setLayoutProperty(layerId,'visibility',e.target.checked?'visible':'none');
  });
}
toggle('chk-bos','bike-bos-2022');
toggle('chk-cam','bike-cam');
toggle('chk-blue','bluebikes-circle');