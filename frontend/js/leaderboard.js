(() => {
  const API = CONFIG.API.BASE_URL;
  const list = document.getElementById('leaderboard-list');
  if (!list) return;
  async function load(){
    try{const r=await fetch(`${API}/leaderboard`,{credentials:'include'});const d=await r.json();if(!r.ok)throw new Error(d.message);list.replaceChildren();d.leaderboard.forEach(p=>{const li=document.createElement('li');li.className='leader-row';li.innerHTML=`<span class="leader-rank">#${p.rank}</span><strong></strong><span>${p.xp.toLocaleString('ar-EG')} XP</span>`;li.querySelector('strong').textContent=p.name;list.appendChild(li);});}
    catch(e){list.innerHTML='<li class="empty-state">سجّل الدخول لعرض التصنيف.</li>';}
  }
  document.addEventListener('DOMContentLoaded',load);
})();
