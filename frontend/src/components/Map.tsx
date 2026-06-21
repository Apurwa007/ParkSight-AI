import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import MapControls from './MapControls';

// Free dark tile style - CartoDB Dark Matter (no token required)
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

interface MapProps {
  hotspotsData: any;
  spilloverData: any;
  warRoomResult: any;
  onHotspotClick: (hotspotId: string) => void;
}

export default function Map({ hotspotsData, spilloverData, warRoomResult, onHotspotClick }: MapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const enforcementMarkersRef = useRef<maplibregl.Marker[]>([]);
  
  const [layers, setLayers] = useState({
    'Hotspots': true,
    'Risk Rings': true,
    'Heatmap': false,
    'Spillover Network': true,
    'Enforcement Zones': true,
  });

  const toggleLayer = (layerName: string) => {
    setLayers(prev => {
      const key = layerName as keyof typeof prev;
      return { ...prev, [key]: !prev[key] };
    });
  };

  useEffect(() => {
    if (map.current) return;
    if (!mapContainer.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: MAP_STYLE,
      center: [77.6, 12.96], // Fallback to Bangalore
      zoom: 11.5,
      pitch: 45,
      bearing: -17.6,
    });

    map.current.addControl(new maplibregl.NavigationControl(), 'bottom-right');

    map.current.on('load', () => {
      if (!map.current) return;

      // Force resize to pick up correct container dimensions
      map.current.resize();

      // Add Sources
      map.current.addSource('hotspots', {
        type: 'geojson',
        data: hotspotsData || { type: 'FeatureCollection', features: [] }
      });

      map.current.addSource('spillover', {
        type: 'geojson',
        data: spilloverData || { type: 'FeatureCollection', features: [] }
      });

      // Add Heatmap Layer
      map.current.addLayer({
        id: 'heatmap-layer',
        type: 'heatmap',
        source: 'hotspots',
        maxzoom: 15,
        paint: {
          'heatmap-weight': ['interpolate', ['linear'], ['get', 'cmrs'], 0, 0, 100, 1],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 11, 1, 15, 3],
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(33,102,172,0)',
            0.2, 'rgb(103,169,207)',
            0.4, 'rgb(209,229,240)',
            0.6, 'rgb(253,219,199)',
            0.8, 'rgb(239,138,98)',
            1, 'rgb(178,24,43)'
          ],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 11, 15, 15, 40],
          'heatmap-opacity': 0.7
        }
      });

      // Add Spillover Lines Layer
      map.current.addLayer({
        id: 'spillover-layer',
        type: 'line',
        source: 'spillover',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#f97316',
          'line-width': 2.5,
          'line-dasharray': [2, 2],
          'line-opacity': 0.75
        }
      });

    });

    // Also resize after a short delay to handle late container layout
    setTimeout(() => {
      map.current?.resize();
    }, 200);

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Update Data and Bounds
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    // Update Sources
    const hotspotsSrc = map.current.getSource('hotspots') as maplibregl.GeoJSONSource | undefined;
    const spilloverSrc = map.current.getSource('spillover') as maplibregl.GeoJSONSource | undefined;
    hotspotsSrc?.setData(hotspotsData || { type: 'FeatureCollection', features: [] });
    spilloverSrc?.setData(spilloverData || { type: 'FeatureCollection', features: [] });

    // Auto-fit Bounds
    if (hotspotsData?.features?.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      hotspotsData.features.forEach((feature: any) => {
        bounds.extend(feature.geometry.coordinates as [number, number]);
      });
      map.current.fitBounds(bounds, { padding: 80, duration: 1000 });
    }

    // Render Markers for Hotspots & Risk Rings
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    if (layers['Hotspots'] || layers['Risk Rings']) {
      hotspotsData?.features?.forEach((feature: any) => {
        const props = feature.properties;
        const coords = feature.geometry.coordinates as [number, number];
        
        const el = document.createElement('div');
        el.className = 'relative flex items-center justify-center cursor-pointer group';
        
        // CSS classes for pulsing based on risk
        let ringColor = 'bg-emerald-500 text-emerald-500';
        let coreColor = 'bg-emerald-600/90 shadow-[0_0_10px_rgba(16,185,129,0.5)]';
        let dotColor = 'bg-emerald-400';
        let pulseClass = '';
        let pulseClass2 = '';
        
        if (props.risk_category === 'Critical') {
          ringColor = 'bg-red-500 text-red-500';
          coreColor = 'bg-red-600/90 shadow-[0_0_12px_rgba(239,68,68,0.5)]';
          dotColor = 'bg-red-400';
          pulseClass = 'animate-[ping_1.5s_cubic-bezier(0,0,0.2,1)_infinite]';
          pulseClass2 = 'animate-[ping_2.5s_cubic-bezier(0,0,0.2,1)_infinite]';
        } else if (props.risk_category === 'High') {
          ringColor = 'bg-orange-500 text-orange-500';
          coreColor = 'bg-orange-500/90 shadow-[0_0_12px_rgba(249,115,22,0.5)]';
          dotColor = 'bg-orange-400';
          pulseClass = 'animate-[ping_2.2s_cubic-bezier(0,0,0.2,1)_infinite]';
          pulseClass2 = 'animate-[ping_3.5s_cubic-bezier(0,0,0.2,1)_infinite]';
        } else if (props.risk_category === 'Medium') {
          ringColor = 'bg-yellow-500 text-yellow-500';
          coreColor = 'bg-yellow-500/90 shadow-[0_0_12px_rgba(234,179,8,0.5)]';
          dotColor = 'bg-yellow-400';
          pulseClass = 'animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite]';
          pulseClass2 = 'animate-[ping_4.5s_cubic-bezier(0,0,0.2,1)_infinite]';
        }

        const size = Math.min(100, Math.max(30, (props.radius / 15)));

        el.innerHTML = `
          ${layers['Risk Rings'] ? `
            <div class="absolute rounded-full ${ringColor} opacity-20 ${pulseClass} border border-current" style="width: ${size}px; height: ${size}px; filter: blur(1px);"></div>
            <div class="absolute rounded-full ${ringColor} opacity-10 ${pulseClass2}" style="width: ${size * 1.5}px; height: ${size * 1.5}px; filter: blur(2px);"></div>
          ` : ''}
          ${layers['Hotspots'] ? `
            <div class="relative flex items-center justify-center w-8 h-8 rounded-full ${coreColor} border-2 border-slate-950 shadow-[0_0_15px_rgba(0,0,0,0.8)] z-10 transition-all duration-300 group-hover:scale-110">
              <span class="text-[9px] font-black text-white select-none">${Math.round(props.cmrs)}</span>
              <span class="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${dotColor} border border-slate-900 shadow"></span>
            </div>
          ` : ''}
        `;

        el.addEventListener('click', () => {
          onHotspotClick(props.id);
        });

        // Hover Popup
        const popup = new maplibregl.Popup({ offset: 15, closeButton: false, closeOnClick: false })
          .setHTML(`
            <div class="p-1 font-sans">
              <strong class="block text-sm text-blue-400 font-bold mb-1">Zone ${props.id.substring(0,4)}</strong>
              <div class="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-slate-300">
                <span>CMRS:</span><span class="font-bold text-slate-100">${props.cmrs.toFixed(1)}</span>
                <span>Risk:</span><span class="font-bold text-${props.risk_category === 'Critical' ? 'red-400' : props.risk_category === 'High' ? 'orange-400' : 'yellow-400'}">${props.risk_category}</span>
                <span>Confidence:</span><span class="font-bold text-blue-400">${props.confidence}%</span>
              </div>
            </div>
          `);

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat(coords)
          .setPopup(popup)
          .addTo(map.current!);

        el.addEventListener('mouseenter', () => marker.togglePopup());
        el.addEventListener('mouseleave', () => marker.togglePopup());

        markersRef.current.push(marker);
      });
    }

  }, [hotspotsData, spilloverData, layers, onHotspotClick]);

  // Handle Enforcement Layers
  useEffect(() => {
    if (!map.current) return;
    
    enforcementMarkersRef.current.forEach(m => m.remove());
    enforcementMarkersRef.current = [];

    if (layers['Enforcement Zones'] && warRoomResult?.allocations) {
      warRoomResult.allocations.forEach((alloc: any) => {
        if (!alloc.lat || !alloc.lon) return;

        const el = document.createElement('div');
        el.className = 'flex flex-col items-center pointer-events-none z-20 mt-8';
        
        let icons = '';
        if (alloc.allocated_resources.officers > 0) {
          icons += `
            <div class="bg-blue-950/90 text-blue-200 border border-blue-500/40 text-xs px-2 py-0.5 rounded-lg shadow-lg shadow-blue-500/10 font-bold flex items-center gap-1 mb-1 backdrop-blur-sm">
              🚓 x${alloc.allocated_resources.officers}
            </div>`;
        }
        if (alloc.allocated_resources.tow_trucks > 0) {
          icons += `
            <div class="bg-amber-950/90 text-amber-200 border border-amber-500/40 text-xs px-2 py-0.5 rounded-lg shadow-lg shadow-amber-500/10 font-bold flex items-center gap-1 backdrop-blur-sm">
              🚚 x${alloc.allocated_resources.tow_trucks}
            </div>`;
        }

        el.innerHTML = icons;

        const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([alloc.lon, alloc.lat])
          .addTo(map.current!);
          
        enforcementMarkersRef.current.push(marker);
      });
    }
  }, [warRoomResult, layers]);

  // Handle Layer Visibilities for Native Layers
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    if (map.current.getLayer('heatmap-layer')) {
      map.current.setLayoutProperty('heatmap-layer', 'visibility', layers['Heatmap'] ? 'visible' : 'none');
    }
    if (map.current.getLayer('spillover-layer')) {
      map.current.setLayoutProperty('spillover-layer', 'visibility', layers['Spillover Network'] ? 'visible' : 'none');
    }

  }, [layers]);

  return (
    <div className="relative w-full h-full min-h-[500px] rounded-xl overflow-hidden border border-slate-800">
      <div ref={mapContainer} className="absolute inset-0" />
      
      {/* Dynamic Floating Legend */}
      <div className="absolute bottom-4 left-4 bg-slate-950/80 backdrop-blur-md border border-slate-800/80 p-3 rounded-xl shadow-xl z-10 w-44 pointer-events-none select-none transition-all duration-300 hover:border-slate-700/60">
        <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2 pb-1 border-b border-slate-800/60">Map Legend</div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]" />
            <span className="text-[10px] text-slate-300">Critical Risk (&gt;75)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.6)]" />
            <span className="text-[10px] text-slate-300">High Risk (55-75)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 shadow-[0_0_6px_rgba(234,179,8,0.6)]" />
            <span className="text-[10px] text-slate-300">Medium Risk (35-55)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
            <span className="text-[10px] text-slate-300">Low Risk (&lt;35)</span>
          </div>
          <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-slate-800/60">
            <span className="w-4 h-0.5 border-t-2 border-dashed border-orange-500" />
            <span className="text-[10px] text-slate-300">Spillover Transfer</span>
          </div>
        </div>
      </div>

      <MapControls layers={layers} onToggleLayer={toggleLayer} />
    </div>
  );
}
