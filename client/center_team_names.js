const fs = require('fs');

let jsx = fs.readFileSync('admin/src/pages/Schedule.jsx', 'utf8');

jsx = jsx.replace(
  "style={{ textAlign: 'left', fontSize: '20px', fontWeight: '800', textTransform: 'uppercase', color: '#ffffff', wordBreak: 'break-word', whiteSpace: 'pre-wrap', lineHeight: '1.2', paddingLeft: '15px' }}",
  "style={{ textAlign: 'center', fontSize: '20px', fontWeight: '800', textTransform: 'uppercase', color: '#ffffff', wordBreak: 'break-word', whiteSpace: 'pre-wrap', lineHeight: '1.2', padding: '0 10px' }}"
);

jsx = jsx.replace(
  "style={{ textAlign: 'right', fontSize: '20px', fontWeight: '800', textTransform: 'uppercase', color: '#ffffff', wordBreak: 'break-word', whiteSpace: 'pre-wrap', lineHeight: '1.2', paddingRight: '15px' }}",
  "style={{ textAlign: 'center', fontSize: '20px', fontWeight: '800', textTransform: 'uppercase', color: '#ffffff', wordBreak: 'break-word', whiteSpace: 'pre-wrap', lineHeight: '1.2', padding: '0 10px' }}"
);

fs.writeFileSync('admin/src/pages/Schedule.jsx', jsx);
console.log("Team names centered successfully!");
