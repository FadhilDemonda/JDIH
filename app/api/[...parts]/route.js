import { handleApi } from '../../../server/api.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function route(request, context) {
  return handleApi(request, (await context.params).parts);
}

export { route as GET, route as POST, route as PATCH, route as PUT, route as DELETE };
