// map.js

// === 1. 依赖（ESM） ===================================
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3      from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';

// === 2. Mapbox 令牌 ==================================
mapboxgl.accessToken = 'pk.eyJ1IjoiamFjazAzMTUiLCJhIjoiY21haTZoNjA3MGsxdTJrcHlsMjZwZjU1aSJ9.bInG4_BU-h6a-eEXGHRDEg';

// === 3. 构建地图 =====================================
const map = new mapboxgl.Map({
  container: 'map',
  style:     'mapbox://styles/mapbox/streets-v12',
  center:    [-71.09415, 42.36027],
  zoom:      12,
  minZoom:   5,
  maxZoom:   18
});

map.on('load', async () => {

  // —— 4. 图层：Boston 与 Cambridge 自行车道 ——  
  map.addSource('bos_lanes_2022', {
    type: 'geojson',
    data: 'data/Existing_Bike_Network_2022.geojson'
  });
  map.addLayer({
    id:    'bike-bos-2022',
    type:  'line',
    source:'bos_lanes_2022',
    paint: {
      'line-color':   '#32d400',
      'line-width':   3,
      'line-opacity': 0.45
    }
  });

  map.addSource('cam_lanes', {
    type: 'geojson',
    data: 'data/cambridge_bike_lanes.geojson'
  });
  const laneColors = {
    'Bike Lane':                    '#32d400',
    'Separated Bike Lane':          '#ff4d4d',
    'Grade-Separated Bike Lane':    '#ff9d00',
    'Bike Path/Multi-Use Path':     '#0094ff',
    'Shared Lane Pavement Marking': '#808080',
    'Buffered Bike Lane':           '#8a2be2',
    'Bus/Bike Lane':                '#d81b60',
    'Contra-flow':                  '#795548',
    'Shared Street':                '#00bcd4'
  };
  map.addLayer({
    id:    'bike-cam',
    type:  'line',
    source:'cam_lanes',
    paint: {
      'line-color': [
        'match', ['get','FacilityType'],
        ...Object.entries(laneColors).flat(),
        '#000'
      ],
      'line-width':   3,
      'line-opacity': 0.8
    }
  });

  // —— 5. D3 SVG Overlay for Bluebikes Stations ——  
  // (1) 在 Mapbox Canvas 容器内插入 SVG
  const container = map.getCanvasContainer();
  const svg = d3.select(container)
    .append('svg')
    .attr('class','overlay')
    .style('position','absolute')
    .style('top',0)
    .style('left',0)
    .style('width','100%')
    .style('height','100%')
    .style('pointer-events','none'); // 让地图事件透过

  const g = svg.append('g');

  // (2) 加载站点数据并初始化每个站点的流量属性
  const rawStations = await fetch('https://dsc106.com/labs/lab07/data/bluebikes-stations.json')
    .then(r => r.ok ? r.json() : Promise.reject('stations.json 404'));
  const stations = rawStations.data.stations.map(s => ({
    station_id:   s.short_name,
    lon:           +s.lon,
    lat:           +s.lat,
    departures:   0,
    arrivals:     0,
    totalTraffic: 0
  }));

  // (3) 加载并解析流量 CSV
  const trips = await d3.csv(
    'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',
    d => {
      d.started_at = new Date(d.started_at);
      d.ended_at   = new Date(d.ended_at);
      return d;
    }
  );

  // (4) 统计函数：给定一组 trips，更新 stations 中的 departures/arrivals/totalTraffic
  function updateStats(filteredTrips) {
    const dep = d3.rollup(filteredTrips, v => v.length, d => d.start_station_id);
    const arr = d3.rollup(filteredTrips, v => v.length, d => d.end_station_id);
    stations.forEach(st => {
      st.departures   = dep.get(st.station_id) ?? 0;
      st.arrivals     = arr.get(st.station_id) ?? 0;
      st.totalTraffic = st.departures + st.arrivals;
    });
  }
  updateStats(trips);

  // (5) 构造比例尺：sqrt 缩放，最大半径 25px
  const maxTraffic   = d3.max(stations, st => st.totalTraffic);
  const radiusScale  = d3.scaleSqrt()
    .domain([0, maxTraffic])
    .range([0, 25]);

  // (6) 投影函数：经纬度 → Mapbox 像素坐标
  function project(d) {
    return map.project([d.lon, d.lat]);
  }

  // (7) 渲染函数：绘制/更新所有 circles
  function render() {
    const u = g.selectAll('circle')
      .data(stations, d => d.station_id);

    u.join(
      enter => enter.append('circle')
        .attr('fill','steelblue')
        .attr('fill-opacity',0.6)
        .attr('stroke','white')
        .attr('stroke-width',1)
        .attr('r', d => radiusScale(d.totalTraffic))
        .attr('cx', d => project(d).x)
        .attr('cy', d => project(d).y),
      update => update
        .attr('r', d => radiusScale(d.totalTraffic))
        .attr('cx', d => project(d).x)
        .attr('cy', d => project(d).y),
      exit => exit.remove()
    );
  }

  // 初始渲染 & 绑定 map 交互事件
  render();
  map.on('move', render);
  map.on('moveend', render);

  // —— 6. 滑块交互（Step 5） ——  
  // 格式化分钟到 AM/PM
  function formatTime(minutes) {
    const d = new Date(0,0,0,0,minutes);
    return d.toLocaleString('en-US',{timeStyle:'short'});
  }

  const timeSlider   = document.getElementById('time-slider');
  const selectedTime = document.getElementById('selected-time');
  const anyTimeLabel = document.getElementById('any-time');

  timeSlider.addEventListener('input', () => {
    const t = +timeSlider.value;
    if (t === -1) {
      selectedTime.textContent   = '';
      anyTimeLabel.style.display = 'block';
    } else {
      selectedTime.textContent   = formatTime(t);
      anyTimeLabel.style.display = 'none';
    }
    // 过滤出发时间在 t 分钟内的 trips
    const filtered = t < 0
      ? trips
      : trips.filter(trip => {
          const mins = trip.started_at.getHours() * 60
                     + trip.started_at.getMinutes();
          return mins <= t;
        });

    // 重新统计并渲染
    updateStats(filtered);
    render();
  });

  // 触发一次初始过滤 & 渲染
  timeSlider.dispatchEvent(new Event('input'));

}); // end map.on('load')

// —— 7. 图层开关 Toggle ——  
function toggle(chkId, layerId) {
  document.getElementById(chkId).addEventListener('change', e => {
    map.setLayoutProperty(
      layerId,
      'visibility',
      e.target.checked ? 'visible' : 'none'
    );
  });
}
toggle('chk-bos',  'bike-bos-2022');
toggle('chk-cam',  'bike-cam');
toggle('chk-blue','bluebikes-circle');
