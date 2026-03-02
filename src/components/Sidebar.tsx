import React from 'react';
import { Home, Trophy, User, Settings, Info, Map } from 'lucide-react';
import { Character } from './Character';
import { useStore } from '../store/useStore';

export const Sidebar: React.FC = () => {
  const setView = useStore(state => state.setView);
  const currentView = useStore(state => state.view);

  const menuItems = [
    { id: 'learn', icon: <Home size={32} />, label: 'Aprender' },
    { id: 'city', icon: <Map size={32} />, label: 'Metrópolis 3D' },
    { id: 'leagues', icon: <Trophy size={32} />, label: 'Ligas' },
    { id: 'profile', icon: <User size={32} />, label: 'Perfil' },
    { id: 'mechanics', icon: <Info size={32} />, label: 'Mecánica' },
    { id: 'settings', icon: <Settings size={32} />, label: 'Configuración' },
  ];

  return (
    <div className="fixed left-0 top-0 h-full w-64 border-r-2 border-duo-gray-light bg-white p-4 hidden md:flex flex-col">
      <div className="mb-8 px-4 flex items-center gap-2 py-4">
        <Character size={40} expression="wink" />
        <h1 className="text-3xl font-bold text-duo-green tracking-tighter">autolingo</h1>
      </div>

      <nav className="flex-1 space-y-2 px-2">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              if (item.id === 'learn' || item.id === 'city') {
                setView(item.id as 'learn' | 'city');
              }
            }}
            className={`flex items-center w-full gap-4 px-4 py-3 rounded-xl font-bold uppercase tracking-wide transition-all border-2 ${
              currentView === item.id
                ? 'bg-[#ddf4ff] text-[#1cb0f6] border-[#84d8ff]'
                : 'text-[#777] border-transparent hover:bg-[#f7f7f7]'
            }`}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="mt-auto p-4 bg-duo-gray-light/30 rounded-2xl flex flex-col items-center text-center">
        <Character size={80} />
        <p className="text-xs font-bold text-duo-gray-dark mt-2 uppercase">Tu guía automotriz</p>
      </div>
    </div>
  );
};
