'use client';
import { useState, useEffect } from 'react';
import Map from '@/components/Map';
import IntelligenceDrawer from '@/components/IntelligenceDrawer';
import { Radio, AlertTriangle, Cpu, TrendingDown, ShieldCheck, Activity, BarChart3, Sparkles } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const SIMULATED_ALERTS = [
  { id: 'sim-1', alert_type: 'IoT Sensor', message: 'Node #B490 detected sudden vehicle density surge near commercial plaza.', confidence_score: 99 },
  { id: 'sim-2', alert_type: 'Predictive AI', message: 'AI Warning: Spillover risk rising 24% at intersection of Zone 5eb7.', confidence_score: 98 },
  { id: 'sim-3', alert_type: 'Enforcement Command', message: 'Dispatch Alert: Reallocate 1 tow truck to Sector 4 to mitigate congestion.', confidence_score: 99 },
  { id: 'sim-4', alert_type: 'Incident Report', message: 'Double-parking queue forming on Brigade Road, causing flow reduction.', confidence_score: 97 },
  { id: 'sim-5', alert_type: 'IoT Sensor Flow', message: 'Sensor Node #A320 reports average vehicle speed drops below 15km/h.', confidence_score: 98 },
  { id: 'sim-6', alert_type: 'Weather Forecast', message: 'Rainfall expected: Evening peak hours congestion forecast increased by 15%.', confidence_score: 98 },
  { id: 'sim-7', alert_type: 'Mobility Alert', message: 'Preventable mobility loss metric rising in Zone 8b9f due to bus lane blocking.', confidence_score: 99 }
];

