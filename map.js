/* --------------------------------------------------------
 * map.js ‑ Boston / Cambridge 车道 + Bluebikes 可视化
 * ------------------------------------------------------ */

/* === 1. 依赖 ============================================= */
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3   from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
console.log('Mapbox GL JS:', mapboxgl, 'D3:', d3);

/* === 2. Mapbox Token ==================================== */
mapboxgl.accessToken =
  'pk.eyJ1IjoiamFjazAzMTUiLCJhIjoiY21haTZoNjA3MGsxdTJrcHlsMjZwZjU1aSJ9.bInG4_BU-h6a-eEXGHRDEg';

/* === 3. 初始化底图 ====================================== */
const map = new mapboxgl.Map({
  container : 'map',
  style     : 'mapbox://styles/mapbox/streets-v12',
  center    : [-71.09415, 42.36027],
  zoom      : 12,
  minZoom   : 5,
  maxZoom   : 18
});

/* --------------------------------------------------------
 * 4. 计算站点交通量的工具函数（Step 4 新建）
 * ------------------------------------------------------ */
function computeStationTraffic(stations, trips) {

  // 4‑A 计算 departures / arrivals
  const departures = d3.rollup(trips, v => v.length, d => d.start_station_id);
  const arrivals   = d3.rollup(trips, v => v.length, d => d.end_station_id);

  // 4‑B 给每个站点补充三个字段
  return stations.map(st => {
    const id = st.properties.id;            // 我们在 ↓ 4.3 构造 id
    st.properties.departures   = departures.get(id) ?? 0;
    st.properties.arrivals     = arrivals.get(id)   ?? 0;
    st.properties.totalTraffic =
      st.properties.departures + st.properties.arrivals;
    return st;
  });
}

/* --------------------------------------------------------
 * 5. 所有图层 – 必须等到底图样式加载完
 * ------------------------------------------------------ */
map.on('load', async () => {

  /* ---------- 5.1 Boston 2022 车道（全部绿色） --------- */
  map.addSource('bos_lanes_2022', {
    type : 'geojson',
    data : 'data/Existing_Bike_Network_2022.geojson'
  });
  map.addLayer({
    id     : 'bike-bos-2022',
    type   : 'line',
    source : 'bos_lanes_2022',
    paint  : { 'line-color':'#32d400', 'line-width':3, 'line-opacity':0.45 }
  });

  /* ---------- 5.2 Cambridge 车道（按类型上色） --------- */
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
    id     : 'bike-cam',
    type   : 'line',
    source : 'cam_lanes',
    paint  : {
      'line-color': [
        'match', ['get','FacilityType'],
        ...Object.entries(laneColors).flat(),   // key,value,key,value…
        '#000000'
      ],
      'line-width'  : 3,
      'line-opacity': 0.8
    }
  });

  /* ---------- 5.3 Bluebikes 站点 & 交通 (Step 3+4) ----- */

  // 5‑A 站点列表（JSON）
  const stationsRaw = await fetch('data/bluebikes-stations.json').then(r=>r.json());

  // 5‑B 交通 (CSV 21 MB；首次加载稍慢)
  const trips = await d3.csv('data/bluebikes-traffic-2024-03.csv', d => ({
    start_station_id : d.start_station_id,
    end_station_id   : d.end_station_id
  }));

  // 5‑C 先把站点转成 GeoJSON，再计算 traffic
  let bluebikesGeo = {
    type     : 'FeatureCollection',
    features : stationsRaw.data.stations.map(s => ({
      type       : 'Feature',
      geometry   : { type:'Point', coordinates:[+s.lon, +s.lat] },
      properties : {
        id       : s.station_id,
        name     : s.name,
        capacity : +s.capacity
      }
    }))
  };
  bluebikesGeo.features = computeStationTraffic(bluebikesGeo.features, trips);

  // 5‑D 生成 √root 半径比例尺（0 → 0px,  max → 25px）
  const maxTraffic = d3.max(bluebikesGeo.features,
                            f => f.properties.totalTraffic);
  const radiusScale = d3.scaleSqrt().domain([0, maxTraffic]).range([0, 25]);

  // 把半径存在属性里（Mapbox expression 里直接 get ）
  bluebikesGeo.features.forEach(f => {
    f.properties.circleR = +radiusScale(f.properties.totalTraffic).toFixed(2);
  });

  // 5‑E 数据源 + 图层
  map.addSource('bluebikes', { type:'geojson', data:bluebikesGeo });
  map.addLayer({
    id     : 'bluebikes-circle',
    type   : 'circle',
    source : 'bluebikes',
    paint  : {
      'circle-radius'        : ['get','circleR'],
      'circle-color'         : '#0074D9',
      'circle-opacity'       : 0.6,
      'circle-stroke-color'  : '#ffffff',
      'circle-stroke-width'  : 1
    }
  });

  console.log('✅  layers added (bike lanes + stations + traffic)');
});
