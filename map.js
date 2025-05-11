import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3      from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';

mapboxgl.accessToken = 'pk.eyJ1IjoiamFjazAzMTUiLCJhIjoiY21haTZoNjA3MGsxdTJrcHlsMjZwZjU1aSJ9.bInG4_BU-h6a-eEXGHRDEg';

const map = new mapboxgl.Map({
  container: 'map',
  style:     'mapbox://styles/mapbox/streets-v12',
  center:    [-71.09415, 42.36027],
  zoom:      12,
  minZoom:   5,
  maxZoom:   18
});

map.on('load', async () => {
  // 1. 添加线图层（Boston / Cambridge）
  map.addSource('bos_lanes_2022', {
    type: 'geojson',
    data: 'data/Existing_Bike_Network_2022.geojson'
  });
  map.addLayer({
    id: 'bike-bos-2022',
    type: 'line',
    source: 'bos_lanes_2022',
    paint: {
      'line-color': '#32d400',
      'line-width': 3,
      'line-opacity': 0.45
    }
  });

  map.addSource('cam_lanes', {
    type: 'geojson',
    data: 'data/cambridge_bike_lanes.geojson'
  });
  const laneColors = {
    'Bike Lane':'#32d400','Separated Bike Lane':'#ff4d4d',
    'Grade-Separated Bike Lane':'#ff9d00','Bike Path/Multi-Use Path':'#0094ff',
    'Shared Lane Pavement Marking':'#808080','Buffered Bike Lane':'#8a2be2',
    'Bus/Bike Lane':'#d81b60','Contra-flow':'#795548','Shared Street':'#00bcd4'
  };
  map.addLayer({
    id:'bike-cam',
    type:'line',
    source:'cam_lanes',
    paint:{
      'line-color': ['match',['get','FacilityType'], ...Object.entries(laneColors).flat(), '#000'],
      'line-width': 3,
      'line-opacity': 0.8
    }
  });

  // 2. D3 SVG Overlay
  const container = map.getCanvasContainer();
  const svg = d3.select(container)
    .append('svg')
    .attr('class','overlay')
    .style('position','absolute').style('top',0).style('left',0)
    .style('width','100%').style('height','100%').style('pointer-events','none');
  const g = svg.append('g');

  // 3. 加载数据
  const raw = await fetch('https://dsc106.com/labs/lab07/data/bluebikes-stations.json')
    .then(r => r.ok ? r.json() : Promise.reject('stations.json 404'));
  const trips = await d3.csv(
    'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',
    d => { d.started_at = new Date(d.started_at); d.ended_at = new Date(d.ended_at); return d; }
  );

  // 4. 分桶
  function minutesSinceMidnight(d){ return d.getHours()*60 + d.getMinutes(); }
  const depsByMin = Array.from({ length: 1440 }, () => []);
  const arrsByMin = Array.from({ length: 1440 }, () => []);
  trips.forEach(t => {
    depsByMin[minutesSinceMidnight(t.started_at)].push(t);
    arrsByMin[minutesSinceMidnight(t.ended_at)].push(t);
  });

  // 5. 滤桶函数
  function filterByMinute(buckets, m) {
    if (m === -1) return buckets.flat();
    const start = (m - 60 + 1440) % 1440;
    const end   = (m + 60) % 1440;
    if (start > end) {
      return buckets.slice(start).concat(buckets.slice(0, end)).flat();
    }
    return buckets.slice(start, end).flat();
  }

  // 6. 计算流量
  function computeStationTraffic(stations, m=-1) {
    const deps = filterByMinute(depsByMin, m);
    const arrs = filterByMinute(arrsByMin, m);
    const droll = d3.rollup(deps, vs=>vs.length, d=>d.start_station_id);
    const aroll = d3.rollup(arrs, vs=>vs.length, d=>d.end_station_id);
    return stations.map(s => {
      const d = droll.get(s.short_name) || 0;
      const a = aroll.get(s.short_name) || 0;
      return { ...s, departures:d, arrivals:a, totalTraffic:d+a };
    });
  }

  // 7. 初始化站点 & 比例尺
  const stations = raw.data.stations.map(s => ({
    short_name: s.short_name,
    lon: +s.lon,
    lat: +s.lat
  }));
  const initStats = computeStationTraffic(stations, -1);
  const maxInit   = d3.max(initStats, d=>d.totalTraffic);
  const radiusScale = d3.scaleSqrt().domain([0, maxInit]);
  function project(d) { return map.project([d.lon, d.lat]); }

  // 8. 颜色比例尺
  const colorScale = d3.scaleQuantize()
    .domain([0,1])
    .range(['darkorange','purple','steelblue']);

  // 9. 渲染 & 更新
  let currentFilter = -1;
  function updateScatterPlot(m) {
    currentFilter = m;
    radiusScale.range(m===-1?[0,25]:[3,50]);
    const stats = computeStationTraffic(stations, m);

    g.selectAll('circle')
      .data(stats, d=>d.short_name)
      .join(
        enter=>enter.append('circle')
          .attr('cx', d=>project(d).x)
          .attr('cy', d=>project(d).y)
          .attr('r',  d=>radiusScale(d.totalTraffic)),
        update=>update
          .attr('cx', d=>project(d).x)
          .attr('cy', d=>project(d).y)
          .attr('r',  d=>radiusScale(d.totalTraffic)),
        exit=>exit.remove()
      )
      .style('fill', d => colorScale(d.departures / d.totalTraffic))
      .style('fill-opacity', 0.6)
      .style('stroke', 'white')
      .style('stroke-width', 1)
      .each(function(d) {
        d3.select(this).selectAll('title').remove();
        d3.select(this).append('title')
          .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
      });
  }

  map.on('move',    () => updateScatterPlot(currentFilter));
  map.on('moveend', () => updateScatterPlot(currentFilter));

  // 10. 滑块交互 & 时间显示
  function formatTime(m) {
    return new Date(0,0,0,0,m).toLocaleString('en-US',{ timeStyle:'short' });
  }
  const slider = document.getElementById('time-slider');
  const selTime = document.getElementById('selected-time');
  const anyTime = document.getElementById('any-time');

  function updateTime() {
    const t = +slider.value;
    if (t === -1) {
      selTime.textContent = '';
      anyTime.style.display = 'block';
    } else {
      selTime.textContent = formatTime(t);
      anyTime.style.display = 'none';
    }
    updateScatterPlot(t);
  }
  slider.addEventListener('input', updateTime);
  updateTime();

});

// 11. 图层显隐 Toggle
function toggle(chkId, layerId) {
  document.getElementById(chkId).addEventListener('change', e => {
    map.setLayoutProperty(layerId, 'visibility', e.target.checked ? 'visible' : 'none');
  });
}
toggle('chk-bos', 'bike-bos-2022');
toggle('chk-cam', 'bike-cam');
document.getElementById('chk-blue').addEventListener('change', e => {
  document.querySelector('svg.overlay').style.display = e.target.checked ? 'block' : 'none';
});
