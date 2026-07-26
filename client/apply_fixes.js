const fs = require('fs');
const path = require('path');

const applyFixes = () => {
    // 1. Standings.jsx
    let standingsJsx = fs.readFileSync('admin/src/pages/Standings.jsx', 'utf8');
    standingsJsx = standingsJsx.replace(
        /<div className="export-logo-left"[\s\S]*?<\/div>/,
        `<div className="export-logo-left" style={{flexDirection: 'row', alignItems: 'center', gap: '15px'}}>
                <img src="/hfl-logo-for-jadval.png" alt="Havas Futbol" crossOrigin="anonymous" style={{ height: '75px', objectFit: 'contain' }} />
                {selectedLeague === '7x7 liga' && (
                  <>
                    <img src="/x.png" crossOrigin="anonymous" style={{ height: '20px', objectFit: 'contain', opacity: 0.6 }} />
                    <img src="/llf-logo.png" alt="LLF" crossOrigin="anonymous" style={{ height: '60px', objectFit: 'contain' }} />
                    <img src="/x.png" crossOrigin="anonymous" style={{ height: '20px', objectFit: 'contain', opacity: 0.6 }} />
                    <img src="/7x7-liga.png" alt="7x7" crossOrigin="anonymous" style={{ height: '60px', objectFit: 'contain' }} />
                  </>
                )}
              </div>`
    );
    standingsJsx = standingsJsx.replace(
        /<div className="export-logo-right"[\s\S]*?<\/div>/,
        `<div className="export-logo-right" style={{textAlign: 'right'}}>
                <img src="/joma.png" alt="Joma" crossOrigin="anonymous" style={{ height: '60px', objectFit: 'contain' }} />
              </div>`
    );
    standingsJsx = standingsJsx.replace(
        /<div className="export-result-row" key=\{m\.id\}>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*\);\s*\}\)/,
        `<div className="export-result-row" key={m.id}>
                          <div style={{ textAlign: 'right', textTransform: 'uppercase', fontSize: '13px', paddingRight: '10px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hTeam.name}</div>
                          <img src={hTeam.logo_url} style={{ width: '30px', height: '30px', borderRadius: '50%', objectFit: 'cover' }} alt="" crossOrigin="anonymous" onError={(e) => { e.target.onerror = null; e.target.src = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'%3E%3Crect width='30' height='30' fill='%23ccc' rx='15'/%3E%3C/svg%3E"; }} />
                          <div className="export-result-score">{m.home_score}-{m.away_score}</div>
                          <img src={aTeam.logo_url} style={{ width: '30px', height: '30px', borderRadius: '50%', objectFit: 'cover' }} alt="" crossOrigin="anonymous" onError={(e) => { e.target.onerror = null; e.target.src = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'%3E%3Crect width='30' height='30' fill='%23ccc' rx='15'/%3E%3C/svg%3E"; }} />
                          <div style={{ textAlign: 'left', textTransform: 'uppercase', fontSize: '13px', paddingLeft: '10px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{aTeam.name}</div>
                        </div>
                      );
                    })`
    );
    fs.writeFileSync('admin/src/pages/Standings.jsx', standingsJsx);

    // 2. Standings.css
    let standingsCss = fs.readFileSync('admin/src/pages/Standings.css', 'utf8');
    standingsCss = standingsCss.replace(
        /\.export-result-row \{[\s\S]*?\.export-result-score \{/m,
        `.export-result-row {
  display: grid;
  grid-template-columns: 1fr 30px 60px 30px 1fr;
  align-items: center;
  padding: 10px 15px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  font-weight: 700;
  font-size: 16px;
  background: transparent;
  border-radius: 8px;
  margin-bottom: 8px;
}
.export-result-row:last-child { border-bottom: none; }
.export-result-score {`
    );
    standingsCss = standingsCss.replace(
        /\.export-result-score \{[\s\S]*?\}/m,
        `.export-result-score { font-size: 20px; font-weight: 900; text-align: center; }`
    );
    fs.writeFileSync('admin/src/pages/Standings.css', standingsCss);

    // 3. Schedule.jsx
    let scheduleJsx = fs.readFileSync('admin/src/pages/Schedule.jsx', 'utf8');
    scheduleJsx = scheduleJsx.replace(
        /<div className="sch-export-header" style={{ justifyContent: 'center', gap: '80px' }}>[\s\S]*?<div className="sch-export-body">/m,
        `<div className="sch-export-header" style={{ justifyContent: 'space-between', alignItems: 'flex-end', padding: '0 20px', marginBottom: '30px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <img src="/hfl-logo-for-jadval.png" alt="HFL" style={{ height: '130px', objectFit: 'contain' }} crossOrigin="anonymous" />
              {exportLeague === '7x7 liga' && (
                <>
                  <img src="/x.png" crossOrigin="anonymous" style={{ height: '35px', objectFit: 'contain', opacity: 0.6 }} />
                  <img src="/llf-logo.png" alt="LLF" crossOrigin="anonymous" style={{ height: '110px', objectFit: 'contain' }} />
                  <img src="/x.png" crossOrigin="anonymous" style={{ height: '35px', objectFit: 'contain', opacity: 0.6 }} />
                  <img src="/7x7-liga.png" alt="7x7" crossOrigin="anonymous" style={{ height: '110px', objectFit: 'contain' }} />
                </>
              )}
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              {LEAGUE_LOGOS[exportLeague] ? (
                exportLeague === '7x7 liga' ? (
                  <div style={{ width: '1px' }}></div>
                ) : (
                  <img src={LEAGUE_LOGOS[exportLeague]} alt={exportLeague} crossOrigin="anonymous" style={{ height: '270px', objectFit: 'contain' }} />
                )
              ) : (
                <h1 style={{ flex: 'none', fontSize: '50px', textTransform: 'uppercase' }}>{exportLeague}</h1>
              )}
            </div>

            <img src="/joma.png" alt="Joma" style={{ height: '130px', filter: exportLeague !== '7x7 liga' ? 'brightness(0) invert(1)' : 'none', objectFit: 'contain' }} crossOrigin="anonymous" />
          </div>

          <div className="sch-export-body">`
    );
    scheduleJsx = scheduleJsx.replace(
        /<div key=\{match\.id\} className="sch-match-row">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*\)\)/,
        `<div key={match.id} className="sch-match-row">
                  <div style={{ textAlign: 'right', fontSize: '22px', fontWeight: '700', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{match.home_team?.name}</div>
                  <img src={match.home_team?.logo_url} alt="Home" crossOrigin="anonymous" className="sch-team-logo" />
                  
                  <div className="sch-time-container" style={{ margin: 0 }}>
                    <div className="sch-time-date">
                      {match.match_date.split('-').reverse().join('.')}
                    </div>
                    <div className="sch-time-box">
                      {match.match_time ? match.match_time.substring(0, 5) : '00:00'}
                    </div>
                  </div>

                  <img src={match.away_team?.logo_url} alt="Away" crossOrigin="anonymous" className="sch-team-logo" />
                  <div style={{ textAlign: 'left', fontSize: '22px', fontWeight: '700', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{match.away_team?.name}</div>
                </div>
              ))`
    );
    fs.writeFileSync('admin/src/pages/Schedule.jsx', scheduleJsx);

    // 4. Schedule.css
    let scheduleCss = fs.readFileSync('admin/src/pages/Schedule.css', 'utf8');
    scheduleCss = scheduleCss.replace(
        /\.sch-match-row \{[\s\S]*?\.sch-time-container \{/m,
        `.sch-match-row {
  display: grid;
  grid-template-columns: 1fr 70px 200px 70px 1fr;
  align-items: center;
  gap: 20px;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 12px 12px 60px 60px;
  padding: 12px 25px;
  position: relative;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-bottom: none;
  width: 90%;
  margin: 0 auto;
}

.sch-team-logo {
  width: 70px;
  height: 70px;
  object-fit: cover;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.5);
  background: white;
}

.sch-time-container {`
    );
    fs.writeFileSync('admin/src/pages/Schedule.css', scheduleCss);
};

applyFixes();
console.log("Fixes applied successfully.");
