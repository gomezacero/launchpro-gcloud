
const fs = require('fs');
const path = require('path');

// Function to get image dimensions without external library (for PNG/JPG)
function getImageDimensions(filePath) {
    const buffer = fs.readFileSync(filePath);

    // PNG
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
        const width = buffer.readUInt32BE(16);
        const height = buffer.readUInt32BE(20);
        return { width, height, type: 'PNG' };
    }

    // JPG (simplified, might not work for all)
    // ... omitting complex JPG parsing for now, assuming PNG based on logs

    return { width: 0, height: 0, type: 'UNKNOWN' };
}

// The user uploaded 'adtiktok.png' but I don't have direct access to the user's file system where they uploaded it from.
// However, the artifact system has a copy: C:/Users/Roberto/.gemini/antigravity/brain/0055582e-d318-472f-87cc-17c666ec1f97/uploaded_image_1763933843166.png
// I will check that one.

const artifactPath = 'C:/Users/Roberto/.gemini/antigravity/brain/0055582e-d318-472f-87cc-17c666ec1f97/uploaded_image_1763933843166.png';

try {
    if (fs.existsSync(artifactPath)) {
        const dims = getImageDimensions(artifactPath);
        console.log(`Image: ${path.basename(artifactPath)}`);
        console.log(`Dimensions: ${dims.width}x${dims.height}`);
        console.log(`Type: ${dims.type}`);

        // Check aspect ratio
        const ratio = dims.width / dims.height;
        console.log(`Aspect Ratio: ${ratio.toFixed(2)}`);

        // TikTok valid ratios: 9:16 (0.56), 1:1 (1.00), 16:9 (1.78)
        const validRatios = [0.56, 1.00, 1.78];
        const isClose = validRatios.some(r => Math.abs(r - ratio) < 0.05);
        console.log(`Valid for TikTok? ${isClose ? 'YES' : 'NO'}`);

    } else {
        console.error('Artifact file not found.');
    }
} catch (err) {
    console.error('Error reading file:', err);
}
