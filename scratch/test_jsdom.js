const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const htmlPath = path.join(__dirname, '..', 'temp_generated_score.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

// Set up JSDOM
const dom = new JSDOM(htmlContent, {
  resources: 'usable',
  runScripts: 'dangerously',
  pretendToBeVisual: true
});

// Capture logs
dom.window.console.log = (...args) => {
  console.log('[WebView Log]', ...args);
};
dom.window.console.warn = (...args) => {
  console.warn('[WebView Warn]', ...args);
};
dom.window.console.error = (...args) => {
  console.error('[WebView Error]', ...args);
};

// Wait for some time to let Verovio load and render
console.log('JSDOM started, waiting 10 seconds for Verovio to download, initialize, and render...');
setTimeout(() => {
  const document = dom.window.document;
  
  // Log system, measure counts
  console.log('System count in JSDOM:', document.querySelectorAll('.system').length);
  console.log('Measure count in JSDOM:', document.querySelectorAll('.measure').length);
  
  // Inspect braces
  const braces = document.querySelectorAll('.brace, [class*="brace"]');
  console.log('Brace elements count:', braces.length);
  braces.forEach((b, idx) => {
    console.log(`Brace ${idx + 1}: class="${b.getAttribute('class')}" tag="${b.tagName}"`);
    console.log(`  attributes:`, Array.from(b.attributes).map(a => `${a.name}="${a.value}"`));
    console.log(`  parent: tag="${b.parentNode.tagName}" class="${b.parentNode.getAttribute('class')}"`);
  });

  // Inspect staff groups
  const staffGroups = document.querySelectorAll('.staffGrp, [class*="staffGrp"]');
  console.log('StaffGrp elements count:', staffGroups.length);
  staffGroups.forEach((g, idx) => {
    console.log(`StaffGrp ${idx + 1}: class="${g.getAttribute('class')}" tag="${g.tagName}"`);
    console.log(`  attributes:`, Array.from(g.attributes).map(a => `${a.name}="${a.value}"`));
  });

  // Inspect system paths / connector lines
  const systems = document.querySelectorAll('.system');
  systems.forEach((systemEl, sysIdx) => {
    console.log(`System ${sysIdx + 1}:`);
    const allPaths = systemEl.querySelectorAll('path');
    const systemPaths = Array.from(allPaths).filter(p => !p.closest('.measure') && !p.closest('.staff'));
    console.log(`  System-level paths count:`, systemPaths.length);
    systemPaths.forEach((p, idx) => {
      console.log(`    Path ${idx + 1}: class="${p.getAttribute('class')}" d="${p.getAttribute('d')}"`);
      console.log(`      parent: tag="${p.parentNode.tagName}" class="${p.parentNode.getAttribute('class')}"`);
    });
  });

  // Write out rendered HTML for inspection if needed
  fs.writeFileSync(path.join(__dirname, 'rendered_output.html'), dom.serialize());
  console.log('Rendered output written to rendered_output.html');
  process.exit(0);
}, 10000);
