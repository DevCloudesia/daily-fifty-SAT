// Daily Fifty retired-question migration.
(()=>{
  const KEYS={session:'dailyFifty.session.v4',completed:'dailyFifty.completed.v4',blocked:'dailyFifty.blocked.v4'};
  const read=(key,fallback)=>{try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):fallback}catch{return fallback}};
  const validId=id=>/^[0-9a-f]{8}$/i.test(String(id||''));
  const hasCurrentWork=answer=>{
    if(!answer||typeof answer!=='object')return false;
    return Boolean(
      answer.selected||String(answer.input||'').trim()||answer.checked||answer.revealed||
      answer.completedAt||(answer.result!==null&&answer.result!==undefined)
    );
  };
  const makeItem=(id,bucket,buckets)=>{
    if(bucket==='math_hard')return{id,subject:'Math',difficulty:'Hard',bucket,skill:null};
    if(bucket==='rw_vocab'){
      const easy=new Set(buckets.rw_easy||[]),medium=new Set(buckets.rw_medium||[]);
      return{id,subject:'Reading & Writing',difficulty:easy.has(id)?'Easy':medium.has(id)?'Medium':'Hard',bucket,skill:'Words in Context'};
    }
    return{id,subject:'Reading & Writing',difficulty:'Hard',bucket:'rw_hard',skill:null};
  };
  async function repair(){
    const session=read(KEYS.session,null);
    if(!session||!Array.isArray(session.plan)||session.plan.length!==50)return;
    const answers=session.answers&&typeof session.answers==='object'?session.answers:{};
    const completed=new Set((read(KEYS.completed,[])||[]).filter(validId).map(id=>String(id).toLowerCase()));
    const blocked=new Set((read(KEYS.blocked,[])||[]).filter(validId).map(id=>String(id).toLowerCase()));
    const stale=[];
    session.plan.forEach((item,index)=>{
      const id=String(item?.id||'').toLowerCase();
      if(completed.has(id)&&!hasCurrentWork(answers[id]))stale.push(index);
    });
    if(!stale.length)return;
    const response=await fetch('/api/index',{cache:'no-store'});
    if(!response.ok)throw new Error(`Question index returned ${response.status}.`);
    const payload=await response.json();
    const buckets=payload?.buckets||{};
    const vocabSet=new Set((buckets.rw_vocab||[]).map(id=>String(id).toLowerCase()));
    const sources={
      rw_vocab:(buckets.rw_vocab||[]).map(id=>String(id).toLowerCase()),
      rw_hard:(buckets.rw_hard||[]).map(id=>String(id).toLowerCase()).filter(id=>!vocabSet.has(id)),
      math_hard:(buckets.math_hard||[]).map(id=>String(id).toLowerCase())
    };
    const used=new Set(session.plan.map((item,index)=>stale.includes(index)?null:String(item?.id||'').toLowerCase()).filter(Boolean));
    let replaced=0;
    for(const index of stale){
      const old=session.plan[index];
      const pool=sources[old.bucket]||[];
      const next=pool.find(id=>validId(id)&&!completed.has(id)&&!blocked.has(id)&&!used.has(id));
      if(!next)throw new Error(`No unseen replacement remains for ${old.bucket}.`);
      const oldId=String(old.id).toLowerCase();
      session.plan[index]=makeItem(next,old.bucket,buckets);
      used.add(next);
      if(!hasCurrentWork(answers[oldId]))delete answers[oldId];
      replaced+=1;
    }
    session.answers=answers;
    const reserve={rw_vocab:[],rw_hard:[],math_hard:[]};
    for(const bucket of Object.keys(reserve)){
      for(const id of sources[bucket]){
        if(reserve[bucket].length>=12)break;
        if(completed.has(id)||blocked.has(id)||used.has(id))continue;
        reserve[bucket].push(makeItem(id,bucket,buckets));
        used.add(id);
      }
    }
    session.reserve=reserve;
    session.savedAt=new Date().toISOString();
    localStorage.setItem(KEYS.session,JSON.stringify(session));
    sessionStorage.setItem('dailyFifty.retiredRepairNotice',String(replaced));
    location.reload();
  }
  const showNotice=()=>{
    let count=0;try{count=Number(sessionStorage.getItem('dailyFifty.retiredRepairNotice')||0);sessionStorage.removeItem('dailyFifty.retiredRepairNotice')}catch{}
    if(!count)return;
    const toast=document.getElementById('toast');
    if(!toast)return;
    toast.textContent=`Replaced ${count} retired question${count===1?'':'s'} with unseen ones. Your completed work was preserved.`;
    toast.classList.remove('hidden');
    setTimeout(()=>toast.classList.add('hidden'),4200);
  };
  const start=()=>{setTimeout(showNotice,700);setTimeout(()=>repair().catch(error=>console.warn('Could not replace retired questions.',error)),1200)};
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
})();
