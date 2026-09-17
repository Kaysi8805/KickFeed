import { handleFootballBffRequest } from '../../lib/footballBff';

export interface Env {
  FOOTBALL_API_KEY: string;
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleFootballBffRequest(request, { apiKey: env.FOOTBALL_API_KEY ?? '' });
  },
};
