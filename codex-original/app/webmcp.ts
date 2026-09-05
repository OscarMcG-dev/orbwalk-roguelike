import type { Arena } from './trainer';
type Tool = {name:string;description:string;inputSchema:object;annotations:{readOnlyHint:boolean};execute:(input:unknown)=>unknown};
export function registerTrainerTools(game:Arena){
 const context=(document as Document&{modelContext?:{registerTool:(tool:Tool,options:{signal:AbortSignal})=>void|Promise<void>}}).modelContext;
 const lifecycle=new AbortController();if(!context?.registerTool)return()=>{};
 const tools:Tool[]=[{name:'read_training_session',description:'Read the current Orbwalk training session and timing metrics.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>game.snapshot()},
 {name:'control_training_session',description:'Start a fresh 60-second drill, pause it, or resume a paused drill using the current settings.',inputSchema:{type:'object',properties:{action:{type:'string',enum:['start','pause','resume']}},required:['action'],additionalProperties:false},annotations:{readOnlyHint:false},execute:(input:unknown)=>{const value=input as {action?:unknown};if(!value||typeof value!=='object'||Object.keys(value).some(k=>k!=='action')||!['start','pause','resume'].includes(String(value.action)))throw new Error('Expected action: start, pause, or resume.');if(value.action==='start')game.start();if(value.action==='pause')game.pause();if(value.action==='resume'){if(game.status!=='paused')throw new Error('The session is not paused.');game.togglePause();}return game.snapshot();}}];
 for(const tool of tools){try{void Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}}
 return()=>lifecycle.abort();
}
