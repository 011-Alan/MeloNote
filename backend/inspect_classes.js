// inspect_classes.js
const { JSDOM } = require("jsdom");
const fs = require("fs");

const htmlContent = fs.readFileSync("score.html", "utf-8");
const dom = new JSDOM(htmlContent, {
  resources: "usable",
  runScripts: "dangerously",
  pretendToBeVisual: true
});

dom.window.structuredClone = (val) => JSON.parse(JSON.stringify(val));

setTimeout(() => {
  try {
    const document = dom.window.document;
    const svg = document.querySelector("#score svg");
    if (!svg) {
      console.error("No SVG found!");
      process.exit(1);
    }
    
    const allClasses = new Set();
    svg.querySelectorAll("*").forEach(el => {
      if (el.className) {
        // className can be an SVGAnimatedString or string
        const clsStr = typeof el.className === "string" ? el.className : el.className.baseVal;
        if (clsStr) {
          clsStr.split(/\s+/).forEach(c => allClasses.add(c));
        }
      }
    });
    
    console.log("All unique classes in SVG:", Array.from(allClasses));
  } catch (err) {
    console.error(err);
  }
  process.exit(0);
}, 5000);
