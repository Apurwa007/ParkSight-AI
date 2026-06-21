import { useState } from 'react';
import { Layers, Target, ShieldAlert, Flame, TrendingUp, Shield, X } from 'lucide-react';

interface MapControlsProps {
  layers: { [key: string]: boolean };
  onToggleLayer: (layerName: string) => void;
}

export default function MapControls({ layers, onToggleLayer }: MapControlsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Map layer names to appropriate icons
  const getIcon = (layerName: string) => {
    switch (layerName) {
      case 'Hotspots':
        return <Target size={14} className="text-red-400" />;
      case 'Risk Rings':
        return <ShieldAlert size={14} className="text-orange-400" />;
      case 'Heatmap':
        return <Flame size={14} className="text-yellow-400" />;
      case 'Spillover Network':
        return <TrendingUp size={14} className="text-amber-500" />;
      case 'Enforcement Zones':
        return <Shield size={14} className="text-blue-400" />;
      default:
        return <Layers size={14} className="text-slate-400" />;
    }
  };

  if (!isExpanded) {
    return (
      <button 
        onClick={() => setIsExpanded(true)}
        className="absolute top-4 left-4 bg-slate-950/80 backdrop-blur-md border border-slate-800 p-3 rounded-xl shadow-2xl z-10 cursor-pointer hover:border-slate-700/60 hover:bg-slate-900/80 transition-all duration-200 flex items-center gap-2 text-slate-300 hover:text-white"
        title="Show Map Layers"
      >
        <Layers size={16} className="text-blue-400" />
        <span className="text-[10px] uppercase tracking-wider font-bold lg:hidden">Layers</span>
      </button>
    );
  }

  return (
    <div className="absolute top-4 left-4 bg-slate-950/85 backdrop-blur-md border border-slate-800 p-4 rounded-xl shadow-2xl z-10 w-60 transition-all duration-300 hover:border-slate-700/60 animate-fade-in-slide-up">
      <div className="flex items-center justify-between mb-3.5 pb-2 border-b border-slate-800/80">
        <div className="flex items-center gap-2 text-slate-100 font-semibold">
          <Layers size={16} className="text-blue-400 animate-pulse" />
          <span className="text-xs uppercase tracking-wider">Map Layers</span>
        </div>
        <button 
          onClick={() => setIsExpanded(false)}
          className="text-slate-500 hover:text-slate-300 transition duration-150 cursor-pointer"
        >
          <X size={14} />
        </button>
      </div>
      
      <div className="space-y-3">
        {Object.entries(layers).map(([key, isEnabled]) => (
          <label key={key} className="flex items-center justify-between cursor-pointer group select-none">
            <div className="flex items-center gap-2">
              {getIcon(key)}
              <span className="text-xs font-medium text-slate-300 group-hover:text-white transition duration-200">{key}</span>
            </div>
            
            <div className="flex items-center">
              <input 
                type="checkbox" 
                className="sr-only" 
                checked={isEnabled} 
                onChange={() => onToggleLayer(key)} 
              />
              <div className={`relative w-8 h-4 rounded-full transition-all duration-300 border border-slate-700/50 
                ${isEnabled ? 'bg-blue-500/80 border-blue-400/30 shadow-[0_0_8px_rgba(59,130,246,0.3)]' : 'bg-slate-800'}`}
              >
                <div className={`absolute top-0.5 left-0.5 bg-white w-2.5 h-2.5 rounded-full shadow transition-all duration-300 
                  ${isEnabled ? 'transform translate-x-4 bg-white' : 'bg-slate-400'}`}
                />
              </div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
