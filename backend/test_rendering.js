// test_rendering.js
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const htmlContent = fs.readFileSync("score.html", "utf-8");

// Set up JSDOM options to run inline scripts and load external scripts (VexFlow CDN)
const dom = new JSDOM(htmlContent, {
  resources: "usable",
  runScripts: "dangerously",
  pretendToBeVisual: true
});

// Mock structuredClone for VexFlow v5 inside JSDOM environment
dom.window.structuredClone = (val) => JSON.parse(JSON.stringify(val));

// We need to wait for VexFlow to load and the scripts to execute
setTimeout(() => {
  try {
    const document = dom.window.document;
    const errorDiv = document.getElementById("error");
    if (errorDiv && errorDiv.style.display === "block") {
      console.error("VexFlow Render Error displayed in HTML:", errorDiv.textContent);
    } else {
      console.log("No rendering error displayed in the HTML error div.");
    }
    
    const svg = document.querySelector("#score svg");
    if (!svg) {
      console.error("No SVG element found under #score!");
      return;
    }
    
    console.log("SVG generated successfully. Inner HTML length:", svg.innerHTML.length);
    
    // Let's analyze what elements were drawn
    const paths = svg.querySelectorAll("path");
    const rects = svg.querySelectorAll("rect");
    const circles = svg.querySelectorAll("circle");
    const glyphs = svg.querySelectorAll(".vf-notehead, .vf-rest, .vf-stavenote");
    
    console.log(`SVG contains: ${paths.length} paths, ${rects.length} rects, ${circles.length} circles.`);
    // Print class lists of some elements
    console.log("vf-notehead count:", svg.querySelectorAll(".vf-notehead").length);
    console.log("vf-rest count:", svg.querySelectorAll(".vf-rest").length);
    console.log("vf-stavenote count:", svg.querySelectorAll(".vf-stavenote").length);
    
    // Print outerHTML of the first 5 path elements
    console.log("First 5 paths outer HTML:");
    for (let i = 0; i < Math.min(5, paths.length); i++) {
      console.log(`Path ${i}:`, paths[i].outerHTML);
    }
    
  } catch (err) {
    console.error("Error inspecting DOM:", err);
  }
  process.exit(0);
}, 5000); // Wait 5 seconds for VexFlow CDN to load and renderScore to run
