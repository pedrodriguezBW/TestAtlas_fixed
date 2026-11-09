// Test Atlas illustrations: decorative SVG scenes, copy and facts of the visual
// panel. Ported verbatim from climate-file-organizer/public/visuals.js; only the
// SVG ids are prefixed (ta-) so they are unique inside the Toolbox page, and the
// step 01 copy says that only the climatic workflow is available.

/** Snapshot of the form that the panel illustrates (same shape as the original getState()). */
export interface VisualState {
    testType: string
    step: number
    details: { programNumber: string; programName: string; phase: string; testNumber: string; date: string; batchName?: string }
    workbook: string
    existingWorkbook: string
    evidence: Array<{ title: string; count: number }>
    data: number[]
    total: number
    conflicts: number
    /** Vibration workflow only (Coming soon in the Toolbox). */
    testCount?: number
    sampleCount?: number
    incidents?: number
    currentTest?: string
    currentSample?: string
    sampleWorkbook?: string
}

// Decorative SVG objects and a light 3D particle field. No test telemetry is simulated.
const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, char => ENTITIES[char] ?? char);
const short = (value: string, limit = 25): string => value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
const fileLabel = (count: number): string => `${count} ${count === 1 ? 'FILE' : 'FILES'}`;
// One corporate accent family keeps the illustrated panel expressive without
// turning every workflow step into a separate visual identity.
export const palette = ['#d9a928', '#8eb7e5', '#d9a928', '#8eb7e5', '#d9a928', '#8eb7e5', '#d9a928'];
export const stepCopy = [
  ['AVAILABLE TEST TYPES', 'Test<br>category', 'CLIMATIC AVAILABLE / OTHER TYPES PLANNED'],
  ['DESTINATION SUMMARY', 'Test<br>details', 'PROGRAM → PHASE → TEST'],
  ['WORKBOOK SUMMARY', 'Inputs<br>workbook', '01_INPUTS / ORIGINAL EXTENSION'],
  ['EVIDENCE SUMMARY', 'Photo<br>evidence', '02_SETUP / PHOTOS BY TEST EVENT'],
  ['DATA FILE SUMMARY', 'Test<br>data', '03_DATA / ORIGINAL FILE NAMES'],
  ['SAVE SUMMARY', 'Review<br>and save', 'SAVE REQUIRES CONFIRMATION'],
  ['SAVE RESULT', 'Save<br>complete', 'FILES SAVED / REPORT FOLDER AVAILABLE']
];
export const vibrationCopy = [stepCopy[0],
  ['BATCH DESTINATION', 'Vibration<br>batch', 'PROGRAM → PHASE → BATCH'],
  ['BATCH WORKBOOK', 'General<br>inputs', 'BATCH LEVEL / ORIGINAL FILE NAME'],
  ['TEST STRUCTURE', 'Tests &<br>samples', 'BATCH → TEST → MATERIAL MASTER'],
  ['SAMPLE FILE SUMMARY', 'Sample<br>files', 'INPUTS / PHOTOS / RESULTS / CHARACTERIZATION'],
  stepCopy[5], ['SAVE RESULT', 'Save<br>complete', 'VIBRATION BATCH ORGANIZED']];

