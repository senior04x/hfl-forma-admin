const fs = require('fs');

// 1. Update Schedule.css to remove blue background & clip-path from time container
let css = fs.readFileSync('admin/src/pages/Schedule.css', 'utf8');

const newTimeContainerCss = `.sch-time-container {
  width: 220px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  background: transparent;
  padding: 4px 10px;
  flex-shrink: 0;
}`;

css = css.replace(/\.sch-time-container \{[\s\S]*?\n\}/, newTimeContainerCss);
fs.writeFileSync('admin/src/pages/Schedule.css', css);

// 2. Update Schedule.jsx to remove title text and remove X between LLF and 7x7
let jsx = fs.readFileSync('admin/src/pages/Schedule.jsx', 'utf8');

// Replace header section
const oldHeaderPattern = /<div className="sch-export-header"[\s\S]*?<\/div>\s*<\/div>\s*<img src="\/joma.png"/;
const newHeader = `<div className="sch-export-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', padding: '0 10px' }}>
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

            <img src="/joma.png"`;

jsx = jsx.replace(oldHeaderPattern, newHeader);
fs.writeFileSync('admin/src/pages/Schedule.jsx', jsx);

console.log("Successfully updated Schedule.css and Schedule.jsx!");
