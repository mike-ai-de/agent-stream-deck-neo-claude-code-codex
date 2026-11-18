import {fork, type ChildProcess} from 'node:child_process';
import {existsSync} from 'node:fs';
import type {Snapshot} from './model.js';

// Native SVG/font allocations are confined to a short-lived process.
export class IsolatedRenderer {
 private child: ChildProcess | null = null;
 private count = 0;
 private queue: Promise<unknown> = Promise.resolve();
 private closed = false;
 private dispose(): void {
  const child = this.child; this.child = null; this.count = 0;
  if (child) child.kill();
 }
 close(): void { this.closed = true; this.dispose(); }
 private request(kind:'render'|'preview', snapshot:Snapshot, page:number, confirmUntil=0, text=''): Promise<Buffer | Buffer[]> {
  const run = async (): Promise<Buffer | Buffer[]> => {
   if (this.closed) throw new Error('renderer stopped');
   if (!this.child) {
    const local = new URL('./render-worker.js', import.meta.url);
    const worker = existsSync(local) ? local : new URL('../../dist/src/osca/render-worker.js', import.meta.url);
    this.child = fork(worker, [], {serialization:'advanced', execArgv:[], stdio:['ignore','ignore','inherit','ipc']});
    this.child.on('error', () => {});
   }
   const child = this.child;
   try {
    const result = await new Promise<Buffer | Buffer[]>((resolve, reject) => {
     const done = (error?:Error, value?:Buffer | Buffer[]) => {
      clearTimeout(timer); child.off('message', onMessage); child.off('exit', onExit); child.off('error', onError);
      error ? reject(error) : resolve(value!);
     };
     const onMessage = (m:any) => m?.ok ? done(undefined, m.result) : done(new Error('render failed'));
     const onExit = () => done(new Error('renderer exited'));
     const onError = (e:Error) => done(e);
     const timer = setTimeout(() => done(new Error('renderer timed out')), 15000);
     child.once('message', onMessage); child.once('exit', onExit); child.once('error', onError);
     child.send({kind,snapshot,page,confirmUntil,text}, e => { if (e) done(e); });
    });
    if (++this.count >= 30) this.dispose();
    return result;
   } catch (e) { this.dispose(); throw e; }
  };
  const result = this.queue.then(run, run); this.queue = result.catch(() => {}); return result;
 }
 async render(s:Snapshot, page:number, confirmUntil:number, text:string):Promise<Buffer[]> { return await this.request('render',s,page,confirmUntil,text) as Buffer[]; }
 async preview(s:Snapshot, page:number):Promise<Buffer> { return await this.request('preview',s,page) as Buffer; }
}