export default function Dashboard() {
  const [summary, setSummary] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [warRoomResult, setWarRoomResult] = useState<any>(null);
  
  const [hotspotsData, setHotspotsData] = useState<any>(null);
  const [spilloverData, setSpilloverData] = useState<any>(null);

  const [officers, setOfficers] = useState<number | string>('');
  const [trucks, setTrucks] = useState<number | string>('');
  
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [intelligenceData, setIntelligenceData] = useState<any>(null);

  // Live Simulation state
  const [isSimulating, setIsSimulating] = useState(false);
  const [activeScenario, setActiveScenario] = useState<string>('');
  const [loadingScenario, setLoadingScenario] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  const fetchDashboardState = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/dashboard/state`);
      const data = await res.json();
      setSummary(data.cmrs);
      setAlerts(data.alerts);
      setHotspotsData(data.hotspots);
      setSpilloverData(data.spillover);
    } catch (e) {
      console.error("Failed to fetch state", e);
    }
  };

  useEffect(() => {
    fetchDashboardState();
    
    // Check URL parameters for scenario
    const params = new URLSearchParams(window.location.search);
    const scenarioParam = params.get('scenario');
    if (scenarioParam === 'market_evening') {
      setActiveScenario('Market Evening Peak');
    } else if (scenarioParam === 'metro_morning') {
      setActiveScenario('Metro Morning Rush');
    } else if (scenarioParam === 'weekend_surge') {
      setActiveScenario('Commercial Weekend');
    }
  }, []);

  // Live Simulation effect
  useEffect(() => {
    if (!isSimulating) return;

    const interval = setInterval(() => {
      // 1. Prepend simulated alert
      const randomAlert = SIMULATED_ALERTS[Math.floor(Math.random() * SIMULATED_ALERTS.length)];
      const uniqueId = `sim-run-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      const newAlert = { ...randomAlert, id: uniqueId };
      
      setAlerts(prev => [newAlert, ...prev.filter(a => !a.id.startsWith('sim-run-')).slice(0, 8)]);

      // 2. Flucluate KPIs slightly to simulate real time sensor telemetry
      setSummary((prev: any) => {
        if (!prev) return prev;
        const deltaScore = (Math.random() - 0.5) * 2.8;
        const deltaLoss = (Math.random() - 0.5) * 1.5;
        const newScore = Math.min(100, Math.max(10, prev.city_mobility_risk_score + deltaScore));
        const newLoss = Math.min(100, Math.max(5, prev.preventable_mobility_loss_pct + deltaLoss));
        
        return {
          ...prev,
          city_mobility_risk_score: newScore,
          cmrs_category: newScore > 75 ? 'Red' : newScore > 55 ? 'Orange' : 'Yellow',
          preventable_mobility_loss_pct: newLoss
        };
      });
    }, 4000);

    return () => clearInterval(interval);
  }, [isSimulating]);

  const runWarRoom = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/enforcement/war-room`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          available_officers: officers === '' ? 0 : Number(officers), 
          available_tow_trucks: trucks === '' ? 0 : Number(trucks) 
        })
      });
      const data = await res.json();
      setWarRoomResult(data);
    } catch (e) {
      console.error("War room failed", e);
    }
  };

  const loadScenario = async (name: string) => {
    setLoadingScenario(name);
    try {
      await fetch(`${API_URL}/api/v1/demo/load-scenario`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario_name: name })
      });
      
      // Update active scenario state
      setActiveScenario(name);
      
      // Update browser URL query parameter without page reload
      const paramMap: { [key: string]: string } = {
        'Market Evening Peak': 'market_evening',
        'Metro Morning Rush': 'metro_morning',
        'Commercial Weekend': 'weekend_surge'
      };
      const param = paramMap[name] || '';
      window.history.pushState({}, '', `${window.location.pathname}?scenario=${param}`);
      
      // Refresh state
      await fetchDashboardState();
      
      // Show success toast
      setToastMessage(`Scenario "${name}" loaded successfully.`);
      setTimeout(() => setToastMessage(null), 4000);
      
      // If we have hotspots, open the top one
      const res = await fetch(`${API_URL}/api/v1/dashboard/state`);
      const data = await res.json();
      if (data.hotspots?.features?.length > 0) {
        // Find most critical
        const critical = data.hotspots.features.reduce((prev: any, curr: any) => 
          (prev.properties.cmrs > curr.properties.cmrs) ? prev : curr
        );
        handleHotspotClick(critical.properties.id);
      }
    } catch (e) {
      console.error("Failed to load scenario", e);
      setToastMessage("Failed to load scenario. Please try again.");
      setTimeout(() => setToastMessage(null), 4000);
    } finally {
      setLoadingScenario(null);
    }
  };

  const handleHotspotClick = async (hotspotId: string) => {
    setDrawerOpen(true);
    setIntelligenceData(null); // loading state
    try {
      const res = await fetch(`${API_URL}/api/v1/hotspots/${hotspotId}/intelligence`);
      const data = await res.json();
      setIntelligenceData(data);
    } catch(e) {
      console.error("Intelligence failed", e);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6 font-sans relative overflow-y-auto lg:overflow-hidden flex flex-col">
      {/* Background Decorative Tech Grids */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.06),transparent_60%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

      <div className={`flex-1 transition-all duration-300 ${drawerOpen ? 'lg:mr-96' : ''} flex flex-col`}>
        {/* Header Panel */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 bg-slate-900/60 backdrop-blur-md border border-slate-800/80 p-5 rounded-2xl shadow-xl shadow-slate-950/20">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 via-indigo-300 to-blue-500 bg-clip-text text-transparent">
                ParkSight-AI
              </h1>
              <span className="text-[9px] font-black tracking-widest uppercase bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/20 shadow-[0_0_12px_rgba(59,130,246,0.15)] flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
                Live Command v2.1
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 font-medium tracking-wide">
              Traffic Command Center & Predictive Intelligence Platform
            </p>
          </div>
          
          <div className="flex flex-wrap gap-3 items-center mt-4 md:mt-0">
            {/* Live Simulation Button */}
            <button 
              onClick={() => setIsSimulating(!isSimulating)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-bold tracking-wide uppercase transition-all duration-300 cursor-pointer 
                ${isSimulating 
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.25)]' 
                  : 'bg-slate-900/90 border-slate-800 text-slate-400 hover:text-white hover:border-slate-500'}`}
            >
              <Radio size={14} className={isSimulating ? "animate-pulse" : ""} />
              <span>{isSimulating ? 'Telemetry Live' : 'Feed Simulation'}</span>
            </button>

            {/* Scenario Engine */}
            <div className="flex flex-wrap gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800/80 justify-center">
              <button 
                onClick={() => loadScenario('Market Evening Peak')} 
                disabled={loadingScenario !== null}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition cursor-pointer flex items-center gap-1.5
                  ${activeScenario === 'Market Evening Peak' 
                    ? 'bg-blue-600/80 border border-blue-500/35 text-white shadow-[0_0_12px_rgba(59,130,246,0.35)]' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/80'}`}
              >
                {loadingScenario === 'Market Evening Peak' && (
                  <div className="w-2.5 h-2.5 border border-white border-t-transparent rounded-full animate-spin"></div>
                )}
                <span>Market Evening</span>
              </button>
              
              <button 
                onClick={() => loadScenario('Metro Morning Rush')} 
                disabled={loadingScenario !== null}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition cursor-pointer flex items-center gap-1.5
                  ${activeScenario === 'Metro Morning Rush' 
                    ? 'bg-blue-600/80 border border-blue-500/35 text-white shadow-[0_0_12px_rgba(59,130,246,0.35)]' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/80'}`}
              >
                {loadingScenario === 'Metro Morning Rush' && (
                  <div className="w-2.5 h-2.5 border border-white border-t-transparent rounded-full animate-spin"></div>
                )}
                <span>Metro Morning</span>
              </button>
              
              <button 
                onClick={() => loadScenario('Commercial Weekend')} 
                disabled={loadingScenario !== null}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition cursor-pointer flex items-center gap-1.5
                  ${activeScenario === 'Commercial Weekend' 
                    ? 'bg-blue-600/80 border border-blue-500/35 text-white shadow-[0_0_12px_rgba(59,130,246,0.35)]' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/80'}`}
              >
                {loadingScenario === 'Commercial Weekend' && (
                  <div className="w-2.5 h-2.5 border border-white border-t-transparent rounded-full animate-spin"></div>
                )}
                <span>Weekend Surge</span>
              </button>
            </div>
          </div>
        </header>

        {/* Top KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
          {/* KPI 1 */}
          <div className={`bg-slate-900/50 backdrop-blur-md p-5 rounded-2xl border border-slate-800 flex flex-col justify-between transition-all duration-300 hover:scale-[1.02] hover:border-slate-700/60 shadow-lg relative overflow-hidden
            ${summary?.cmrs_category === 'Red' ? 'shadow-glow-red' : summary?.cmrs_category === 'Orange' ? 'shadow-glow-orange' : 'shadow-glow-yellow'}`}>
            <div className={`absolute top-0 left-0 w-full h-0.5 transition-all duration-500 
              ${summary?.cmrs_category === 'Red' ? 'bg-red-500' : summary?.cmrs_category === 'Orange' ? 'bg-orange-500' : 'bg-yellow-500'}`} />
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-2">
              <span className="text-xs text-slate-400 font-semibold tracking-wide flex items-center gap-1.5">
                <Cpu size={14} className="text-blue-400" />
                City Mobility Risk Score (CMRS)
              </span>
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider shrink-0
                ${summary?.cmrs_category === 'Red' 
                  ? 'bg-red-500/10 border-red-500/20 text-red-400' 
                  : summary?.cmrs_category === 'Orange' 
                    ? 'bg-orange-500/10 border-orange-500/20 text-orange-400' 
                    : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'}`}>
                {summary?.cmrs_category || 'Orange'} Level
              </span>
            </div>
            
            <div className="flex items-baseline gap-2 mt-2">
              <span className={`text-4xl font-extrabold transition-colors duration-500 tracking-tight
                ${summary?.cmrs_category === 'Red' ? 'text-red-500' : summary?.cmrs_category === 'Orange' ? 'text-orange-400' : 'text-yellow-400'}`}>
                {summary?.city_mobility_risk_score != null ? Number(summary.city_mobility_risk_score).toFixed(2) : ''}
              </span>
              <span className="text-xs text-slate-500">/ 100 max</span>
            </div>
          </div>

          {/* KPI 2 */}
          <div className="bg-slate-900/50 backdrop-blur-md p-5 rounded-2xl border border-slate-800 flex flex-col justify-between transition-all duration-300 hover:scale-[1.02] hover:border-slate-700/60 shadow-lg relative overflow-hidden shadow-glow-blue">
            <div className="absolute top-0 left-0 w-full h-0.5 bg-blue-500" />
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-2">
              <span className="text-xs text-slate-400 font-semibold tracking-wide flex items-center gap-1.5">
                <TrendingDown size={14} className="text-blue-400" />
                Preventable Mobility Loss
              </span>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded border bg-blue-500/10 border-blue-500/20 text-blue-400 uppercase tracking-wider shrink-0">
                Target Score
              </span>
            </div>

            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-4xl font-extrabold text-blue-400 tracking-tight">
                {summary?.preventable_mobility_loss_pct != null ? Number(summary.preventable_mobility_loss_pct).toFixed(2) : ''}%
              </span>
              <span className="text-xs text-slate-500">Optimizable</span>
            </div>
          </div>

          {/* KPI 3 */}
          <div className="bg-slate-900/50 backdrop-blur-md p-5 rounded-2xl border border-slate-800 flex flex-col justify-between transition-all duration-300 hover:scale-[1.02] hover:border-slate-700/60 shadow-lg relative overflow-hidden shadow-glow-green">
            <div className="absolute top-0 left-0 w-full h-0.5 bg-emerald-500" />
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-2">
              <span className="text-xs text-slate-400 font-semibold tracking-wide flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-emerald-400" />
                Critical Hotspots
              </span>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded border bg-emerald-500/10 border-emerald-500/20 text-emerald-400 uppercase tracking-wider shrink-0">
                Active Count
              </span>
            </div>

            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-4xl font-extrabold text-emerald-400 tracking-tight">
                {summary?.critical_hotspots}
              </span>
              <span className="text-xs text-slate-500">Deployment Required</span>
            </div>
          </div>
        </div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
          {/* Map Section */}
          <div className="lg:col-span-2 bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-850 p-1.5 shadow-[0_15px_35px_rgba(0,0,0,0.6)] h-[380px] md:h-[480px] lg:h-[560px] relative transition-all duration-300 hover:border-slate-800/80">
            <Map 
              hotspotsData={hotspotsData} 
              spilloverData={spilloverData} 
              warRoomResult={warRoomResult}
              onHotspotClick={handleHotspotClick}
            />
          </div>

          {/* Right Action Panels */}
          <div className="flex flex-col gap-6 h-auto lg:h-[560px]">
            {/* Smart Alerts Feed */}
            <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 p-5 shadow-xl h-60 lg:h-auto lg:max-h-64 overflow-y-auto relative transition-all duration-300 hover:border-slate-700/60 flex flex-col">
              <div className="flex justify-between items-center mb-3.5 pb-2 border-b border-slate-800/60">
                <h2 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <AlertTriangle size={15} className="text-red-500 animate-pulse" />
                  <span>Executive Smart Alerts</span>
                </h2>
                {isSimulating && (
                  <span className="flex h-2.5 w-2.5 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                  </span>
                )}
              </div>
              
              <div className="space-y-2.5 overflow-y-auto flex-1 pr-1">
                {alerts.map(alert => (
                  <div 
                    key={alert.id} 
                    className={`p-3 rounded-xl border border-slate-800/60 border-l-4 relative transition-all duration-300
                      ${alert.id.startsWith('sim-run-') 
                        ? 'bg-red-500/5 border-l-red-500 shadow-[0_0_12px_rgba(239,68,68,0.1)] animate-fade-in-slide-up' 
                        : 'bg-slate-950/40 border-l-blue-500'}`}
                  >
                    <span className="absolute top-2 right-2 text-[9px] font-black text-slate-400 bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded">
                      {alert.confidence_score}% Conf
                    </span>
                    <p className="text-[9px] font-bold text-blue-400 uppercase tracking-widest mb-1">{alert.alert_type}</p>
                    <p className="text-xs text-slate-300 leading-snug pr-12 font-medium">{alert.message}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Tactical War Room */}
            <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 p-5 shadow-xl flex-1 flex flex-col overflow-hidden min-h-[350px] lg:min-h-0 transition-all duration-300 hover:border-slate-700/60">
              <div className="flex items-center gap-2 mb-2.5 pb-2 border-b border-slate-800/60">
                <Activity size={15} className="text-blue-400 animate-pulse" />
                <h2 className="text-xs font-black uppercase tracking-wider text-slate-300">Resource War Room</h2>
              </div>
              <p className="text-[11px] text-slate-400 font-medium leading-relaxed mb-4">
                Input available traffic command resources to calculate the optimal allocation strategy maximizing city flow.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <div className="flex-1">
                  <label className="block text-[9px] uppercase tracking-wider font-bold text-slate-400 mb-1">Officers</label>
                  <input 
                    type="number" 
                    value={officers} 
                    onChange={e => setOfficers(e.target.value === '' ? '' : parseInt(e.target.value))} 
                    placeholder="e.g. 5" 
                    className="w-full bg-slate-950/60 border border-slate-800 focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/30 rounded-xl p-2.5 text-xs font-semibold text-white focus:outline-none transition-all duration-200" 
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-[9px] uppercase tracking-wider font-bold text-slate-400 mb-1">Tow Trucks</label>
                  <input 
                    type="number" 
                    value={trucks} 
                    onChange={e => setTrucks(e.target.value === '' ? '' : parseInt(e.target.value))} 
                    placeholder="e.g. 2" 
                    className="w-full bg-slate-950/60 border border-slate-800 focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/30 rounded-xl p-2.5 text-xs font-semibold text-white focus:outline-none transition-all duration-200" 
                  />
                </div>
              </div>
              
              <button 
                onClick={runWarRoom} 
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-extrabold uppercase tracking-widest py-3 rounded-xl transition duration-300 shadow-[0_0_15px_rgba(59,130,246,0.3)] hover:shadow-[0_0_20px_rgba(59,130,246,0.45)] cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Sparkles size={14} />
                Optimize Deployment
              </button>

              {/* Scrollable Results container */}
              <div className="overflow-y-auto flex-1 mt-4 pr-1 space-y-2.5 scrollbar-thin">
                {warRoomResult ? (
                  <>
                    <h3 className="text-[10px] font-black uppercase tracking-wider text-emerald-400 mb-1 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                      Deployment Strategy
                    </h3>
                    <div className="space-y-2">
                      {warRoomResult.allocations.map((alloc: any, idx: number) => (
                        <div key={idx} className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/80 transition-all duration-300 hover:border-slate-700/60">
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-bold text-xs text-blue-300">{alloc.location}</span>
                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider 
                              ${alloc.intervention_roi === 'High' 
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                                : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'}`}>
                              ROI: {alloc.intervention_roi}
                            </span>
                          </div>
                          <p className="text-xs text-slate-300 font-medium leading-relaxed mt-1.5">{alloc.recommended_action}</p>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-500 text-[11px] font-medium border border-dashed border-slate-800/80 rounded-xl bg-slate-950/20 py-6">
                    No active allocation. Configure inputs.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Intelligence Drawer */}
      <IntelligenceDrawer 
        isOpen={drawerOpen} 
        onClose={() => setDrawerOpen(false)} 
        data={intelligenceData} 
      />
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 left-6 z-50 bg-slate-900/95 border border-blue-500/30 text-slate-100 text-xs px-4 py-3.5 rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] flex items-center gap-2 border-l-4 border-l-blue-500 transition-all duration-300 animate-fade-in-slide-up">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
          <span className="font-semibold">{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
