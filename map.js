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
  const container = map.getCanvasContainer();
  const svg = d3.select(container)
    .append('svg')
    .attr('class','overlay')
    .style('position','absolute')
    .style('top',0)
    .style('left',0)
    .style('width','100%')
    .style('height','100%')
    .style('pointer-events','none');

  const g = svg.append('g');

  // 加载站点数据
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

  // 加载并解析流量 CSV
  const trips = await d3.csv(
    'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',
    d => {
      d.started_at = new Date(d.started_at);
      d.ended_at   = new Date(d.ended_at);
      return d;
    }
  );

  // 更新 stations 流量统计
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

  // 构造比例尺
  const maxTraffic   = d3.max(stations, st => st.totalTraffic);
  const radiusScale  = d3.scaleSqrt()
    .domain([0, maxTraffic])
    .range([0, 25]);

  // 经纬度 → 像素
  function project(d) {
    return map.project([d.lon, d.lat]);
  }

  // 渲染函数：绘制/更新 circles 并添加纯文本 title
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

    // 添加/更新每个 circle 的 <title>
    g.selectAll('circle').each(function(d) {
      d3.select(this).selectAll('title').remove();
      d3.select(this)
        .append('title')
        .text(
          `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`
        );
    });
  }

  // 初始渲染 & 绑定 Map 事件
  render();
  map.on('move', render);
  map.on('moveend', render);

  // —— 6. 滑块交互（±60 分钟窗口） ——  

  // 把 Date 转成当天分钟数
  function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
  }

  // 过滤：只保留出发/到达在 [t-60, t+60] 分钟内的 trips
  function filterTripsByTime(trips, t) {
    if (t === -1) return trips;
    return trips.filter(trip => {
      const s = minutesSinceMidnight(trip.started_at);
      const e = minutesSinceMidnight(trip.ended_at);
      return Math.abs(s - t) <= 60 || Math.abs(e - t) <= 60;
    });
  }

  // 格式化显示时间
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

    const filtered = filterTripsByTime(trips, t);
    updateStats(filtered);
    render();
  });

  // 触发一次初始渲染
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