export function summaryFor(state: VisualState) {
  const d = state.details;
  if (state.step === 0) return 'Climatic tests are available. Vibration, EGR valve and wind tunnel workflows are planned.';
  if (state.testType === 'vibration') {
    switch (state.step) {
      case 1: return `Program: ${[d.programNumber, d.programName].filter(Boolean).join('_') || 'not specified'}. Phase: ${d.phase || 'not specified'}. Batch: ${d.batchName || 'not specified'}.`;
      case 2: return state.workbook ? `${state.workbook} will be saved directly in the batch, with its original name. Specific sample inputs are added in step 05.` : 'Select the general .xlsx or .xlsm inputs workbook for this batch.';
      case 3: return `${state.testCount} tests and ${state.sampleCount} Material Masters defined. Each sample belongs inside its test folder.`;
      case 4: return `Test: ${state.currentTest}. Material Master: ${state.currentSample}. Inputs: ${state.sampleWorkbook || 'not selected'}. Photos: ${state.data[0]}. Results: ${state.data[1]}. Characterization: ${state.data[2]}. Incidents: ${state.incidents}.`;
      case 5: return `${state.total} files prepared across ${state.testCount} tests and ${state.sampleCount} samples. ${state.conflicts} existing-file conflicts require approval. Review the folder tree and authorize saving.`;
      case 6: return `${state.total} files saved in the batch and its test/sample folders. Photos, results and characterization folders are available for every sample.`;
    }
  }
  const checkpoints = Math.max(0, state.evidence.length - 2);
  switch (state.step) {
    case 0:
      return 'Climatic tests are available. Vibration, EGR valve and wind tunnel workflows are planned.';
    case 1:
      if (![d.programNumber, d.programName, d.phase, d.testNumber, d.date].some(Boolean)) {
        return 'Enter the program, phase, test number and date to define the destination folders.';
      }
      return `Program: ${[d.programNumber, d.programName].filter(Boolean).join(' - ') || 'not specified'}. Phase: ${d.phase || 'not specified'}. Test: ${d.testNumber || 'not specified'}. Date: ${d.date || 'not specified'}.`;
    case 2:
      if (state.workbook) return `Selected workbook: ${state.workbook}. It will be renamed using the test details and stored in 01_Inputs with its original extension.`;
      if (state.existingWorkbook) return `This test already has an inputs workbook (${state.existingWorkbook}). You can continue without adding it again.`;
      return 'Select one .xlsx or .xlsm workbook. It will be renamed using the test details and stored in 01_Inputs.';
    case 3: {
      const photos = state.evidence.reduce((sum: number, set: { count: number }) => sum + set.count, 0);
      return `${photos} ${photos === 1 ? 'photograph' : 'photographs'} added across ${state.evidence.length} evidence sets. Initial and final sets are included, with ${checkpoints} intermediate ${checkpoints === 1 ? 'checkpoint' : 'checkpoints'}.`;
    }
    case 4:
      return ['SIMPATI', 'Graphtec', 'CANoe'].map((category, index) => `${category}: ${state.data[index]} ${state.data[index] === 1 ? 'file' : 'files'}.`).join(' ') + ' Original file names are retained in the corresponding data folders.';
    case 5:
      return `${state.total} ${state.total === 1 ? 'file' : 'files'} prepared for saving. ${state.conflicts ? `${state.conflicts} existing-file ${state.conflicts === 1 ? 'conflict requires' : 'conflicts require'} review.` : 'No existing-file conflicts detected.'} Review the destination and authorize saving.`;
    case 6:
      return `${state.total} ${state.total === 1 ? 'file' : 'files'} saved in the program, phase and test folders. The 04_Report folder is available for reports.`;
  }
}

const defs = `<defs>
  <linearGradient id="ta-metal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f4f8fd"/><stop offset=".35" stop-color="#aac1dd"/><stop offset=".55" stop-color="#e4edf8"/><stop offset="1" stop-color="#426890"/></linearGradient>
  <linearGradient id="ta-blue" x2=".8" y2="1"><stop stop-color="#dce9f8"/><stop offset="1" stop-color="#3d79bb"/></linearGradient>
  <linearGradient id="ta-orange" x2=".7" y2="1"><stop stop-color="#fff0bd"/><stop offset="1" stop-color="#d9a928"/></linearGradient>
  <linearGradient id="ta-lime" x2=".8" y2="1"><stop stop-color="#f4f7fd"/><stop offset="1" stop-color="#8eb7e5"/></linearGradient>
  <linearGradient id="ta-dark" x2="1" y2="1"><stop stop-color="#315f94"/><stop offset="1" stop-color="#082d6d"/></linearGradient>
  <filter id="ta-shadow" x="-50%" y="-50%" width="200%" height="220%"><feDropShadow dx="0" dy="9" stdDeviation="8" flood-color="#031735" flood-opacity=".28"/></filter>
</defs>`;
const svg = (content: string): string => `<svg viewBox="0 0 480 320" xmlns="http://www.w3.org/2000/svg">${defs}${content}</svg>`;
const label = (x: number, y: number, text: string, cls = 'scene-label'): string => `<text x="${x}" y="${y}" class="${cls}">${escape(text)}</text>`;
const folder = (x: number, y: number, color: string, number: string, scale = 1): string => `<g transform="translate(${x} ${y}) scale(${scale})"><path d="M0 27L36 5H79L95 19H154L181 38V124L144 149L0 117Z" fill="url(#ta-dark)" stroke="#c3dec5" stroke-width=".6"/><path d="M0 27L36 5H79L94 19H154L144 43H0Z" fill="url(#ta-${color})" opacity=".65"/><path d="M0 45H58L71 34H144V149L0 117Z" fill="url(#ta-${color})" stroke="#eafade" stroke-width=".8"/><path d="M144 34L181 38V124L144 149Z" fill="url(#ta-${color})" opacity=".5"/><path d="M14 60L129 85M14 66L129 91" stroke="#ffffff55" stroke-width=".8"/><text x="16" y="100" fill="#17372d" font-family="Arial,sans-serif" font-size="34" font-weight="700">${number}</text><path d="M111 123L130 127M123 117L130 127L122 134" fill="none" stroke="#183b30"/></g>`;
const paper = (x: number, y: number, color: string, title: string, rotation = 0): string => `<g transform="translate(${x} ${y}) rotate(${rotation})"><path d="M0 0H70L91 21V117H0Z" fill="url(#ta-${color})" stroke="#efffdf" stroke-width=".7"/><path d="M70 0V21H91" fill="#ffffff55" stroke="#efffdf" stroke-width=".7"/><path d="M13 47H77M13 57H67M13 67H77M13 77H58" stroke="#1e493c" opacity=".55"/><text x="13" y="102" fill="#173b2d" font-size="15" font-family="Consolas,monospace">${title}</text></g>`;

