const fs = require('fs');

// 1. Update Schedule.css
let css = fs.readFileSync('admin/src/pages/Schedule.css', 'utf8');

// Replace export template styles
const newCssExport = `/* EXPORT TEMPLATE */
.schedule-export-container {
  width: 1080px;
  height: 1080px;
  position: relative;
  font-family: 'Inter', sans-serif;
  color: white;
  padding: 35px 40px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.schedule-export-container.theme-export-Super { background: linear-gradient(to bottom, #BB1308, #F7842B); }
.schedule-export-container.theme-export-Pro { background: linear-gradient(to bottom, #003E9D, #00BAEF); }
.schedule-export-container.theme-export-3-liga { background: linear-gradient(to bottom, #A200D2, #EB00F4); }
.schedule-export-container.theme-export-Europa { background: linear-gradient(135deg, #b91c1c, #000000); }
.schedule-export-container.theme-export-Chempionlar { background: linear-gradient(135deg, #4338ca, #1e1b4b); }
.schedule-export-container.theme-export-7x7 { background: linear-gradient(to bottom, #013C82, #589AFB); color: white; }

.sch-export-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding: 0 10px;
}

.sch-export-header h1 {
  font-size: 42px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 2px;
  margin: 0;
  text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
  text-align: center;
  flex: 1;
}

.sch-export-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
  justify-content: center;
}

.sch-match-row {
  display: grid;
  grid-template-columns: 65px 1fr 220px 1fr 65px;
  align-items: center;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(15px);
  -webkit-backdrop-filter: blur(15px);
  border-radius: 40px;
  padding: 8px 18px;
  position: relative;
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
  width: 100%;
  box-sizing: border-box;
}

.sch-team-logo {
  width: 65px;
  height: 65px;
  object-fit: cover;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.8);
  background: white;
  flex-shrink: 0;
}

.sch-time-container {
  width: 220px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  background: linear-gradient(180deg, #1e88e5 0%, #1565c0 100%);
  padding: 6px 15px 8px 15px;
  border-radius: 8px;
  clip-path: polygon(8% 0%, 92% 0%, 100% 100%, 0% 100%);
  flex-shrink: 0;
  box-shadow: 0 4px 15px rgba(0,0,0,0.2);
}

.sch-time-date {
  font-size: 14px;
  font-weight: 700;
  color: #ffffff;
  margin-bottom: 2px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.sch-time-box {
  color: #ffffff;
  font-size: 40px;
  font-weight: 900;
  text-align: center;
  text-shadow: 0 2px 8px rgba(0,0,0,0.4);
  line-height: 1;
}

.sch-export-footer {
  padding-top: 15px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.sch-social {
  font-size: 18px;
  font-weight: bold;
  display: flex;
  align-items: center;
  gap: 12px;
  opacity: 0.6;
}`;

css = css.replace(/\/\* EXPORT TEMPLATE \*\/[\s\S]*/, newCssExport);
fs.writeFileSync('admin/src/pages/Schedule.css', css);

// 2. Update Schedule.jsx
let jsx = fs.readFileSync('admin/src/pages/Schedule.jsx', 'utf8');

const oldExportBlock = jsx.substring(jsx.indexOf('{/* HIDDEN EXPORT TEMPLATE */}'));

