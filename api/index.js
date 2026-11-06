import { tratarRequisicao } from '../servidor.js';

// A Vercel entrega req/res no padrão do Node.js. O mesmo handler usado
// por `npm start` também atende as funções serverless.
export default async function handler(req, res) {
  await tratarRequisicao(req, res);
}
