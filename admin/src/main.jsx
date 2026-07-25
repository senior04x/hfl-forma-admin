import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { OrgProvider } from './context/OrgContext.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <OrgProvider>
      <App />
    </OrgProvider>
  </React.StrictMode>,
)

