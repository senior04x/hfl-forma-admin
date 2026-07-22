const fs = require('fs');

let jsx = fs.readFileSync('admin/src/pages/Schedule.jsx', 'utf8');

const targetHeader = `          <div className="sch-export-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <img src="/hfl-logo-for-jadval.png" alt="HFL" style={{ height: '90px', objectFit: 'contain' }} crossOrigin="anonymous" />
              {exportLeague === '7x7 liga' && (
                <>
                  <img src="/x.png" crossOrigin="anonymous" style={{ height: '25px', objectFit: 'contain', opacity: 0.6 }} />
                  <img src="/llf-logo.png" alt="LLF" crossOrigin="anonymous" style={{ height: '80px', objectFit: 'contain' }} />
                  <img src="/x.png" crossOrigin="anonymous" style={{ height: '25px', objectFit: 'contain', opacity: 0.6 }} />
                  <img src="/7x7-liga.png" alt="7x7" style={{ height: '80px', objectFit: 'contain' }} />
                </>
              )}
            </div>
            
            <div style={{ flex: 1, textAlign: 'center', padding: '0 20px' }}>
              <h1 style={{ fontSize: '42px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '2px', margin: 0, textShadow: '2px 2px 4px rgba(0,0,0,0.5)' }}>
                {exportLeague === '7x7 liga' ? 'PROBOTAS 7x7 LEAGUE' : exportLeague}
              </h1>
            </div>

            <img src="/joma.png" alt="Joma" style={{ height: '80px', filter: exportLeague !== '7x7 liga' ? 'brightness(0) invert(1)' : 'none', objectFit: 'contain' }} crossOrigin="anonymous" />
          </div>`;

const replacementHeader = `          <div className="sch-export-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', padding: '0 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <img src="/hfl-logo-for-jadval.png" alt="HFL" style={{ height: '90px', objectFit: 'contain' }} crossOrigin="anonymous" />
              {exportLeague === '7x7 liga' && (
                <>
                  <img src="/x.png" crossOrigin="anonymous" style={{ height: '25px', objectFit: 'contain', opacity: 0.6 }} />
                  <img src="/llf-logo.png" alt="LLF" crossOrigin="anonymous" style={{ height: '80px', objectFit: 'contain' }} />
                  <img src="/7x7-liga.png" alt="7x7" crossOrigin="anonymous" style={{ height: '80px', objectFit: 'contain' }} />
                </>
              )}
            </div>

            <img src="/joma.png" alt="Joma" style={{ height: '80px', filter: exportLeague !== '7x7 liga' ? 'brightness(0) invert(1)' : 'none', objectFit: 'contain' }} crossOrigin="anonymous" />
          </div>`;

if (jsx.includes(targetHeader)) {
    jsx = jsx.replace(targetHeader, replacementHeader);
    fs.writeFileSync('admin/src/pages/Schedule.jsx', jsx);
    console.log("Header replaced successfully!");
} else {
    console.log("Target header not found, checking normalized string...");
    // Slice out the exact block and replace
    const startIdx = jsx.indexOf('<div className="sch-export-header">');
    const endIdx = jsx.indexOf('<div className="sch-export-body">');
    if (startIdx !== -1 && endIdx !== -1) {
        jsx = jsx.substring(0, startIdx) + replacementHeader + '\n\n          ' + jsx.substring(endIdx);
        fs.writeFileSync('admin/src/pages/Schedule.jsx', jsx);
        console.log("Header replaced via slice successfully!");
    } else {
        console.log("Error: could not find export header boundaries!");
    }
}
