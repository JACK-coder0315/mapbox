import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3      from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';

mapboxgl.accessToken = 'YOUR_MAPBOX_TOKEN';

const map = new mapboxgl.Map({
  container:'map',
  style:'mapbox://styles/mapbox/streets-v12',
  center:[-71.09415,42.36027],
  zoom:12,minZoom:5,maxZoom:18
});

map.on('load', async () => {
  // … 省略：添加 Boston/Cambridge 线图层 …

  // D3 SVG Overlay
  const svg = d3.select(map.getCanvasContainer())
    .append('svg')
    .attr('class','overlay')
    .style('position','absolute')
    .style('top',0).style('left',0)
    .style('width','100%').style('height','100%')
    .style('pointer-events','none');
  const g = svg.append('g');

  // 加载数据（stations + trips）
  const raw = await fetch('https://dsc106.com/labs/lab07/data/bluebikes-stations.json').then(r=>r.json());
  const trips = await d3.csv(
    'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',
    d => { d.started_at=new Date(d.started_at); d.ended_at=new Date(d.ended_at); return d; }
  );

  // 辅助：分钟 & 分桶
  function minutesSinceMidnight(d){ return d.getHours()*60 + d.getMinutes(); }
  const depsByMin = Array.from({length:1440},()=>[]),
        arrsByMin = Array.from({length:1440},()=>[]);
  trips.forEach(t => {
    depsByMin[minutesSinceMidnight(t.started_at)].push(t);
    arrsByMin[minutesSinceMidnight(t.ended_at)].push(t);
  });

  // 滤桶 & 统计
  function filterByMinute(buckets,m){
    if(m===-1) return buckets.flat();
    const a=(m-60+1440)%1440, b=(m+60)%1440;
    const slice = a>b
      ? buckets.slice(a).concat(buckets.slice(0,b))
      : buckets.slice(a,b);
    return slice.flat();
  }
  function computeTraffic(stations,m=-1){
    const deps=filterByMinute(depsByMin,m),
          arr=filterByMinute(arrsByMin,m);
    const droll=d3.rollup(deps,vs=>vs.length,d=>d.start_station_id),
          aroll=d3.rollup(arr,vs=>vs.length,d=>d.end_station_id);
    return stations.map(s=>{
      const d=droll.get(s.short_name)||0,
            a=aroll.get(s.short_name)||0;
      return {...s,departures:d,arrivals:a,totalTraffic:d+a};
    });
  }

  // 初始化站点 & 比例尺
  const stations = raw.data.stations.map(s=>({
    short_name:s.short_name, lon:+s.lon, lat:+s.lat
  }));
  const initStats = computeTraffic(stations,-1),
        maxInit   = d3.max(initStats,d=>d.totalTraffic);
  const radiusScale = d3.scaleSqrt().domain([0,maxInit]);
  function project(d){ return map.project([d.lon,d.lat]); }

  // Color scale for departure/arrival ratio
  const stationFlow = d3.scaleQuantize().domain([0,1]).range([0,0.5,1]);

  // 渲染 & 更新
  let currentFilter = -1;
  function updateScatterPlot(m){
    currentFilter=m;
    radiusScale.range(m===-1?[0,25]:[3,50]);
    const stats = computeTraffic(stations,m);

    g.selectAll('circle')
      .data(stats,d=>d.short_name)
      .join(
        enter=>enter.append('circle')
          .attr('cx',d=>project(d).x)
          .attr('cy',d=>project(d).y)
          .attr('r',d=>radiusScale(d.totalTraffic)),
        update=>update
          .attr('cx',d=>project(d).x)
          .attr('cy',d=>project(d).y)
          .attr('r',d=>radiusScale(d.totalTraffic)),
        exit=>exit.remove()
      )
      .style('--departure-ratio',d=>stationFlow(d.departures/d.totalTraffic))
      .each(function(d){
        d3.select(this).selectAll('title').remove();
        d3.select(this).append('title')
          .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
      });
  }
  map.on('move',()=>updateScatterPlot(currentFilter));
  map.on('moveend',()=>updateScatterPlot(currentFilter));

  // 滑块 & 时间显示
  function formatTime(m){ return new Date(0,0,0,0,m).toLocaleString('en-US',{timeStyle:'short'}); }
  const slider = document.getElementById('time-slider'),
        selTime = document.getElementById('selected-time'),
        anyTime = document.getElementById('any-time');
  function updateTime(){
    const t=+slider.value;
    if(t===-1){ selTime.textContent=''; anyTime.style.display='block'; }
    else{ selTime.textContent=formatTime(t); anyTime.style.display='none'; }
    updateScatterPlot(t);
  }
  slider.addEventListener('input',updateTime);
  updateTime();

  // 图层开关
  function toggle(chkid,layerid){
    document.getElementById(chkid).addEventListener('change',e=>{
      map.setLayoutProperty(layerid,'visibility',e.target.checked?'visible':'none');
    });
  }
  toggle('chk-bos','bike-bos-2022');
  toggle('chk-cam','bike-cam');
  document.getElementById('chk-blue').addEventListener('change',e=>{
    document.querySelector('svg.overlay').style.display = e.target.checked?'block':'none';
  });
});