const newExportBlock = `{/* HIDDEN EXPORT TEMPLATE */}
      <div style={{ position: 'fixed', left: '-9999px', top: 0, opacity: 1, pointerEvents: 'none', zIndex: -100 }}>
        <div 
          ref={exportRef} 
          className={\`schedule-export-container theme-export-\${exportLeague.split(' ')[0]}\`}
        >
          <div className="sch-export-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <img src="/hfl-logo-for-jadval.png" alt="HFL" style={{ height: '90px', objectFit: 'contain' }} crossOrigin="anonymous" />
              {exportLeague === '7x7 liga' && (
                <>
                  <img src="/x.png" crossOrigin="anonymous" style={{ height: '25px', objectFit: 'contain', opacity: 0.6 }} />
                  <img src="/llf-logo.png" alt="LLF" crossOrigin="anonymous" style={{ height: '80px', objectFit: 'contain' }} />
                  <img src="/x.png" crossOrigin="anonymous" style={{ height: '25px', objectFit: 'contain', opacity: 0.6 }} />
                  <img src="/7x7-liga.png" alt="7x7" crossOrigin="anonymous" style={{ height: '80px', objectFit: 'contain' }} />
                </>
              )}
            </div>
            
            <div style={{ flex: 1, textAlign: 'center', padding: '0 20px' }}>
              <h1 style={{ fontSize: '42px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '2px', margin: 0, textShadow: '2px 2px 4px rgba(0,0,0,0.5)' }}>
                {exportLeague === '7x7 liga' ? 'PROBOTAS 7x7 LEAGUE' : exportLeague}
              </h1>
            </div>

            <img src="/joma.png" alt="Joma" style={{ height: '80px', filter: exportLeague !== '7x7 liga' ? 'brightness(0) invert(1)' : 'none', objectFit: 'contain' }} crossOrigin="anonymous" />
          </div>

          <div className="sch-export-body">
            {matches
              .filter(m => m.league === exportLeague && m.round == exportRound)
              .map(match => (
                <div key={match.id} className="sch-match-row">
                  {/* 1. Home Logo */}
                  <img 
                    src={match.home_team?.logo_url} 
                    alt="" 
                    crossOrigin="anonymous" 
                    className="sch-team-logo"
                    onError={(e) => { e.target.onerror = null; e.target.src = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'%3E%3Crect width='30' height='30' fill='%23ccc' rx='15'/%3E%3C/svg%3E"; }}
                  />

                  {/* 2. Home Team Name */}
                  <div style={{ textAlign: 'left', fontSize: '20px', fontWeight: '800', textTransform: 'uppercase', color: '#ffffff', wordBreak: 'break-word', whiteSpace: 'pre-wrap', lineHeight: '1.2', paddingLeft: '15px' }}>
                    {match.home_team?.name}
                  </div>
                  
                  {/* 3. Time Container */}
                  <div className="sch-time-container">
                    <div className="sch-time-date">
                      {match.match_date ? match.match_date.split('-').reverse().join('.') : ''}
                    </div>
                    <div className="sch-time-box">
                      {match.match_time ? match.match_time.substring(0, 5) : '00:00'}
                    </div>
                  </div>

                  {/* 4. Away Team Name */}
                  <div style={{ textAlign: 'right', fontSize: '20px', fontWeight: '800', textTransform: 'uppercase', color: '#ffffff', wordBreak: 'break-word', whiteSpace: 'pre-wrap', lineHeight: '1.2', paddingRight: '15px' }}>
                    {match.away_team?.name}
                  </div>

                  {/* 5. Away Logo */}
                  <img 
                    src={match.away_team?.logo_url} 
                    alt="" 
                    crossOrigin="anonymous" 
                    className="sch-team-logo"
                    onError={(e) => { e.target.onerror = null; e.target.src = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'%3E%3Crect width='30' height='30' fill='%23ccc' rx='15'/%3E%3C/svg%3E"; }}
                  />
                </div>
              ))}
          </div>

          <div className="sch-export-footer">
            <div style={{ display: 'flex', gap: '30px', alignItems: 'center', marginBottom: '10px' }}>
              {exportLeague !== '7x7 liga' && selectedSponsors.map((s, idx) => (
                <React.Fragment key={s.id}>
                  <img src={s.logo_url} alt="Sponsor" style={{ height: '45px', filter: 'brightness(0) invert(1)' }} crossOrigin="anonymous" />
                  {idx < selectedSponsors.length - 1 && <div style={{ height: '30px', width: '1px', background: '#fff', opacity: 0.5 }}></div>}
                </React.Fragment>
              ))}
            </div>
            <div className="sch-social" style={{ color: exportLeague === '7x7 liga' ? '#ffffff' : 'white', marginBottom: '0px' }}>
              @havas_football
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Schedule;
`;

jsx = jsx.substring(0, jsx.indexOf('{/* HIDDEN EXPORT TEMPLATE */}')) + newExportBlock;
fs.writeFileSync('admin/src/pages/Schedule.jsx', jsx);
console.log("Updated Schedule files successfully!");
