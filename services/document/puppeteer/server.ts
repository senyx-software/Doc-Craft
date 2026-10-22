import Fastify from 'fastify';
import cors from '@fastify/cors';
import puppeteer, { type Browser } from 'puppeteer';
import dotenv from 'dotenv';
import path from 'path';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { existsSync } from 'node:fs';
// Source and compiled entry points sit at different depths in the workspace.
const sourceAssets=new URL('../../../shared/document-assets.mjs',import.meta.url);
const { documentAssets, placeAsset } = await import(existsSync(sourceAssets)?sourceAssets.href:new URL('../../../../shared/document-assets.mjs',import.meta.url).href) as typeof import('../../../shared/document-assets.mjs');
const securitySource = new URL('../../../shared/service-auth.mjs', import.meta.url);
const { authorizeService, captureServiceBody, closeServiceAuth } = await import(existsSync(securitySource) ? securitySource.href : new URL('../../../../shared/service-auth.mjs', import.meta.url).href) as typeof import('../../../shared/service-auth.mjs');

// Renderer credentials are injected separately; never load the document API environment.

if(process.env.PDF_REDIS_URL)process.env.REDIS_URL=process.env.PDF_REDIS_URL;
if(process.env.PDF_SERVICE_AUTH_CONFIG_FILE){delete process.env.SERVICE_AUTH_CONFIG_JSON;process.env.SERVICE_AUTH_CONFIG_FILE=process.env.PDF_SERVICE_AUTH_CONFIG_FILE;}

const tlsSource=new URL('../../../shared/server-tls.mjs',import.meta.url);
const {fastifyTlsOptions}=await import(existsSync(tlsSource)?tlsSource.href:new URL('../../../../shared/server-tls.mjs',import.meta.url).href) as typeof import('../../../shared/server-tls.mjs');
const loggingSource=new URL('../../../shared/logging.mjs',import.meta.url);
const {safeLoggerOptions}=await import(existsSync(loggingSource)?loggingSource.href:new URL('../../../../shared/logging.mjs',import.meta.url).href) as typeof import('../../../shared/logging.mjs');
const server = Fastify({ ...fastifyTlsOptions(), logger: safeLoggerOptions, bodyLimit: 2 * 1024 * 1024 });
server.addHook('preParsing', captureServiceBody);
server.addHook('preValidation', async (request, reply) => {
  if (!['/generate', '/ready'].includes(request.url.split('?')[0])) return;
  try { await authorizeService('pdf', request); }
  catch (error) { return reply.status((error as {statusCode?:number}).statusCode || 503).send({error:'Service authorization rejected'}); }
});
const maxRenders = Math.max(1, Number(process.env.PDF_MAX_CONCURRENT || 2));
let activeRenders = 0;
let browserPromise: Promise<Browser> | undefined;
function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ['--disable-dev-shm-usage', '--disable-gpu'],
      timeout: 15000,
    }).then(browser => {
      browser.once('disconnected', () => { browserPromise = undefined; });
      return browser;
    }).catch(error => { browserPromise = undefined; throw error; });
  }
  return browserPromise;
}
server.get('/health', async () => ({ status: 'ok', activeRenders, maxRenders }));
server.get('/ready', async (_request, reply) => {
  try { await getBrowser(); return { status: 'ready', activeRenders, maxRenders }; }
  catch { server.log.warn({code:'BROWSER_UNAVAILABLE'},'Sandboxed browser startup failed');return reply.status(503).send({ status: 'unavailable' }); }
});
server.addHook('onClose', async () => {
  await closeServiceAuth();
  if (browserPromise) await (await browserPromise).close();
});
process.once('SIGTERM', () => { void server.close(); });
process.once('SIGINT', () => { void server.close(); });

server.register(cors, {
  origin: false,
});

// Register Swagger
await server.register(swagger, {
  openapi: {
    info: {
      title: 'DocCraft Puppeteer Sidecar API',
      description: 'Sidecar service for generating PDF documents using Puppeteer',
      version: '1.0.0',
    },
  },
});

// Register Swagger UI
await server.register(swaggerUi, {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: false,
  },
  staticCSP: true,
  transformStaticCSP: (header) => header,
});

