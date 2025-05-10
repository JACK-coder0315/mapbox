/* --------------------------------------------------------
 * map.js – Boston / Cambridge Bike Lanes + Bluebikes traffic
 * ------------------------------------------------------ */

/* === 1. 依赖（ESM） =================================== */
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3   from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';

mapboxgl.accessToken =
  'pk.eyJ1IjoiamFjazAzMTUiLCJhIjoiY21haTZoNjA3MGsxdTJrcHlsMjZwZjU1aSJ9.bInG4_BU-h6a-eEXGHRDEg';

/* === 2. 小工具函数 ==================================== */
// 把 Date → 离午夜多少分钟，便于数值比较
const minutesSinceMidnight = d =>
  d.getHours()*60 + d.getMinutes();

// 把分钟数格式化成人类可读的 HH:MM AM/PM
function formatTime(min){
  return new Date(0,0,0,0,min)
         .toLocaleTimeString('en-US',{timeStyle:'short'});
}

// 汇总每个站的出发/到达/总流量
function computeStationTraffic(stations, trips){
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

// 根据滑块过滤：离目标时间 ±60 min 内的骑行
function filterTripsByTime(trips, t){
  if (t === -1) return trips;          // -1 = 不过滤
  return trips.filter(trip=>{
    const s = minutesSinceMidnight(trip.started_at);
    const e = minutesSinceMidnight(trip.ended_at);
    return Math.abs(s-t) <= 60 || Math.abs(e-t) <= 60;
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

  /* 3.1——车道图层（沿用你原来的代码，不再赘述） */
  /* ---------------------------------------------- */
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

  /* 3.2——加载Bluebikes站点基础信息 -------------------- */
  let stations = (await fetch('data/bluebikes-stations.json')
                    .then(r=>r.json())).data.stations;

  /* 3.3——加载 2024‑03 骑行记录 ----------------------- */
  let trips = await d3.csv(
      'data/bluebikes-traffic-2024-03.csv',
      d=>({
        ...d,
        started_at:new Date(d.started_at),
        ended_at  :new Date(d.ended_at)
      })
    );

  /* 3.4——SVG 覆盖层，专门放站点圆点 ------------------ */
  const svg = d3.select(map.getCanvasContainer())
                .append('svg')
                  .style('position','absolute')
                  .style('inset',0)
                  .style('pointer-events','none');

  /* 3.5——初次计算各站点流量 -------------------------- */
  stations = computeStationTraffic(stations,trips);

  // 用平方根比例尺保证“圆面积”≈流量
  const radiusScale = d3.scaleSqrt()
        .domain([0,d3.max(stations,d=>d.totalTraffic)])
        .range([0,25]);

  const project = p => map.project(p);   // 经纬度→像素

  // 建立并渲染圆点
  const circles = svg.selectAll('circle')
      .data(stations,d=>d.short_name)
      .enter().append('circle')
        .attr('r',d=>radiusScale(d.totalTraffic))
        .each(function(d){               // 原生 tooltip
          d3.select(this)
            .append('title')
            .text(`${d.totalTraffic} 次 (${d.departures} 出 • ${d.arrivals} 入)`);
        });

  // 地图平移/缩放时，更新圆点位置
  function reproject(){
    circles
      .attr('cx',d=>project([+d.lon,+d.lat]).x)
      .attr('cy',d=>project([+d.lon,+d.lat]).y);
  }
  reproject();
  map.on('move zoom resize',reproject);

  /* === 4. 滑块逻辑 =================================== */
  const slider       = document.getElementById('time-slider');
  const timeOut      = document.getElementById('selected-time');
  const anyTimeLabel = document.getElementById('any-time');

  slider.addEventListener('input',onSlider);
  onSlider();             // 页面加载完就先跑一次

  function onSlider(){
    const val = +slider.value;
    if (val === -1){
      timeOut.textContent='';
      anyTimeLabel.style.display='block';
    }else{
      timeOut.textContent = formatTime(val);
      anyTimeLabel.style.display='none';
    }
    updateCircles(val);
  }

  // 重新统计 & 画圆
  function updateCircles(tFilter){
    const tripsFiltered = filterTripsByTime(trips,tFilter);
    const statsFiltered = computeStationTraffic(stations,tripsFiltered);

    // 若过滤后流量普遍很小，就把最大半径放大一点
    tFilter === -1
      ? radiusScale.range([0,25])
      : radiusScale.range([3,50]);

    circles
      .data(statsFiltered,d=>d.short_name)
      .attr('r',d=>radiusScale(d.totalTraffic))
      .select('title')
      .text(d=>`${d.totalTraffic} 次 (${d.departures} 出 • ${d.arrivals} 入)`);
  }
});

/* === 5. DOM→Map 图层显隐开关保持原样即可 ============ */
['chk-bos','chk-cam','chk-blue'].forEach((id,i)=>{
  const layer = ['bike-bos-2022','bike-cam',''][i];   // 蓝点已换成 D3，不用隐藏
  if(!layer) return;
  document.getElementById(id).addEventListener('change',e=>{
    map.setLayoutProperty(layer,'visibility',e.target.checked?'visible':'none');
  });
});
