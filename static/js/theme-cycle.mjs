/** One owner for theme intent, timed commits and interrupted animation cleanup. */
export function createThemeCycle({initial=false,apply,animate=()=>()=>{},reduced=()=>false,schedule=setTimeout,cancel=clearTimeout}){
 let desired=initial,current=initial,running=false,timers=[],cleanup=()=>{},generation=0;
 function clear(){generation++;timers.forEach(cancel);timers=[];cleanup();cleanup=()=>{};running=false;}
 function settle(){clear();current=desired;apply(current);}
 function run(){
  if(current===desired)return;
  if(reduced()){settle();return;}
  running=true;const target=desired,token=++generation;
  try{cleanup=animate(target)||(()=>{});}catch{settle();return;}
  timers.push(schedule(()=>{if(token!==generation)return;current=target;apply(current);},300));
  timers.push(schedule(()=>{if(token!==generation)return;cleanup();cleanup=()=>{};timers=[];running=false;if(current!==desired)run();},900));
 }
 return {toggle(){desired=!desired;if(!running)run();},settle,getState:()=>({current,desired,running})};
}
