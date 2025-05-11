// === 1. 依赖（ESM） ===================================
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3      from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';

// === 2. Mapbox Token ==================================
mapboxgl.accessToken = 'pk.eyJ1IjoiamFjazAzMTUiLCJhIjoiY21haTZoNjA3MGsxdTJrcHlsMjZwZjU1aSJ9.bInG4_BU-h6a-eEXGHRDEg';

// === 3. 构建 Mapbox 地图 ==============================
const map = new mapboxgl.Map({
  container: 'map',
  style:     'mapbox://styles/mapbox/streets-v12',
  center:    [-71.09415, 42.36027],
  zoom:      12,
  minZoom:   5,
  maxZoom:   18
});

map.on('load', async () => {
  // —— 4. 添加自行车道图层 ——  
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

  // —— 5. D3 SVG Overlay 用于 Bluebikes 站点与流量 ——  
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

  // (A) 加载站点 & 流量数据
  const rawStations = await fetch('https://dsc106.com/labs/lab07/data/bluebikes-stations.json')
    .then(r => r.ok ? r.json() : Promise.reject('stations.json 404'));
  const trips = await d3.csv(
    'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',
    d => {
      d.started_at = new Date(d.started_at);
      d.ended_at   = new Date(d.ended_at);
      return d;
    }
  );

  // (B) 辅助：计算当日分钟数
  function minutesSinceMidnight(d) {
    return d.getHours() * 60 + d.getMinutes();
  }

  // (C) 按时间过滤 trips（±60 分钟窗口）
  function filterTripsByTime(trips, t) {
    if (t === -1) return trips;
    return trips.filter(trip => {
      const s = minutesSinceMidnight(trip.started_at);
      const e = minutesSinceMidnight(trip.ended_at);
      return Math.abs(s - t) <= 60 || Math.abs(e - t) <= 60;
    });
  }

  // (D) 计算每个 station 的 departures/arrivals/totalTraffic
  function computeStationTraffic(stations, tripsSubset) {
    const depRoll = d3.rollup(tripsSubset, v => v.length, d => d.start_station_id);
    const arrRoll = d3.rollup(tripsSubset, v => v.length, d => d.end_station_id);
    return stations.map(s => {
      const d = depRoll.get(s.short_name) ?? 0;
      const a = arrRoll.get(s.short_name) ?? 0;
      return {
        ...s,
        departures:   d,
        arrivals:     a,
        totalTraffic: d + a
      };
    });
  }

  // (E) 初始 stations 数组（包含 short_name, lon, lat）
  const stations = rawStations.data.stations.map(s => ({
    short_name: s.short_name,
    lon:        +s.lon,
    lat:        +s.lat
  }));

  // (F) 构造 sqrt 比例尺（domain 固定，range 动态）
  const initTraffic = computeStationTraffic(stations, trips);
  const maxInit = d3.max(initTraffic, d => d.totalTraffic);
  const radiusScale = d3.scaleSqrt()
    .domain([0, maxInit]);

  // (G) 经纬度 → 像素
  function project(d) {
    return map.project([d.lon, d.lat]);
  }

  // (H) 更新并渲染 scatter
  let currentFilter = -1;
  function updateScatterPlot(t) {
    currentFilter = t;
    // 调整 range：无过滤用小点，有过滤用大点
    radiusScale.range(t === -1 ? [0, 25] : [3, 50]);

    // 1) 筛选 trips & 重新计算站点流量
    const filteredTrips   = filterTripsByTime(trips, t);
    const filteredStations = computeStationTraffic(stations, filteredTrips);

    // 2) 绑定数据并 join
    g.selectAll('circle')
      .data(filteredStations, d => d.short_name)
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
      // 3) 为每个 circle 加纯文本 <title>
      .each(function(d) {
        d3.select(this).selectAll('title').remove();
        d3.select(this)
          .append('title')
          .text(
            `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`
          );
      });
  }

  // (I) Map 移动时重新定位 circles
  map.on('move',    () => updateScatterPlot(currentFilter));
  map.on('moveend', () => updateScatterPlot(currentFilter));

  // —— Step 5.2 & 5.3: 滑块交互与 time display ——  
  function formatTime(minutes) {
    const dt = new Date(0,0,0,0,minutes);
    return dt.toLocaleString('en-US',{timeStyle:'short'});
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

  // 初始渲染
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
toggle('chk-bos',  'bike-bos-2022');
toggle('chk-cam',  'bike-cam');
toggle('chk-blue','bluebikes-circle');
