import React from 'react';
import { X } from 'lucide-react';

interface ProgressBarProps {
  progress: number; // 0 to 1
  onClose?: () => void;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ progress, onClose }) => {
  return (
    <div className="flex items-center gap-4 w-full max-w-5xl mx-auto px-4 py-8">
      {onClose && (
        <button onClick={onClose} className="text-duo-gray hover:text-duo-gray-dark transition-colors">
          <X size={28} strokeWidth={3} />
        </button>
      )}
      <div className="flex-1 h-4 bg-duo-gray-light rounded-full overflow-hidden">
        <div
          className="h-full bg-duo-green transition-all duration-500 ease-out rounded-full"
          style={{ width: `${progress * 100}%` }}
        >
          <div className="w-full h-1/3 bg-white/30" />
        </div>
      </div>
    </div>
  );
};
