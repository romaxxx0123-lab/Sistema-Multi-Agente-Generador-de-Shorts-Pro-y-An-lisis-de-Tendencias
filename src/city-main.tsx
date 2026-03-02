
import React from 'react'
import ReactDOM from 'react-dom/client'
import { CityGame } from './components/CityGame'
import './index.css'

ReactDOM.createRoot(document.getElementById('city-root')!).render(
  <React.StrictMode>
    <div className="w-screen h-screen">
      <CityGame />
    </div>
  </React.StrictMode>,
)
