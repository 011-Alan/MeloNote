const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

function mockGenerateXML(clefs) {
  const parts = [];
  for (let i = 0; i < clefs.length; i++) {
    if (i < clefs.length - 1 && clefs[i] === 'treble' && clefs[i+1] === 'bass') {
      parts.push([clefs[i], clefs[i+1]]);
      i++;
    } else {
      parts.push([clefs[i]]);
    }
  }

  let partListXml = '';
  parts.forEach((partClefs, pIdx) => {
    partListXml += `
    <score-part id="P${pIdx + 1}">
      <part-name>Music ${pIdx + 1}</part-name>
    </score-part>`;
  });

  let partsXml = '';
  parts.forEach((partClefs, pIdx) => {
    let partXml = '';
    for (let m = 0; m < 4; m++) {
      let measureXml = '';
      if (m === 0) {
        let clefsXml = '';
        partClefs.forEach((clef, localIdx) => {
          const sign = clef === 'bass' ? 'F' : 'G';
          const line = clef === 'bass' ? 4 : 2;
          clefsXml += `
            <clef number="${localIdx + 1}">
              <sign>${sign}</sign>
              <line>${line}</line>
            </clef>`;
        });

        measureXml += `
          <attributes>
            <divisions>256</divisions>
            <key>
              <fifths>0</fifths>
              <mode>major</mode>
            </key>
            <time>
              <beats>4</beats>
              <beat-type>4</beat-type>
            </time>
            <staves>${partClefs.length}</staves>${clefsXml}
          </attributes>`;
      }

      partClefs.forEach((clef, localIdx) => {
        const voice = localIdx * 4 + 1;
        measureXml += `
          <note>
            <rest/>
            <duration>1024</duration>
            <voice>${voice}</voice>
            <type>whole</type>
            <staff>${localIdx + 1}</staff>
          </note>`;
        if (localIdx < partClefs.length - 1) {
          measureXml += `
            <backup>
              <duration>1024</duration>
            </backup>`;
        }
      });

      partXml += `
        <measure number="${m + 1}">
          ${measureXml}
        </measure>`;
    }
    partsXml += `
      <part id="P${pIdx + 1}">
        ${partXml}
      </part>`;
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC
    "-//Recordare//DTD MusicXML 4.0 Partwise//EN"
    "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work>
    <work-title>Test Score</work-title>
  </work>
  <part-list>
    ${partListXml}
  </part-list>
  ${partsXml}
</score-partwise>`;
}

const baseHtmlTemplate = fs.readFileSync(path.join(__dirname, '..', 'temp_generated_score.html'), 'utf8');

function runTestForLayout(name, clefs) {
  return new Promise((resolve) => {
    console.log(`\n---------------- STARTING TEST FOR ${name} ----------------`);
    const xml = mockGenerateXML(clefs);
    const base64Xml = Buffer.from(xml).toString('base64');

    let html = baseHtmlTemplate.replace(
      /let musicxmlBase64 = ".*?";/,
      `let musicxmlBase64 = "${base64Xml}";`
    );

    const dom = new JSDOM(html, {
      resources: 'usable',
      runScripts: 'dangerously',
      pretendToBeVisual: true
    });

    dom.window.Element.prototype.scrollIntoView = function() {};

    const logs = [];

    dom.window.console.log = (...args) => {
      logs.push(`[LOG] ${args.join(' ')}`);
    };
    dom.window.console.warn = (...args) => {
      logs.push(`[WARN] ${args.join(' ')}`);
    };
    dom.window.console.error = (...args) => {
      logs.push(`[ERROR] ${args.join(' ')}`);
    };

    setTimeout(() => {
      const document = dom.window.document;
      const scoreRoot = document.getElementById('score');
      if (!scoreRoot) {
        console.error(`[${name}] No score element found`);
        console.log('Logs captured:\n', logs.join('\n'));
        resolve();
        return;
      }

      console.log(`\n================== RESULTS FOR ${name} (${clefs.join(', ')}) ==================`);
      console.log('Total systems rendered:', document.querySelectorAll('.system').length);
      console.log('Total measures rendered:', document.querySelectorAll('.measure').length);
      console.log('Total staves rendered:', document.querySelectorAll('.staff').length);
      
      // 1. Inspect braces
      const braces = document.querySelectorAll('.brace, [class*="brace"]');
      console.log('Braces found:', braces.length);
      braces.forEach((b, idx) => {
        console.log(`  Brace ${idx + 1}: class="${b.getAttribute('class')}" tag="${b.tagName}"`);
        const d = b.getAttribute('d') || '';
        console.log(`    d: "${d.substring(0, 100)}..."`);
      });

      // 2. Inspect system paths/connectors
      const systems = document.querySelectorAll('.system');
      systems.forEach((systemEl, sysIdx) => {
        const allPaths = systemEl.querySelectorAll('path');
        const systemPaths = Array.from(allPaths).filter(p => !p.closest('.measure') && !p.closest('.staff'));
        console.log(`  System ${sysIdx + 1} - System-level paths (connector lines/braces):`, systemPaths.length);
        systemPaths.forEach((p, idx) => {
          console.log(`    Path ${idx + 1}: class="${p.getAttribute('class')}" d="${p.getAttribute('d')}"`);
        });
      });

      console.log('\n--- ALL CAPTURED LOGS ---');
      console.log(logs.join('\n'));

      // Write final output HTML for manual inspection
      fs.writeFileSync(path.join(__dirname, `rendered_${name}.html`), dom.serialize());
      resolve();
    }, 15000);
  });
}

async function runAll() {
  await runTestForLayout('grand_staff_only', ['treble', 'bass', 'treble', 'bass']);
  await runTestForLayout('single_staff_only', ['treble', 'treble', 'treble']);
  await runTestForLayout('mixed_layout', ['treble', 'bass', 'treble']);
  console.log('\nAll tests completed.');
  process.exit(0);
}

runAll();
