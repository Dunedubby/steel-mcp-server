// ABOUTME: steel_upload_file — puts a LOCAL file (from a configured root) on a page's file input in a
// ABOUTME: live session, so a headless browser can attach an image a person would have picked.
import { readFile, realpath, stat } from 'node:fs/promises';
import { basename, extname, sep } from 'node:path';
import { z } from 'zod';
import { SteelToolError } from '../errors.js';
import { sessionIdSchema, successResult, withPage } from './shared.js';
/** Total bytes one call may hand to a page. A CDP message carries them base64-encoded. */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
/** Names that are credentials however they got under an allowed root; never offered to a page. */
const SECRETISH = /(^|\/)(token\.txt|[^/]*token[^/]*\.json|[^/]*credentials[^/]*|client_secret[^/]*|[^/]*secret[^/]*\.json|service[-_]?account[^/]*\.json|deploy_key[^/]*|id_(rsa|dsa|ecdsa|ed25519)[^/]*|[^/]*\.(pem|key|p12|pfx|keystore|jks|ppk|secret))$/i;
const MIME_BY_EXTENSION = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.json': 'application/json',
    '.zip': 'application/zip',
};
/**
 * Judges one path against the roots, the way a download gate does: resolved first so a symlink is
 * judged by where it points, inside a root, no hidden part, no credential-shaped name, a regular
 * file. Returns the real path and size, or throws with the reason the model can act on.
 */
async function admit(path, roots) {
    if (!path.startsWith('/')) {
        throw new SteelToolError(`"${path}" is not an absolute path.`, { code: 'invalid_argument' });
    }
    let real;
    try {
        real = await realpath(path);
    }
    catch {
        throw new SteelToolError(`No such file: ${path}`, { code: 'not_found' });
    }
    const root = roots.find(candidate => real === candidate || real.startsWith(candidate + sep));
    if (!root) {
        throw new SteelToolError(`${path} is outside the folders files may be uploaded from (${roots.join(', ')}). Copy it into one of them first.`, { code: 'forbidden' });
    }
    if (real.split(sep).some(part => part.startsWith('.') && part !== '.' && part !== '..')) {
        throw new SteelToolError('Hidden files and folders are never uploaded.', { code: 'forbidden' });
    }
    if (SECRETISH.test(real.slice(root.length))) {
        throw new SteelToolError(`${basename(real)} looks like a credential or key; it is never uploaded.`, {
            code: 'forbidden',
        });
    }
    const info = await stat(real);
    if (!info.isFile()) {
        throw new SteelToolError(`${path} is not a regular file.`, { code: 'invalid_argument' });
    }
    return { real, size: info.size };
}
/**
 * Registered only when roots are configured: a tool that can never succeed is noise in the list.
 */
export function registerUploadFile(host, deps) {
    const roots = deps.config.uploadRoots;
    if (roots.length === 0)
        return;
    host.registerTool('steel_upload_file', {
        title: 'Put a local file on a file input',
        description: 'Attach file(s) from this machine to a file input on the page, as if picked in the file dialog: ' +
            'the composer sees them and shows its preview. Only files under the configured upload folders. ' +
            'Click the control that opens the picker first if the input only exists after that; then call ' +
            'this with no target when the page has one file input, or name it with a @eN ref or CSS selector.',
        annotations: { readOnlyHint: false, openWorldHint: true },
        inputSchema: z
            .object({
            session_id: sessionIdSchema,
            paths: z
                .array(z.string().min(1))
                .min(1)
                .max(10)
                .describe(`Absolute paths of the files to attach. Allowed under: ${roots.join(', ')}.`),
            target: z
                .string()
                .optional()
                .describe('The file input (or an element containing it): a @eN ref from steel_snapshot/steel_find or a CSS selector such as input[type="file"]. Omit when the page has exactly one file input.'),
        })
            .strict(),
    }, async (args, ctx) => withPage(deps, 'steel_upload_file', ctx.mcpReq, args.session_id, async (page) => {
        const admitted = await Promise.all(args.paths.map(path => admit(path, roots)));
        const total = admitted.reduce((sum, file) => sum + file.size, 0);
        if (total > MAX_UPLOAD_BYTES) {
            throw new SteelToolError(`${(total / 1048576).toFixed(1)} MB in one call is over the ${MAX_UPLOAD_BYTES / 1048576} MB limit.`, { code: 'invalid_argument' });
        }
        const files = await Promise.all(admitted.map(async (file) => ({
            name: basename(file.real),
            type: MIME_BY_EXTENSION[extname(file.real).toLowerCase()] ?? 'application/octet-stream',
            base64: (await readFile(file.real)).toString('base64'),
        })));
        const outcome = await page.setInputFiles(args.target, files);
        const names = outcome.accepted.map(file => `${file.name} (${(file.size / 1024).toFixed(0)} KB)`);
        return successResult({
            result: `Attached ${names.join(', ')} to ${outcome.target}.`,
            change: 'The input now holds the file(s) and the page was told they changed; take a snapshot to see what it made of them (a preview, an upload progress) before submitting.',
        }, { target: outcome.target, files: outcome.accepted });
    }));
}
//# sourceMappingURL=upload.js.map