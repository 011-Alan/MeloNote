"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
// test_gen_html.ts
const fs = __importStar(require("fs"));
const sheetMusicShared_ts_1 = require("./src/components/sheetMusicShared.ts");
const sampleNotes = [
    { pitch: 'Bb1,Bb2,F3,F4,D5', duration: '8', beats: 0.5 },
    { pitch: 'Bb2,F3', duration: '8', beats: 0.5 },
    { pitch: 'rest', duration: '16r', beats: 0.25 }
];
const { parsedNotes } = (0, sheetMusicShared_ts_1.parseSheetNotes)(sampleNotes);
const html = (0, sheetMusicShared_ts_1.buildSheetMusicHtml)(parsedNotes, '2/4', 93);
fs.writeFileSync('temp_generated_score.html', html);
console.log('HTML written successfully.');
