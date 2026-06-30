// verify_test_page.js
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

// Read test_page.html from the root
const htmlContent = fs.readFileSync(path.join(__dirname, "..", "..", "test_page.html"), "utf-8");
const dom = new JSDOM(htmlContent, {
  resources: "usable",
  runScripts: "dangerously",
  pretendToBeVisual: true
});

dom.window.structuredClone = (val) => JSON.parse(JSON.stringify(val));

setTimeout(() => {
  try {
    const document = dom.window.document;
    const debugDiv = document.getElementById("debug-info");
    const errorDiv = document.getElementById("error");
    
    console.log("=== DEBUG DIV TEXT ===");
    console.log(debugDiv ? debugDiv.textContent : "Not found");
    
    console.log("=== ERROR DIV TEXT ===");
    console.log(errorDiv ? errorDiv.textContent : "Not found");
    
    const svg = document.querySelector("#score svg");
    console.log("SVG found:", !!svg);
    if (svg) {
      console.log("SVG paths count:", svg.querySelectorAll("path").length);
    }
  } catch (err) {
    console.error(err);
  }
  process.exit(0);
}, 5000);
