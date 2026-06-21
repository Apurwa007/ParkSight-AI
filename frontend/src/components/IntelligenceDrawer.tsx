import { X, ShieldAlert, TrendingDown, Target, Zap } from 'lucide-react';

const renderMarkdown = (text: string) => {
  if (!text) return null;
  
  // Clean double-serialization enclosing quotes
  let cleanText = text.trim();
  if (cleanText.startsWith('"') && cleanText.endsWith('"')) {
    cleanText = cleanText.substring(1, cleanText.length - 1).trim();
  }
  
  // Replace literal '\n' sequences with real newlines
  cleanText = cleanText.replace(/\\n/g, '\n');
  
  const lines = cleanText.split('\n');
  
  return lines.map((line, idx) => {
    let cleanLine = line.trim();
    if (!cleanLine) return <div key={idx} className="h-2" />;
    
    const parseBold = (str: string) => {
      const parts = str.split('**');
      return parts.map((part, i) => {
        if (i % 2 === 1) {
          return <strong key={i} className="font-semibold text-slate-200">{part}</strong>;
        }
        return part;
      });
    };

    if (cleanLine.startsWith('### ')) {
      return (
        <h4 key={idx} className="text-xs font-bold text-slate-200 mt-3 mb-1 uppercase tracking-wider">
          {parseBold(cleanLine.substring(4))}
        </h4>
      );
    }
    
    if (cleanLine.startsWith('## ') || cleanLine.startsWith('# ')) {
      const headerText = cleanLine.startsWith('## ') ? cleanLine.substring(3) : cleanLine.substring(2);
      return (
        <h3 key={idx} className="text-sm font-semibold text-blue-400 mt-4 mb-2">
          {parseBold(headerText)}
        </h3>
      );
    }

    if (cleanLine.startsWith('- ') || cleanLine.startsWith('* ') || cleanLine.startsWith('• ')) {
      return (
        <div key={idx} className="flex items-start gap-2 ml-2 my-1 text-xs text-slate-300 leading-relaxed">
          <span className="text-blue-500 mt-1 font-bold">•</span>
          <span className="flex-1">{parseBold(cleanLine.substring(2))}</span>
        </div>
      );
    }

    if (cleanLine.startsWith('⚠️')) {
      return (
        <div key={idx} className="bg-amber-500/10 border border-amber-500/20 rounded p-3 my-3 text-xs text-amber-300 leading-relaxed">
          {parseBold(cleanLine)}
        </div>
      );
    }

    return (
      <p key={idx} className="text-xs text-slate-300 leading-relaxed mb-2">
        {parseBold(cleanLine)}
      </p>
    );
  });
};

interface IntelligenceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  data: any | null;
}