function disciplineScene() {
  const blades = Array.from({ length: 16 }, (_, i) => `<path d="M-14 -61Q-29 -90 -12 -114L20 -104Q4 -86 7 -62Z" transform="rotate(${i * 22.5})" fill="url(#ta-metal)" stroke="#c9e0c2" stroke-width=".6"/>`).join('');
  return svg(`<ellipse cx="242" cy="258" rx="114" ry="17" fill="#071612" opacity=".3"/>
    <g class="scene-turn"><ellipse cx="240" cy="160" rx="175" ry="116" class="scene-line scene-dash"/><ellipse cx="240" cy="160" rx="192" ry="124" class="scene-line" opacity=".2"/></g>
    <g class="scene-float" filter="url(#ta-shadow)"><g transform="translate(240 158) rotate(-25) scale(1 .82)"><g class="scene-rotor">${blades}</g><circle r="63" fill="url(#ta-dark)" stroke="#d7edc3"/><circle r="53" fill="none" stroke="url(#ta-metal)" stroke-width="17"/><circle r="32" fill="url(#ta-orange)" stroke="#ffdfb8" stroke-width="2"/><circle r="13" fill="#18332b"/><path d="M-18 0H18M0 -18V18" stroke="#f4ffc9" stroke-width=".7"/></g><path d="M227 144L245 137L253 144L236 153Z" fill="#ffb075"/></g>
    <g class="scene-float-late"><path d="M75 96L104 72L134 96L104 121Z" fill="url(#ta-blue)"/><path d="M75 96V119L104 143V121M104 143L134 119V96" stroke="#a7c7ff" fill="#486dcc66"/>${label(43, 58, 'CLIMATE')}</g>
    <g class="scene-float"><circle cx="389" cy="99" r="20" fill="#ff9860"/><path d="M375 99Q380 82 384 99T393 99T402 99" stroke="#263e2a" fill="none"/>${label(353, 58, 'VIBRATION')}</g>
    <g class="scene-float-late"><rect x="62" y="222" width="39" height="39" rx="3" transform="rotate(-14 82 242)" fill="url(#ta-lime)"/><path d="M70 236L93 248M70 248L93 236M81 228V257" stroke="#31523b"/>${label(55, 282, 'EGR VALVES')}</g>
    <g class="scene-float"><path d="M356 236H401L393 228M352 246H415L406 239M356 256H401L393 249" stroke="#bce2d2" stroke-width="3" fill="none"/>${label(347, 282, 'WIND TUNNEL')}</g>
    <path d="M141 98L161 112M354 99L328 113M106 237L155 204M350 244L322 208" class="scene-line scene-dash"/>`);
}
function destinationScene(details: VisualState['details']) {
  return svg(`<path d="M104 119V270H387V75" class="scene-line scene-dash"/><circle cx="104" cy="119" r="4" fill="#b9dbfe"/><circle cx="387" cy="75" r="4" fill="#ff9860"/>
    <g class="scene-float-late" filter="url(#ta-shadow)">${folder(70, 39, 'blue', 'P', .85)}</g>
    <g class="scene-float" filter="url(#ta-shadow)">${folder(185, 104, 'orange', 'Φ', .85)}</g>
    <g class="scene-float-late" filter="url(#ta-shadow)">${folder(295, 174, 'lime', 'T', .85)}</g>
    ${label(240, 58, short(details.programNumber && details.programName ? `${details.programNumber} — ${details.programName}` : 'PROGRAM', 27))}
    ${label(340, 142, short(details.phase || 'PHASE', 15))}
    ${label(104, 292, details.batchName ? `BATCH — ${short(details.batchName, 22)}` : details.testNumber ? `TEST — ${short(details.testNumber, 18)}` : 'TEST')}
    <path d="M242 66H353M323 149H379M105 280H282" class="scene-line"/>`);
}
function workbookScene(state: VisualState) {
  let grid = '';
  for (let row = 0; row < 7; row++) for (let col = 0; col < 4; col++) {
    grid += `<rect x="${31 + col * 30}" y="${71 + row * 16}" width="25" height="10" fill="${(row + col) % 4 === 0 ? '#67984e' : '#d0e9b5'}" opacity="${row === 0 ? '.85' : '.6'}"/>`;
  }
  const extension = state.workbook.toLowerCase().endsWith('.xlsm') ? 'XLSM' : 'XLSX';
  return svg(`<ellipse cx="256" cy="284" rx="109" ry="12" fill="#071612" opacity=".4"/>
    <path d="M58 163H100M376 125H423M402 104V146" class="scene-line"/>
    <g class="scene-float-late">${paper(322, 69, 'blue', '01', 18)}</g>
    <g class="scene-float" filter="url(#ta-shadow)"><g transform="translate(133 37) rotate(-13 90 110)"><path d="M16 0H163L183 23V237H16Z" fill="#69856c" stroke="#d4e9be"/><path d="M4 8H153L176 32V244H4Z" fill="#aec7a2" stroke="#d4e9be"/><path d="M0 15H148L170 38V250H0Z" fill="url(#ta-lime)" stroke="#efffe0"/><path d="M148 15V38H170" stroke="#67834b" fill="#ffffff66"/>${label(23, 52, 'INPUTS WORKBOOK')}${grid}<rect x="21" y="192" width="87" height="31" fill="#315439"/><text x="34" y="215" fill="#edffd5" font-family="Consolas,monospace" font-size="21">.${extension}</text><path d="M128 203L145 209L139 199M145 209L132 218" stroke="#365b3b" fill="none"/></g></g>
    <g class="scene-float-late"><circle cx="90" cy="227" r="25" fill="url(#ta-orange)"/><path d="M79 227H101M90 216V238" stroke="#31513e" stroke-width="2"/></g>
    ${label(309, 276, state.workbook ? 'WORKBOOK SELECTED' : 'AWAITING YOUR FILE')}`);
}

