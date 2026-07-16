const fs = require('fs');
const sharp = require('sharp');

async function roundImage() {
    const inputPath = 'client/images/app-icon.jpg';
    const outputPath = 'client/images/app-icon-rounded.png';
    const adminOutputPath = '../hfl-forma-admin/admin/public/app-icon-rounded.png';

    // Get metadata to know the width and height
    const metadata = await sharp(inputPath).metadata();
    const size = Math.min(metadata.width, metadata.height);

    // Create an SVG mask for a circle
    const r = size / 2;
    const circleSvg = `
      <svg width="${size}" height="${size}">
        <circle cx="${r}" cy="${r}" r="${r}" fill="white"/>
      </svg>
    `;

    // Resize to square, apply mask, and output as PNG with transparency
    const buffer = await sharp(inputPath)
        .resize(size, size)
        .composite([{
            input: Buffer.from(circleSvg),
            blend: 'dest-in'
        }])
        .png()
        .toBuffer();

    fs.writeFileSync(outputPath, buffer);
    fs.writeFileSync(adminOutputPath, buffer);
    console.log('Rounded image created successfully!');
}

roundImage().catch(console.error);
