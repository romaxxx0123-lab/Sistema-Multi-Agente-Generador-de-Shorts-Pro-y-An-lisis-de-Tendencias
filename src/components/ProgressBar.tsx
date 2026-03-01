import React from 'react';
import { X } from 'lucide-react';

interface ProgressBarProps {
  progress: number; // 0 to 1
  onClose?: () => void;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ progress, onClose }) => {
  const rotation = -90 + (progress * 180); // -90deg to 90deg for a semi-circle

  // Calculate gear based on progress (1 to 6)
  const currentGear = Math.min(6, Math.floor(progress * 6) + 1);

  return (
    <div className="flex items-center gap-6 w-full max-w-5xl mx-auto px-4 py-4">
      {onClose && (
        <button onClick={onClose} className="text-duo-gray hover:text-duo-gray-dark transition-colors shrink-0">
          <X size={28} strokeWidth={3} />
        </button>
      )}

      <div className="flex-1 flex items-center gap-4">
        {/* Tachometer Style Gauge */}
        <div className="relative w-20 h-12 shrink-0 overflow-hidden">
          <svg viewBox="0 0 100 60" className="w-full h-full">
            {/* Background Arch */}
            <path
              d="M 10 50 A 40 40 0 0 1 90 50"
              fill="none"
              stroke="#e5e5e5"
              strokeWidth="8"
              strokeLinecap="round"
            />
            {/* Progress Arch */}
            <path
              d="M 10 50 A 40 40 0 0 1 90 50"
              fill="none"
              stroke={progress > 0.85 ? "#ff4b4b" : "#58cc02"}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray="125.6"
              strokeDashoffset={125.6 * (1 - progress)}
              className="transition-all duration-700 ease-out"
            />
            {/* Redline indicator */}
            <path
              d="M 80 20 A 40 40 0 0 1 90 50"
              fill="none"
              stroke="#ef4444"
              strokeWidth="2"
              opacity="0.5"
            />

            {/* Needle */}
            <line
              x1="50" y1="50" x2="50" y2="15"
              stroke="#4b4b4b"
              strokeWidth="3"
              strokeLinecap="round"
              style={{
                transformOrigin: '50px 50px',
                transform: `rotate(${rotation}deg)`
              }}
              className="transition-transform duration-700 ease-out"
            />
            <circle cx="50" cy="50" r="4" fill="#4b4b4b" />
          </svg>

          {/* Gear Indicator Overlay */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] font-black px-1.5 rounded-t-sm">
            G{currentGear}
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-1">
          <div className="flex justify-between text-[10px] font-black text-duo-gray uppercase tracking-widest italic">
            <span>RACE HUD // RPM x 1000</span>
            <span>{Math.round(progress * 9000)} RPM</span>
          </div>
          <div className="h-4 bg-duo-gray-light rounded-sm overflow-hidden border border-duo-gray-light p-[2px]">
            <div
              className={`h-full transition-all duration-500 ease-out rounded-sm relative ${
                progress > 0.85 ? 'bg-duo-red shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-duo-green'
              }`}
              style={{ width: `${progress * 100}%` }}
            >
              {/* Segment markers */}
              <div className="absolute inset-0 flex justify-between px-1 opacity-20 pointer-events-none">
                {[...Array(10)].map((_, i) => (
                  <div key={i} className="w-[1px] h-full bg-white" />
                ))}
              </div>
              <div className="w-full h-1/2 bg-white/20" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
