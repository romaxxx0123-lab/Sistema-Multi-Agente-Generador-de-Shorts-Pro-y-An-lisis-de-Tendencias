import React from 'react';
import { Home, Trophy, User, Settings, Info } from 'lucide-react';
import { Character } from './Character';

export const Sidebar: React.FC = () => {
  const menuItems = [
    { icon: <Home size={32} />, label: 'Aprender', active: true },
    { icon: <Trophy size={32} />, label: 'Ligas', active: false },
    { icon: <User size={32} />, label: 'Perfil', active: false },
    { icon: <Info size={32} />, label: 'Mecánica', active: false },
    { icon: <Settings size={32} />, label: 'Configuración', active: false },
  ];

  return (
    <div className="fixed left-0 top-0 h-full w-64 border-r-2 border-duo-gray-light bg-white p-4 hidden md:flex flex-col">
      <div className="mb-10 px-4 flex items-center gap-2">
        <Character size={40} expression="wink" />
        <h1 className="text-3xl font-bold text-duo-green tracking-tighter">autolingo</h1>
      </div>

      <nav className="flex-1 space-y-2">
        {menuItems.map((item, index) => (
          <button
            key={index}
            className={`flex items-center w-full gap-4 px-4 py-3 rounded-xl font-bold uppercase tracking-wide transition-colors ${
              item.active
                ? 'bg-blue-100 text-duo-blue border-2 border-duo-blue'
                : 'text-duo-gray hover:bg-gray-100'
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
