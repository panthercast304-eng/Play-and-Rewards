(()=>{"use strict";
/* ============================================================
   PLUS FOR YOU — Supabase-backed front end
   Auth lives in Supabase (see config.js for URL/anon key). All
   coin/points/referral/withdrawal writes go through Postgres
   RPC functions (award_ad_watch, award_game_points,
   claim_daily_challenge, apply_referral_code,
   claim_referral_bonus, request_withdrawal) — the browser never
   writes coins/ads_watched/game_points/daily_last_claim directly
   to the profiles table anymore (that policy was dropped
   server-side). After every RPC call we re-fetch the profile so
   the UI always reflects the authoritative server value.
   ============================================================ */
const $=id=>document.getElementById(id);
const sb = window.supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

function uid(){return Math.random().toString(16).slice(2,10)}
function todayKey(){return new Date().toISOString().slice(0,10)}
function fmtDate(ts){return new Date(ts).toLocaleString(undefined,{day:"numeric",month:"short",year:"numeric",hour:"numeric",minute:"2-digit"})}

let cur=null; // current profile row (plus a few joined fields we attach: referredUsers, ledger, withdrawals)

/* ---------------- data loading ---------------- */
async function loadProfile(userId){
  const {data,error}=await sb.from("profiles").select("*").eq("id",userId).single();
  if(error||!data) return null;
  return data;
}

async function loadReferredUsers(userId){
  const {data,error}=await sb
    .from("referrals")
    .select("referred_id,status,ads_progress,joined_at,profiles!referrals_referred_id_fkey(email)")
    .eq("referrer_id",userId);
  if(error||!data) return [];
  return data.map(r=>({
    email:r.profiles?r.profiles.email:"(unknown)",
    status:r.status,
    ads:r.ads_progress,
    joinedAt:new Date(r.joined_at).getTime()
  }));
}

async function loadLedger(userId){
  const {data,error}=await sb.from("ledger").select("*").eq("user_id",userId).order("date",{ascending:false}).limit(25);
  if(error||!data) return [];
  return data.map(l=>({id:l.id,type:l.type,amount:l.amount,date:new Date(l.date).getTime(),status:l.status,balance:cur?cur.coins:0}));
}

async function loadWithdrawals(userId){
  const {data,error}=await sb.from("withdrawals").select("*").eq("user_id",userId).order("date",{ascending:false});
  if(error||!data) return [];
  return data.map(w=>({id:w.id,amount:w.amount,method:w.method,date:new Date(w.date).getTime(),status:w.status}));
}

async function refreshCurrent(){
  if(!cur) return;
  const profile=await loadProfile(cur.id);
  if(!profile) return;
  const [referredUsers,ledger,withdrawals]=await Promise.all([
    loadReferredUsers(cur.id), loadLedger(cur.id), loadWithdrawals(cur.id)
  ]);
  cur={...profile, referredUsers, ledger, withdrawals};
}

/* ledgerAdd removed — every RPC function now writes its own ledger
   row server-side, so the client never inserts into ledger. */

/* ---------------- auth ---------------- */
function page(p){
 document.querySelectorAll(".page").forEach(x=>x.hidden=x.id!==p);
 document.querySelectorAll("nav [data-page]").forEach(x=>x.classList.toggle("active",x.dataset.page===p));
 const titles={home:"Welcome back",ads:"Watch Ads",games:"Games",referral:"Referral",profile:"Profile"};
 $("headerTitle").textContent=titles[p]||"Welcome back";
 if(p==="games")renderLeaderboard();
}

async function enter(isSignup){
 const e=$("email").value.trim().toLowerCase(),p=$("password").value;
 if(!e||!p){$("msg").textContent="Enter email and password.";return}
 if(!/^\S+@\S+\.\S+$/.test(e)){$("msg").textContent="Enter a valid email address.";return}
 $("msg").textContent="Please wait…";

 let authRes;
 if(isSignup){
   authRes=await sb.auth.signUp({email:e,password:p});
 }else{
   authRes=await sb.auth.signInWithPassword({email:e,password:p});
 }
 if(authRes.error){
   $("msg").textContent=authRes.error.message;
   return;
 }
 const userId=authRes.data.user?authRes.data.user.id:authRes.data.session.user.id;

 // Give the DB trigger a moment to create the profile row on first signup.
 let profile=await loadProfile(userId);
 for(let i=0;i<5 && !profile;i++){ await new Promise(r=>setTimeout(r,400)); profile=await loadProfile(userId); }
 if(!profile){ $("msg").textContent="Account created, but profile setup is still finishing — please try logging in again in a few seconds."; return; }

 cur={...profile, referredUsers:[], ledger:[], withdrawals:[]};

 const refQ=$("refQuery").value.trim().toUpperCase();
 if(isSignup && refQ && !cur.applied_ref){ await applyReferralCode(refQ,true); }

 await refreshCurrent();
 $("auth").hidden=true;$("app").hidden=false;$("nav").hidden=false;
 $("avatarBtn").textContent=(cur.username||cur.email)[0].toUpperCase();
 $("username").textContent=cur.username||cur.email; $("mail").textContent=cur.email;
 $("memberSince").textContent="Member since "+new Date(cur.created_at).toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"});
 render(); page("home");
}

async function logout(){ await sb.auth.signOut(); location.reload(); }

/* ---------------- referral logic ---------------- */
async function applyReferralCode(code,silent){
 code=(code||"").trim().toUpperCase();
 const msgEl=$("refMsg");
 const setMsg=t=>{if(msgEl)msgEl.textContent=t; else if(!silent)$("msg").textContent=t};
 if(!code){setMsg("Enter a referral code.");return}
 if(cur.applied_ref){setMsg("You already applied a referral code.");return}
 if(code===cur.ref_code){setMsg("You can't use your own code.");return}

 const {error}=await sb.rpc("apply_referral_code",{p_code:code});
 if(error){setMsg(error.message||"Could not apply referral code — try again.");return}

 setMsg("Referral code applied — pending verification.");
 await refreshCurrent(); render();
}

/* progressReferredAds removed — award_ad_watch() now ticks the
   referrer's ads_progress (and flips it to "eligible" at 10)
   server-side as part of the same RPC call. */

async function claimReferralBonus(){
 const {error}=await sb.rpc("claim_referral_bonus");
 if(error){ alert(error.message||"No eligible referral to claim."); return; }
 await refreshCurrent(); render();
}

/* ---------------- ads ---------------- */
function renderAds(){
 const box=$("adButtons");if(!box)return;box.innerHTML="";
 const unlocked = 25 + (cur.referredUsers.filter(r=>r.status!=="pending").length>=2 ? 75 : 0);
 for(let i=1;i<=100;i++){
   const b=document.createElement("button");
   const isDone=i<=cur.ads_watched;
   const isLocked=i>unlocked;
   b.className="adbtn"+(isLocked?" locked":"");
   b.disabled=isLocked||isDone||i!==cur.ads_watched+1;
   b.textContent= isDone? `✅ Ad ${i} — Verified · +200 Coins`
                : isLocked? `🔒 Ad ${i} — Unlock after 2 verified referrals`
                : `📺 Watch Ad ${i} — +200 Coins after verified completion`;
   b.onclick=()=>startAd(i,b);
   box.appendChild(b);
 }
}
/* ---------------- real rewarded video ad (HilltopAds via Supabase vast-proxy) ----
   IMPORTANT: raw fetch() of a VAST tag from the browser is blocked by CORS
   on most ad networks (confirmed: HilltopAds returns "Failed to fetch").
   The Google IMA SDK was tried next, but it ALSO fetches the ad tag
   directly from the browser under the hood, so it hit the same CORS wall
   ("AdError 1005 ... HTTP status code: -1").
   Fix: a Supabase Edge Function (`vast-proxy`) fetches the VAST XML
   server-to-server (not subject to browser CORS) and returns it with
   Access-Control-Allow-Origin: *. The browser fetches THAT URL instead,
   parses the VAST XML by hand (DOMParser), and plays the <MediaFile> mp4
   directly in the <video id="realAdVideo"> element.
   NOTE: coin crediting below still happens client-side after "ended" —
   that's still technically fakeable from devtools. For real payouts,
   move the coin-award into a Postgres/Edge function that only fires
   from a trusted server-side ad-completion callback. */
const VAST_PROXY_URL=window.SUPABASE_URL+"/functions/v1/vast-proxy";
const REAL_AD_COINS=200;
const VAST_MAX_WRAPPER_HOPS=3;

async function fetchVastXml(overrideUrl){
 const url=overrideUrl?VAST_PROXY_URL+"?url="+encodeURIComponent(overrideUrl):VAST_PROXY_URL;
 const res=await fetch(url,{
   headers: window.SUPABASE_ANON_KEY?{"Authorization":"Bearer "+window.SUPABASE_ANON_KEY}:{}
 });
 if(!res.ok) throw new Error("vast-proxy returned HTTP "+res.status);
 const text=await res.text();
 const xml=new DOMParser().parseFromString(text,"text/xml");
 if(xml.querySelector("parsererror")) throw new Error("VAST response was not valid XML");
 return xml;
}

function pickMediaFile(xml){
 const files=Array.from(xml.querySelectorAll("MediaFile"));
 if(!files.length) return null;
 const mp4=files.find(f=>(f.getAttribute("type")||"").toLowerCase()==="video/mp4");
 return ((mp4||files[0]).textContent||"").trim();
}

async function resolveVastMediaUrl(){
 let xml=await fetchVastXml();
 for(let hop=0; hop<VAST_MAX_WRAPPER_HOPS; hop++){
   const inlineAd=xml.querySelector("InLine");
   if(inlineAd){
     const mediaUrl=pickMediaFile(xml);
     if(!mediaUrl) throw new Error("VAST InLine had no MediaFile");
     return mediaUrl;
   }
   const wrapperUri=xml.querySelector("Wrapper VASTAdTagURI, VASTAdTagURI");
   if(wrapperUri && wrapperUri.textContent.trim()){
     xml=await fetchVastXml(wrapperUri.textContent.trim());
     continue;
   }
   throw new Error("No ad returned (empty VAST response)");
 }
 throw new Error("Too many VAST wrapper redirects");
}

let vastAdInFlight=false;

function playRealVastAd(){
 return new Promise(async (resolve,reject)=>{
   if(vastAdInFlight){ reject(new Error("An ad is already loading — please wait a moment and try again.")); return; }
   vastAdInFlight=true;

   const outer=$("realAdContainer"), video=$("realAdVideo");
   if(!outer||!video){vastAdInFlight=false; reject(new Error("no player on page"));return}

   function cleanup(){
     outer.hidden=true;
     video.pause(); video.removeAttribute("src"); video.load();
     video.onended=null; video.onerror=null;
     vastAdInFlight=false;
   }

   async function tryPlay(retriesLeft){
     try{ await video.play(); }
     catch(e){
       if(retriesLeft>0 && e && e.name==="AbortError"){
         await new Promise(r=>setTimeout(r,200));
         return tryPlay(retriesLeft-1);
       }
       throw e;
     }
   }

   try{
     const mediaUrl=await resolveVastMediaUrl();
     outer.hidden=false;
     video.onended=()=>{ cleanup(); resolve(); };
     video.onerror=()=>{ cleanup(); reject(new Error("Video failed to play")); };
     video.src=mediaUrl;
     await tryPlay(2);
   }catch(e){ cleanup(); reject(e); }
 });
}

async function startAd(i,btn){
 if(i!==cur.ads_watched+1)return;
 btn.disabled=true; btn.textContent=`⏳ Ad ${i}: loading ad…`;
 $("admsg").textContent="Fetching ad from provider…";
 try{
   await playRealVastAd();
   const {error}=await sb.rpc("award_ad_watch");
   if(error) throw error;
   $("admsg").textContent="Ad verified — 200 coins credited.";
   await refreshCurrent(); render();
 }catch(e){
   btn.disabled=false; btn.textContent=`📺 Watch Ad ${i} — +200 Coins after verified completion`;
   $("admsg").textContent="No ad available right now — try again shortly.";
   alert("Ad error: "+(e && e.message ? e.message : e));
 }
}

async function startRealVideoAd(btn){
 const msg=$("realAdMsg");
 btn.disabled=true; btn.textContent="Loading ad…";
 if(msg)msg.textContent="Fetching ad from provider…";
 try{
   btn.hidden=true;
   await playRealVastAd();
   btn.hidden=false;
   btn.disabled=false; btn.textContent="📺 Watch Real Video Ad — +"+REAL_AD_COINS+" Coins";
   const {error}=await sb.rpc("award_ad_watch");
   if(error) throw error;
   if(msg)msg.textContent="Ad verified — "+REAL_AD_COINS+" coins credited.";
   await refreshCurrent(); render();
 }catch(e){
   btn.hidden=false;
   btn.disabled=false; btn.textContent="📺 Watch Real Video Ad — +"+REAL_AD_COINS+" Coins";
   if(msg)msg.textContent="No ad available right now — try again shortly.";
   alert("Ad error: "+(e && e.message ? e.message : e));
 }
}

/* ---------------- bridge for the 8 embedded mini-games (mines/tower/balloon/vortex/frost/penalty/thimbles/skyflyer) ----------------
   Each game runs in a same-origin iframe and calls window.parent.PFY_GameBridge
   to read the real coin balance and push changes back through the sync_coins
   RPC (server-side capped + logged to the ledger — see SQL you were given). */
window.PFY_GameBridge = {
  getBalance(){ return cur ? Number(cur.coins)||0 : 0; },
  async syncBalance(newBalance, gameName){
    if(!cur) return 0;
    const {data,error} = await sb.rpc("sync_coins",{p_new_balance:Math.max(0,Math.round(newBalance)),p_game:gameName||"game"});
    if(error){ console.error("sync_coins failed:",error.message); return cur.coins; }
    cur.coins = data;
    if($("coins")) $("coins").textContent = cur.coins.toLocaleString();
    if($("inr")) $("inr").textContent = "≈ ₹"+(cur.coins/10).toFixed(2);
    return data;
  }
};

/* ---------------- games ---------------- */
async function gp(n,label){
 if(n<1) return; // award_game_points requires 1-1000
 const {error}=await sb.rpc("award_game_points",{p_points:Math.min(1000,Math.round(n))});
 if(error){ alert("Could not award points: "+error.message); return; }
 await refreshCurrent(); render();
 alert((label?label+" — ":"")+"You earned "+n+" Game Points. They have no cash value.")
}

const QUIZ_BANK=[
 {q:"What is the capital of France?",o:["Paris","Rome","Berlin","Madrid"],a:0},
 {q:"How many continents are there?",o:["5","6","7","8"],a:2},
 {q:"What is 12 × 8?",o:["96","88","108","104"],a:0},
 {q:"Which planet is known as the Red Planet?",o:["Venus","Mars","Jupiter","Saturn"],a:1},
 {q:"What is the largest ocean on Earth?",o:["Atlantic","Indian","Arctic","Pacific"],a:3},
 {q:"Who wrote 'Romeo and Juliet'?",o:["Dickens","Shakespeare","Tolstoy","Hemingway"],a:1},
 {q:"What gas do plants absorb from the air?",o:["Oxygen","Nitrogen","Carbon dioxide","Helium"],a:2},
 {q:"How many sides does a hexagon have?",o:["5","6","7","8"],a:1},
];
function shuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}

function quiz(){
 const qs=shuffle(QUIZ_BANK).slice(0,5);
 let idx=0,score=0;
 function draw(){
   if(idx>=qs.length){
     $("game").innerHTML=`<div class="card"><h3>🧠 Quiz complete</h3><p>You scored <b>${score}/${qs.length}</b></p><button id="qAgain" class="primary wide">Play again</button></div>`;
     $("qAgain").onclick=quiz;
     if(score>0)gp(score*20,"Quiz");
     return;
   }
   const cur_q=qs[idx];
   $("game").innerHTML=`<div class="card"><h3>🧠 Quiz — ${idx+1}/${qs.length}</h3><p>${cur_q.q}</p><div id="qOpts"></div></div>`;
   const box=$("qOpts");
   cur_q.o.forEach((opt,i)=>{
     const b=document.createElement("button");b.className="quiz-opt";b.textContent=opt;
     b.onclick=()=>{
       document.querySelectorAll(".quiz-opt").forEach(x=>x.disabled=true);
       if(i===cur_q.a){b.classList.add("correct");score++}
       else{b.classList.add("wrong");box.children[cur_q.a].classList.add("correct")}
       setTimeout(()=>{idx++;draw()},700);
     };
     box.appendChild(b);
   });
 }
 draw();
}

function tap(){
 let taps=0,left=10,timer=null,started=false;
 $("game").innerHTML=`<div class="card"><h3>👆 Tap Challenge</h3><p class="muted">Tap as fast as you can in 10 seconds.</p><div class="tap-zone" id="tapZone">Tap to start</div><p>Taps: <b id="tapCount">0</b> · Time left: <b id="tapTime">10</b>s</p></div>`;
 const zone=$("tapZone");
 zone.onclick=()=>{
   if(!started){
     started=true;
     timer=setInterval(()=>{
       left--; $("tapTime").textContent=left;
       if(left<=0){
         clearInterval(timer); zone.onclick=null; zone.textContent="Time's up!";
         const pts=taps*2;
         if(pts>0)gp(pts,"Tap Challenge");
       }
     },1000);
   }
   if(left<=0)return;
   taps++; $("tapCount").textContent=taps; zone.textContent="Tap! ("+taps+")";
 };
}

function memory(){
 const emojis=["🍕","🚀","🐝","🎧","🌵","⚽"];
 const deck=shuffle(emojis.concat(emojis)).map((e,i)=>({id:i,e,flipped:false,matched:false}));
 let picked=[],moves=0,lock=false;
 $("game").innerHTML=`<div class="card"><h3>🎴 Memory Game</h3><p class="muted">Match all pairs. Moves: <b id="memMoves">0</b></p><div class="mem-grid" id="memGrid"></div></div>`;
 const grid=$("memGrid");
 function draw(){
   grid.innerHTML="";
   deck.forEach(c=>{
     const el=document.createElement("div");
     el.className="mem-card"+(c.flipped||c.matched?" flipped":"")+(c.matched?" matched":"");
     el.textContent=(c.flipped||c.matched)?c.e:"❔";
     el.onclick=()=>flip(c.id);
     grid.appendChild(el);
   });
 }
 function flip(id){
   if(lock)return;
   const c=deck.find(x=>x.id===id);
   if(!c||c.flipped||c.matched)return;
   c.flipped=true; picked.push(c); draw();
   if(picked.length===2){
     moves++; $("memMoves").textContent=moves; lock=true;
     setTimeout(()=>{
       const [a,b]=picked;
       if(a.e===b.e){a.matched=b.matched=true}
       else{a.flipped=b.flipped=false}
       picked=[]; lock=false; draw();
       if(deck.every(x=>x.matched)){
         const pts=Math.max(40,150-moves*8);
         gp(pts,"Memory Game");
       }
     },600);
   }
 }
 draw();
}

function daily(){
 const doneToday = cur.daily_last_claim===todayKey();
 if(doneToday){
   $("game").innerHTML=`<div class="card"><h3>📅 Daily Challenge</h3><p>You already completed today's challenge. Come back tomorrow for a fresh one!</p></div>`;
   return;
 }
 const challenges=[
   "Name a planet in our solar system.",
   "What color do you get by mixing blue and yellow?",
   "How many days are in a leap year?",
   "What's the freezing point of water in Celsius?",
 ];
 const seed=new Date().getDate()%challenges.length;
 const answer=[["mercury","venus","earth","mars","jupiter","saturn","uranus","neptune"],["green"],["366"],["0"]][seed];
 $("game").innerHTML=`<div class="card"><h3>📅 Daily Challenge</h3><p>${challenges[seed]}</p><input id="dailyAns" placeholder="Your answer"><button id="dailySubmit" class="primary wide">Submit</button><p id="dailyMsg" class="message"></p></div>`;
 $("dailySubmit").onclick=async ()=>{
   const val=$("dailyAns").value.trim().toLowerCase();
   if(answer.includes(val)){
     const {error}=await sb.rpc("claim_daily_challenge",{p_points:100});
     if(error){ $("dailyMsg").textContent=error.message||"Could not claim — try again."; return; }
     await refreshCurrent();
     $("dailyMsg").textContent="Correct! +100 coins credited.";
     render();
     daily();
   }else{
     $("dailyMsg").textContent="Not quite — try again.";
   }
 };
}

function ludo(){
 let cells="";
 for(let i=0;i<25;i++)cells+=`<div class="cell" style="background:${i===0?"#4c2a79":i===4?"#553d27":i===20?"#552735":i===24?"#54451f":"#251b32"}" id="lc${i}"></div>`;
 $("game").innerHTML=`<div class="card"><h3>🎲 Ludo vs Computer</h3><p class="muted">Race to square 25 • Game Points only</p><div class="ludo">${cells}</div><p id="ls">Your turn</p><button id="lr" class="primary">🎲 Roll Dice</button> <button id="ln" class="secondary">🔄 New Game</button></div>`;
 let p=0,c=0,done=false;
 function draw(){
   document.querySelectorAll(".cell").forEach(e=>e.innerHTML="");
   $("lc"+Math.min(p,24)).innerHTML+='<span class="token">Y</span>';
   $("lc"+Math.min(c,24)).innerHTML+='<span class="token">C</span>';
 }
 $("lr").onclick=()=>{
   if(done)return;
   let d=1+Math.floor(Math.random()*6);
   p=Math.min(24,p+d); $("ls").textContent="You rolled "+d; draw();
   if(p===24){done=true; gp(100,"Ludo"); $("ls").textContent="You won! +100 Game Points"; return}
   setTimeout(()=>{
     c=Math.min(24,c+1+Math.floor(Math.random()*6)); draw();
     if(c===24){done=true;$("ls").textContent="Computer won."}
   },500);
 };
 $("ln").onclick=ludo;
 draw();
}

/* ---------------- leaderboard ---------------- */
const LB_ALL=[["🏆 NovaPlayer",4820],["⭐ PixelKing",4260],["🪙 CoinMaster",3940],["🎯 QuizWhiz",3110],["🔥 StreakKing",2870]];
const LB_WEEK=[["⭐ PixelKing",640],["🏆 NovaPlayer",580],["🎯 QuizWhiz",510],["🪙 CoinMaster",410],["🔥 StreakKing",300]];
let lbMode="all";
function renderLeaderboard(){
 const list=(lbMode==="all"?LB_ALL:LB_WEEK).slice();
 list.push(["🎮 You",cur.game_points]);
 list.sort((a,b)=>b[1]-a[1]);
 const el=$("leaderboardList");if(!el)return;
 el.innerHTML="";
 list.forEach((row,i)=>{
   const li=document.createElement("li");
   if(row[0]==="🎮 You")li.classList.add("me");
   li.innerHTML=`<b>${i+1}</b><span>${row[0]}</span><strong>${row[1].toLocaleString()}</strong>`;
   el.appendChild(li);
 });
}

/* ---------------- render / update ---------------- */
function render(){
 if(!cur)return;
 $("coins").textContent=cur.coins.toLocaleString();
 $("inr").textContent="≈ ₹"+(cur.coins/10).toFixed(2);
 $("gamePoints").textContent=cur.game_points.toLocaleString();
 $("ovPoints").textContent=cur.game_points.toLocaleString();
 $("adcount").textContent=cur.ads_watched;
 $("bar").style.width=Math.min(cur.ads_watched,100)+"%";

 const successfulRefs=cur.referredUsers.filter(r=>r.status==="claimed").length;
 const eligibleRefs=cur.referredUsers.filter(r=>r.status==="eligible"||r.status==="claimed").length;
 $("refs").textContent=successfulRefs;
 $("refGate").textContent=cur.ads_watched>=1?"Passed":"Locked";
 $("refBar").style.width=Math.min(eligibleRefs*50,100)+"%";
 $("refcode").textContent=cur.ref_code;
 $("claim").disabled = !cur.referredUsers.some(r=>r.status==="eligible");

 const refListEl=$("refList");
 if(cur.referredUsers.length){
   refListEl.innerHTML="";
   cur.referredUsers.forEach(r=>{
     const div=document.createElement("div");div.className="ref-item";
     div.innerHTML=`<div><b>${r.email}</b><div class="muted">Joined ${fmtDate(r.joinedAt)} · ${r.ads}/10 ads</div></div><span class="ref-status ${r.status}">${r.status}</span>`;
     refListEl.appendChild(div);
   });
 } else refListEl.innerHTML=`<div class="empty">No referrals yet. Share your code to get started.</div>`;

 const ads25=cur.ads_watched>=25, refOk=eligibleRefs>=1, coins12k=cur.coins>=12000;
 const ready=ads25&&refOk&&coins12k;
 $("wstatus").textContent=ready?"Eligible":"Locked"; $("wstatus").className="status-pill "+(ready?"ok":"locked");
 $("wbadge").textContent=ready?"Eligible":"Locked"; $("wbadge").className="status-pill "+(ready?"ok":"locked");
 $("withdraw").disabled=!ready;
 $("wLockedBtn").hidden=ready; $("wLockedBtn").textContent="Withdrawal Locked";
 const checks=[["checkAds",ads25],["checkRefs",refOk],["checkCoins",coins12k],["checkVerify",true],["checkSafe",true],
               ["pcheckAds",ads25],["pcheckRefs",refOk]];
 checks.forEach(([id,ok])=>{const el=$(id);if(!el)return;el.firstElementChild.textContent=ok?"✅":"🔒";});

 $("eligBal").textContent=cur.coins.toLocaleString()+" ≈ ₹"+(cur.coins/10).toFixed(2);

 const ledgerEl=$("ledgerList");
 if(cur.ledger.length){
   ledgerEl.innerHTML="";
   cur.ledger.forEach(l=>{
     const div=document.createElement("div");div.className="ledger-item";
     div.innerHTML=`<div><b>${l.type}</b><div class="muted">${fmtDate(l.date)} · Status: ${l.status}</div></div><span class="ledger-amt">${l.amount>=0?"+":""}${l.amount}</span>`;
     ledgerEl.appendChild(div);
   });
 } else ledgerEl.innerHTML=`<div class="empty">No verified transactions yet.</div>`;

 const whEl=$("wHistory");
 if(cur.withdrawals.length){
   whEl.innerHTML="";
   cur.withdrawals.forEach(w=>{
     const div=document.createElement("div");div.className="wh-item";
     div.innerHTML=`<div><b>${w.amount.toLocaleString()} coins</b><div class="muted">${fmtDate(w.date)} · ${w.method}</div></div><span class="ref-status pending">${w.status}</span>`;
     whEl.appendChild(div);
   });
 } else whEl.innerHTML=`<div class="empty">No withdrawals yet.</div>`;

 renderAds();
 renderLeaderboard();
}

/* ---------------- withdraw submit ---------------- */
async function submitWithdraw(){
 const amount=+$("amount").value, method=$("method").value, upi=$("upi").value.trim();
 if(!amount||amount<12000){alert("Enter at least 12,000 coins.");return}
 if(amount>cur.coins){alert("Amount exceeds your available balance.");return}
 if(!method){alert("Select a payment method.");return}
 if(method==="UPI" && !/^[\w.\-]+@[\w]+$/.test(upi)){alert("Enter a valid UPI ID.");return}

 const {error}=await sb.rpc("request_withdrawal",{p_amount:amount,p_method:method,p_upi:upi});
 if(error){ alert(error.message||"Could not submit withdrawal — try again."); return; }
 await refreshCurrent();
 alert("Withdrawal request submitted — pending review by the team.");
 render();
}

/* ---------------- wire up ---------------- */
$("login").onclick=()=>enter(false);
$("signup").onclick=()=>enter(true);
$("logout").onclick=logout; $("logout2").onclick=logout;
document.querySelectorAll("[data-page]").forEach(b=>b.onclick=()=>page(b.dataset.page));
$("avatarBtn").onclick=()=>page("profile");
$("referNow").onclick=doShare; $("share").onclick=doShare;
$("copy").onclick=()=>{navigator.clipboard?.writeText(referralLink());alert("Referral link copied.")};
$("claim").onclick=claimReferralBonus;
$("applyRef").onclick=()=>applyReferralCode($("refInput").value);
$("withdraw").onclick=submitWithdraw;
$("lbAll").onclick=()=>{lbMode="all";$("lbAll").classList.add("active");$("lbWeek").classList.remove("active");renderLeaderboard()};
$("lbWeek").onclick=()=>{lbMode="week";$("lbWeek").classList.add("active");$("lbAll").classList.remove("active");renderLeaderboard()};
document.querySelectorAll("[data-profile]").forEach(b=>b.onclick=()=>{
 document.querySelectorAll(".subnav button").forEach(x=>x.classList.remove("active"));
 b.classList.add("active");
 document.querySelectorAll(".profile-pane").forEach(x=>x.hidden=true);
 $("profile"+b.dataset.profile[0].toUpperCase()+b.dataset.profile.slice(1)).hidden=false;
});
$("ludo").onclick=ludo; $("quiz").onclick=quiz; $("tap").onclick=tap; $("memory").onclick=memory; $("daily").onclick=daily;
if($("realAdBtn"))$("realAdBtn").onclick=()=>startRealVideoAd($("realAdBtn"));

function referralLink(){return location.origin+location.pathname+"?ref="+encodeURIComponent(cur.ref_code)}
function doShare(){const u=referralLink();try{navigator.share({title:"PLUS FOR YOU",text:"Join using my referral link",url:u})}catch(e){navigator.clipboard?.writeText(u);alert("Referral link copied.")}}

/* ---------------- boot ---------------- */
(async function boot(){
 const params=new URLSearchParams(location.search);
 const ref=params.get("ref");
 if(ref)$("refQuery").value=ref;

 const {data:{session}}=await sb.auth.getSession();
 if(session){
   const profile=await loadProfile(session.user.id);
   if(profile){
     cur={...profile, referredUsers:[], ledger:[], withdrawals:[]};
     await refreshCurrent();
     $("auth").hidden=true;$("app").hidden=false;$("nav").hidden=false;
     $("avatarBtn").textContent=(cur.username||cur.email)[0].toUpperCase();
     $("username").textContent=cur.username||cur.email; $("mail").textContent=cur.email;
     $("memberSince").textContent="Member since "+new Date(cur.created_at).toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"});
     render(); page("home");
   }
 }
})();
})();