server.post('/generate', {
  schema: {
    description: 'Generate a PDF document from an HTML string',
    summary: 'Generate PDF from HTML',
    body: {
      type: 'object',
      required: ['htmlString'],
      properties: {
        assets: { type:'array', maxItems:6, items:{type:'object',required:['id','role','name','src','width','height'],properties:{
          id:{type:'string',maxLength:80},role:{type:'string',enum:['logo','image','signature']},name:{type:'string',maxLength:120},
          src:{type:'string',maxLength:160000},width:{type:'integer',minimum:1,maximum:1024},height:{type:'integer',minimum:1,maximum:1024},
        }} },
        htmlString: {
          type: 'string',
          description: 'The HTML content to render into the PDF document'
        }
      }
    },
    response: {
      200: {
        description: 'Successfully generated PDF',
        content: {
          'application/pdf': {
            schema: {
              type: 'string',
              format: 'binary'
            }
          }
        }
      },
      400: {
        description: 'Bad request (missing htmlString)',
        type: 'object',
        properties: {
          error: { type: 'string' }
        }
      },
      500: {
        description: 'Failed to generate PDF',
        type: 'object',
        properties: {
          error: { type: 'string' }
        }
      }
      ,503: {type:'object',properties:{error:{type:'string'}}}
    }
  }
}, async (request, reply) => {
  const { htmlString, assets } = request.body as { htmlString?: string; assets?:unknown[] };
  if (!htmlString) {
    return reply.status(400).send({ error: 'htmlString is required' });
  }

  if (activeRenders >= maxRenders) return reply.header('Retry-After', '1').status(503).send({ error: 'Renderer capacity reached; retry later' });
  activeRenders += 1;
  let page: Awaited<ReturnType<Browser['newPage']>> | undefined;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(15000);
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', request => {
      // Templates and validated assets are self-contained. Untrusted HTML must
      // not turn the renderer into a file reader or internal network proxy.
      if (/^(data:|about:|blob:)/i.test(request.url())) void request.continue();
      else void request.abort('blockedbyclient');
    });
    await page.setViewport({width:794,height:1123});
    server.log.info('Setting page content...');
    await page.setContent(htmlString, { waitUntil: 'load' });
    const images=documentAssets(assets);
    if(images.length) {
      // Measure the rendered template itself. Queued server templates can
      // have different geometry from the interactive canvas, so placements
      // are calculated against their actual text/table/image rectangles.
      await page.evaluate(async (input:any, functionSource:string)=>{
        const place=new Function('return ('+functionSource+')')();
        const occupied:any[]=[];
        const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
        let node:Node|null;
        while((node=walker.nextNode())) {
          if(!node.textContent?.trim() || ['SCRIPT','STYLE','NOSCRIPT'].includes(node.parentElement?.tagName||''))continue;
          const range=document.createRange();range.selectNodeContents(node);
          const r=range.getBoundingClientRect();if(r.width&&r.height)occupied.push({type:'text',text:node.textContent,x:r.left+scrollX,y:r.top+scrollY,w:r.width,h:r.height});
        }
        document.querySelectorAll('img,table,hr').forEach(el=>{const r=el.getBoundingClientRect();if(r.width&&r.height)occupied.push({type:'image',x:r.left+scrollX,y:r.top+scrollY,w:r.width,h:r.height});});
        document.body.style.position='relative';
        for(const asset of input) {
          const box=place(asset,occupied,794,1123);
          const img=document.createElement('img');img.src=asset.src;img.alt=asset.role;img.dataset.documentAsset=asset.id;
          Object.assign(img.style,{position:'absolute',left:box.x+'px',top:box.y+'px',width:box.w+'px',height:box.h+'px',objectFit:'contain',zIndex:'20'});
          document.body.append(img);await img.decode();occupied.push({type:'image',...box});
          // Don't freeze a first-page 100vh layout to screen pixels: print
          // rounding would create an otherwise empty second page.
          if(box.y+box.h>1123)document.body.style.minHeight=Math.max(document.body.scrollHeight,box.y+box.h+40)+'px';
        }
      },images,placeAsset.toString());
    }

    server.log.info('Generating PDF...');
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
    });

    server.log.info('PDF generated successfully.');
    // Complete browser cleanup before sending bytes: a client can immediately
    // start its next render after receipt. Awaiting cleanup after reply.send
    // briefly kept every slot occupied and rejected bounded concurrent clients.
    await page.close().catch(() => {});
    page = undefined;
    reply.type('application/pdf');
    return reply.send(pdf);
  } catch (err: any) {
    server.log.error(err, 'Failed to generate PDF');
    if (page) await page.close().catch(() => {});
    page = undefined;
    return reply.status(500).send({ error: 'PDF rendering failed' });
  } finally {
    if (page) await page.close().catch(() => {});
    activeRenders -= 1;
  }
});

const port = parseInt(process.env.SIDECAR_PORT || '3023', 10);
server.listen({ port, host: process.env.SIDECAR_HOST || '127.0.0.1' }, (err) => {
  if (err) {
    server.log.error(err);
    process.exit(1);
  }
  console.log(`[puppeteer-sidecar] Running on port ${port}`);
});