function photoFrame(x: number, y: number, color: string, rotation: number, tag: string) {
  return `<g transform="translate(${x} ${y}) rotate(${rotation})"><rect width="128" height="150" rx="2" fill="url(#ta-${color})" stroke="#f5ffdb"/><rect x="10" y="10" width="108" height="103" fill="#29443a"/><circle cx="89" cy="36" r="13" fill="#efc692"/><path d="M10 103L48 54L72 82L89 63L118 98V113H10Z" fill="#789b77"/><path d="M10 101L48 54L72 82L89 63L118 98" stroke="#c4dec2" fill="none"/><text x="12" y="135" fill="#254134" font-size="10" font-family="Consolas,monospace">${tag}</text><circle cx="107" cy="131" r="3" fill="#294e35"/></g>`;
}
function evidenceScene(state: VisualState) {
  const total = state.evidence.reduce((sum: number, set: { count: number }) => sum + set.count, 0);
  return svg(`<path d="M46 273H438" class="scene-line"/><path d="M46 273H438" stroke="#ffd4b1" class="scene-signal"/>
    <g class="scene-float-late" filter="url(#ta-shadow)">${photoFrame(65, 74, 'blue', -16, '01 / INITIAL')}</g>
    <g class="scene-float" filter="url(#ta-shadow)">${photoFrame(189, 40, 'orange', 6, '02 / DURING')}</g>
    <g class="scene-float-late" filter="url(#ta-shadow)">${photoFrame(302, 94, 'lime', 15, '03 / FINAL')}</g>
    <circle cx="98" cy="273" r="5" fill="#b9d5fc"/><circle cx="240" cy="273" r="5" fill="#ffb986"/><circle cx="385" cy="273" r="5" fill="#cceaa2"/>
    ${label(62, 299, `${String(total).padStart(2, '0')} PHOTOS`)}${label(268, 299, `${String(state.evidence.length).padStart(2, '0')} EVIDENCE SETS`)}
    <path d="M98 251V233M240 251V221M385 251V240" class="scene-line scene-dash"/>`);
}
function dataScene(state: VisualState) {
  const vibration = state.testType === 'vibration';
  return svg(`<path d="M117 85C230 85 230 220 329 207M117 180C230 180 230 220 329 220M117 273C230 273 230 240 329 232" stroke="#688c7b" stroke-width="1" fill="none"/>
    <path d="M117 85C230 85 230 220 329 207" stroke="#bcd5ff" stroke-width="3" fill="none" class="scene-signal"/><path d="M117 180C230 180 230 220 329 220" stroke="#c9ea9d" stroke-width="3" fill="none" class="scene-signal"/><path d="M117 273C230 273 230 240 329 232" stroke="#ffb790" stroke-width="3" fill="none" class="scene-signal"/>
    <g class="scene-float-late">${paper(51, 20, 'blue', vibration ? 'IMG' : '.x03', -10)}</g><g class="scene-float">${paper(90, 114, 'lime', vibration ? 'DATA' : '.csv', 9)}</g><g class="scene-float-late">${paper(48, 199, 'orange', vibration ? '.swp2' : '.blf', -8)}</g>
    <g class="scene-float" filter="url(#ta-shadow)"><path d="M303 150L363 117L427 153L367 188Z" fill="url(#ta-metal)" stroke="#e9ffe4"/><path d="M303 150V233L367 271V188Z" fill="url(#ta-dark)" stroke="#a1c1b0"/><path d="M367 188L427 153V234L367 271Z" fill="url(#ta-blue)" stroke="#c5e5f1"/><path d="M320 158L351 176V203L320 185Z" fill="#a5caab"/><path d="M379 210L414 191M379 220L414 201M379 230L414 211" stroke="#15382e"/><path d="M364 129L406 153L366 177L324 152Z" fill="none" stroke="#193d2e"/></g>
    ${label(168, 56, fileLabel(state.data[0]))}${label(205, 144, fileLabel(state.data[1]))}${label(163, 293, fileLabel(state.data[2]))}${label(298, 300, vibration ? short(state.currentSample || 'MATERIAL MASTER', 21) : '03_DATA')}`);
}
function samplesScene(state: VisualState) {
  return svg(`<path d="M108 90H243V254H399M243 171H399" class="scene-line scene-dash"/>
    <g class="scene-float" filter="url(#ta-shadow)">${folder(47, 48, 'blue', 'T', .8)}</g>
    <g class="scene-float-late" filter="url(#ta-shadow)">${folder(274, 30, 'orange', 'MM', .68)}</g>
    <g class="scene-float" filter="url(#ta-shadow)">${folder(274, 179, 'lime', 'MM', .68)}</g>
    ${label(40, 210, `${state.testCount} TESTS`)}${label(40, 237, `${state.sampleCount} SAMPLES`)}${label(290, 159, 'MATERIAL MASTER')}${label(35, 293, 'EVERY SAMPLE BELONGS TO A TEST')}`);
}
function vibrationArchiveScene() {
  return svg(`<path d="M75 39V281H412" class="scene-line scene-dash"/>
    <g class="scene-float" filter="url(#ta-shadow)">${folder(91, 26, 'blue', '01', .7)}</g>
    <g class="scene-float-late" filter="url(#ta-shadow)">${folder(160, 103, 'orange', '02', .7)}</g>
    <g class="scene-float" filter="url(#ta-shadow)">${folder(228, 179, 'lime', '03', .7)}</g>
    ${label(265, 51, 'PHOTOS')}${label(321, 123, 'RESULTS')}${label(38, 307, '03_CARACTERIZACION / OPTIONAL 90_INCIDENCIAS')}
    <g class="scene-float-late">${paper(337, 163, 'blue', 'INPUTS', 8)}</g>`);
}
function archiveScene(state: VisualState) {
  return svg(`<ellipse cx="258" cy="284" rx="138" ry="16" fill="#071612" opacity=".4"/><path d="M85 59V279H414V59" class="scene-line scene-dash"/>
    <g class="scene-float-late" filter="url(#ta-shadow)">${folder(104, 36, 'blue', '01', .71)}</g>
    <g class="scene-float" filter="url(#ta-shadow)">${folder(154, 83, 'orange', '02', .71)}</g>
    <g class="scene-float-late" filter="url(#ta-shadow)">${folder(209, 131, 'lime', '03', .71)}</g>
    <g class="scene-float" filter="url(#ta-shadow)">${folder(265, 181, 'blue', '04', .71)}</g>
    ${label(272, 53, 'INPUTS')}${label(321, 102, 'SETUP')}${label(373, 153, 'DATA')}${label(72, 302, '04_REPORT / REPORT FOLDER')}
    <g class="scene-float-late"><circle cx="393" cy="58" r="20" fill="url(#ta-lime)"/><path d="${state.step === 6 ? 'M383 58L390 65L405 50' : 'M384 58H402M393 49V67'}" stroke="#244832" stroke-width="2" fill="none"/></g>`);
}
export function sceneFor(state: VisualState) {
  if (state.testType === 'vibration') return [disciplineScene, () => destinationScene(state.details), () => workbookScene(state), () => samplesScene(state), () => dataScene(state), vibrationArchiveScene, vibrationArchiveScene][state.step]();
  return [disciplineScene, () => destinationScene(state.details), () => workbookScene(state), () => evidenceScene(state), () => dataScene(state), () => archiveScene(state), () => archiveScene(state)][state.step]();
}

