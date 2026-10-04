import { registerBatch } from './tools/batch.js';
import { registerAct, registerFind, registerNavigate, registerSnapshot, registerWaitFor } from './tools/browse.js';
import { registerSessionHandoff } from './tools/handoff.js';
import { registerSessionReplay } from './tools/replay.js';
import { registerSessionCreate, registerSessionDiagnostics, registerSessionLiveView, registerSessionRelease, } from './tools/session.js';
import { registerSessionOptions } from './tools/session-options.js';
import { registerPdf, registerScrape, registerScreenshot } from './tools/stateless.js';
import { registerUploadFile } from './tools/upload.js';
const SCRAPE_AND_UP = ['scrape', 'browse'];
const BROWSE_AND_UP = ['browse'];
/**
 * The tool table, in the order `tools/list` returns them.
 *
 * The order is fixed here rather than derived from a map, because a stable ordering is what makes
 * a host's prompt cache hit across connections.
 */
export const TOOL_TABLE = [
    { name: 'steel_scrape', profiles: SCRAPE_AND_UP, register: registerScrape },
    { name: 'steel_screenshot', profiles: SCRAPE_AND_UP, register: registerScreenshot },
    { name: 'steel_pdf', profiles: SCRAPE_AND_UP, register: registerPdf },
    { name: 'steel_session_create', profiles: BROWSE_AND_UP, register: registerSessionCreate },
    { name: 'steel_session_release', profiles: BROWSE_AND_UP, register: registerSessionRelease },
    { name: 'steel_navigate', profiles: BROWSE_AND_UP, register: registerNavigate },
    { name: 'steel_snapshot', profiles: BROWSE_AND_UP, register: registerSnapshot },
    { name: 'steel_find', profiles: BROWSE_AND_UP, register: registerFind },
    { name: 'steel_act', profiles: BROWSE_AND_UP, register: registerAct },
    { name: 'steel_wait_for', profiles: BROWSE_AND_UP, register: registerWaitFor },
    { name: 'steel_session_diagnostics', profiles: BROWSE_AND_UP, register: registerSessionDiagnostics },
    { name: 'steel_session_handoff', profiles: BROWSE_AND_UP, register: registerSessionHandoff },
    { name: 'steel_session_replay', profiles: BROWSE_AND_UP, register: registerSessionReplay },
    { name: 'steel_batch', profiles: BROWSE_AND_UP, register: registerBatch },
    { name: 'steel_session_options', profiles: BROWSE_AND_UP, register: registerSessionOptions },
    // Appended after upstream's tools so their prefix stays byte-identical; listed only when
    // STEEL_UPLOAD_ROOTS names at least one folder (see registerUploadFile).
    { name: 'steel_upload_file', profiles: BROWSE_AND_UP, register: registerUploadFile },
    // Last on purpose. A host filters this one out of the list it shows the model, and appending
    // rather than inserting keeps the prefix every other tool sits in byte-identical.
    { name: 'steel_session_live_view', profiles: BROWSE_AND_UP, register: registerSessionLiveView },
];
/** The tools a profile exposes, in `tools/list` order. */
export function toolsForProfile(profile) {
    return TOOL_TABLE.filter(tool => tool.profiles.includes(profile));
}
//# sourceMappingURL=profiles.js.map