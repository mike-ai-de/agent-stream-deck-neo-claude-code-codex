import {render, preview} from './view.js';
import type {Snapshot} from './model.js';

process.on('disconnect', () => process.exit(0));
process.on('message', async (message: {kind:'render'|'preview'; snapshot:Snapshot; page:number; confirmUntil?:number; text?:string}) => {
 try {
  const result = message.kind === 'render'
   ? await render(message.snapshot, message.page, message.confirmUntil, message.text)
   : await preview(message.snapshot, message.page);
  process.send?.({ok:true, result});
 } catch { process.send?.({ok:false}); }
});
