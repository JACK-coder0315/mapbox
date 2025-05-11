// map.js

// === 1. 依赖（ESM） ===================================
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3      from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';

// === 2. Mapbox 令牌 ==================================
mapboxgl.accessToken = 'pk.eyJ1IjoiamFjazAzMTUiLCJhIjoiY21haTZoNjA3MGsxdTJrcHlsMjZwZjU1aSJ9.bInG4_BU-h6a-eEXGHRDEg';

// === 3. 构建 Mapbox 地图 =============================
const map = new mapboxgl.Map({
  container: 'map',
  style:     'mapbox://styles/mapbox/streets-v12',
  center:    [-71.09415, 42.36027],
  zoom:      12,
  minZoom:   5,
  maxZoom:   18
});

map.on('load', async () => {
  // —— 4. 添加 Boston & Cambridge 自行车道 ——  
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

  // (A) 加载站点 & 行程数据
  const raw = await fetch('https://dsc106.com/labs/lab07/data/bluebikes-stations.json')
    .then(r => r.ok ? r.json() : Promise.reject('stations.json 404'));
  const trips = await d3.csv(
    'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',
    d => {
      d.started_at = new Date(d.started_at);
      d.ended_at   = new Date(d.ended_at);
      return d;
    }
  );

  // (B) 工具函数：计算自午夜以来的分钟数
  function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
  }

  // (C) 构建 1440 桶：按分钟分桶
  const departuresByMinute = Array.from({ length: 1440 }, () => []);
  const arrivalsByMinute   = Array.from({ length: 1440 }, () => []);
  trips.forEach(trip => {
    const s = minutesSinceMidnight(trip.started_at);
    const e = minutesSinceMidnight(trip.ended_at);
    departuresByMinute[s].push(trip);
    arrivalsByMinute  [e].push(trip);
  });

  // (D) 根据桶快速筛选 ±60 分钟内的行程
  function filterByMinute(tripsByMinute, minute) {
    if (minute === -1) return tripsByMinute.flat();
    const minM = (minute - 60 + 1440) % 1440;
    const maxM = (minute + 60) % 1440;
    if (minM > maxM) {
      return tripsByMinute
        .slice(minM)
        .concat(tripsByMinute.slice(0, maxM))
        .flat();
    }
    return tripsByMinute.slice(minM, maxM).flat();
  }

  // (E) 计算每个站点的到离次数及总流量
  function computeStationTraffic(stations, timeFilter = -1) {
    const depTrips = filterByMinute(departuresByMinute, timeFilter);
    const arrTrips = filterByMinute(arrivalsByMinute,   timeFilter);
    const depRoll = d3.rollup(depTrips, v => v.length, d => d.start_station_id);
    const arrRoll = d3.rollup(arrTrips, v => v.length, d => d.end_station_id);
    return stations.map(s => {
      const d = depRoll.get(s.short_name) ?? 0;
      const a = arrRoll.get(s.short_name) ?? 0;
      return { ...s, departures: d, arrivals: a, totalTraffic: d + a };
    });
  }

  // (F) 构造 station 对象（包含 short_name, lon, lat）
  const stations = raw.data.stations.map(s => ({
    short_name: s.short_name,
    lon:        +s.lon,
    lat:        +s.lat
  }));

  // (G) 比例尺 & 投影函数
  const initTraffic = computeStationTraffic(stations, -1);
  const maxInit     = d3.max(initTraffic, d => d.totalTraffic);
  const radiusScale = d3.scaleSqrt().domain([0, maxInit]);
  function project(d) {
    return map.project([d.lon, d.lat]);
  }

  // (H) 渲染函数：根据当前筛选绘制/更新 circles
  let currentFilter = -1;
  function updateScatterPlot(timeFilter) {
    currentFilter = timeFilter;
    // 动态调整 range：无过滤小点，有过滤大点
    radiusScale.range(timeFilter === -1 ? [0, 25] : [3, 50]);

    const updatedStations = computeStationTraffic(stations, timeFilter);

    g.selectAll('circle')
      .data(updatedStations, d => d.short_name)
      .join(
        enter => enter.append('circle')
          .attr('fill','steelblue')
          .attr('fill-opacity',0.6)
          .attr('stroke','white')
          .attr('stroke-width',1)
          .attr('r', d => radiusScale(d.totalTraffic))
          .attr('cx', d => project(d).x)
          .attr('cy', d => project(d).y),
        update => update
          .attr('r',  d => radiusScale(d.totalTraffic))
          .attr('cx', d => project(d).x)
          .attr('cy', d => project(d).y),
        exit => exit.remove()
      )
      .each(function(d) {
        d3.select(this).selectAll('title').remove();
        d3.select(this)
          .append('title')
          .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
      });
  }

  // 绑定地图移动时保持位置同步
  map.on('move',    () => updateScatterPlot(currentFilter));
  map.on('moveend', () => updateScatterPlot(currentFilter));

  // —— 6. 滑块交互 & Time Display ——  
  function formatTime(m) {
    return new Date(0,0,0,0,m).toLocaleString('en-US',{timeStyle:'short'});
  }
  const timeSlider   = document.getElementById('time-slider');
  const selectedTime = document.getElementById('selected-time');
  const anyTimeLabel = document.getElementById('any-time');

  function updateTimeDisplay() {
    const t = Number(timeSlider.value);
    if (t === -1) {
      selectedTime.textContent   = '';
      anyTimeLabel.style.display = 'block';
    } else {
      selectedTime.textContent   = formatTime(t);
      anyTimeLabel.style.display = 'none';
    }
    updateScatterPlot(t);
  }
  timeSlider.addEventListener('input', updateTimeDisplay);
  updateTimeDisplay();
});

// —— 7. 图层显隐 Toggle ——  
function toggle(chkId, layerId) {
  document.getElementById(chkId)
    .addEventListener('change', e => {
      map.setLayoutProperty(
        layerId,
        'visibility',
        e.target.checked ? 'visible' : 'none'
      );
    });
}
toggle('chk-bos','bike-bos-2022');
toggle('chk-cam','bike-cam');
// Toggle for Bluebikes SVG overlay
document.getElementById('chk-blue').addEventListener('change', e => {
  const svg = document.querySelector('svg.overlay');
  if (svg) svg.style.display = e.target.checked ? 'block' : 'none';
});
