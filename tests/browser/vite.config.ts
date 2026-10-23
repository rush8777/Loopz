import { defineConfig } from 'vite';
export default defineConfig({ plugins: [{ name: 'guide-test-routes', configureServer(server) { server.middlewares.use((request, _response, next) => { if (request.url?.startsWith('/journey/')) request.url = '/tests/browser/guide-app.html'; next(); }); } }] });
