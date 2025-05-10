// === 1. 依赖（ESM） ===================================
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3      from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';

console.log('Mapbox GL JS Loaded:', mapboxgl);

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

// === 4. 图层 & 交互初始化 ============================
map.on('load', async () => {

  // 4.1 Boston 2022 Bike-lanes ---------------------
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

  // 4.2 Cambridge 车道（彩色） ----------------------
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

  // 4.3 Bluebikes 站点 & 可视化流量 ----------------
  const raw = await fetch('https://dsc106.com/labs/lab07/data/bluebikes-stations.json')
    .then(r => {
      if (!r.ok) throw new Error('stations.json 404');
      return r.json();
    });

  const blueGeo = {
    type: 'FeatureCollection',
    features: raw.data.stations.map(s => ({
      type:     'Feature',
      geometry: { type: 'Point', coordinates: [+s.lon, +s.lat] },
      properties: {
        station_id:   s.short_name,
        capacity:     +s.capacity,
        departures:   0,
        arrivals:     0,
        totalTraffic: 0
      }
    }))
  };

  const trips = await d3.csv(
    'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',
    trip => {
      trip.started_at = new Date(trip.started_at);
      trip.ended_at   = new Date(trip.ended_at);
      return trip;
    }
  );

  function updateStats(filteredTrips) {
    const dep = d3.rollup(filteredTrips, v => v.length, d => d.start_station_id);
    const arr = d3.rollup(filteredTrips, v => v.length, d => d.end_station_id);
    blueGeo.features.forEach(f => {
      const id = f.properties.station_id;
      f.properties.departures   = dep.get(id) ?? 0;
      f.properties.arrivals     = arr.get(id) ?? 0;
      f.properties.totalTraffic = f.properties.departures + f.properties.arrivals;
    });
  }
  updateStats(trips);

  map.addSource('bluebikes', { type: 'geojson', data: blueGeo });

  let maxTraffic = d3.max(blueGeo.features, f => f.properties.totalTraffic);

  map.addLayer({
    id:     'bluebikes-circle',
    type:   'circle',
    source: 'bluebikes',
    paint: {
      'circle-color':        '#0074D9',
      'circle-opacity':      0.85,
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 1,
      'circle-radius': [
        'interpolate',
        ['exponential', 0.5],    // 指数插值实现 sqrt 效果
        ['get', 'totalTraffic'],
        0,        0,
        maxTraffic, 25
      ]
    }
  });

  // 4.4 原生 Tooltip（Popup）----------------------
  const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false });
  map.on('mouseenter', 'bluebikes-circle', e => {
    map.getCanvas().style.cursor = 'pointer';
    const p = e.features[0].properties;
    popup
      .setLngLat(e.lngLat)
      .setHTML(
        `${p.totalTraffic} trips<br>` +
        `${p.departures} departures, ${p.arrivals} arrivals`
      )
      .addTo(map);
  });
  map.on('mouseleave', 'bluebikes-circle', () => {
    map.getCanvas().style.cursor = '';
    popup.remove();
  });

  console.log('✅ layers added');

  // === Step 5: 滑块交互 =================================
  function formatTime(minutes) {
    const d = new Date(0, 0, 0, 0, minutes);
    return d.toLocaleString('en-US', { timeStyle: 'short' });
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

    const filtered = t === -1
      ? trips
      : trips.filter(trip => {
          const mins =
            trip.started_at.getHours() * 60 +
            trip.started_at.getMinutes();
          return mins <= t;
        });

    updateStats(filtered);
    map.getSource('bluebikes').setData(blueGeo);

    maxTraffic = d3.max(blueGeo.features, f => f.properties.totalTraffic);
    map.setPaintProperty(
      'bluebikes-circle',
      'circle-radius',
      ['interpolate', ['exponential', 0.5], ['get','totalTraffic'], 0, 0, maxTraffic, 25]
    );
  });

  // 初始渲染一次
  timeSlider.dispatchEvent(new Event('input'));

}); // end of map.on('load')

// === 5. 图层显隐开关 ===============================
function toggle(chkId, layerId) {
  document.getElementById(chkId).addEventListener('change', e => {
    map.setLayoutProperty(
      layerId,
      'visibility',
      e.target.checked ? 'visible' : 'none'
    );
  });
}
toggle('chk-bos',   'bike-bos-2022');
toggle('chk-cam',   'bike-cam');
toggle('chk-blue',  'bluebikes-circle');