export default function IntelligenceDrawer({ isOpen, onClose, data }: IntelligenceDrawerProps) {
  if (!isOpen) return null;

  // AI Forecast 6h Trend curve calculations
  const currentVal = data?.cmrs || 0;
  const val3h = data?.risk_score_3h || currentVal;
  const isRising = data?.trend?.includes('Rising');
  const isFalling = data?.trend?.includes('Falling');
  
  // Create 5 data points representing Hour 0, 1.5, 3, 4.5, 6
  let p0 = currentVal;
  let p1 = (currentVal * 2 + val3h) / 3 + (isRising ? 5 : isFalling ? -5 : 0);
  let p2 = val3h;
  let p3 = val3h + (isRising ? 8 : isFalling ? -8 : 2);
  let p4 = val3h + (isRising ? 12 : isFalling ? -15 : -3);

  const clamp = (val: number) => Math.min(100, Math.max(0, val));
  const points = [p0, p1, p2, p3, p4].map(clamp);

  const width = 150;
  const height = 36;
  const xCoords = [0, 37.5, 75, 112.5, 150];
  const yCoords = points.map(p => height - (p / 100) * (height - 8));
  
  const pathD = `M ${xCoords[0]} ${yCoords[0]} L ${xCoords[1]} ${yCoords[1]} L ${xCoords[2]} ${yCoords[2]} L ${xCoords[3]} ${yCoords[3]} L ${xCoords[4]} ${yCoords[4]}`;
  const areaD = `${pathD} L 150 ${height} L 0 ${height} Z`;

  // Dynamic SHAP Factors or Fallback
  let factors: any[] = [];
  if (data?.shap_values) {
    const rawShap = data.shap_values;
    const featureInfo: { [key: string]: { name: string, desc: string, color: string } } = {
      'violations_last_1h': { name: 'Recent Inflow Surge (1h)', desc: 'Sensor activity spike', color: 'from-rose-500 to-red-600' },
      'violations_last_3h': { name: 'Short-term Density (3h)', desc: 'Accumulating vehicles', color: 'from-red-500 to-rose-600' },
      'violations_last_24h': { name: 'Daily Baseline Traffic', desc: 'Average daily volume', color: 'from-amber-500 to-orange-600' },
      'same_hour_last_day': { name: 'Diurnal Recurrence Shift', desc: 'Yesterday pattern match', color: 'from-amber-500 to-yellow-600' },
      'same_hour_last_week': { name: 'Weekly Load Telemetry', desc: 'Same hour last week', color: 'from-indigo-500 to-blue-600' },
      'same_day_last_week': { name: 'Weekly Day Telemetry', desc: 'Same day last week', color: 'from-indigo-500 to-blue-600' },
      'hour_of_day': { name: 'Hourly Load Factor', desc: 'Diurnal time profile', color: 'from-blue-500 to-cyan-600' },
      'day_of_week': { name: 'Weekly Load Factor', desc: 'Weekly calendar profile', color: 'from-blue-500 to-cyan-600' },
      'weekend_flag': { name: 'Weekend Flow Offset', desc: 'Weekend shift congestion', color: 'from-emerald-500 to-green-600' },
      'peak_hour_flag': { name: 'Rush Hour Congestion', desc: 'Peak hour load surge', color: 'from-rose-500 to-orange-500' },
      'month': { name: 'Seasonal Traffic Offset', desc: 'Month offset multiplier', color: 'from-slate-500 to-slate-600' },
      'precipitation_mm': { name: 'Hourly Rainfall Index', desc: 'Precipitation volume (mm)', color: 'from-blue-400 to-sky-600' },
      'temperature_c': { name: 'Ambient Temperature Factor', desc: 'Temperature level (°C)', color: 'from-orange-400 to-amber-600' },
      'is_holiday': { name: 'Public Holiday Traffic Wave', desc: 'Regional calendar holiday', color: 'from-purple-500 to-indigo-600' }
    };
    
    const sortedFeatures = Object.entries(rawShap)
      .map(([feat, val]) => ({
        feat,
        val: val as number,
        absVal: Math.abs(val as number)
      }))
      .sort((a, b) => b.absVal - a.absVal);
      
    // Always include active weather/holiday features in the display if they have non-trivial impact
    const telemetryKeys = ['precipitation_mm', 'temperature_c', 'is_holiday'];
    const telemetryFeatures = sortedFeatures.filter(f => telemetryKeys.includes(f.feat) && f.absVal > 0.0001);
    const generalFeatures = sortedFeatures.filter(f => !telemetryKeys.includes(f.feat));
    
    // Take top 3 general features
    const topGeneral = generalFeatures.slice(0, 3);
    
    // Combine, keeping top general first, then active telemetry, then remaining general up to 5 total
    let combined = [...topGeneral];
    for (const tf of telemetryFeatures) {
      if (!combined.some(c => c.feat === tf.feat)) {
        combined.push(tf);
      }
    }
    const topFeatures = combined.slice(0, 5);
    
    const maxAbs = Math.max(...topFeatures.map(f => f.absVal), 1.0);
    factors = topFeatures.map(f => {
      const info = featureInfo[f.feat] || { name: f.feat, desc: 'Local feature impact', color: 'from-blue-500 to-indigo-600' };
      const normalizedPercent = Math.min(100, Math.max(12, (f.absVal / maxAbs) * 100));
      return {
        name: info.name,
        value: normalizedPercent,
        impact: `${f.val >= 0 ? '+' : ''}${f.val.toFixed(2)}`,
        color: info.color,
        text: info.desc
      };
    });
  } else if (data) {
    factors = [
      { name: 'Mobility Disruption (MDI)', value: data.mdi, impact: `+${(data.mdi * 0.45).toFixed(1)}`, color: 'from-red-500 to-rose-600', text: 'Critical congestion' },
      { name: 'Parking Accumulation (PIS)', value: data.pis, impact: `+${(data.pis * 0.35).toFixed(1)}`, color: 'from-amber-500 to-orange-600', text: 'High occupancy' },
      { name: 'Spillover Threat (SIS)', value: data.sis, impact: `+${(data.sis * 0.20).toFixed(1)}`, color: 'from-blue-500 to-indigo-600', text: 'Spillover transfer' },
    ];
  } else {
    factors = [];
  }

  return (
    <>
      {/* Drawer Overlay Backdrop */}
      {isOpen && (
        <div 
          onClick={onClose} 
          className="fixed inset-0 bg-slate-950/40 backdrop-blur-[2px] z-40 transition-opacity duration-300"
        />
      )}

      <div className={`fixed inset-y-0 right-0 w-full sm:w-96 bg-slate-900/95 backdrop-blur-md border-l border-slate-800 shadow-2xl transform transition-transform duration-300 ease-in-out z-50 overflow-y-auto flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Neon left glowing border indicator */}
        <div className="absolute top-0 left-0 w-[1.5px] h-full bg-gradient-to-b from-blue-500/80 via-indigo-500 to-blue-500/20 shadow-[1px_0_12px_rgba(59,130,246,0.4)] pointer-events-none" />

        {/* Header */}
        <div className="p-5 border-b border-slate-800/80 flex justify-between items-center bg-slate-900/40 backdrop-blur-md sticky top-0 z-10">
          <div>
            <h2 className="text-base font-extrabold text-slate-100 tracking-wide">{data?.location_name || 'Hotspot Intelligence'}</h2>
            {data?.risk_category_1h && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider mt-2.5 
                ${data.risk_category_1h === 'Critical' 
                  ? 'bg-red-500/10 text-red-400 border border-red-500/20' 
                  : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'}`}>
                <ShieldAlert size={10} className="animate-pulse" /> {data.risk_category_1h} Risk
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/60 transition duration-200 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {data ? (
          <div className="p-5 space-y-6 flex-1">
            {/* Top Level Metrics */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-950/40 rounded-xl p-4 border border-slate-800/80 shadow-inner flex flex-col justify-between">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Current CMRS</p>
                <div className="flex items-baseline gap-1.5">
                  <p className={`text-3xl font-black tracking-tight ${data.cmrs > 75 ? 'text-red-400' : 'text-yellow-400'}`}>{Math.round(data.cmrs)}</p>
                  <span className={`text-[10px] font-bold ${data.trend?.includes('Rising') ? 'text-red-400' : data.trend?.includes('Falling') ? 'text-green-400' : 'text-slate-400'}`}>{data.trend}</span>
                </div>
              </div>
              
              {/* AI Forecast Trend Graph */}
              <div className="bg-slate-950/40 rounded-xl p-4 border border-slate-800/80 shadow-inner relative overflow-hidden flex flex-col justify-between">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 font-sans">AI Forecast (6h)</p>
                <div className="flex items-center gap-2 mt-1">
                  {/* SVG Sparkline */}
                  <div className="flex-1 h-[32px] relative overflow-visible">
                    <svg viewBox="0 0 150 36" className="w-full h-full overflow-visible">
                      <defs>
                        <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={isRising ? "#ef4444" : "#f59e0b"} stopOpacity="0.35" />
                          <stop offset="100%" stopColor={isRising ? "#ef4444" : "#f59e0b"} stopOpacity="0" />
                        </linearGradient>
                        <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#3b82f6" />
                          <stop offset="100%" stopColor={isRising ? "#ef4444" : "#f59e0b"} />
                        </linearGradient>
                      </defs>
                      
                      {/* Grid Guide */}
                      <line x1="0" y1="18" x2="150" y2="18" stroke="#475569" strokeWidth="0.5" strokeDasharray="2,2" opacity="0.25" />
                      
                      {/* Area fill */}
                      <path d={areaD} fill="url(#areaGradient)" />
                      
                      {/* Line path */}
                      <path d={pathD} fill="none" stroke="url(#lineGradient)" strokeWidth="2" strokeLinecap="round" />
                      
                      {/* End nodes */}
                      <circle cx={xCoords[0]} cy={yCoords[0]} r="2" className="fill-slate-950 stroke-blue-400 stroke-[1.5]" />
                      <circle cx={xCoords[4]} cy={yCoords[4]} r="2.5" className={`fill-slate-950 ${isRising ? 'stroke-red-400' : 'stroke-amber-400'} stroke-[1.5]`} />
                    </svg>
                    <div className="flex justify-between text-[7px] text-slate-500 mt-1 uppercase font-bold tracking-wider">
                      <span>Now</span>
                      <span>3h</span>
                      <span>6h</span>
                    </div>
                  </div>

                  {/* Categories */}
                  <div className="text-right text-[9px] leading-tight pl-1.5 border-l border-slate-800/80">
                    <span className="text-slate-500 block text-[7px] font-bold uppercase tracking-wider">Risk 3h</span>
                    <span className={`font-black block ${data.risk_category_3h === 'Critical' ? 'text-red-400' : 'text-yellow-400'}`}>{data.risk_category_3h || data.risk_category_1h}</span>
                    <span className="text-slate-500 block text-[7px] font-bold uppercase tracking-wider mt-1.5">Conf</span>
                    <span className="text-slate-400 font-bold">{data.confidence}%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Sub Metrics - Custom SHAP bar chart list */}
            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Target size={14} className="text-slate-500" /> Factor Analysis
              </h3>
              <div className="bg-slate-950/40 rounded-xl p-4 border border-slate-800/80 space-y-3.5">
                {factors.map((factor, idx) => (
                  <div key={idx} className="group/factor">
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="text-xs text-slate-300 font-bold tracking-wide group-hover/factor:text-white transition duration-200">{factor.name}</span>
                      <div className="flex gap-2 items-center">
                        <span className="text-[9px] text-slate-500 font-medium italic">{factor.text}</span>
                        <span className="text-xs font-bold text-slate-200">{Math.round(factor.value)}%</span>
                      </div>
                    </div>
                    <div className="relative w-full bg-slate-900/60 h-2.5 rounded-full overflow-hidden border border-slate-800/60 shadow-inner">
                      <div 
                        className={`h-full rounded-full bg-gradient-to-r ${factor.color} transition-all duration-500 relative`}
                        style={{ width: `${factor.value}%` }}
                      >
                        <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.15)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.15)_50%,rgba(255,255,255,0.15)_75%,transparent_75%,transparent)] bg-[length:12px_12px] animate-[progress-bar-stripes_1s_linear_infinite] opacity-30"></div>
                      </div>
                    </div>
                    <div className="flex justify-between text-[8px] text-slate-500 mt-1 font-semibold">
                      <span>Base Impact: +0.00</span>
                      <span className="font-bold text-slate-400">Contribution: {factor.impact}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Copilot Action */}
            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Zap size={14} className="text-blue-400" /> Copilot Recommendation
              </h3>
              <div className="bg-blue-950/20 rounded-xl p-4 border border-blue-900/30">
                <p className="text-xs text-slate-200 font-semibold leading-relaxed mb-3">{data.recommended_action}</p>
                <div className="flex items-center gap-2 text-green-400 text-xs font-bold bg-green-500/10 p-2 rounded-lg border border-green-500/15">
                  <TrendingDown size={14} /> Expected Improvement: {data.expected_improvement}
                </div>
                
                {data.copilot && (
                  <div className="mt-4 pt-4 border-t border-blue-900/20 space-y-2 text-xs">
                    {renderMarkdown(typeof data.copilot === 'object' ? data.copilot.insight_text : data.copilot)}
                  </div>
                )}
              </div>
            </div>

          </div>
        ) : (
          <div className="p-5 flex flex-col items-center justify-center h-64 text-slate-500">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-xs font-medium tracking-wide">Loading intelligence metrics...</p>
          </div>
        )}
      </div>
    </>
  );
}
