import React from 'react';

// html2canvas supports background-size: contain; object-fit on images can stretch.
export default function SponsorLogo({ sponsor }) {
  return <div role="img" aria-label={sponsor.name || 'Homiy'} style={{
    width: 110, height: 38, flex: '0 0 110px',
    backgroundImage: `url(${JSON.stringify(sponsor.logo_url)})`,
    backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat',
  }} />;
}
