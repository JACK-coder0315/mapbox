/* --------------------------------------------------------
 * map.js – Boston / Cambridge Bike Lanes + Bluebikes traffic
 * ------------------------------------------------------ */

/* === 1. 依赖（ESM） =================================== */
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3   from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';

mapboxgl.accessToken =
  'pk.eyJ1IjoiamFjazAzMTUiLCJhIjoiY21haTZoNjA3MGsxdTJrcHlsMjZwZjU1aSJ9.bInG4_BU-h6a-eEXGHRDEg';

/* === 2. 小工具函数 ==================================== */
const minutesSinceMidnight = d => d.getHours()*60 + d.getMinutes();

function formatTime(min){           // 480 → "8:00 AM"
  return new Date(0,0,0,0,min)
         .toLocaleTimeString('en-US',{timeStyle:'short'});
}

function computeStationTraffic(stations,trips){
  const dep = d3.rollup(trips,v=>v.length,d=>d.start_station_id);
  const arr = d3.rollup(trips,v=>v.length,d=>d.end_station_id);

  return stations.map(st=>{
    const id = st.short_name;
    st.departures   = dep.get(id) ?? 0;
    st.arrivals     = arr.get(id) ?? 0;
    st.totalTraffic = st.departures + st.arrivals;
    return st;
  });
}

function filterTripsByTime(trips,t){
  if (t===-1) return trips;      // -1 = 不过滤
  return trips.filter(trip=>{
    const s = minutesSinceMidnight(trip.started_at);
    const e = minutesSinceMidnight(trip.ended_at);
    return Math.abs(s-t)<=60 || Math.abs(e-t)<=60;
  });
}

/* === 3. 创建地图 ====================================== */
const map = new mapboxgl.Map({
  container:'map',
  style   :'mapbox://styles/mapbox/streets-v12',
  center  :[-71.09415,42.36027],
  zoom    :12
});

map.on('load', async ()=>{

  /* ---- 3.1 车道（保持和之前一致） ------------------- */
  map.addSource('bos_lanes_2022',{type:'geojson',data:'data/Existing_Bike_Network_2022.geojson'});
  map.addLayer({
    id:'bike-bos-2022',type:'line',source:'bos_lanes_2022',
    paint:{'line-color':'#32d400','line-width':3,'line-opacity':0.45}
  });

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

  /* ---- 3.2 Bluebikes 站点 & 骑行数据 ---------------- */
  let stations = (await fetch('data/bluebikes-stations.json')
                    .then(r=>r.json())).data.stations;

  let trips = await d3.csv(
      'data/bluebikes-traffic-2024-03.csv',
      d=>({
        ...d,
        started_at:new Date(d.started_at),
        ended_at  :new Date(d.ended_at)
      })
    );

  /* ---- 3.3 SVG 覆盖层放圆点 ------------------------- */
  const svg = d3.select(map.getCanvasContainer())
                .append('svg')
                  .style('position','absolute')
                  .style('inset',0)
                  .style('pointer-events','none');   // 整个 SVG 也不抢事件

  /* ---- 3.4 初次计算 & 绘制 --------------------------- */
  stations = computeStationTraffic(stations,trips);

  const radiusScale = d3.scaleSqrt()
        .domain([0,d3.max(stations,d=>d.totalTraffic)])
        .range([2,25]);               // 最小 2px，最大 25px

  const project = p => map.project(p);

  const circles = svg.selectAll('circle')
      .data(stations,d=>d.short_name)
      .enter().append('circle')
        .attr('r',d=>radiusScale(d.totalTraffic))
        .each(function(d){
          d3.select(this)
            .append('title')
            .text(`${d.totalTraffic} 次 (${d.departures} 出 • ${d.arrivals} 入)`);
        });

  function reproject(){
    circles
      .attr('cx',d=>project([+d.lon,+d.lat]).x)
      .attr('cy',d=>project([+d.lon,+d.lat]).y);
  }
  reproject();
  map.on('move zoom resize',reproject);

  /* === 4. 滑块交互 =================================== */
  const slider       = document.getElementById('time-slider');
  const timeOut      = document.getElementById('selected-time');
  const anyTimeLabel = document.getElementById('any-time');

  slider.addEventListener('input',onSlider);
  onSlider();   // 初始化

  function onSlider(){
    const val = +slider.value;
    if (val===-1){
      timeOut.textContent='';
      anyTimeLabel.style.display='block';
    }else{
      timeOut.textContent = formatTime(val);
      anyTimeLabel.style.display='none';
    }
    updateCircles(val);
  }

  function updateCircles(tFilter){
    const tripsFiltered = filterTripsByTime(trips,tFilter);
    const statsFiltered = computeStationTraffic(stations,tripsFiltered);

    tFilter===-1
      ? radiusScale.range([2,25])
      : radiusScale.range([2,50]);   // 过滤时放大上限

    circles
      .data(statsFiltered,d=>d.short_name)
      .attr('r',d=>radiusScale(d.totalTraffic))
      .select('title')
      .text(d=>`${d.totalTraffic} 次 (${d.departures} 出 • ${d.arrivals} 入)`);
  }
});

/* === 5. 图层显隐：蓝点已用 D3 绘制，无需隐藏 ========= */
['chk-bos','chk-cam'].forEach(([id,layer])=>{
  // 用结构拆包写法简短地对应 id → layer 名
});
function toggle(chkId,layerId){
  document.getElementById(chkId).addEventListener('change',e=>{
    map.setLayoutProperty(layerId,'visibility',e.target.checked?'visible':'none');
  });
}
toggle('chk-bos','bike-bos-2022');
toggle('chk-cam','bike-cam');