export function factsFor(state: VisualState) {
  const d = state.details;
  const fact = (value: string | number, text: string): string => `<span class="visual-fact"><strong>${escape(value)}</strong> ${escape(text)}</span>`;
  if (state.step === 0) return fact('04', 'DISCIPLINES') + fact('01', 'AVAILABLE NOW');
  if (state.testType === 'vibration') {
    if (state.step === 1) return fact(d.programNumber || '—', short(d.programName || 'PROGRAM', 22)) + fact(d.phase || '—', 'PHASE') + fact(short(d.batchName || '—', 22), 'BATCH');
    if (state.step === 3) return fact(state.testCount ?? 0, 'TESTS') + fact(state.sampleCount ?? 0, 'MATERIAL MASTERS');
    if (state.step === 4) return state.data.map((count: number, i: number) => fact(count, ['PHOTOS', 'RESULTS', 'CHARACTERIZATION'][i])).join('') + fact(state.incidents ?? 0, 'INCIDENT FILES');
  }
  if (state.step === 1) return fact(d.programNumber || '—', short(d.programName || 'PROGRAM', 22)) + fact(d.phase || '—', 'PHASE') + fact(d.testNumber || '—', 'TEST');
  if (state.step === 2 && !state.workbook && state.existingWorkbook) return fact('✓', 'ALREADY SAVED') + fact(short(state.existingWorkbook, 36), '');
  if (state.step === 2) return fact(state.workbook ? '01' : '00', 'WORKBOOK') + fact(state.workbook ? short(state.workbook, 36) : 'XLSX / XLSM', state.workbook ? '' : 'ACCEPTED');
  if (state.step === 3) return fact(state.evidence.reduce((sum: number, set: { count: number }) => sum + set.count, 0), 'PHOTOS') + fact(Math.max(0, state.evidence.length - 2), 'CHECKPOINTS');
  if (state.step === 4) return state.data.map((count: number, i: number) => fact(count, ['SIMPATI', 'GRAPHTEC', 'CANOE'][i])).join('');
  return fact(state.total, state.step === 6 ? 'FILES SAVED' : 'FILES TO SAVE') + fact(state.step === 6 ? '✓' : state.conflicts, state.step === 6 ? 'ORGANIZED' : 'CONFLICTS');
}

