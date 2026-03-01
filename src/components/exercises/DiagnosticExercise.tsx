import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Activity } from 'lucide-react';
import type { Option } from '../../types';

interface DiagnosticProps {
  scenario: string;
  symptoms: string[];
  options: Option[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  status: 'idle' | 'correct' | 'incorrect';
}

export const DiagnosticExercise: React.FC<DiagnosticProps> = ({
  scenario,
  symptoms,
  options,
  selectedId,
  onSelect,
  status
}) => {
  return (
    <div className="flex flex-col gap-6 w-full max-w-2xl mx-auto py-4">
      {/* Scenario Card */}
      <div className="bg-white border-2 border-duo-gray-light rounded-3xl p-6 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-duo-yellow" />
        <div className="flex items-start gap-4">
          <div className="bg-yellow-100 p-3 rounded-2xl text-duo-yellow-dark shrink-0">
             <AlertTriangle size={32} />
          </div>
          <div>
            <h3 className="font-black text-duo-gray-dark text-lg uppercase mb-2">Caso de Diagnóstico</h3>
            <p className="text-duo-gray-dark font-medium leading-relaxed">
              "{scenario}"
            </p>
          </div>
        </div>

        {/* Symptoms list */}
        <div className="mt-4 flex flex-wrap gap-2">
          {symptoms.map((symptom, i) => (
            <div key={i} className="flex items-center gap-2 bg-duo-gray-light/50 px-3 py-1 rounded-full text-xs font-bold text-duo-gray uppercase">
               <Activity size={14} className="text-duo-blue" />
               {symptom}
            </div>
          ))}
        </div>
      </div>

      <div className="text-center">
         <h4 className="font-bold text-duo-gray uppercase tracking-widest text-sm">¿Cuál es el diagnóstico más probable?</h4>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {options.map((option) => (
          <motion.button
            key={option.id}
            whileTap={{ y: 4 }}
            onClick={() => status === 'idle' && onSelect(option.id)}
            className={`
              p-4 border-2 rounded-2xl text-left font-bold transition-all flex flex-col gap-1
              ${selectedId === option.id
                ? status === 'correct' ? 'border-duo-green bg-green-50 text-duo-green shadow-[0_4px_0_0_#58cc02]' :
                  status === 'incorrect' ? 'border-duo-red bg-red-50 text-duo-red shadow-[0_4px_0_0_#ff4b4b]' :
                  'border-duo-blue bg-blue-50 text-duo-blue shadow-[0_4px_0_0_#1cb0f6]'
                : 'border-duo-gray-light hover:bg-gray-50 shadow-[0_4px_0_0_#e5e5e5]'}
            `}
          >
            <span className="text-lg">{option.text}</span>
            <span className="text-[10px] opacity-60 uppercase">Procedimiento recomendado</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
};
