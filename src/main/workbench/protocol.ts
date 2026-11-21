import { session, protocol } from 'electron';
import { pathToFileURL } from 'node:url';
import { resolveInside } from '../safePath';

export const DESK_PARTITION = 'wheeldesk-ui';
export const DESK_SCHEME = 'wheeldesk';
export function registerDeskScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: DESK_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
}
/** The local app origin makes the upstream Web Audio loader work in packaged builds as well as development. */
export function serveDeskScheme(rendererRoot: string): void {
  const ui = session.fromPartition(DESK_PARTITION);
  ui.protocol.handle(DESK_SCHEME, request => {
    const url = new URL(request.url);
    const file = url.host === 'app' ? resolveInside(rendererRoot, url.pathname) : null;
    if (!file || !['GET', 'HEAD'].includes(request.method)) return new Response('Not found', { status: 404 });
    return ui.fetch(pathToFileURL(file).toString());
  });
}
