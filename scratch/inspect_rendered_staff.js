const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const filePath = path.join(__dirname, 'rendered_grand_staff_only.html');
const html = fs.readFileSync(filePath, 'utf8');
const dom = new JSDOM(html);
const document = dom.window.document;

const staff = document.querySelector('.staff');
if (!staff) {
  console.error('No staff element found');
  process.exit(1);
}

const paths = Array.from(staff.childNodes).filter(node => node.nodeName.toLowerCase() === 'path');
console.log(`Found ${paths.length} direct path children:`);
paths.forEach((p, idx) => {
  const d = p.getAttribute('d') || '';
  console.log(`  Path ${idx + 1} d="${d}"`);
  const match = d.match(/^M\s*([-\d.]+)[, ]\s*([-\d.]+)\s+L\s*([-\d.]+)[, ]\s*([-\d.]+)\s*$/i);
  console.log(`    Regex match:`, match ? 'SUCCESS' : 'FAILED');
});
